/* =========================================
   馨宝与树宝 · cloud-sync.js
   Supabase 登录 + 二人配对 + 整本日记同步
   ========================================= */

window.XinbaoCloud = (function () {
  var client = null;
  var user = null;
  var pair = null;
  var journalId = null;
  var pushTimer = null;
  var lastPushed = "";
  var syncState = "local"; // local | pending | syncing | synced | error
  var syncDetail = "";
  var statusListeners = [];

  function emitStatus(state, detail) {
    syncState = state || syncState;
    syncDetail = detail || "";
    statusListeners.forEach(function (fn) {
      try {
        fn({ state: syncState, detail: syncDetail, at: Date.now() });
      } catch (err) {}
    });
  }

  function onStatusChange(fn) {
    if (typeof fn === "function") statusListeners.push(fn);
  }

  function getSyncState() {
    return { state: syncState, detail: syncDetail };
  }

  function configured() {
    var cfg = window.APP_CONFIG || {};
    if (!cfg.supabaseUrl || !cfg.supabaseAnonKey) return false;
    if (String(cfg.supabaseUrl).indexOf("你的项目") !== -1) return false;
    if (String(cfg.supabaseAnonKey).indexOf("粘贴") !== -1) return false;
    return true;
  }

  function ensureClient() {
    if (!configured()) return null;
    if (client) return client;
    if (!window.supabase || !window.supabase.createClient) return null;
    client = window.supabase.createClient(
      window.APP_CONFIG.supabaseUrl,
      window.APP_CONFIG.supabaseAnonKey,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true,
          storage: window.localStorage
        }
      }
    );
    return client;
  }

  function canSync() {
    return !!(ensureClient() && user && pair && pair.partner_id);
  }

  function getUser() {
    return user;
  }
  function getPair() {
    return pair;
  }

  function makeInviteCode() {
    var chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    var out = "";
    for (var i = 0; i < 6; i++) {
      out += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return out;
  }

  function friendlyAuthError(message) {
    var m = String(message || "");
    if (/Invalid login credentials/i.test(m)) return "邮箱或密码不对";
    if (/Email not confirmed/i.test(m)) return "邮箱还没验证，请先点邮件里的链接";
    if (/User already registered/i.test(m)) return "这个邮箱已经注册过了，直接登录即可";
    if (/Password should be at least/i.test(m)) return "密码至少要 6 位";
    if (/rate limit/i.test(m)) return "操作太频繁，请稍后再试";
    return m || "操作失败";
  }

  function loadPair() {
    var c = ensureClient();
    if (!c || !user) {
      pair = null;
      return Promise.resolve(null);
    }

    // 分开查 owner / partner，避免 UUID 写在 or() 里解析失败，
    // 也避免测试时多条记录导致 maybeSingle 报错。
    return Promise.all([
      c
        .from("pairs")
        .select("id, invite_code, owner_id, partner_id, created_at")
        .eq("owner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5),
      c
        .from("pairs")
        .select("id, invite_code, owner_id, partner_id, created_at")
        .eq("partner_id", user.id)
        .order("created_at", { ascending: false })
        .limit(5)
    ]).then(function (results) {
      var ownerRes = results[0];
      var partnerRes = results[1];
      if (ownerRes.error) throw ownerRes.error;
      if (partnerRes.error) throw partnerRes.error;

      var rows = []
        .concat(ownerRes.data || [])
        .concat(partnerRes.data || []);

      // 去重
      var seen = {};
      var unique = [];
      rows.forEach(function (row) {
        if (!row || !row.id || seen[row.id]) return;
        seen[row.id] = true;
        unique.push(row);
      });

      // 优先已配对成功的；否则取最近一条
      var connected = unique.filter(function (row) {
        return !!row.partner_id;
      });
      pair = connected[0] || unique[0] || null;
      return pair;
    });
  }

  function pullJournal() {
    var c = ensureClient();
    if (!canSync()) return Promise.resolve(null);
    return c
      .from("journals")
      .select("id, payload, updated_at")
      .eq("pair_id", pair.id)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data) {
          journalId = null;
          return null;
        }
        journalId = res.data.id;
        return res.data.payload || null;
      });
  }

  function friendlySyncError(err) {
    var m = String(
      (err && (err.message || err.error_description || err.details || err.hint)) ||
        ""
    );
    var code = String((err && (err.code || err.statusCode || err.status)) || "");
    if (/quota/i.test(m) || /quota/i.test(code)) {
      return "存储配额已满（照片太大）。请用电脑打开并记→设置→同步最新，先把照片压小后再用手机同步";
    }
    if (
      code === "413" ||
      /413|payload|too large|request entity|body exceeded|JSON could not be generated|bytes/i.test(
        m
      )
    ) {
      return "足迹照片总大小超出云端限制。请少放几张，或等自动压缩后再点「同步最新」";
    }
    if (/Failed to fetch|NetworkError|network/i.test(m)) {
      return "网络不稳定，请稍后再试";
    }
    return m || "同步失败";
  }

  function dataUrlToBlob(dataUrl) {
    var str = String(dataUrl || "");
    var parts = str.split(",");
    if (parts.length < 2) throw new Error("无效图片数据");
    var mimeMatch = parts[0].match(/:(.*?);/);
    var mime = (mimeMatch && mimeMatch[1]) || "image/jpeg";
    var bin = atob(parts[1]);
    var arr = new Uint8Array(bin.length);
    for (var i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }

  /** 把单张 base64 照片上传到 Storage，返回可公开访问的 URL */
  function uploadPlacePhoto(dataUrl, placeId) {
    var c = ensureClient();
    if (!c || !user || !pair) {
      return Promise.reject(new Error("未登录或未配对，无法上传照片"));
    }
    var blob;
    try {
      blob = dataUrlToBlob(dataUrl);
    } catch (err) {
      return Promise.reject(err);
    }
    var safePlace = String(placeId || "place")
      .replace(/[^a-zA-Z0-9_-]/g, "")
      .slice(0, 40);
    var path =
      user.id +
      "/" +
      pair.id +
      "/" +
      safePlace +
      "/" +
      Date.now() +
      "-" +
      Math.floor(Math.random() * 1e6) +
      ".jpg";

    return c.storage
      .from("place-photos")
      .upload(path, blob, {
        contentType: "image/jpeg",
        upsert: false,
        cacheControl: "31536000"
      })
      .then(function (res) {
        if (res.error) throw res.error;
        var pub = c.storage.from("place-photos").getPublicUrl(path);
        var url = pub && pub.data ? pub.data.publicUrl : "";
        if (!url) throw new Error("照片上传成功但未拿到链接");
        return url;
      });
  }

  /**
   * 把日记里的 data:image 迁到 Storage。
   * 若 bucket 未建好 / 配额不足，返回 ok:false，由上层决定是否去掉内嵌照片再同步。
   */
  function migrateEmbeddedPhotos(journal) {
    var clone = JSON.parse(JSON.stringify(journal || {}));
    var tasks = [];
    var changed = false;
    var failures = 0;

    (clone.places || []).forEach(function (place) {
      if (!place || !Array.isArray(place.photos)) return;
      place.photos.forEach(function (src, idx) {
        if (typeof src !== "string" || src.indexOf("data:image") !== 0) return;
        tasks.push(
          uploadPlacePhoto(src, place.id || "place")
            .then(function (url) {
              place.photos[idx] = url;
              changed = true;
            })
            .catch(function () {
              failures += 1;
            })
        );
      });
    });

    if (!tasks.length) {
      return Promise.resolve({ journal: clone, changed: false, failures: 0 });
    }

    emitStatus("syncing", "正在把足迹照片上传到云相册…");
    return Promise.all(tasks).then(function () {
      return { journal: clone, changed: changed, failures: failures };
    });
  }

  function pushJournal(payload, preJson, options) {
    options = options || {};
    var c = ensureClient();
    if (!canSync() || !payload) {
      emitStatus(canSync() ? syncState : "local", canSync() ? "" : "未开启云端同步");
      return Promise.resolve();
    }
    var json = preJson || JSON.stringify(payload);
    if (!options.force && json === lastPushed) {
      emitStatus("synced", "已是最新");
      return Promise.resolve();
    }

    emitStatus("syncing", options.force ? "正在同步删除…" : "正在上传…");
    var row = {
      pair_id: pair.id,
      payload: payload,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    };

    var req = journalId
      ? c.from("journals").update(row).eq("id", journalId)
      : c.from("journals").insert(row).select("id").single();

    return Promise.resolve(req)
      .then(function (res) {
        if (res.error) throw res.error;
        if (!journalId && res.data && res.data.id) journalId = res.data.id;
        if (!journalId) {
          return c
            .from("journals")
            .select("id")
            .eq("pair_id", pair.id)
            .maybeSingle()
            .then(function (r2) {
              if (r2.data) journalId = r2.data.id;
              lastPushed = json;
              emitStatus("synced", "刚刚同步成功");
            });
        }
        lastPushed = json;
        emitStatus("synced", "刚刚同步成功");
      })
      .catch(function (err) {
        var msg = friendlySyncError(err);
        emitStatus("error", msg);
        var wrapped = new Error(msg);
        wrapped.cause = err;
        throw wrapped;
      });
  }

  function queuePush(payload, options) {
    if (!canSync()) {
      emitStatus("local", "仅保存在本机");
      return;
    }
    options = options || {};
    var json = JSON.stringify(payload);
    if (json === lastPushed) {
      emitStatus("synced", "已是最新");
      return;
    }

    emitStatus("pending", "准备同步…");
    clearTimeout(pushTimer);
    // 默认很快上传；连续狂点保存时稍作合并，避免卡网络
    var delay = options.immediate ? 0 : 120;
    pushTimer = setTimeout(function () {
      pushJournal(payload, json).catch(function (err) {
        console.warn("云端同步失败", err);
      });
    }, delay);
  }

  function signIn(email, password) {
    var c = ensureClient();
    return c.auth.signInWithPassword({ email: email, password: password }).then(function (res) {
      if (res.error) throw new Error(friendlyAuthError(res.error.message));
      user = res.data.user;
      return loadPair().then(function () {
        return user;
      });
    });
  }

  function signUp(email, password) {
    var c = ensureClient();
    return c.auth.signUp({ email: email, password: password }).then(function (res) {
      if (res.error) throw new Error(friendlyAuthError(res.error.message));
      if (!res.data.session) {
        throw new Error("注册成功。请先验证邮箱，再回来登录。");
      }
      user = res.data.user;
      return loadPair().then(function () {
        return user;
      });
    });
  }

  function signOut() {
    var c = ensureClient();
    user = null;
    pair = null;
    journalId = null;
    lastPushed = "";
    return c ? c.auth.signOut() : Promise.resolve();
  }

  function createPair() {
    var c = ensureClient();
    if (!user) return Promise.reject(new Error("请先登录"));
    if (pair) return Promise.reject(new Error("你已经在二人空间里了"));
    var code = makeInviteCode();
    return c
      .from("pairs")
      .insert({ invite_code: code, owner_id: user.id })
      .select("id, invite_code, owner_id, partner_id")
      .single()
      .then(function (res) {
        if (res.error) throw res.error;
        pair = res.data;
        return pair;
      });
  }

  function joinPair(code) {
    var c = ensureClient();
    if (!user) return Promise.reject(new Error("请先登录"));
    if (pair) return Promise.reject(new Error("你已经在二人空间里了"));
    code = String(code || "").trim().toUpperCase();
    if (!code) return Promise.reject(new Error("请输入邀请码"));

    return c
      .from("pairs")
      .select("id, invite_code, owner_id, partner_id")
      .eq("invite_code", code)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        if (!res.data) throw new Error("找不到这个邀请码");
        if (res.data.owner_id === user.id) throw new Error("不能加入自己的邀请码");
        if (res.data.partner_id) throw new Error("这个邀请码已经被用过了");
        return c
          .from("pairs")
          .update({ partner_id: user.id })
          .eq("id", res.data.id)
          .select("id, invite_code, owner_id, partner_id")
          .single();
      })
      .then(function (upd) {
        if (upd.error) throw upd.error;
        pair = upd.data;
        return pair;
      });
  }

  function leavePair() {
    var c = ensureClient();
    if (!user) return Promise.reject(new Error("请先登录"));
    if (!pair) return Promise.reject(new Error("你当前不在二人空间里"));

    var pairId = pair.id;
    var isOwner = pair.owner_id === user.id;
    var hasPartner = !!pair.partner_id;

    // 1) 我是伙伴：退出后房间留给对方
    if (!isOwner) {
      return c
        .from("pairs")
        .update({ partner_id: null })
        .eq("id", pairId)
        .eq("partner_id", user.id)
        .then(function (res) {
          if (res.error) throw res.error;
          pair = null;
          journalId = null;
          lastPushed = "";
          emitStatus("local", "已退出云端同步");
          return null;
        });
    }

    // 2) 我是房主，且已有伙伴：把房主转给对方，自己退出
    if (hasPartner) {
      return c
        .from("pairs")
        .update({ owner_id: pair.partner_id, partner_id: null })
        .eq("id", pairId)
        .eq("owner_id", user.id)
        .then(function (res) {
          if (res.error) throw res.error;
          pair = null;
          journalId = null;
          lastPushed = "";
          emitStatus("local", "已退出云端同步");
          return null;
        });
    }

    // 3) 我是房主，还没人加入：删除空房间（日记本会级联删掉）
    return c
      .from("pairs")
      .delete()
      .eq("id", pairId)
      .eq("owner_id", user.id)
      .then(function (res) {
        if (res.error) throw res.error;
        pair = null;
        journalId = null;
        lastPushed = "";
        emitStatus("local", "已退出云端同步");
        return null;
      });
  }

  function restoreSession() {
    var c = ensureClient();
    if (!c) return Promise.resolve(null);
    return c.auth.getSession().then(function (res) {
      user = res.data && res.data.session ? res.data.session.user : null;
      if (!user) {
        pair = null;
        return null;
      }
      return loadPair().then(function () {
        return user;
      });
    });
  }

  return {
    configured: configured,
    canSync: canSync,
    getUser: getUser,
    getPair: getPair,
    restoreSession: restoreSession,
    signIn: signIn,
    signUp: signUp,
    signOut: signOut,
    createPair: createPair,
    joinPair: joinPair,
    leavePair: leavePair,
    loadPair: loadPair,
    pullJournal: pullJournal,
    pushJournal: pushJournal,
    queuePush: queuePush,
    uploadPlacePhoto: uploadPlacePhoto,
    migrateEmbeddedPhotos: migrateEmbeddedPhotos,
    onStatusChange: onStatusChange,
    getSyncState: getSyncState,
    friendlyAuthError: friendlyAuthError
  };
})();
