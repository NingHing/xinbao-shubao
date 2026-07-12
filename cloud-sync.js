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
      window.APP_CONFIG.supabaseAnonKey
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
    return c
      .from("pairs")
      .select("id, invite_code, owner_id, partner_id")
      .or("owner_id.eq." + user.id + ",partner_id.eq." + user.id)
      .limit(1)
      .maybeSingle()
      .then(function (res) {
        if (res.error) throw res.error;
        pair = res.data || null;
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

  function pushJournal(payload) {
    var c = ensureClient();
    if (!canSync() || !payload) return Promise.resolve();
    var json = JSON.stringify(payload);
    if (json === lastPushed) return Promise.resolve();

    var row = {
      pair_id: pair.id,
      payload: payload,
      updated_at: new Date().toISOString(),
      updated_by: user.id
    };

    var req = journalId
      ? c.from("journals").update(row).eq("id", journalId)
      : c.from("journals").insert(row).select("id").single();

    return Promise.resolve(req).then(function (res) {
      if (res.error) throw res.error;
      if (!journalId && res.data && res.data.id) journalId = res.data.id;
      // insert without select may not return id — refetch
      if (!journalId) {
        return c
          .from("journals")
          .select("id")
          .eq("pair_id", pair.id)
          .maybeSingle()
          .then(function (r2) {
            if (r2.data) journalId = r2.data.id;
            lastPushed = json;
          });
      }
      lastPushed = json;
    });
  }

  function queuePush(payload) {
    if (!canSync()) return;
    clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      pushJournal(payload).catch(function (err) {
        console.warn("云端同步失败", err);
      });
    }, 600);
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
    loadPair: loadPair,
    pullJournal: pullJournal,
    pushJournal: pushJournal,
    queuePush: queuePush,
    friendlyAuthError: friendlyAuthError
  };
})();
