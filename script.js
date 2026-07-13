/* =========================================
   并记 · script.js
   ========================================= */

document.addEventListener("DOMContentLoaded", function () {
  var START_DATE = "2025-12-04";
  var STORAGE_KEY = "xinbao-shubao-journal-v1";
  var SEED_VERSION_KEY = "xinbao-shubao-seed-v";
  var LAST_SEEN_KEY = "xinbao-shubao-last-seen-v1";
  var DRAFT_KEY = "xinbao-shubao-drafts-v1";
  var PRODUCT_NAME = "并记";
  var MODULE_KEYS = ["anniversaries", "events", "sweets", "places", "fights"];
  var MODULE_LABELS = {
    anniversaries: "纪念日",
    events: "重要的事",
    sweets: "想对你说",
    places: "足迹",
    fights: "和解"
  };

  var defaultData = {
    siteTitle: PRODUCT_NAME,
    siteTitleAt: "",
    tombstones: {},
    anniversaries: [
      {
        id: "seed-anni-1",
        title: "在一起纪念日",
        date: START_DATE,
        note: "故事开始的日子",
        pinned: true,
        remind: true,
        order: 0
      }
    ],
    events: [],
    sweets: [],
    places: [],
    fights: []
  };

  var data = null;
  var editingId = null; // 正在编辑的条目 id；为空表示「新增」
  var VALID_VIEWS = {
    home: true,
    anniversaries: true,
    events: true,
    sweets: true,
    places: true,
    fights: true
  };

  // 本机找回的「想对你说」（云端整本覆盖时曾丢失）；按 id 合并，不会重复
  var RECOVERED_SWEETS = [
    {
      id: "id-1783774071366-4630",
      author: "馨宝",
      date: "2026-07-11",
      note: "请不要害怕问我任何问题，保持我们之间的确定感，也不要停止你的热情，永远在我身边。",
      title: ""
    },
    {
      id: "id-1783870083810-2369",
      author: "馨宝",
      date: "2026-07-12",
      note: "崔斌斌能不能不要老是熬夜了呀",
      title: ""
    }
  ];

  /** 按 id 合并：有更新时间的取较新；都没有时取后写入的那份（调用时让「想保留的」放后面） */
  function mergeById(primaryArr, preferredArr) {
    var map = {};

    function stamp(item) {
      if (!item || !item.updatedAt) return 0;
      var t = Date.parse(item.updatedAt);
      return isNaN(t) ? 0 : t;
    }

    function consider(item, preferIfTie) {
      if (!item || !item.id) return;
      var prev = map[item.id];
      if (!prev) {
        map[item.id] = item;
        return;
      }
      var tNew = stamp(item);
      var tOld = stamp(prev);
      if (tNew > tOld) {
        map[item.id] = item;
      } else if (tNew === tOld && preferIfTie) {
        map[item.id] = item;
      }
    }

    (primaryArr || []).forEach(function (item) {
      consider(item, false);
    });
    (preferredArr || []).forEach(function (item) {
      consider(item, true);
    });
    return Object.keys(map).map(function (id) {
      return map[id];
    });
  }

  function mergeTombstones(localStones, remoteStones) {
    var out = {};
    function absorb(src) {
      Object.keys(src || {}).forEach(function (id) {
        var t = Date.parse(src[id] || "") || 0;
        var prev = Date.parse(out[id] || "") || 0;
        if (t >= prev) out[id] = src[id];
      });
    }
    absorb(remoteStones);
    absorb(localStones);
    return out;
  }

  /** 按删除标记清掉已被删除的条目（避免云端旧副本又合并回来） */
  function purgeDeleted(journal) {
    if (!journal) return journal;
    if (!journal.tombstones || typeof journal.tombstones !== "object") {
      journal.tombstones = {};
    }
    var stones = journal.tombstones;
    function keepItem(item) {
      if (!item || !item.id) return true;
      var delAt = Date.parse(stones[item.id] || "") || 0;
      if (!delAt) return true;
      var itemAt = Date.parse(item.updatedAt || "") || 0;
      return itemAt > delAt;
    }
    ["anniversaries", "events", "sweets", "places", "fights"].forEach(function (key) {
      journal[key] = (journal[key] || []).filter(keepItem);
    });
    (journal.sweets || []).forEach(function (sweet) {
      if (!sweet) return;
      sweet.replies = (sweet.replies || []).filter(keepItem);
    });
    return journal;
  }

  function markDeleted(id) {
    if (!data) return;
    if (!data.tombstones || typeof data.tombstones !== "object") data.tombstones = {};
    if (id) data.tombstones[id] = new Date().toISOString();
  }

  /** 云端与本机合并：列表按 id；名称等字段按更新时间；尊重删除标记 */
  function mergeJournalPayload(localData, remotePayload) {
    var local = localData || JSON.parse(JSON.stringify(defaultData));
    var remote = remotePayload || {};
    var out = {};
    Object.keys(defaultData).forEach(function (key) {
      if (key === "tombstones") return;
      if (Array.isArray(defaultData[key])) {
        if (key === "sweets") {
          out[key] = mergeSweetsById(remote[key], local[key]);
        } else {
          out[key] = mergeById(remote[key], local[key]);
        }
        return;
      }
      if (key === "siteTitle" || key === "siteTitleAt") {
        return;
      }
      out[key] =
        local[key] != null && local[key] !== ""
          ? local[key]
          : remote[key] != null
            ? remote[key]
            : defaultData[key];
    });

    var lAt = Date.parse(local.siteTitleAt || "") || 0;
    var rAt = Date.parse(remote.siteTitleAt || "") || 0;
    if (lAt >= rAt) {
      out.siteTitle = normalizeSiteTitle(local.siteTitle);
      out.siteTitleAt = local.siteTitleAt || "";
    } else {
      out.siteTitle = normalizeSiteTitle(remote.siteTitle);
      out.siteTitleAt = remote.siteTitleAt || "";
    }

    out.tombstones = mergeTombstones(local.tombstones, remote.tombstones);
    return purgeDeleted(out);
  }

  function sweetStamp(item) {
    if (!item) return 0;
    if (item.updatedAt) {
      var t = Date.parse(item.updatedAt);
      if (!isNaN(t)) return t;
    }
    var m = String(item.id || "").match(/id-(\d+)/);
    return m ? Number(m[1]) : 0;
  }

  function normalizeSweet(item) {
    if (!item) return item;
    var note = (item.note || "").trim();
    var title = (item.title || "").trim();
    if (!note && title) note = title;
    return {
      id: item.id || uid(),
      author: item.author || "",
      date: item.date || "",
      note: note,
      title: "",
      updatedAt: item.updatedAt || "",
      replies: Array.isArray(item.replies)
        ? item.replies.map(function (r) {
            return {
              id: r.id || uid(),
              author: r.author || "",
              date: r.date || "",
              note: (r.note || "").trim(),
              updatedAt: r.updatedAt || ""
            };
          })
        : []
    };
  }

  /** 想对你说：正文按更新时间合并，回复列表按 id 合并，避免两边各回一条时互相覆盖 */
  function mergeSweetsById(remoteArr, localArr) {
    var remoteMap = {};
    var localMap = {};
    (remoteArr || []).forEach(function (item) {
      if (item && item.id) remoteMap[item.id] = normalizeSweet(item);
    });
    (localArr || []).forEach(function (item) {
      if (item && item.id) localMap[item.id] = normalizeSweet(item);
    });
    var ids = {};
    Object.keys(remoteMap).forEach(function (id) {
      ids[id] = true;
    });
    Object.keys(localMap).forEach(function (id) {
      ids[id] = true;
    });
    return Object.keys(ids).map(function (id) {
      var remoteItem = remoteMap[id];
      var localItem = localMap[id];
      if (!remoteItem) return localItem;
      if (!localItem) return remoteItem;
      var preferLocal = sweetStamp(localItem) >= sweetStamp(remoteItem);
      var base = preferLocal ? localItem : remoteItem;
      var other = preferLocal ? remoteItem : localItem;
      var out = Object.assign({}, other, base);
      out.replies = mergeById(remoteItem.replies || [], localItem.replies || []);
      return out;
    });
  }

  function normalizeSiteTitle(title) {
    var t = String(title || "").trim();
    if (!t) return PRODUCT_NAME;
    if (t.length > 24) t = t.slice(0, 24);
    return t;
  }

  function applySiteTitle() {
    if (!data) return;
    var title = normalizeSiteTitle(data.siteTitle);
    data.siteTitle = title;
    var hero = document.getElementById("site-title");
    if (hero) hero.textContent = title;
    try {
      document.title = title;
    } catch (err) {}
    var input = document.getElementById("settings-site-title");
    if (input && document.activeElement !== input) {
      input.value = title;
    }
  }

  function touchUpdatedAt(item) {
    if (!item) return item;
    item.updatedAt = new Date().toISOString();
    return item;
  }

  function loadLastSeen() {
    try {
      var raw = localStorage.getItem(LAST_SEEN_KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : null;
    } catch (err) {
      return null;
    }
  }

  function saveLastSeen(seen) {
    try {
      localStorage.setItem(LAST_SEEN_KEY, JSON.stringify(seen || {}));
    } catch (err) {}
  }

  /** 首次启用：记为 7 天前已读，避免历史条目刷屏，又不会漏掉最近对方写的 */
  function ensureLastSeen() {
    try {
      // 旧版用「打开模块=当前时间已读」，会吞掉后同步到的内容；升级时清一次
      if (!localStorage.getItem("xinbao-shubao-last-seen-fix-v2")) {
        localStorage.removeItem(LAST_SEEN_KEY);
        localStorage.setItem("xinbao-shubao-last-seen-fix-v2", "1");
      }
    } catch (err) {}
    var seen = loadLastSeen();
    if (seen) return seen;
    var baseline = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    seen = {};
    MODULE_KEYS.forEach(function (key) {
      seen[key] = baseline;
    });
    saveLastSeen(seen);
    return seen;
  }

  function markModuleSeen(module) {
    if (MODULE_KEYS.indexOf(module) < 0) return;
    var seen = ensureLastSeen();
    var maxAt = 0;
    (data && data[module] ? data[module] : []).forEach(function (item) {
      var t = itemStamp(item);
      if (t > maxAt) maxAt = t;
    });
    // 本地还没有条目时不要用「现在」标已读，否则稍后同步到的对方内容会被吞掉
    if (maxAt <= 0) return;
    var prev = Date.parse(seen[module] || "") || 0;
    if (maxAt > prev) {
      seen[module] = new Date(maxAt).toISOString();
      saveLastSeen(seen);
    }
  }

  function markAllModulesSeen() {
    MODULE_KEYS.forEach(function (key) {
      markModuleSeen(key);
    });
  }

  function itemStamp(item) {
    if (!item || !item.updatedAt) return 0;
    var t = Date.parse(item.updatedAt);
    return isNaN(t) ? 0 : t;
  }

  function getUnreadForModule(module) {
    if (!data) return [];
    var seen = ensureLastSeen();
    var seenAt = Date.parse(seen[module] || "") || 0;
    return (data[module] || []).filter(function (item) {
      var t = itemStamp(item);
      return t > 0 && t > seenAt;
    });
  }

  function activityPreview(module, item) {
    if (module === "sweets") {
      var who = item.author ? item.author + "：" : "";
      return who + (item.note || "写了一段话");
    }
    if (module === "fights") {
      return item.title || item.note || "记下一次和解";
    }
    if (module === "places") {
      return item.title || "新的足迹";
    }
    if (module === "events") {
      return item.title || "记下重要的事";
    }
    return item.title || item.note || "有新内容";
  }

  function truncateText(s, n) {
    s = String(s || "")
      .replace(/\s+/g, " ")
      .trim();
    if (s.length <= n) return s;
    return s.slice(0, n) + "…";
  }

  function formatRelativeTime(iso) {
    var t = Date.parse(iso || "");
    if (!t) return "";
    var diff = Math.max(0, Date.now() - t);
    if (diff < 60 * 1000) return "刚刚";
    if (diff < 60 * 60 * 1000) return Math.floor(diff / 60000) + " 分钟前";
    if (diff < 24 * 60 * 60 * 1000) {
      return Math.floor(diff / 3600000) + " 小时前";
    }
    var d = new Date(t);
    var today = new Date();
    var yday = new Date();
    yday.setDate(today.getDate() - 1);
    if (d.toDateString() === today.toDateString()) {
      return (
        "今天 " +
        String(d.getHours()).padStart(2, "0") +
        ":" +
        String(d.getMinutes()).padStart(2, "0")
      );
    }
    if (d.toDateString() === yday.toDateString()) return "昨天";
    return d.getMonth() + 1 + "月" + d.getDate() + "日";
  }

  function collectUnreadActivities() {
    if (!data) return [];
    var rows = [];
    MODULE_KEYS.forEach(function (module) {
      getUnreadForModule(module).forEach(function (item) {
        rows.push({
          module: module,
          item: item,
          updatedAt: item.updatedAt
        });
      });
    });
    rows.sort(function (a, b) {
      return itemStamp(b.item) - itemStamp(a.item);
    });
    return rows;
  }

  function renderActivity() {
    if (!data) return;
    ensureLastSeen();
    var section = document.getElementById("home-activity");
    var listEl = document.getElementById("list-activity");
    if (!section || !listEl) return;

    var unread = collectUnreadActivities();
    var counts = {};
    MODULE_KEYS.forEach(function (key) {
      counts[key] = 0;
    });
    unread.forEach(function (row) {
      counts[row.module] += 1;
    });

    MODULE_KEYS.forEach(function (module) {
      var badge = document.querySelector('[data-badge-for="' + module + '"]');
      if (!badge) return;
      var n = counts[module];
      if (n > 0) {
        badge.hidden = false;
        badge.textContent = n > 9 ? "9+" : String(n);
      } else {
        badge.hidden = true;
        badge.textContent = "";
      }
    });

    if (!unread.length) {
      section.hidden = true;
      listEl.innerHTML = "";
      return;
    }

    section.hidden = false;
    listEl.innerHTML = unread
      .slice(0, 8)
      .map(function (row) {
        return (
          "<li><a class=\"activity-item\" href=\"#" +
          escapeText(row.module) +
          "\">" +
          '<p class="activity-module">' +
          escapeText(MODULE_LABELS[row.module] || row.module) +
          "</p>" +
          '<p class="activity-preview">' +
          escapeText(truncateText(activityPreview(row.module, row.item), 48)) +
          "</p>" +
          '<p class="activity-meta">' +
          escapeText(formatRelativeTime(row.updatedAt)) +
          "</p>" +
          "</a></li>"
        );
      })
      .join("");
  }

  /** 自己写入后标已读，避免首页把自己刚写的当成「新动态」 */
  function noteLocalWrite(type) {
    if (type) markModuleSeen(type);
    renderActivity();
  }

  function applyRecoveredSweets(target) {
    if (!target) return target;
    target.sweets = mergeById(target.sweets, RECOVERED_SWEETS);
    return purgeDeleted(target);
  }

  // ----- 页面切换（整页切换，不是叠在首页下面）-----
  function showView(name) {
    if (!VALID_VIEWS[name]) name = "home";

    document.querySelectorAll(".view").forEach(function (el) {
      el.classList.remove("is-active");
      el.hidden = true;
    });
    var target = document.getElementById("view-" + name);
    if (!target) return;
    target.hidden = false;
    target.classList.add("is-active");
    document.body.dataset.view = name;
    if (name !== "home") {
      markModuleSeen(name);
    }
    renderActivity();
    window.scrollTo({ top: 0, behavior: "smooth" });
  }


  function showAppChrome() {
    var settingsBtn = document.getElementById("btn-open-settings");
    if (settingsBtn) settingsBtn.hidden = false;
  }

  function viewFromHash() {
    var raw = (location.hash || "#home").replace(/^#/, "").trim();
    return VALID_VIEWS[raw] ? raw : "home";
  }

  function goToHash(name) {
    if (!VALID_VIEWS[name]) name = "home";
    var next = "#" + name;
    if (location.hash === next) {
      showView(name);
      return;
    }
    location.hash = name;
  }

  window.addEventListener("hashchange", function () {
    showView(viewFromHash());
  });

  document.body.addEventListener("click", function (e) {
    var link = e.target.closest('a[href^="#"]');
    if (!link) return;
    var name = link.getAttribute("href").replace(/^#/, "");
    if (!VALID_VIEWS[name]) return;
    e.preventDefault();
    goToHash(name);
  });

  // ----- 存储 -----
  function normalizeAnniversaries(list) {
    return (list || []).map(function (item, index) {
      return {
        id: item.id || uid(),
        title: item.title || "",
        date: item.date || "",
        note: item.note || "",
        pinned: !!item.pinned,
        // 只有明确设为 true 才进入提醒栏（记录 ≠ 提醒）
        remind: item.remind === true,
        order: typeof item.order === "number" ? item.order : index,
        updatedAt: item.updatedAt || ""
      };
    });
  }

  function applyPublishedSeedIfNeeded() {
    var seed = window.XINBAO_SEED;
    if (!seed || !seed.data) return;
    var ver = String(seed.version || "");
    if (!ver) return;
    var applied = "";
    try {
      applied = localStorage.getItem(SEED_VERSION_KEY) || "";
    } catch (err) {}
    if (applied === ver) return;
    try {
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(seed.data));
      } catch (quotaErr) {
        var slimSeed = seed.data;
        try {
          // seed 可能含大图：超配额时仍写入版本号，避免反复灌入
          slimSeed = JSON.parse(JSON.stringify(seed.data));
          (slimSeed.places || []).forEach(function (place) {
            if (place) place.photos = [];
          });
          localStorage.setItem(STORAGE_KEY, JSON.stringify(slimSeed));
        } catch (err2) {
          throw quotaErr;
        }
      }
      localStorage.setItem(SEED_VERSION_KEY, ver);
    } catch (err) {
      console.warn("发布快照写入失败", err);
    }
  }

  function loadData() {
    var raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return JSON.parse(JSON.stringify(defaultData));
    try {
      var parsed = JSON.parse(raw);
      Object.keys(defaultData).forEach(function (key) {
        if (Array.isArray(defaultData[key])) {
          if (!Array.isArray(parsed[key])) parsed[key] = [];
        }
      });
      parsed.anniversaries = normalizeAnniversaries(parsed.anniversaries);
      // 大事记：兼容旧的单日期字段，支持开始～结束
      parsed.events = (parsed.events || []).map(function (item) {
        var start = item.dateStart || item.date || "";
        var ongoing = item.ongoing === true;
        var end = ongoing ? "" : item.dateEnd || item.date || start;
        return {
          id: item.id || uid(),
          title: item.title || "",
          author: item.author || "",
          dateStart: start,
          dateEnd: end,
          date: start,
          ongoing: ongoing,
          note: item.note || "",
          updatedAt: item.updatedAt || ""
        };
      });
      // 吵架记录：补上来自谁
      parsed.fights = (parsed.fights || []).map(function (item) {
        return {
          id: item.id || uid(),
          title: item.title || "",
          author: item.author || "",
          date: item.date || "",
          note: item.note || "",
          resolve: item.resolve || "",
          reflection: item.reflection || "",
          updatedAt: item.updatedAt || ""
        };
      });
      // 甜蜜想法：去掉旧的自动标题，正文保留在 note；兼容回复
      parsed.sweets = (parsed.sweets || []).map(function (item) {
        return normalizeSweet(item);
      });
      // 足迹：兼容旧的单日期字段
      parsed.places = (parsed.places || []).map(function (item) {
        var start = item.dateStart || item.date || "";
        var end = item.dateEnd || item.date || start;
        return {
          id: item.id || uid(),
          title: item.title || "",
          dateStart: start,
          dateEnd: end,
          cost: Number(item.cost) || 0,
          note: item.note || "",
          photos: Array.isArray(item.photos) ? item.photos : [],
          updatedAt: item.updatedAt || ""
        };
      });
      if (parsed.anniversaries.length === 0) {
        parsed.anniversaries = JSON.parse(JSON.stringify(defaultData.anniversaries));
      }
      // 日记本名称：旧数据没有该字段时，沿用你们原来的专属名；全新本子默认「并记」
      if (!parsed.siteTitle || !String(parsed.siteTitle).trim()) {
        var hasOwnContent =
          (parsed.events && parsed.events.length) ||
          (parsed.sweets && parsed.sweets.length) ||
          (parsed.places && parsed.places.length) ||
          (parsed.fights && parsed.fights.length) ||
          (parsed.anniversaries && parsed.anniversaries.length > 1);
        parsed.siteTitle = hasOwnContent ? "馨宝与树宝" : PRODUCT_NAME;
        parsed.siteTitleAt = parsed.siteTitleAt || "";
      } else {
        parsed.siteTitle = normalizeSiteTitle(parsed.siteTitle);
        parsed.siteTitleAt = parsed.siteTitleAt || "";
      }
      if (!parsed.tombstones || typeof parsed.tombstones !== "object") {
        parsed.tombstones = {};
      }
      return purgeDeleted(parsed);
    } catch (err) {
      return JSON.parse(JSON.stringify(defaultData));
    }
  }

  function saveData() {
    persistLocalData(data);
    if (window.XinbaoCloud && XinbaoCloud.canSync()) {
      // 先拉云端合并，再上传——避免两人各写各的时「后上传的整本盖掉先上传的」
      queueMergePush({ immediate: true });
    }
  }

  var mergePushTimer = null;
  var mergePushRunning = false;
  var mergePushAgain = false;
  // 云端整本 JSON 过大时（常见于足迹 base64 照片）会同步失败
  var CLOUD_PAYLOAD_SOFT_LIMIT = 850000;
  var CLOUD_PAYLOAD_HARD_LIMIT = 1200000;

  function isQuotaError(err) {
    if (!err) return false;
    var name = String(err.name || "");
    var msg = String(err.message || err || "");
    return name === "QuotaExceededError" || /quota/i.test(msg);
  }

  /** 去掉内嵌 base64 照片，保留 http(s) 云相册链接 */
  function stripEmbeddedPhotos(journal) {
    var clone = JSON.parse(JSON.stringify(journal || {}));
    var removed = 0;
    (clone.places || []).forEach(function (place) {
      if (!place) return;
      var kept = [];
      (place.photos || []).forEach(function (src) {
        if (typeof src === "string" && /^https?:\/\//i.test(src)) {
          kept.push(src);
        } else if (typeof src === "string" && src.indexOf("data:") === 0) {
          removed += 1;
        }
      });
      place.photos = kept;
    });
    return { journal: clone, removed: removed };
  }

  /** 本机保存：手机 localStorage 很小，超配额时自动去掉大图以免整站挂掉 */
  function persistLocalData(journal) {
    var payload = journal || data;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return payload;
    } catch (err) {
      if (!isQuotaError(err)) throw err;
      var slim = stripEmbeddedPhotos(payload).journal;
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(slim));
        showToast("手机存储快满了，已先保存不含大图的版本");
        return slim;
      } catch (err2) {
        throw new Error(
          "手机存储配额已满。请用电脑打开并记同步一次（压缩照片），再回手机点「重新加载页面」"
        );
      }
    }
  }

  function queueMergePush(options) {
    options = options || {};
    clearTimeout(mergePushTimer);
    var delay = options.immediate ? 0 : 120;
    mergePushTimer = setTimeout(function () {
      runMergePush();
    }, delay);
  }

  function drawImageToJpegWithOpts(img, maxSide, quality) {
    maxSide = maxSide || 1600;
    quality = quality == null ? 0.82 : quality;
    var w = img.naturalWidth || img.width;
    var h = img.naturalHeight || img.height;
    if (!w || !h) throw new Error("图片尺寸无效");
    if (w > maxSide || h > maxSide) {
      if (w >= h) {
        h = Math.round((h * maxSide) / w);
        w = maxSide;
      } else {
        w = Math.round((w * maxSide) / h);
        h = maxSide;
      }
    }
    var canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    var ctx = canvas.getContext("2d");
    ctx.drawImage(img, 0, 0, w, h);
    var dataUrl = canvas.toDataURL("image/jpeg", quality);
    canvas.width = 0;
    canvas.height = 0;
    if (!dataUrl || dataUrl === "data:,") throw new Error("图片压缩失败");
    return dataUrl;
  }

  function recompressDataUrl(dataUrl, maxSide, quality) {
    return new Promise(function (resolve, reject) {
      if (!dataUrl || String(dataUrl).indexOf("data:image") !== 0) {
        resolve(dataUrl);
        return;
      }
      var img = new Image();
      img.onload = function () {
        try {
          resolve(drawImageToJpegWithOpts(img, maxSide, quality));
        } catch (err) {
          reject(err);
        }
      };
      img.onerror = function () {
        reject(new Error("图片读取失败"));
      };
      img.src = dataUrl;
    });
  }

  function journalHasEmbeddedPhotos(journal) {
    var places = (journal && journal.places) || [];
    for (var i = 0; i < places.length; i++) {
      var photos = places[i] && places[i].photos;
      if (!Array.isArray(photos)) continue;
      for (var j = 0; j < photos.length; j++) {
        if (typeof photos[j] === "string" && photos[j].indexOf("data:image") === 0) {
          return true;
        }
      }
    }
    return false;
  }

  /** 把足迹里的大图逐级压小，直到整本接近云端可传大小（仅处理 data:image） */
  function shrinkJournalPhotos(journal, targetBytes) {
    var clone = JSON.parse(JSON.stringify(journal || {}));
    // 只在确实超限时才压；优先保清晰度
    var levels = [
      { maxSide: 1400, quality: 0.78 },
      { maxSide: 1200, quality: 0.7 },
      { maxSide: 960, quality: 0.6 },
      { maxSide: 720, quality: 0.5 }
    ];

    function currentSize() {
      return JSON.stringify(clone).length;
    }

    function shrinkLevel(level) {
      var tasks = [];
      (clone.places || []).forEach(function (place) {
        if (!place || !Array.isArray(place.photos)) return;
        place.photos.forEach(function (src, idx) {
          if (typeof src !== "string" || src.indexOf("data:image") !== 0) return;
          tasks.push(
            recompressDataUrl(src, level.maxSide, level.quality)
              .then(function (next) {
                if (next && next.length < src.length) {
                  place.photos[idx] = next;
                }
              })
              .catch(function () {})
          );
        });
      });
      return Promise.all(tasks);
    }

    function step(i) {
      if (currentSize() <= targetBytes) return Promise.resolve(clone);
      if (i >= levels.length) return Promise.resolve(clone);
      return shrinkLevel(levels[i]).then(function () {
        return step(i + 1);
      });
    }

    if (currentSize() <= targetBytes) return Promise.resolve(clone);
    return step(0);
  }

  function ensureCloudPayload(journal) {
    var originalSize = JSON.stringify(journal || {}).length;
    var hasEmbedded = journalHasEmbeddedPhotos(journal);
    var oversized = originalSize > CLOUD_PAYLOAD_SOFT_LIMIT;

    // 已是小体积且无内嵌大图：直接上传，不弹提示、不重复压缩
    if (!oversized && !hasEmbedded) {
      return Promise.resolve({
        localJournal: journal,
        cloudJournal: journal,
        changed: false
      });
    }

    // 只有真的要压缩时才弹提示，避免每次切回页面都刷「正在处理照片」
    if (oversized) {
      try {
        showToast("日记较大，正在压缩后同步…");
      } catch (err) {}
    }

    var start = oversized
      ? shrinkJournalPhotos(journal, CLOUD_PAYLOAD_SOFT_LIMIT)
      : Promise.resolve(JSON.parse(JSON.stringify(journal || {})));

    return start
      .then(function (shrunk) {
        // 有内嵌照片时优先迁到云相册；保存足迹后会重置 _skipMigrate
        if (
          journalHasEmbeddedPhotos(shrunk) &&
          !ensureCloudPayload._skipMigrate &&
          window.XinbaoCloud &&
          typeof XinbaoCloud.migrateEmbeddedPhotos === "function" &&
          XinbaoCloud.canSync()
        ) {
          return XinbaoCloud.migrateEmbeddedPhotos(shrunk)
            .then(function (res) {
              var next = res && res.journal ? res.journal : shrunk;
              if (res && res.failures > 0 && !res.changed) {
                ensureCloudPayload._skipMigrate = true;
              }
              return next;
            })
            .catch(function () {
              ensureCloudPayload._skipMigrate = true;
              return shrunk;
            });
        }
        return shrunk;
      })
      .then(function (localJournal) {
        var size = JSON.stringify(localJournal).length;
        var stillEmbedded = journalHasEmbeddedPhotos(localJournal);
        if (size <= CLOUD_PAYLOAD_SOFT_LIMIT && !stillEmbedded) {
          return {
            localJournal: localJournal,
            cloudJournal: localJournal,
            changed: true
          };
        }
        if (size <= CLOUD_PAYLOAD_SOFT_LIMIT) {
          // 仍有 base64 但体积还行：整本带图上传
          return {
            localJournal: localJournal,
            cloudJournal: localJournal,
            changed: size < originalSize || stillEmbedded !== hasEmbedded
          };
        }
        // 仍然过大：云端只能先不同步内嵌大图（会明确提示）
        var safe = stripEmbeddedPhotos(localJournal);
        if (safe.removed) {
          try {
            showToast(
              "照片未能完整同步到云端（另一台可能还看不到）。请少放几张，或配置云相册后再保存"
            );
          } catch (err) {}
        }
        return {
          localJournal: localJournal,
          cloudJournal: safe.journal,
          changed: true,
          stripped: !!safe.removed
        };
      })
      .then(function (ready) {
        var cloudSize = JSON.stringify(ready.cloudJournal).length;
        if (cloudSize > CLOUD_PAYLOAD_HARD_LIMIT) {
          var safer = stripEmbeddedPhotos(ready.cloudJournal);
          ready.cloudJournal = safer.journal;
          ready.stripped = true;
        }
        return ready;
      });
  }

  /** 保存足迹前：尽量把 data:image 上传成云相册链接，这样同步不会把照片剥掉 */
  function uploadPlacePhotosForSync(photos, placeId) {
    var list = Array.isArray(photos) ? photos.slice() : [];
    if (
      !list.length ||
      !window.XinbaoCloud ||
      !XinbaoCloud.canSync() ||
      typeof XinbaoCloud.uploadPlacePhoto !== "function"
    ) {
      return Promise.resolve({
        photos: list,
        uploaded: 0,
        failed: 0,
        skipped: true
      });
    }

    ensureCloudPayload._skipMigrate = false;
    var uploaded = 0;
    var failed = 0;

    return list
      .reduce(function (chain, src) {
        return chain.then(function (acc) {
          if (typeof src === "string" && /^https?:\/\//i.test(src)) {
            acc.push(src);
            return acc;
          }
          if (typeof src !== "string" || src.indexOf("data:image") !== 0) {
            if (src) acc.push(src);
            return acc;
          }
          return XinbaoCloud.uploadPlacePhoto(src, placeId)
            .then(function (url) {
              uploaded += 1;
              acc.push(url);
              return acc;
            })
            .catch(function () {
              failed += 1;
              acc.push(src);
              return acc;
            });
        });
      }, Promise.resolve([]))
      .then(function (next) {
        return {
          photos: next,
          uploaded: uploaded,
          failed: failed,
          skipped: false
        };
      });
  }

  function runMergePush() {
    if (!window.XinbaoCloud || !XinbaoCloud.canSync()) return;
    if (mergePushRunning) {
      mergePushAgain = true;
      return;
    }
    mergePushRunning = true;
    mergePushAgain = false;
    // 深拷贝：避免拉取期间本机又改动，导致合并用到半截状态
    var localSnapshot = JSON.parse(JSON.stringify(data || loadData()));
    XinbaoCloud.pullJournal()
      .then(function (remote) {
        if (remote) {
          var merged = applyRecoveredSweets(
            mergeJournalPayload(localSnapshot, remote)
          );
          data = merged;
          try {
            persistLocalData(data);
          } catch (err) {
            // 手机存不下大图时，内存里仍保留合并结果，至少界面能用
            console.warn(err);
          }
          try {
            renderAll();
            if (document.body.dataset.view === "anniversaries") {
              renderReminders();
            }
          } catch (err) {}
        } else {
          data = purgeDeleted(data || localSnapshot);
        }
        return ensureCloudPayload(data).then(function (ready) {
          if (ready.localJournal) {
            data = ready.localJournal;
            try {
              persistLocalData(data);
            } catch (err) {
              console.warn(err);
            }
            try {
              renderAll();
            } catch (err) {}
          }
          return XinbaoCloud.pushJournal(ready.cloudJournal || data);
        });
      })
      .catch(function (err) {
        console.warn("合并同步失败", err);
        try {
          var msg = (err && err.message) || "同步失败，请稍后再试";
          if (isQuotaError(err) || /quota/i.test(msg)) {
            msg =
              "存储配额已满。请用电脑打开并记→设置→同步最新（会自动压缩/外传照片），再回手机重新加载";
          }
          showToast(msg);
        } catch (e) {}
      })
      .then(function () {
        mergePushRunning = false;
        if (mergePushAgain) runMergePush();
      });
  }

  function setPairMsg(text, ok) {
    var el = document.getElementById("pair-msg");
    if (!el) return;
    if (!text) {
      el.hidden = true;
      el.textContent = "";
      el.classList.remove("ok");
      return;
    }
    el.hidden = false;
    el.textContent = text;
    el.classList.toggle("ok", !!ok);
  }

  function openSettings() {
    var sheet = document.getElementById("settings-sheet");
    if (sheet) sheet.hidden = false;
    applySiteTitle();
    renderPairPanel();
  }

  function closeSettings() {
    var sheet = document.getElementById("settings-sheet");
    if (sheet) sheet.hidden = true;
  }

  function setSettingsAuthError(msg) {
    var el = document.getElementById("settings-auth-error");
    if (!el) return;
    if (!msg) {
      el.hidden = true;
      el.textContent = "";
      return;
    }
    el.hidden = false;
    el.textContent = msg;
  }

  function renderPairPanel() {
    var panel = document.getElementById("pair-panel");
    var loggedIn = document.getElementById("settings-account-logged-in");
    var guest = document.getElementById("settings-account-guest");
    var note = document.getElementById("privacy-note");
    var settingsBtn = document.getElementById("btn-open-settings");

    if (settingsBtn && !document.body.classList.contains("is-locked")) {
      settingsBtn.hidden = false;
    }

    if (!window.XinbaoCloud || !XinbaoCloud.configured()) {
      if (panel) panel.hidden = true;
      if (loggedIn) loggedIn.hidden = true;
      if (guest) guest.hidden = false;
      return;
    }

    var user = XinbaoCloud.getUser();
    var pair = XinbaoCloud.getPair();

    if (user) {
      if (loggedIn) loggedIn.hidden = false;
      if (guest) guest.hidden = true;
      var label = document.getElementById("cloud-user-label");
      if (label) label.textContent = "已登录：" + (user.email || "");
    } else {
      if (loggedIn) loggedIn.hidden = true;
      if (guest) guest.hidden = false;
      if (panel) panel.hidden = true;
      if (note) note.textContent = "私密本机站 · 点板块进入独立页面";
      return;
    }

    if (panel) panel.hidden = false;
    var actions = document.getElementById("pair-actions");
    var waiting = document.getElementById("pair-waiting");
    var ready = document.getElementById("pair-ready");
    var status = document.getElementById("pair-status");
    if (actions) actions.hidden = true;
    if (waiting) waiting.hidden = true;
    if (ready) ready.hidden = true;

    if (!pair) {
      if (status) status.textContent = "还没有房间。创建后生成邀请码，或输入对方邀请码加入。";
      if (actions) actions.hidden = false;
      if (note) note.textContent = "已登录云端 · 配对后即可双向同步";
      return;
    }

    if (!pair.partner_id) {
      if (status) status.textContent = "房间已创建，等待另一半加入。";
      var codeEl = document.getElementById("pair-invite-code");
      if (codeEl) codeEl.textContent = pair.invite_code;
      if (waiting) waiting.hidden = false;
      if (note) note.textContent = "等待配对 · 目前仍主要保存在本机";
      return;
    }

    if (status) {
      status.textContent = "已成功连接，正在同步同一本日记。";
      status.hidden = false;
    }
    if (actions) actions.hidden = true;
    if (waiting) waiting.hidden = true;
    if (ready) ready.hidden = false;
    if (note) note.textContent = "云端同步已开启 · 双方看到同一本";
    renderSyncStatus(XinbaoCloud.getSyncState());
  }

  function renderSyncStatus(info) {
    var el = document.getElementById("sync-status");
    if (!el) return;
    info = info || { state: "local", detail: "" };
    var state = info.state || "local";
    var detail = info.detail || "";
    var text = "同步状态：待命";
    el.classList.remove("is-pending", "is-syncing", "is-synced", "is-error", "is-local");

    if (state === "pending") {
      text = "同步状态：准备上传…";
      el.classList.add("is-pending");
    } else if (state === "syncing") {
      text = "同步状态：正在同步…";
      el.classList.add("is-syncing");
    } else if (state === "synced") {
      text = "同步状态：已同步" + (detail ? "（" + detail + "）" : "");
      el.classList.add("is-synced");
    } else if (state === "error") {
      text = "同步状态：失败" + (detail ? " — " + detail : "") + "，可点「立即同步」重试";
      el.classList.add("is-error");
    } else {
      text = "同步状态：仅本机";
      el.classList.add("is-local");
    }
    el.textContent = text;
  }

  function wirePairControls() {
    var openBtn = document.getElementById("btn-open-settings");
    if (openBtn) {
      openBtn.addEventListener("click", openSettings);
    }
    document.body.addEventListener("click", function (e) {
      if (e.target.closest("[data-close-settings]")) closeSettings();
    });

    var titleForm = document.getElementById("settings-title-form");
    if (titleForm) {
      titleForm.addEventListener("submit", function (e) {
        e.preventDefault();
        if (!data) data = loadData();
        var input = document.getElementById("settings-site-title");
        var next = normalizeSiteTitle(input && input.value);
        data.siteTitle = next;
        data.siteTitleAt = new Date().toISOString();
        saveData();
        applySiteTitle();
        showToast("名称已更新");
      });
    }
    var resetTitleBtn = document.getElementById("btn-reset-site-title");
    if (resetTitleBtn) {
      resetTitleBtn.addEventListener("click", function () {
        if (!data) data = loadData();
        data.siteTitle = PRODUCT_NAME;
        data.siteTitleAt = new Date().toISOString();
        saveData();
        applySiteTitle();
        showToast("已恢复为并记");
      });
    }

    function setBackupMsg(text, ok) {
      var el = document.getElementById("settings-backup-msg");
      if (!el) return;
      if (!text) {
        el.hidden = true;
        el.textContent = "";
        el.style.color = "";
        return;
      }
      el.hidden = false;
      el.textContent = text;
      el.style.color = ok ? "#2f5d50" : "#a33b2b";
    }

    function exportBackup() {
      if (!data) data = loadData();
      var payload = {
        app: PRODUCT_NAME,
        format: "binji-journal-v1",
        exportedAt: new Date().toISOString(),
        data: data
      };
      var json = JSON.stringify(payload, null, 2);
      var blob = new Blob([json], { type: "application/json" });
      var url = URL.createObjectURL(blob);
      var a = document.createElement("a");
      var title = normalizeSiteTitle(data.siteTitle || PRODUCT_NAME).replace(/[\\/:*?"<>|]/g, "-");
      var d = new Date();
      var stamp =
        d.getFullYear() +
        String(d.getMonth() + 1).padStart(2, "0") +
        String(d.getDate()).padStart(2, "0");
      a.href = url;
      a.download = title + "-备份-" + stamp + ".json";
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(function () {
        URL.revokeObjectURL(url);
      }, 1500);
      setBackupMsg("已生成备份文件，请保存到文件 App / 网盘。", true);
      showToast("已导出备份");
    }

    function importBackupFile(file) {
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var parsed = JSON.parse(String(reader.result || ""));
          var incoming = parsed && parsed.data ? parsed.data : parsed;
          if (!incoming || typeof incoming !== "object") {
            throw new Error("文件格式不对");
          }
          var preview =
            "将用备份覆盖本机当前日记。\n\n" +
            "备份时间：" +
            (parsed.exportedAt || "未知") +
            "\n" +
            "纪念日 " +
            ((incoming.anniversaries && incoming.anniversaries.length) || 0) +
            " · 想法 " +
            ((incoming.sweets && incoming.sweets.length) || 0) +
            " · 足迹 " +
            ((incoming.places && incoming.places.length) || 0) +
            "\n\n确定导入吗？";
          if (!window.confirm(preview)) return;

          try {
            persistLocalData(incoming);
          } catch (err) {
            localStorage.setItem(STORAGE_KEY, JSON.stringify(stripEmbeddedPhotos(incoming).journal));
          }
          data = loadData();
          reindexOrders(data.anniversaries);
          applySiteTitle();
          saveData();
          renderAll();
          renderPairPanel();
          setBackupMsg("导入成功。若已配对，会尽快同步到云端。", true);
          showToast("备份已导入");
        } catch (err) {
          setBackupMsg((err && err.message) || "导入失败，请确认是并记导出的 JSON", false);
        }
      };
      reader.onerror = function () {
        setBackupMsg("读取文件失败", false);
      };
      reader.readAsText(file);
    }

    var exportBtn = document.getElementById("btn-export-backup");
    if (exportBtn) {
      exportBtn.addEventListener("click", exportBackup);
    }
    var importBtn = document.getElementById("btn-import-backup");
    var importInput = document.getElementById("import-backup-input");
    if (importBtn && importInput) {
      importBtn.addEventListener("click", function () {
        setBackupMsg("");
        importInput.value = "";
        importInput.click();
      });
      importInput.addEventListener("change", function () {
        var file = importInput.files && importInput.files[0];
        importBackupFile(file);
      });
    }

    var softRefreshBtn = document.getElementById("btn-soft-refresh");
    if (softRefreshBtn) {
      softRefreshBtn.addEventListener("click", function () {
        softRefreshBtn.disabled = true;
        showToast("正在同步…");
        ensureCloudPayload._skipMigrate = false;
        var done = function (msg) {
          softRefreshBtn.disabled = false;
          showToast(msg || "已同步");
        };
        try {
          if (!window.XinbaoCloud || !XinbaoCloud.canSync()) {
            data = loadData();
            applySiteTitle();
            renderAll();
            renderPairPanel();
            done("已刷新本机内容");
            return;
          }
          var localSnapshot = JSON.parse(JSON.stringify(data || loadData()));
          XinbaoCloud.pullJournal()
            .then(function (remote) {
              if (remote) {
                data = applyRecoveredSweets(
                  mergeJournalPayload(localSnapshot, remote)
                );
              } else {
                data = purgeDeleted(data || localSnapshot);
              }
              try {
                persistLocalData(data);
              } catch (err) {
                console.warn(err);
              }
              applySiteTitle();
              renderAll();
              renderPairPanel();
              return ensureCloudPayload(data).then(function (ready) {
                if (ready.localJournal) {
                  data = ready.localJournal;
                  try {
                    persistLocalData(data);
                  } catch (err) {
                    console.warn(err);
                  }
                  renderAll();
                }
                return XinbaoCloud.pushJournal(ready.cloudJournal || data);
              });
            })
            .then(function () {
              done("已同步最新内容");
            })
            .catch(function (err) {
              console.warn(err);
              var msg = (err && err.message) || "同步失败，请稍后再试";
              if (isQuotaError(err) || /quota/i.test(msg)) {
                msg =
                  "存储配额已满。请用电脑同步一次压缩照片后，再回手机重新加载";
              }
              done(msg);
            });
        } catch (err) {
          softRefreshBtn.disabled = false;
          showToast("刷新失败");
        }
      });
    }

    var reloadBtn = document.getElementById("btn-reload-app");
    if (reloadBtn) {
      reloadBtn.addEventListener("click", function () {
        showToast("正在重新加载…");
        // 立刻跳转并带时间戳，减少手机端卡在旧缓存上的等待感
        var url = location.href.split("#")[0].split("?")[0] + "?t=" + Date.now();
        var hash = location.hash || "#home";
        setTimeout(function () {
          location.replace(url + hash);
        }, 50);
      });
    }

    var settingsForm = document.getElementById("settings-auth-form");
    if (settingsForm) {
      settingsForm.addEventListener("submit", function (e) {
        e.preventDefault();
        setSettingsAuthError("");
        var email = document.getElementById("settings-email").value.trim();
        var password = document.getElementById("settings-password").value;
        XinbaoCloud.signIn(email, password)
          .then(function () {
            return XinbaoCloud.loadPair();
          })
          .then(function () {
            renderPairPanel();
            showToast("已登录");
            if (XinbaoCloud.canSync()) {
              return XinbaoCloud.pullJournal().then(function (payload) {
                if (payload) {
                  var merged = applyRecoveredSweets(
                    mergeJournalPayload(loadData(), payload)
                  );
                  try {
                    persistLocalData(merged);
                  } catch (err) {
                    console.warn(err);
                  }
                  data = loadData();
                  applySiteTitle();
                  reindexOrders(data.anniversaries);
                  renderAll();
                }
                return XinbaoCloud.pushJournal(data);
              });
            }
          })
          .catch(function (err) {
            setSettingsAuthError(
              (err && err.message) ||
                (XinbaoCloud.friendlyAuthError && XinbaoCloud.friendlyAuthError(err)) ||
                "登录失败"
            );
          });
      });
    }

    var settingsSignup = document.getElementById("settings-signup-btn");
    if (settingsSignup) {
      settingsSignup.addEventListener("click", function () {
        setSettingsAuthError("");
        var email = document.getElementById("settings-email").value.trim();
        var password = document.getElementById("settings-password").value;
        XinbaoCloud.signUp(email, password)
          .then(function () {
            return XinbaoCloud.signIn(email, password);
          })
          .then(function () {
            return XinbaoCloud.loadPair();
          })
          .then(function () {
            setSettingsAuthError("");
            renderPairPanel();
            showToast("注册并登录成功");
          })
          .catch(function (err) {
            setSettingsAuthError((err && err.message) || "注册失败");
          });
      });
    }

    var createBtn = document.getElementById("btn-create-pair");
    if (createBtn) {
      createBtn.addEventListener("click", function () {
        setPairMsg("");
        XinbaoCloud.createPair()
          .then(function () {
            setPairMsg("已生成邀请码", true);
            renderPairPanel();
          })
          .catch(function (err) {
            setPairMsg((err && err.message) || "创建失败");
          });
      });
    }

    var joinForm = document.getElementById("join-pair-form");
    if (joinForm) {
      joinForm.addEventListener("submit", function (e) {
        e.preventDefault();
        setPairMsg("");
        var code = document.getElementById("join-pair-code").value;
        XinbaoCloud.joinPair(code)
          .then(function () {
            setPairMsg("加入成功，开始同步…", true);
            return XinbaoCloud.pullJournal().then(function (payload) {
              if (payload) {
                var merged = applyRecoveredSweets(
                  mergeJournalPayload(loadData(), payload)
                );
                try {
                  persistLocalData(merged);
                } catch (err) {
                  console.warn(err);
                }
                data = loadData();
                reindexOrders(data.anniversaries);
                saveData();
                renderAll();
              } else {
                // 云端还没有本子：把当前本机内容上传
                return XinbaoCloud.pushJournal(data);
              }
            });
          })
          .then(function () {
            renderPairPanel();
            showToast("已连上共享本");
          })
          .catch(function (err) {
            setPairMsg((err && err.message) || "加入失败");
          });
      });
    }

    var logoutBtn = document.getElementById("btn-cloud-logout");
    if (logoutBtn) {
      logoutBtn.addEventListener("click", function () {
        XinbaoCloud.signOut().then(function () {
          try {
            if (window.XinbaoClearGate) window.XinbaoClearGate();
            else {
              localStorage.removeItem("xinbao-shubao-gate-ok");
              sessionStorage.removeItem("xinbao-shubao-gate-ok");
            }
          } catch (err) {}
          location.reload();
        });
      });
    }

    var refreshPairBtn = document.getElementById("btn-refresh-pair");
    if (refreshPairBtn) {
      refreshPairBtn.addEventListener("click", function () {
        setPairMsg("");
        XinbaoCloud.loadPair()
          .then(function () {
            renderPairPanel();
            if (!XinbaoCloud.canSync()) {
              setPairMsg("还在等待对方加入");
              return null;
            }
            return XinbaoCloud.pullJournal().then(function (payload) {
              if (payload) {
                var merged = applyRecoveredSweets(
                  mergeJournalPayload(loadData(), payload)
                );
                try {
                  persistLocalData(merged);
                } catch (err) {
                  console.warn(err);
                }
                data = loadData();
                reindexOrders(data.anniversaries);
                renderAll();
              }
              return XinbaoCloud.pushJournal(data);
            }).then(function () {
              setPairMsg("已同步共享本", true);
              showToast("云端同步已开启");
              renderPairPanel();
            });
          })
          .catch(function (err) {
            setPairMsg((err && err.message) || "刷新失败");
          });
      });
    }

    function handleLeavePair() {
      var p = XinbaoCloud.getPair();
      if (!p) return;
      var msg = p.partner_id
        ? "确定退出二人空间吗？\n\n你这边会停止云端同步，但本机内容还在。\n对方仍可继续使用这份共享本。"
        : "确定取消这个还没人加入的二人空间吗？";
      if (!confirm(msg)) return;
      setPairMsg("");
      XinbaoCloud.leavePair()
        .then(function () {
          setPairMsg("已退出二人空间", true);
          showToast("已退出配对");
          renderPairPanel();
        })
        .catch(function (err) {
          setPairMsg((err && err.message) || "退出失败");
        });
    }

    var leaveWaiting = document.getElementById("btn-leave-pair-waiting");
    if (leaveWaiting) leaveWaiting.addEventListener("click", handleLeavePair);
    var leaveReady = document.getElementById("btn-leave-pair-ready");
    if (leaveReady) leaveReady.addEventListener("click", handleLeavePair);

    var syncNowBtn = document.getElementById("btn-sync-now");
    if (syncNowBtn) {
      syncNowBtn.addEventListener("click", function () {
        if (!XinbaoCloud.canSync()) {
          setPairMsg("请先完成二人配对");
          return;
        }
        setPairMsg("正在同步…");
        ensureCloudPayload._skipMigrate = false;
        ensureCloudPayload(data)
          .then(function (ready) {
            if (ready.localJournal) {
              data = ready.localJournal;
              try {
                persistLocalData(data);
              } catch (err) {
                console.warn(err);
              }
              try {
                renderAll();
              } catch (err) {}
            }
            return XinbaoCloud.pushJournal(ready.cloudJournal || data);
          })
          .then(function () {
            setPairMsg("已同步到云端", true);
            showToast("已同步到云端");
          })
          .catch(function (err) {
            var msg = (err && err.message) || "同步失败";
            if (isQuotaError(err) || /quota/i.test(msg)) {
              msg =
                "存储配额已满。请减少足迹照片后，在电脑上再点同步最新";
            }
            setPairMsg(msg);
          });
      });
    }

    if (XinbaoCloud.onStatusChange) {
      XinbaoCloud.onStatusChange(function (info) {
        renderSyncStatus(info);
      });
    }
  }

  function bootWithData() {
    data = applyRecoveredSweets(loadData());
    reindexOrders(data.anniversaries);
    try {
      saveData();
    } catch (err) {
      console.warn("保存失败（可能是手机存储空间不足）", err);
    }
    updateDaysTogether();
    fillDefaultDates();
    applySiteTitle();
    showAppChrome();
    renderPairPanel();
    renderAll();
    if (!location.hash || location.hash === "#") {
      location.replace("#home");
    }
    showView(viewFromHash());
  }

  function showToast(message) {
    var el = document.getElementById("toast");
    if (!el) return;
    el.textContent = message || "已保存";
    el.hidden = false;
    el.classList.remove("is-show");
    // 触发重新播放动画
    void el.offsetWidth;
    el.classList.add("is-show");
    clearTimeout(showToast._timer);
    showToast._timer = setTimeout(function () {
      el.classList.remove("is-show");
      showToast._timer = setTimeout(function () {
        el.hidden = true;
      }, 280);
    }, 1700);
  }

  var markAllSeenBtn = document.getElementById("btn-mark-all-seen");
  if (markAllSeenBtn) {
    markAllSeenBtn.addEventListener("click", function () {
      markAllModulesSeen();
      renderActivity();
      showToast("已全部标为已读");
    });
  }

  function uid() {
    return "id-" + Date.now() + "-" + Math.floor(Math.random() * 10000);
  }

  function daysSince(dateStr) {
    if (!dateStr) return 0;
    var start = new Date(dateStr + "T00:00:00");
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var diff = Math.floor((today - start) / (1000 * 60 * 60 * 24)) + 1;
    return diff < 1 ? 1 : diff;
  }

  function daysLabel(item) {
    var n = daysSince(item.date);
    return "已经" + n + "天了";
  }

  function updateDaysTogether() {
    document.getElementById("days-together").textContent = String(daysSince(START_DATE));
  }

  function todayDate() {
    var now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate());
  }

  function makeMonthDay(year, month, day) {
    // month: 1-12；处理 2 月 29 日
    if (month === 2 && day === 29) {
      var leap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
      if (!leap) day = 28;
    }
    return new Date(year, month - 1, day);
  }

  function nextYearlyDate(dateStr) {
    if (!dateStr || dateStr.length < 10) return null;
    var month = Number(dateStr.slice(5, 7));
    var day = Number(dateStr.slice(8, 10));
    if (!month || !day) return null;
    var today = todayDate();
    var year = today.getFullYear();
    var next = makeMonthDay(year, month, day);
    if (next < today) next = makeMonthDay(year + 1, month, day);
    return next;
  }

  function daysUntilDate(dateObj) {
    if (!dateObj) return null;
    return Math.round((dateObj - todayDate()) / (1000 * 60 * 60 * 24));
  }

  function formatMonthDay(dateObj) {
    if (!dateObj) return "";
    return dateObj.getMonth() + 1 + "月" + dateObj.getDate() + "日";
  }

  function remindCountdownLabel(days) {
    if (days === 0) return "就是今天";
    if (days === 1) return "明天";
    // 按「每年一次」计算，距离下一次纪念日
    return "一年还有 " + days + " 天";
  }

  function getUpcomingReminders() {
    return (data.anniversaries || [])
      .filter(function (item) {
        return item.remind === true && item.date;
      })
      .map(function (item) {
        var next = nextYearlyDate(item.date);
        return {
          id: item.id,
          title: item.title,
          next: next,
          daysLeft: daysUntilDate(next)
        };
      })
      .filter(function (row) {
        return row.next && row.daysLeft != null && row.daysLeft >= 0;
      })
      .sort(function (a, b) {
        return a.daysLeft - b.daysLeft;
      });
  }

  function renderReminders() {
    var listEl = document.getElementById("list-reminders");
    if (!listEl) return;
    var upcoming = getUpcomingReminders().slice(0, 4);

    if (!upcoming.length) {
      listEl.innerHTML =
        '<li class="reminder-empty">需要每年记住的日子，在「纪念日」里点「加入提醒」即可出现在这里。<br />像「搬进小家」这种只想留念的，不必加入提醒。</li>';
      return;
    }

    listEl.innerHTML = upcoming
      .map(function (row) {
        var urgency =
          row.daysLeft === 0 ? " is-today" : row.daysLeft <= 7 ? " is-soon" : "";
        return (
          '<li class="reminder-item' +
          urgency +
          '">' +
          '<div class="reminder-text">' +
          '<p class="reminder-name">' +
          escapeText(row.title || "纪念日") +
          "</p>" +
          '<p class="reminder-date">' +
          escapeText("下次：" + formatMonthDay(row.next)) +
          "</p>" +
          "</div>" +
          '<p class="reminder-countdown">' +
          escapeText(remindCountdownLabel(row.daysLeft)) +
          "</p>" +
          "</li>"
        );
      })
      .join("");
  }

  function findItem(type, id) {
    var list = data[type] || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function setModalTitle(titleId, text) {
    var el = document.getElementById(titleId);
    if (el) el.textContent = text;
  }

  function editButtonHtml(type, id) {
    return (
      '<button type="button" class="btn-mini" data-edit="' +
      escapeText(type) +
      '" data-id="' +
      escapeText(id) +
      '">编辑</button>'
    );
  }

  function clearEditing() {
    editingId = null;
  }

  // ----- 写作草稿（退出弹窗不丢未保存内容）-----
  var draftSaveTimer = null;
  var activeDraft = { kind: "", id: null, extra: "" };

  function draftSlot(kind, id, extra) {
    var slot = String(kind || "") + "::" + (id || "new");
    if (extra) slot += "::" + extra;
    return slot;
  }

  function readAllDrafts() {
    try {
      var raw = localStorage.getItem(DRAFT_KEY);
      if (!raw) return {};
      var parsed = JSON.parse(raw);
      return parsed && typeof parsed === "object" ? parsed : {};
    } catch (err) {
      return {};
    }
  }

  function writeAllDrafts(map) {
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify(map || {}));
    } catch (err) {}
  }

  function clearDraft(slot) {
    if (!slot) return;
    var all = readAllDrafts();
    if (!Object.prototype.hasOwnProperty.call(all, slot)) return;
    delete all[slot];
    writeAllDrafts(all);
  }

  function collectFormFields(form) {
    var out = {};
    if (!form) return out;
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el || !el.name) return;
      var tag = (el.tagName || "").toLowerCase();
      if (tag !== "input" && tag !== "textarea" && tag !== "select") return;
      if (
        el.type === "button" ||
        el.type === "submit" ||
        el.type === "file" ||
        el.type === "hidden"
      ) {
        return;
      }
      if (el.type === "checkbox") out[el.name] = !!el.checked;
      else out[el.name] = el.value;
    });
    return out;
  }

  function fillFormFields(form, fields) {
    if (!form || !fields) return;
    Object.keys(fields).forEach(function (name) {
      var el = form.elements[name];
      if (!el) return;
      if (el.type === "checkbox") el.checked = !!fields[name];
      else el.value = fields[name] == null ? "" : String(fields[name]);
    });
  }

  function draftIsMeaningful(kind, fields) {
    if (!fields) return false;
    function text(key) {
      return String(fields[key] || "").trim();
    }
    if (kind === "sweets" || kind === "sweet-reply") return !!text("note");
    if (kind === "anniversaries") return !!text("title") || !!text("note");
    if (kind === "events") return !!text("title") || !!text("note");
    if (kind === "fights") {
      return (
        !!text("title") ||
        !!text("note") ||
        !!text("resolve") ||
        !!text("reflection")
      );
    }
    if (kind === "places") {
      return !!text("title") || !!text("note") || !!text("cost");
    }
    return Object.keys(fields).some(function (key) {
      return String(fields[key] || "").trim();
    });
  }

  function saveDraftFromForm(kind, id, form, extra) {
    if (!kind || !form) return false;
    var slot = draftSlot(kind, id, extra);
    var fields = collectFormFields(form);
    if (!draftIsMeaningful(kind, fields)) {
      clearDraft(slot);
      return false;
    }
    var all = readAllDrafts();
    all[slot] = {
      fields: fields,
      savedAt: new Date().toISOString()
    };
    writeAllDrafts(all);
    return true;
  }

  function restoreDraftToForm(kind, id, form, extra) {
    if (!kind || !form) return false;
    var all = readAllDrafts();
    var draft = all[draftSlot(kind, id, extra)];
    if (!draft || !draft.fields) return false;
    fillFormFields(form, draft.fields);
    return true;
  }

  /** 打开弹窗填好内容后记录快照；关闭时只有改过才提示草稿已保存 */
  var draftBaselineJson = "";

  function snapshotDraftBaseline(form, photoList) {
    var fields = collectFormFields(form);
    if (photoList) fields.__photos = photoList.slice();
    draftBaselineJson = JSON.stringify(fields);
  }

  function isDraftDirty(form, photoList) {
    if (!form || !draftBaselineJson) return false;
    var fields = collectFormFields(form);
    if (photoList) fields.__photos = photoList.slice();
    return JSON.stringify(fields) !== draftBaselineJson;
  }

  function maybePersistDraftOnClose(kind, id, form, extra, photoList) {
    if (!form || !isDraftDirty(form, photoList)) return false;
    if (saveDraftFromForm(kind, id, form, extra)) {
      showToast("草稿已保存");
      return true;
    }
    return false;
  }

  function setActiveDraft(kind, id, extra) {
    activeDraft = {
      kind: kind || "",
      id: id || null,
      extra: extra || ""
    };
  }

  function clearActiveDraft() {
    activeDraft = { kind: "", id: null, extra: "" };
    draftBaselineJson = "";
  }

  function queueActiveDraftSave() {
    clearTimeout(draftSaveTimer);
    draftSaveTimer = setTimeout(function () {
      if (!activeDraft.kind) return;
      var formId =
        activeDraft.kind === "anniversaries"
          ? "form-anniversary"
          : activeDraft.kind === "events"
            ? "form-event"
            : activeDraft.kind === "sweets"
              ? "form-sweet"
              : activeDraft.kind === "sweet-reply"
                ? "form-sweet-reply"
                : activeDraft.kind === "fights"
                  ? "form-fight"
                  : activeDraft.kind === "places"
                    ? "form-place"
                    : "";
      var form = formId ? document.getElementById(formId) : null;
      if (!form) return;
      saveDraftFromForm(
        activeDraft.kind,
        activeDraft.id,
        form,
        activeDraft.extra
      );
    }, 350);
  }

  document.body.addEventListener("input", function (e) {
    if (!e.target || !e.target.closest) return;
    if (
      !e.target.closest(
        "#form-anniversary, #form-event, #form-sweet, #form-sweet-reply, #form-fight, #form-place"
      )
    ) {
      return;
    }
    queueActiveDraftSave();
  });
  document.body.addEventListener("change", function (e) {
    if (!e.target || !e.target.closest) return;
    if (
      !e.target.closest(
        "#form-anniversary, #form-event, #form-sweet, #form-sweet-reply, #form-fight, #form-place"
      )
    ) {
      return;
    }
    queueActiveDraftSave();
  });

  function escapeText(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function sortByDateDesc(arr) {
    return arr.slice().sort(function (a, b) {
      var star = (!!b.starred) - (!!a.starred);
      if (star !== 0) return star;
      return (b.date || "").localeCompare(a.date || "");
    });
  }

  /** 想对你说：日期新→旧；同一天再按写入/更新时间，最新在上；星标置顶 */
  function sortSweetsDesc(arr) {
    return arr.slice().sort(function (a, b) {
      var star = (!!b.starred) - (!!a.starred);
      if (star !== 0) return star;
      var byDate = (b.date || "").localeCompare(a.date || "");
      if (byDate !== 0) return byDate;
      return sweetStamp(b) - sweetStamp(a);
    });
  }

  function sortRepliesAsc(arr) {
    return (arr || []).slice().sort(function (a, b) {
      var byDate = (a.date || "").localeCompare(b.date || "");
      if (byDate !== 0) return byDate;
      return sweetStamp(a) - sweetStamp(b);
    });
  }

  function sortEvents(arr) {
    return arr.slice().sort(function (a, b) {
      var star = (!!b.starred) - (!!a.starred);
      if (star !== 0) return star;
      return (b.dateStart || b.date || "").localeCompare(a.dateStart || a.date || "");
    });
  }

  function formatDateRange(start, end, ongoing) {
    var s = start || "";
    if (!s) return "";
    if (ongoing) return s + " ～ 现在";
    var e = end || s;
    if (!e || e === s) return s;
    return s + " ～ " + e;
  }

  function getFilterQuery(type) {
    var input = document.getElementById("filter-q-" + type);
    return input ? (input.value || "").trim().toLowerCase() : "";
  }

  function getFilterAuthor(type) {
    var bar = document.querySelector('.filter-bar[data-type="' + type + '"]');
    if (!bar) return "";
    var active = bar.querySelector(".author-chip.is-active");
    return active ? active.getAttribute("data-author") || "" : "";
  }

  function getFilterStarredOnly(type) {
    var bar = document.querySelector('.filter-bar[data-type="' + type + '"]');
    if (!bar) return false;
    var active = bar.querySelector(".star-filter-chip.is-active");
    return !!(active && active.getAttribute("data-starred") === "1");
  }

  function starButtonHtml(type, id, starred) {
    var on = !!starred;
    return (
      '<button type="button" class="btn-star' +
      (on ? " is-on" : "") +
      '" data-star-type="' +
      escapeText(type) +
      '" data-star-id="' +
      escapeText(id) +
      '" aria-label="' +
      (on ? "取消星标" : "加星标") +
      '" title="' +
      (on ? "取消星标" : "星标为重要") +
      '">' +
      (on ? "★" : "☆") +
      "</button>"
    );
  }

  function textHasQuery(text, q) {
    if (!q) return true;
    return String(text || "").toLowerCase().indexOf(q) !== -1;
  }

  function itemMatchesFilters(item, type) {
    var q = getFilterQuery(type);
    var author = getFilterAuthor(type);

    if (getFilterStarredOnly(type) && !item.starred) return false;
    if (author && (item.author || "") !== author) return false;

    if (!q) return true;

    if (type === "anniversaries") {
      return textHasQuery(item.title, q) || textHasQuery(item.note, q);
    }
    if (type === "events") {
      return (
        textHasQuery(item.title, q) ||
        textHasQuery(item.note, q) ||
        textHasQuery(item.author, q)
      );
    }
    if (type === "sweets") {
      var replyHit = (item.replies || []).some(function (r) {
        return textHasQuery(r.note, q) || textHasQuery(r.author, q);
      });
      return (
        textHasQuery(item.note, q) ||
        textHasQuery(item.title, q) ||
        textHasQuery(item.author, q) ||
        replyHit
      );
    }
    if (type === "places") {
      return textHasQuery(item.title, q) || textHasQuery(item.note, q);
    }
    if (type === "fights") {
      return (
        textHasQuery(item.title, q) ||
        textHasQuery(item.note, q) ||
        textHasQuery(item.resolve, q) ||
        textHasQuery(item.reflection, q) ||
        textHasQuery(item.author, q)
      );
    }
    return true;
  }

  function emptyFilterMessage() {
    return '<li class="empty">没有符合条件的记录，试试换个关键词或筛选。</li>';
  }

  function renderEvents() {
    var listEl = document.getElementById("list-events");
    var all = data.events || [];

    if (!all.length) {
      listEl.innerHTML = '<li class="empty">还没有记下重要的事，点右下角 + 添加吧。</li>';
      return;
    }

    var items = sortEvents(all.filter(function (item) {
      return itemMatchesFilters(item, "events");
    }));

    if (!items.length) {
      listEl.innerHTML = emptyFilterMessage();
      return;
    }

    listEl.innerHTML = items
      .map(function (item) {
        var range = formatDateRange(
          item.dateStart || item.date,
          item.dateEnd,
          item.ongoing === true
        );
        var meta = item.author
          ? '<p class="entry-meta">来自 ' + escapeText(item.author) + "</p>"
          : "";
        var note = item.note
          ? '<p class="entry-note">' + escapeText(item.note) + "</p>"
          : "";
        return (
          '<li class="entry-item' +
          (item.starred ? " is-starred" : "") +
          '">' +
          '<div class="entry-top">' +
          '<p class="entry-title">' +
          (item.starred ? '<span class="star-badge">★</span>' : "") +
          escapeText(item.title || "（无标题）") +
          "</p>" +
          '<p class="entry-date">' +
          escapeText(range) +
          "</p>" +
          "</div>" +
          meta +
          note +
          '<div class="entry-actions">' +
          starButtonHtml("events", item.id, item.starred) +
          editButtonHtml("events", item.id) +
          '<button type="button" class="btn-delete" data-type="events" data-id="' +
          escapeText(item.id) +
          '">删除</button>' +
          "</div>" +
          "</li>"
        );
      })
      .join("");
  }

  function getAnniSortMode() {
    var active = document.querySelector(".sort-chip.is-active");
    return active ? active.getAttribute("data-sort") : "manual";
  }

  function sortAnniversaries(list) {
    var mode = getAnniSortMode();
    var arr = list.slice();

    function byStar(a, b) {
      return (!!b.starred) - (!!a.starred);
    }

    if (mode === "date-desc") {
      return arr.sort(function (a, b) {
        var s = byStar(a, b);
        if (s !== 0) return s;
        return (b.date || "").localeCompare(a.date || "");
      });
    }
    if (mode === "date-asc") {
      return arr.sort(function (a, b) {
        var s = byStar(a, b);
        if (s !== 0) return s;
        return (a.date || "").localeCompare(b.date || "");
      });
    }
    if (mode === "days-desc") {
      return arr.sort(function (a, b) {
        var s = byStar(a, b);
        if (s !== 0) return s;
        return daysSince(b.date) - daysSince(a.date);
      });
    }

    // manual：星标 → 置顶 → order
    return arr.sort(function (a, b) {
      var s = byStar(a, b);
      if (s !== 0) return s;
      if (!!b.pinned - !!a.pinned !== 0) return (!!b.pinned) - (!!a.pinned);
      return (a.order || 0) - (b.order || 0);
    });
  }

  function reindexOrders(list) {
    // 按当前手动顺序重写 order，方便上移下移
    var sorted = list.slice().sort(function (a, b) {
      if (!!b.pinned - !!a.pinned !== 0) return (!!b.pinned) - (!!a.pinned);
      return (a.order || 0) - (b.order || 0);
    });
    sorted.forEach(function (item, i) {
      item.order = i;
    });
  }

  function renderAnniversaries() {
    var listEl = document.getElementById("list-anniversaries");
    var all = data.anniversaries || [];
    var manual = getAnniSortMode() === "manual";

    if (!all.length) {
      listEl.innerHTML = '<li class="empty">还没有纪念日，点右下角 + 添加一条吧。</li>';
      return;
    }

    var items = sortAnniversaries(
      all.filter(function (item) {
        return itemMatchesFilters(item, "anniversaries");
      })
    );

    if (!items.length) {
      listEl.innerHTML = emptyFilterMessage();
      return;
    }

    listEl.innerHTML = items.map(function (item, index) {
      var pinBadge = item.pinned ? '<span class="pin-badge">置顶</span>' : "";
      var isRemind = item.remind === true;
      var remindBadge = isRemind ? '<span class="remind-badge">提醒中</span>' : "";
      var note = item.note
        ? '<p class="entry-note">' + escapeText(item.note) + "</p>"
        : "";
      var next = isRemind ? nextYearlyDate(item.date) : null;
      var daysLeft = next ? daysUntilDate(next) : null;
      var remindLine =
        next && daysLeft != null
          ? '<p class="entry-remind">' +
            escapeText(
              daysLeft === 0
                ? "今天就是这一天"
                : "下次：" +
                  formatMonthDay(next) +
                  " · " +
                  remindCountdownLabel(daysLeft)
            ) +
            "</p>"
          : "";
      var moveBtns = manual
        ? '<button type="button" class="btn-mini" data-anni-act="up" data-id="' +
          escapeText(item.id) +
          '">上移</button>' +
          '<button type="button" class="btn-mini" data-anni-act="down" data-id="' +
          escapeText(item.id) +
          '">下移</button>'
        : "";
      var remindBtn =
        '<button type="button" class="btn-mini' +
        (isRemind ? " btn-mini--active" : " btn-mini--accent") +
        '" data-anni-act="remind" data-id="' +
        escapeText(item.id) +
        '">' +
        (isRemind ? "移出提醒" : "加入提醒") +
        "</button>";

      return (
        '<li class="entry-item' +
        (item.pinned ? " is-pinned" : "") +
        (isRemind ? " is-remind" : "") +
        (item.starred ? " is-starred" : "") +
        '">' +
        '<div class="entry-top">' +
        '<p class="entry-title">' +
        (item.starred ? '<span class="star-badge">★</span>' : "") +
        pinBadge +
        remindBadge +
        escapeText(item.title || "（无标题）") +
        "</p>" +
        '<p class="entry-date">' +
        escapeText(item.date || "") +
        "</p>" +
        "</div>" +
        '<p class="entry-days">' +
        escapeText(daysLabel(item)) +
        "</p>" +
        remindLine +
        note +
        '<div class="entry-actions">' +
        starButtonHtml("anniversaries", item.id, item.starred) +
        remindBtn +
        '<button type="button" class="btn-mini" data-anni-act="pin" data-id="' +
        escapeText(item.id) +
        '">' +
        (item.pinned ? "取消置顶" : "置顶") +
        "</button>" +
        moveBtns +
        editButtonHtml("anniversaries", item.id) +
        '<button type="button" class="btn-delete" data-type="anniversaries" data-id="' +
        escapeText(item.id) +
        '">删除</button>' +
        "</div>" +
        "</li>"
      );
    }).join("");
  }

  function sortPlaces(arr) {
    return arr.slice().sort(function (a, b) {
      var star = (!!b.starred) - (!!a.starred);
      if (star !== 0) return star;
      return (b.dateStart || "").localeCompare(a.dateStart || "");
    });
  }

  function formatMoney(n) {
    var num = Number(n) || 0;
    return num.toLocaleString("zh-CN", {
      minimumFractionDigits: 0,
      maximumFractionDigits: 2
    });
  }

  function renderPlaces() {
    var listEl = document.getElementById("list-places");
    var all = data.places || [];

    if (!all.length) {
      listEl.innerHTML = '<li class="empty">还没有足迹，点右下角 + 添加一次旅程吧。</li>';
      return;
    }

    var items = sortPlaces(
      all.filter(function (item) {
        return itemMatchesFilters(item, "places");
      })
    );

    if (!items.length) {
      listEl.innerHTML = emptyFilterMessage();
      return;
    }

    listEl.innerHTML = items.map(function (item) {
      var range =
        escapeText(item.dateStart || "") +
        (item.dateEnd && item.dateEnd !== item.dateStart
          ? " ～ " + escapeText(item.dateEnd)
          : "");
      var note = item.note
        ? '<p class="entry-note">' + escapeText(item.note) + "</p>"
        : "";
      var costHtml =
        '<p class="place-cost">花销：¥ ' + formatMoney(item.cost) + "</p>";
      var photos = Array.isArray(item.photos) ? item.photos : [];
      var photosHtml = "";
      if (photos.length) {
        photosHtml =
          '<div class="place-stack" data-place-id="' +
          escapeText(item.id) +
          '" aria-label="足迹照片' +
          photos.length +
          '张">' +
          photos
            .slice(0, 5)
            .map(function (src, i) {
              return (
                '<button type="button" class="place-stack-card" style="--i:' +
                i +
                '" data-place-id="' +
                escapeText(item.id) +
                '" data-photo-index="' +
                i +
                '" aria-label="查看照片' +
                (i + 1) +
                '">' +
                '<img src="' +
                src +
                '" alt="" class="place-photo-thumb" />' +
                "</button>"
              );
            })
            .join("") +
          (photos.length > 1
            ? '<span class="place-stack-count">' + photos.length + "</span>"
            : "") +
          "</div>";
      }

      return (
        '<li class="entry-item entry-item--place' +
        (item.starred ? " is-starred" : "") +
        '">' +
        '<div class="place-main">' +
        '<div class="entry-top">' +
        '<p class="entry-title">' +
        (item.starred ? '<span class="star-badge">★</span>' : "") +
        escapeText(item.title || "（未命名地点）") +
        "</p>" +
        '<p class="place-range">' +
        range +
        "</p>" +
        "</div>" +
        costHtml +
        note +
        '<div class="entry-actions">' +
        starButtonHtml("places", item.id, item.starred) +
        editButtonHtml("places", item.id) +
        '<button type="button" class="btn-mini" data-edit-place-photos="' +
        escapeText(item.id) +
        '">照片</button>' +
        '<button type="button" class="btn-delete" data-type="places" data-id="' +
        escapeText(item.id) +
        '">删除</button>' +
        "</div>" +
        "</div>" +
        photosHtml +
        "</li>"
      );
    }).join("");
  }

  function renderList(type) {
    if (type === "anniversaries") {
      renderAnniversaries();
      return;
    }
    if (type === "places") {
      renderPlaces();
      return;
    }
    if (type === "events") {
      renderEvents();
      return;
    }

    var listEl = document.getElementById("list-" + type);
    if (!listEl) return;
    var all = data[type] || [];

    if (!all.length) {
      if (type === "sweets") {
        listEl.innerHTML = '<li class="empty">还没有想说的话，点右下角 + 写一句吧。</li>';
      } else if (type === "fights") {
        listEl.innerHTML = '<li class="empty">还没有和解记录，点右下角 + 记下一次吧。</li>';
      } else {
        listEl.innerHTML = '<li class="empty">还没有记录，点右下角 + 添加一条吧。</li>';
      }
      return;
    }

    var items = (type === "sweets" ? sortSweetsDesc : sortByDateDesc)(
      all.filter(function (item) {
        return itemMatchesFilters(item, type);
      })
    );

    if (!items.length) {
      listEl.innerHTML = emptyFilterMessage();
      return;
    }

    listEl.innerHTML = items.map(function (item) {
      var meta = "";
      if ((type === "sweets" || type === "fights") && item.author) {
        meta = '<p class="entry-meta">来自 ' + escapeText(item.author) + "</p>";
      }
      var resolve = "";
      if (type === "fights" && item.resolve) {
        resolve =
          '<p class="entry-resolve"><strong>怎么和好：</strong>' +
          escapeText(item.resolve) +
          "</p>";
      }
      var reflection = "";
      if (type === "fights" && item.reflection) {
        reflection =
          '<p class="entry-resolve"><strong>感受与反思：</strong>' +
          escapeText(item.reflection) +
          "</p>";
      }
      var note = item.note
        ? '<p class="entry-note">' + escapeText(item.note) + "</p>"
        : "";

      if (type === "sweets") {
        var sweetBody = (item.note || item.title || "").trim();
        var repliesHtml = renderSweetRepliesHtml(item);
        return (
          '<li class="entry-item entry-item--sweet' +
          (item.starred ? " is-starred" : "") +
          '">' +
          '<div class="entry-top">' +
          '<p class="entry-meta" style="margin:0">' +
          (item.starred ? '<span class="star-badge">★</span>' : "") +
          (item.author ? "来自 " + escapeText(item.author) : "") +
          "</p>" +
          '<p class="entry-date">' +
          escapeText(item.date || "") +
          "</p>" +
          "</div>" +
          (sweetBody
            ? '<p class="entry-note entry-note--sweet">' +
              escapeText(sweetBody) +
              "</p>"
            : "") +
          repliesHtml +
          '<div class="entry-actions">' +
          starButtonHtml(type, item.id, item.starred) +
          '<button type="button" class="btn-mini" data-reply-sweet="' +
          escapeText(item.id) +
          '">回复</button>' +
          editButtonHtml(type, item.id) +
          '<button type="button" class="btn-delete" data-type="' +
          type +
          '" data-id="' +
          escapeText(item.id) +
          '">删除</button>' +
          "</div>" +
          "</li>"
        );
      }

      return (
        '<li class="entry-item' +
        (item.starred ? " is-starred" : "") +
        '">' +
        '<div class="entry-top">' +
        '<p class="entry-title">' +
        (item.starred ? '<span class="star-badge">★</span>' : "") +
        escapeText(item.title || "（无标题）") +
        "</p>" +
        '<p class="entry-date">' +
        escapeText(item.date || "") +
        "</p>" +
        "</div>" +
        meta +
        note +
        resolve +
        reflection +
        '<div class="entry-actions">' +
        starButtonHtml(type, item.id, item.starred) +
        editButtonHtml(type, item.id) +
        '<button type="button" class="btn-delete" data-type="' +
        type +
        '" data-id="' +
        escapeText(item.id) +
        '">删除</button>' +
        "</div>" +
        "</li>"
      );
    }).join("");
  }

  function renderSweetRepliesHtml(item) {
    var replies = sortRepliesAsc(item.replies || []);
    if (!replies.length) return "";
    return (
      '<ul class="sweet-replies">' +
      replies
        .map(function (reply) {
          return (
            '<li class="sweet-reply">' +
            '<div class="sweet-reply-top">' +
            '<p class="sweet-reply-meta">' +
            escapeText(
              (reply.author ? reply.author : "回复") +
                (reply.date ? " · " + reply.date : "")
            ) +
            "</p>" +
            '<div class="sweet-reply-actions">' +
            '<button type="button" class="btn-mini" data-edit-reply="' +
            escapeText(reply.id) +
            '" data-parent="' +
            escapeText(item.id) +
            '">编辑</button>' +
            '<button type="button" class="btn-delete" data-delete-reply="' +
            escapeText(reply.id) +
            '" data-parent="' +
            escapeText(item.id) +
            '">删除</button>' +
            "</div>" +
            "</div>" +
            '<p class="sweet-reply-note">' +
            escapeText(reply.note || "") +
            "</p>" +
            "</li>"
          );
        })
        .join("") +
      "</ul>"
    );
  }

  function renderAll() {
    applySiteTitle();
    ["anniversaries", "events", "sweets", "places", "fights"].forEach(renderList);
    renderReminders();
    renderActivity();
  }

  function todayStr() {
    var d = new Date();
    var m = String(d.getMonth() + 1).padStart(2, "0");
    var day = String(d.getDate()).padStart(2, "0");
    return d.getFullYear() + "-" + m + "-" + day;
  }

  function fillDefaultDates() {
    document.querySelectorAll('input[name="date"]').forEach(function (input) {
      if (!input.value) input.value = todayStr();
    });
  }

  // ----- 纪念日弹窗 -----
  var modal = document.getElementById("modal-anni");
  var btnAdd = document.getElementById("btn-anni-add");

  function openAnniModal(item) {
    editingId = item ? item.id : null;
    setModalTitle("modal-anni-title", item ? "编辑纪念日" : "添加纪念日");
    var form = document.getElementById("form-anniversary");
    form.reset();
    if (item) {
      form.title.value = item.title || "";
      form.date.value = item.date || "";
      form.note.value = item.note || "";
    } else {
      form.date.value = todayStr();
    }
    setActiveDraft("anniversaries", editingId);
    restoreDraftToForm("anniversaries", editingId, form);
    snapshotDraftBaseline(form);
    modal.hidden = false;
    form.title.focus();
  }

  function closeAnniModal(opts) {
    opts = opts || {};
    var form = document.getElementById("form-anniversary");
    if (!opts.skipDraftSave && form) {
      maybePersistDraftOnClose("anniversaries", editingId, form);
    }
    modal.hidden = true;
    if (form) form.reset();
    clearEditing();
    clearActiveDraft();
    setModalTitle("modal-anni-title", "添加纪念日");
  }

  btnAdd.addEventListener("click", function () {
    openAnniModal(null);
  });
  document.body.addEventListener("click", function (e) {
    if (e.target.closest("[data-close-anni-modal]")) closeAnniModal();
  });

  // ----- 大事记 / 甜蜜想法 / 吵架：统一 + 弹窗 -----
  var eventModal = document.getElementById("modal-event");
  var sweetModal = document.getElementById("modal-sweet");
  var fightModal = document.getElementById("modal-fight");

  function syncEventOngoingUI() {
    var form = document.getElementById("form-event");
    if (!form || !form.ongoing || !form.dateEnd) return;
    var ongoing = !!form.ongoing.checked;
    form.dateEnd.disabled = ongoing;
    form.dateEnd.required = !ongoing;
    if (ongoing) form.dateEnd.value = "";
  }

  function openEventModal(item) {
    editingId = item ? item.id : null;
    setModalTitle("modal-event-title", item ? "编辑重要的事" : "记下重要的事");
    var form = document.getElementById("form-event");
    form.reset();
    if (item) {
      form.author.value = item.author || "我们";
      form.title.value = item.title || "";
      form.dateStart.value = item.dateStart || item.date || "";
      form.ongoing.checked = item.ongoing === true;
      if (item.ongoing === true) {
        form.dateEnd.value = "";
      } else {
        form.dateEnd.value = item.dateEnd || item.dateStart || item.date || "";
      }
      form.note.value = item.note || "";
    } else {
      var today = todayStr();
      form.author.value = "我们";
      form.dateStart.value = today;
      form.dateEnd.value = today;
      form.ongoing.checked = false;
    }
    setActiveDraft("events", editingId);
    restoreDraftToForm("events", editingId, form);
    syncEventOngoingUI();
    snapshotDraftBaseline(form);
    eventModal.hidden = false;
    form.title.focus();
  }

  function openSweetModal(item) {
    editingId = item ? item.id : null;
    setModalTitle("modal-sweet-title", item ? "编辑想说的话" : "想对你说");
    var form = document.getElementById("form-sweet");
    form.reset();
    if (item) {
      form.author.value = item.author || "馨宝";
      form.date.value = item.date || "";
      form.note.value = item.note || "";
    } else {
      form.date.value = todayStr();
    }
    setActiveDraft("sweets", editingId);
    restoreDraftToForm("sweets", editingId, form);
    snapshotDraftBaseline(form);
    sweetModal.hidden = false;
    form.note.focus();
  }

  var sweetReplyModal = document.getElementById("modal-sweet-reply");
  var replyEditing = { parentId: "", replyId: "" };

  function findReply(parent, replyId) {
    var list = (parent && parent.replies) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === replyId) return list[i];
    }
    return null;
  }

  function openSweetReplyModal(parentId, reply) {
    var parent = findItem("sweets", parentId);
    if (!parent) return;
    if (!Array.isArray(parent.replies)) parent.replies = [];
    replyEditing.parentId = parentId;
    replyEditing.replyId = reply ? reply.id : "";
    setModalTitle(
      "modal-sweet-reply-title",
      reply ? "编辑回复" : "回复这条想说的话"
    );
    var form = document.getElementById("form-sweet-reply");
    form.reset();
    form.parentId.value = parentId;
    form.replyId.value = reply ? reply.id : "";
    var quote = document.getElementById("sweet-reply-quote");
    if (quote) {
      var preview = (parent.note || "").trim();
      if (preview.length > 60) preview = preview.slice(0, 60) + "…";
      quote.textContent = preview
        ? "回复「" + (parent.author ? parent.author + "：" : "") + preview + "」"
        : "";
      quote.hidden = !preview;
    }
    if (reply) {
      form.author.value = reply.author || "馨宝";
      form.date.value = reply.date || todayStr();
      form.note.value = reply.note || "";
    } else {
      // 默认选对方：若原文是馨宝则默认树宝，反之亦然
      if (parent.author === "馨宝") form.author.value = "树宝";
      else if (parent.author === "树宝") form.author.value = "馨宝";
      else form.author.value = "馨宝";
      form.date.value = todayStr();
    }
    setActiveDraft("sweet-reply", replyEditing.replyId || null, parentId);
    restoreDraftToForm(
      "sweet-reply",
      replyEditing.replyId || null,
      form,
      parentId
    );
    snapshotDraftBaseline(form);
    sweetReplyModal.hidden = false;
    form.note.focus();
  }

  function closeSweetReplyModal(opts) {
    opts = opts || {};
    var form = document.getElementById("form-sweet-reply");
    if (!opts.skipDraftSave && form) {
      maybePersistDraftOnClose(
        "sweet-reply",
        replyEditing.replyId || null,
        form,
        replyEditing.parentId
      );
    }
    if (sweetReplyModal) sweetReplyModal.hidden = true;
    if (form) form.reset();
    replyEditing.parentId = "";
    replyEditing.replyId = "";
    clearActiveDraft();
    setModalTitle("modal-sweet-reply-title", "回复");
    var quote = document.getElementById("sweet-reply-quote");
    if (quote) {
      quote.hidden = true;
      quote.textContent = "";
    }
  }

  function openFightModal(item) {
    editingId = item ? item.id : null;
    setModalTitle("modal-fight-title", item ? "编辑和解" : "记一次和解");
    var form = document.getElementById("form-fight");
    form.reset();
    if (item) {
      form.author.value = item.author || "我们";
      form.date.value = item.date || "";
      form.title.value = item.title || "";
      form.note.value = item.note || "";
      form.resolve.value = item.resolve || "";
      form.reflection.value = item.reflection || "";
    } else {
      form.author.value = "我们";
      form.date.value = todayStr();
    }
    setActiveDraft("fights", editingId);
    restoreDraftToForm("fights", editingId, form);
    snapshotDraftBaseline(form);
    fightModal.hidden = false;
    form.title.focus();
  }

  function closeEventModal(opts) {
    opts = opts || {};
    var form = document.getElementById("form-event");
    if (!opts.skipDraftSave && form) {
      maybePersistDraftOnClose("events", editingId, form);
    }
    eventModal.hidden = true;
    if (form) form.reset();
    clearEditing();
    clearActiveDraft();
    setModalTitle("modal-event-title", "记下重要的事");
  }

  function closeSweetModal(opts) {
    opts = opts || {};
    var form = document.getElementById("form-sweet");
    if (!opts.skipDraftSave && form) {
      maybePersistDraftOnClose("sweets", editingId, form);
    }
    sweetModal.hidden = true;
    if (form) form.reset();
    clearEditing();
    clearActiveDraft();
    setModalTitle("modal-sweet-title", "想对你说");
  }

  function closeFightModal(opts) {
    opts = opts || {};
    var form = document.getElementById("form-fight");
    if (!opts.skipDraftSave && form) {
      maybePersistDraftOnClose("fights", editingId, form);
    }
    fightModal.hidden = true;
    if (form) form.reset();
    clearEditing();
    clearActiveDraft();
    setModalTitle("modal-fight-title", "记一次和解");
  }

  document.getElementById("btn-event-add").addEventListener("click", function () {
    openEventModal(null);
  });
  var eventOngoingInput = document.getElementById("event-ongoing");
  if (eventOngoingInput) {
    eventOngoingInput.addEventListener("change", syncEventOngoingUI);
  }
  document.getElementById("btn-sweet-add").addEventListener("click", function () {
    openSweetModal(null);
  });
  document.getElementById("btn-fight-add").addEventListener("click", function () {
    openFightModal(null);
  });

  document.body.addEventListener("click", function (e) {
    if (e.target.closest("[data-close-event-modal]")) closeEventModal();
    if (e.target.closest("[data-close-sweet-modal]")) closeSweetModal();
    if (e.target.closest("[data-close-sweet-reply-modal]")) closeSweetReplyModal();
    if (e.target.closest("[data-close-fight-modal]")) closeFightModal();
  });

  var formSweetReply = document.getElementById("form-sweet-reply");
  if (formSweetReply) {
    formSweetReply.addEventListener("submit", function (e) {
      e.preventDefault();
      var fd = new FormData(formSweetReply);
      var parentId = (fd.get("parentId") || replyEditing.parentId || "").toString();
      var replyId = (fd.get("replyId") || replyEditing.replyId || "").toString();
      var parent = findItem("sweets", parentId);
      if (!parent) return;
      if (!Array.isArray(parent.replies)) parent.replies = [];
      var payload = {
        author: (fd.get("author") || "").toString(),
        date: (fd.get("date") || "").toString(),
        note: (fd.get("note") || "").toString().trim()
      };
      if (!payload.note) return;
      if (replyId) {
        var existing = findReply(parent, replyId);
        if (!existing) return;
        existing.author = payload.author;
        existing.date = payload.date;
        existing.note = payload.note;
        touchUpdatedAt(existing);
      } else {
        var reply = {
          id: uid(),
          author: payload.author,
          date: payload.date,
          note: payload.note
        };
        touchUpdatedAt(reply);
        parent.replies.push(reply);
      }
      touchUpdatedAt(parent);
      saveData();
      noteLocalWrite("sweets");
      renderList("sweets");
      clearDraft(
        draftSlot(
          "sweet-reply",
          replyId || null,
          parentId
        )
      );
      closeSweetReplyModal({ skipDraftSave: true });
      showToast(replyId ? "已更新回复" : "已回复");
    });
  }

  // ----- 足迹文字弹窗 + 独立照片弹窗 -----
  var placeModal = document.getElementById("modal-place");
  var placePhotosModal = document.getElementById("modal-place-photos");
  var btnPlaceAdd = document.getElementById("btn-place-add");
  var placePhotosInput = document.getElementById("place-photos-input");
  var placePhotoPreview = document.getElementById("place-photo-preview");
  var pendingPlacePhotos = [];
  var editingPlacePhotoId = null;
  var MAX_PLACE_PHOTOS = 5;

  function renderPlacePreview() {
    if (!placePhotoPreview) return;
    var html = pendingPlacePhotos
      .map(function (src, i) {
        var canLeft = i > 0;
        var canRight = i < pendingPlacePhotos.length - 1;
        return (
          '<div class="photo-preview-item">' +
          '<img src="' +
          src +
          '" alt="预览' +
          (i + 1) +
          '" />' +
          '<span class="photo-order-badge">' +
          (i + 1) +
          "</span>" +
          '<button type="button" class="photo-remove-btn" data-remove-photo="' +
          i +
          '" aria-label="移除照片">×</button>' +
          '<div class="photo-order-btns">' +
          '<button type="button" class="photo-move-btn"' +
          (canLeft ? "" : " disabled") +
          ' data-move-photo="left" data-idx="' +
          i +
          '" aria-label="左移">‹</button>' +
          '<button type="button" class="photo-move-btn"' +
          (canRight ? "" : " disabled") +
          ' data-move-photo="right" data-idx="' +
          i +
          '" aria-label="右移">›</button>' +
          "</div>" +
          "</div>"
        );
      })
      .join("");

    if (pendingPlacePhotos.length < MAX_PLACE_PHOTOS) {
      html +=
        '<button type="button" class="photo-add-tile" id="btn-place-photo-add" aria-label="添加照片">+</button>';
    }
    placePhotoPreview.innerHTML = html;
  }

  function isHeicFile(file) {
    var type = String((file && file.type) || "").toLowerCase();
    var name = String((file && file.name) || "").toLowerCase();
    return (
      type.indexOf("heic") !== -1 ||
      type.indexOf("heif") !== -1 ||
      /\.heic$|\.heif$/.test(name)
    );
  }

  function loadHeic2Any() {
    if (window.heic2any) return Promise.resolve(window.heic2any);
    return new Promise(function (resolve, reject) {
      var existing = document.querySelector('script[data-heic2any="1"]');
      if (existing) {
        existing.addEventListener("load", function () {
          if (window.heic2any) resolve(window.heic2any);
          else reject(new Error("HEIC转换库加载失败"));
        });
        existing.addEventListener("error", function () {
          reject(new Error("HEIC转换库加载失败"));
        });
        return;
      }
      var script = document.createElement("script");
      script.src = "https://cdn.jsdelivr.net/npm/heic2any@0.0.4/dist/heic2any.min.js";
      script.async = true;
      script.setAttribute("data-heic2any", "1");
      script.onload = function () {
        if (window.heic2any) resolve(window.heic2any);
        else reject(new Error("HEIC转换库加载失败"));
      };
      script.onerror = function () {
        reject(new Error("HEIC转换库加载失败"));
      };
      document.head.appendChild(script);
    });
  }

  function drawImageToJpeg(img) {
    // 兼顾手机查看清晰度与同步体积（过大仍会在上传前再压）
    return drawImageToJpegWithOpts(img, 1600, 0.82);
  }

  function loadImageFromBlob(blob) {
    return new Promise(function (resolve, reject) {
      if (typeof createImageBitmap === "function") {
        createImageBitmap(blob)
          .then(resolve)
          .catch(function () {
            // 旧浏览器或不支持时，退回 Image + ObjectURL
            loadImageFromObjectUrl(blob).then(resolve, reject);
          });
        return;
      }
      loadImageFromObjectUrl(blob).then(resolve, reject);
    });
  }

  function loadImageFromObjectUrl(blob) {
    return new Promise(function (resolve, reject) {
      var img = new Image();
      var url = URL.createObjectURL(blob);
      img.onload = function () {
        URL.revokeObjectURL(url);
        resolve(img);
      };
      img.onerror = function () {
        URL.revokeObjectURL(url);
        // 再试 FileReader（部分环境 ObjectURL 会失败）
        var reader = new FileReader();
        reader.onload = function () {
          var img2 = new Image();
          img2.onload = function () {
            resolve(img2);
          };
          img2.onerror = function () {
            reject(new Error("图片读取失败"));
          };
          img2.src = String(reader.result || "");
        };
        reader.onerror = function () {
          reject(new Error("图片读取失败"));
        };
        reader.readAsDataURL(blob);
      };
      img.src = url;
    });
  }

  function compressImageFile(file) {
    function fromBlob(blob) {
      return loadImageFromBlob(blob).then(function (img) {
        return drawImageToJpeg(img);
      });
    }

    function viaHeic() {
      return loadHeic2Any().then(function (heic2any) {
        return heic2any({
          blob: file,
          toType: "image/jpeg",
          quality: 0.85
        }).then(function (result) {
          return Array.isArray(result) ? result[0] : result;
        });
      }).then(fromBlob);
    }

    // 先按普通图片处理；失败再尝试 HEIC 转换（苹果相册很常见）
    if (isHeicFile(file)) return viaHeic();
    return fromBlob(file).catch(function () {
      return viaHeic();
    });
  }

  function openPlaceModal(item) {
    editingId = item ? item.id : null;
    setModalTitle("modal-place-title", item ? "编辑足迹" : "添加足迹");
    var form = document.getElementById("form-place");
    form.reset();
    if (item) {
      form.title.value = item.title || "";
      form.dateStart.value = item.dateStart || "";
      form.dateEnd.value = item.dateEnd || "";
      form.cost.value = item.cost != null ? item.cost : "";
      form.note.value = item.note || "";
    } else {
      form.dateStart.value = todayStr();
      form.dateEnd.value = todayStr();
    }
    setActiveDraft("places", editingId);
    restoreDraftToForm("places", editingId, form);
    snapshotDraftBaseline(form);
    placeModal.hidden = false;
    form.title.focus();
  }

  function closePlaceModal(opts) {
    opts = opts || {};
    var form = document.getElementById("form-place");
    if (!opts.skipDraftSave && form) {
      maybePersistDraftOnClose("places", editingId, form);
    }
    placeModal.hidden = true;
    if (form) form.reset();
    clearEditing();
    clearActiveDraft();
    setModalTitle("modal-place-title", "添加足迹");
  }

  function openPlacePhotosModal(item) {
    if (!item || !item.id || !placePhotosModal) return;
    editingPlacePhotoId = item.id;
    pendingPlacePhotos = Array.isArray(item.photos) ? item.photos.slice() : [];
    setModalTitle(
      "modal-place-photos-title",
      "编辑照片 · " + (item.title || "足迹")
    );
    var sub = document.getElementById("place-photos-subtitle");
    if (sub) {
      var range =
        (item.dateStart || "") +
        (item.dateEnd && item.dateEnd !== item.dateStart
          ? " ～ " + item.dateEnd
          : "");
      sub.textContent = range ? range : "为这条足迹添加或调整照片";
    }
    renderPlacePreview();
    placePhotosModal.hidden = false;
  }

  function closePlacePhotosModal() {
    if (placePhotosModal) placePhotosModal.hidden = true;
    editingPlacePhotoId = null;
    pendingPlacePhotos = [];
    if (placePhotosInput) placePhotosInput.value = "";
    renderPlacePreview();
    setModalTitle("modal-place-photos-title", "编辑照片");
    var sub = document.getElementById("place-photos-subtitle");
    if (sub) sub.textContent = "";
  }

  function savePlacePhotos() {
    if (!editingPlacePhotoId) return;
    var placeItem = findItem("places", editingPlacePhotoId);
    if (!placeItem) {
      closePlacePhotosModal();
      return;
    }
    var placeId = editingPlacePhotoId;
    var saveBtn = document.getElementById("btn-place-photos-save");
    if (saveBtn) saveBtn.disabled = true;
    showToast("正在保存足迹照片…");

    uploadPlacePhotosForSync(pendingPlacePhotos.slice(), placeId)
      .then(function (up) {
        pendingPlacePhotos = up.photos.slice();
        if (up.failed && !up.uploaded) {
          alert(
            "照片已保存在这台设备，但没能传到云端，另一台可能暂时看不到。\n\n可以：\n1）在 Supabase 运行 schema-place-photos.sql 开启云相册\n2）每条足迹少放几张后再保存并点「同步最新」"
          );
        } else if (up.failed) {
          showToast("部分照片未传到云端，已尽量保留");
        }

        try {
          placeItem.photos = up.photos.slice();
          touchUpdatedAt(placeItem);
          saveData();
          noteLocalWrite("places");
        } catch (err) {
          alert("保存失败：照片可能太大或太多，请减少照片后再试。");
          return;
        }
        renderPlaces();
        closePlacePhotosModal();
        showToast("已保存照片");
      })
      .finally(function () {
        if (saveBtn) saveBtn.disabled = false;
      });
  }

  btnPlaceAdd.addEventListener("click", function () {
    openPlaceModal(null);
  });

  var btnPlacePhotosSave = document.getElementById("btn-place-photos-save");
  if (btnPlacePhotosSave) {
    btnPlacePhotosSave.addEventListener("click", function () {
      savePlacePhotos();
    });
  }

  // ----- 足迹照片浏览（左右箭头 / 滑动 / 键盘）-----
  var lightboxEl = document.getElementById("lightbox");
  var lightboxImg = document.getElementById("lightbox-img");
  var lightboxPrev = document.getElementById("lightbox-prev");
  var lightboxNext = document.getElementById("lightbox-next");
  var lightboxCloseBtn = document.getElementById("lightbox-close");
  var lightboxCounter = document.getElementById("lightbox-counter");
  var lightboxPhotos = [];
  var lightboxIndex = 0;
  var swipeStartX = null;

  function updateLightboxNav() {
    var multi = lightboxPhotos.length > 1;
    if (lightboxPrev) lightboxPrev.hidden = !multi;
    if (lightboxNext) lightboxNext.hidden = !multi;
    if (lightboxCounter) {
      if (multi) {
        lightboxCounter.hidden = false;
        lightboxCounter.textContent = lightboxIndex + 1 + " / " + lightboxPhotos.length;
      } else {
        lightboxCounter.hidden = true;
      }
    }
  }

  function showLightboxImage() {
    if (!lightboxPhotos.length) return;
    lightboxImg.style.opacity = "0.4";
    lightboxImg.src = lightboxPhotos[lightboxIndex];
    updateLightboxNav();
    requestAnimationFrame(function () {
      lightboxImg.style.opacity = "1";
    });
  }

  function openLightboxGallery(photos, startIndex) {
    lightboxPhotos = (photos || []).slice();
    if (!lightboxPhotos.length) return;
    lightboxIndex = Math.max(0, Math.min(startIndex || 0, lightboxPhotos.length - 1));
    lightboxEl.hidden = false;
    showLightboxImage();
  }

  function closeLightbox() {
    lightboxEl.hidden = true;
    lightboxImg.src = "";
    lightboxPhotos = [];
    lightboxIndex = 0;
    swipeStartX = null;
  }

  function lightboxStep(delta) {
    if (lightboxPhotos.length <= 1) return;
    lightboxIndex = (lightboxIndex + delta + lightboxPhotos.length) % lightboxPhotos.length;
    showLightboxImage();
  }

  if (lightboxPrev) {
    lightboxPrev.addEventListener("click", function (e) {
      e.stopPropagation();
      lightboxStep(-1);
    });
  }
  if (lightboxNext) {
    lightboxNext.addEventListener("click", function (e) {
      e.stopPropagation();
      lightboxStep(1);
    });
  }
  if (lightboxCloseBtn) {
    lightboxCloseBtn.addEventListener("click", function (e) {
      e.stopPropagation();
      closeLightbox();
    });
  }

  document.addEventListener("keydown", function (e) {
    if (lightboxEl.hidden) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") {
      e.preventDefault();
      lightboxStep(-1);
    }
    if (e.key === "ArrowRight") {
      e.preventDefault();
      lightboxStep(1);
    }
  });

  lightboxEl.addEventListener(
    "touchstart",
    function (e) {
      if (e.touches && e.touches.length === 1) {
        swipeStartX = e.touches[0].clientX;
      }
    },
    { passive: true }
  );

  lightboxEl.addEventListener(
    "touchend",
    function (e) {
      if (swipeStartX == null || !e.changedTouches || !e.changedTouches.length) return;
      var dx = e.changedTouches[0].clientX - swipeStartX;
      swipeStartX = null;
      if (Math.abs(dx) < 40) return;
      if (dx > 0) lightboxStep(-1);
      else lightboxStep(1);
    },
    { passive: true }
  );

  document.body.addEventListener("click", function (e) {
    if (e.target.closest(".photo-add-tile")) {
      e.preventDefault();
      if (placePhotosModal && !placePhotosModal.hidden && placePhotosInput) {
        placePhotosInput.click();
      }
      return;
    }

    if (e.target.closest("[data-close-place-modal]")) {
      closePlaceModal();
      return;
    }

    if (e.target.closest("[data-close-place-photos-modal]")) {
      closePlacePhotosModal();
      return;
    }

    var placePhotosBtn = e.target.closest("[data-edit-place-photos]");
    if (placePhotosBtn) {
      var photosPlace = findItem(
        "places",
        placePhotosBtn.getAttribute("data-edit-place-photos")
      );
      if (photosPlace) openPlacePhotosModal(photosPlace);
      return;
    }

    var removeBtn = e.target.closest("[data-remove-photo]");
    if (removeBtn && placePhotosModal && !placePhotosModal.hidden) {
      var idx = Number(removeBtn.getAttribute("data-remove-photo"));
      pendingPlacePhotos.splice(idx, 1);
      renderPlacePreview();
      return;
    }

    var moveBtn = e.target.closest("[data-move-photo]");
    if (moveBtn && !moveBtn.disabled && placePhotosModal && !placePhotosModal.hidden) {
      var from = Number(moveBtn.getAttribute("data-idx"));
      var dir = moveBtn.getAttribute("data-move-photo");
      var to = dir === "left" ? from - 1 : from + 1;
      if (
        from < 0 ||
        to < 0 ||
        from >= pendingPlacePhotos.length ||
        to >= pendingPlacePhotos.length
      ) {
        return;
      }
      var tmp = pendingPlacePhotos[from];
      pendingPlacePhotos[from] = pendingPlacePhotos[to];
      pendingPlacePhotos[to] = tmp;
      renderPlacePreview();
      return;
    }

    var shot = e.target.closest(".place-stack-card");
    if (shot) {
      var placeId = shot.getAttribute("data-place-id");
      var photoIndex = Number(shot.getAttribute("data-photo-index")) || 0;
      var placeItem = findItem("places", placeId);
      var album = placeItem && Array.isArray(placeItem.photos) ? placeItem.photos : [];
      openLightboxGallery(album, photoIndex);
      return;
    }

    if (e.target.id === "lightbox") {
      closeLightbox();
    }
  });

  if (placePhotosInput) {
    placePhotosInput.addEventListener("change", function () {
      var files = Array.prototype.slice.call(placePhotosInput.files || []);
      placePhotosInput.value = "";
      var room = MAX_PLACE_PHOTOS - pendingPlacePhotos.length;
      if (room <= 0) {
        alert("最多只能添加 " + MAX_PLACE_PHOTOS + " 张照片。");
        return;
      }
      var selected = files.slice(0, room);
      if (files.length > room) {
        alert("最多 " + MAX_PLACE_PHOTOS + " 张，已为你保留前 " + room + " 张。");
      }

      showToast("正在处理照片…");
      var ok = [];
      var fail = 0;
      var heicFail = 0;

      selected
        .reduce(function (chain, file) {
          return chain.then(function () {
            return compressImageFile(file)
              .then(function (src) {
                ok.push(src);
              })
              .catch(function (err) {
                fail += 1;
                if (
                  isHeicFile(file) ||
                  (err && String(err.message || "").indexOf("HEIC") !== -1)
                ) {
                  heicFail += 1;
                }
              });
          });
        }, Promise.resolve())
        .then(function () {
          if (ok.length) {
            pendingPlacePhotos = pendingPlacePhotos.concat(ok);
            renderPlacePreview();
            showToast("已添加 " + ok.length + " 张");
          }
          if (fail) {
            if (heicFail && !ok.length) {
              alert(
                "这些照片是苹果相册的 HEIC 格式，当前浏览器转换失败。\n\n可以：\n1）用 Safari 打开本站再试\n2）先把照片存成 JPG / 截图后再上传"
              );
            } else {
              alert(
                "有 " +
                  fail +
                  " 张照片无法读取（常见于 HEIC 或过大的原图）。已保留成功的 " +
                  ok.length +
                  " 张。"
              );
            }
          }
        });
    });
  }

  function openEdit(type, id) {
    var item = findItem(type, id);
    if (!item) return;
    if (type === "anniversaries") openAnniModal(item);
    else if (type === "events") openEventModal(item);
    else if (type === "sweets") openSweetModal(item);
    else if (type === "places") openPlaceModal(item);
    else if (type === "fights") openFightModal(item);
  }

  // ----- 表单提交（新增或保存编辑）-----
  document.querySelectorAll(".entry-form").forEach(function (form) {
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      var type = form.getAttribute("data-type");
      var fd = new FormData(form);
      var isEdit = !!editingId;

      // 足迹文字：只保存字段，不碰照片、不弹照片提示
      if (type === "places") {
        var dateStart = (fd.get("dateStart") || "").toString();
        var dateEnd = (fd.get("dateEnd") || "").toString();
        if (dateStart && dateEnd && dateEnd < dateStart) {
          alert("结束日期不能早于开始日期。");
          return;
        }
        var placeFields = {
          title: (fd.get("title") || "").toString().trim(),
          dateStart: dateStart,
          dateEnd: dateEnd || dateStart,
          cost: Number(fd.get("cost")) || 0,
          note: (fd.get("note") || "").toString().trim()
        };
        var openedPhotosAfterCreate = null;
        try {
          if (isEdit) {
            var oldPlace = findItem("places", editingId);
            if (!oldPlace) return;
            oldPlace.title = placeFields.title;
            oldPlace.dateStart = placeFields.dateStart;
            oldPlace.dateEnd = placeFields.dateEnd;
            oldPlace.cost = placeFields.cost;
            oldPlace.note = placeFields.note;
            touchUpdatedAt(oldPlace);
            saveData();
            noteLocalWrite("places");
          } else {
            placeFields.id = uid();
            placeFields.photos = [];
            touchUpdatedAt(placeFields);
            data.places.push(placeFields);
            saveData();
            noteLocalWrite("places");
            openedPhotosAfterCreate = placeFields;
          }
        } catch (err) {
          if (!isEdit && openedPhotosAfterCreate) data.places.pop();
          alert("保存失败，请稍后再试。");
          return;
        }
        renderPlaces();
        clearDraft(draftSlot("places", editingId));
        closePlaceModal({ skipDraftSave: true });
        showToast(isEdit ? "已更新足迹" : "已保存足迹");
        if (openedPhotosAfterCreate) {
          openPlacePhotosModal(openedPhotosAfterCreate);
        }
        return;
      }

      // 重要的事：支持单日、区间，或持续至今
      if (type === "events") {
        var eventStart = (fd.get("dateStart") || "").toString();
        var eventOngoing = !!(form.ongoing && form.ongoing.checked);
        var eventEnd = eventOngoing ? "" : (fd.get("dateEnd") || "").toString();
        if (!eventOngoing && eventStart && eventEnd && eventEnd < eventStart) {
          alert("结束日期不能早于开始日期。");
          return;
        }
        if (!eventOngoing && !eventEnd) eventEnd = eventStart;
        var eventFields = {
          title: (fd.get("title") || "").toString().trim(),
          author: (fd.get("author") || "").toString(),
          dateStart: eventStart,
          dateEnd: eventEnd,
          date: eventStart,
          ongoing: eventOngoing,
          note: (fd.get("note") || "").toString().trim()
        };
        if (isEdit) {
          var oldEvent = findItem("events", editingId);
          if (!oldEvent) return;
          oldEvent.title = eventFields.title;
          oldEvent.author = eventFields.author;
          oldEvent.dateStart = eventFields.dateStart;
          oldEvent.dateEnd = eventFields.dateEnd;
          oldEvent.date = eventFields.date;
          oldEvent.ongoing = eventFields.ongoing;
          oldEvent.note = eventFields.note;
          touchUpdatedAt(oldEvent);
        } else {
          eventFields.id = uid();
          touchUpdatedAt(eventFields);
          data.events.push(eventFields);
        }
        saveData();
        noteLocalWrite("events");
        renderEvents();
        clearDraft(draftSlot("events", editingId));
        closeEventModal({ skipDraftSave: true });
        showToast(isEdit ? "已更新" : "已记下重要的事");
        return;
      }

      var fields = {
        title: (fd.get("title") || "").toString().trim(),
        date: (fd.get("date") || "").toString(),
        note: (fd.get("note") || "").toString().trim()
      };

      if (type === "sweets") {
        fields.author = (fd.get("author") || "").toString();
        fields.title = "";
      }

      if (type === "fights") {
        fields.resolve = (fd.get("resolve") || "").toString().trim();
        fields.reflection = (fd.get("reflection") || "").toString().trim();
        fields.author = (fd.get("author") || "").toString();
      }

      if (isEdit) {
        var old = findItem(type, editingId);
        if (!old) return;
        old.title = fields.title;
        old.date = fields.date;
        old.note = fields.note;
        if (type === "anniversaries") {
          // 编辑时不改「是否提醒」，提醒只通过列表按钮开关
        }
        if (type === "sweets") old.author = fields.author;
        if (type === "fights") {
          old.author = fields.author;
          old.resolve = fields.resolve;
          old.reflection = fields.reflection;
        }
        touchUpdatedAt(old);
        // 纪念日：保留置顶、排序与提醒状态
      } else {
        var entry = {
          id: uid(),
          title: fields.title,
          date: fields.date,
          note: fields.note
        };
        if (type === "anniversaries") {
          entry.pinned = false;
          entry.remind = false;
          entry.order = data.anniversaries.length;
        }
        if (type === "sweets") {
          entry.author = fields.author;
          entry.title = "";
          entry.replies = [];
        }
        if (type === "fights") {
          entry.author = fields.author;
          entry.resolve = fields.resolve;
          entry.reflection = fields.reflection;
        }
        touchUpdatedAt(entry);
        data[type].push(entry);
      }

      saveData();
      noteLocalWrite(type);
      renderList(type);
      if (type === "anniversaries") renderReminders();

      if (type === "anniversaries") {
        clearDraft(draftSlot("anniversaries", editingId));
        closeAnniModal({ skipDraftSave: true });
      }
      if (type === "events") {
        clearDraft(draftSlot("events", editingId));
        closeEventModal({ skipDraftSave: true });
      }
      if (type === "sweets") {
        clearDraft(draftSlot("sweets", editingId));
        closeSweetModal({ skipDraftSave: true });
      }
      if (type === "fights") {
        clearDraft(draftSlot("fights", editingId));
        closeFightModal({ skipDraftSave: true });
      }

      if (type === "anniversaries") showToast(isEdit ? "已更新纪念日" : "已保存纪念日");
      else if (type === "sweets") showToast(isEdit ? "已更新" : "已写给对方");
      else if (type === "fights") showToast(isEdit ? "已更新和解" : "已记下和解");
    });
  });

  // ----- 编辑 / 删除 / 置顶 / 排序 -----
  document.body.addEventListener("click", function (e) {
    var starBtn = e.target.closest("[data-star-type]");
    if (starBtn) {
      var starType = starBtn.getAttribute("data-star-type");
      var starId = starBtn.getAttribute("data-star-id");
      var starItem = findItem(starType, starId);
      if (!starItem) return;
      starItem.starred = !starItem.starred;
      touchUpdatedAt(starItem);
      saveData();
      noteLocalWrite(starType);
      renderList(starType);
      showToast(starItem.starred ? "已加星标" : "已取消星标");
      return;
    }

    var replyBtn = e.target.closest("[data-reply-sweet]");
    if (replyBtn) {
      openSweetReplyModal(replyBtn.getAttribute("data-reply-sweet"), null);
      return;
    }

    var editReplyBtn = e.target.closest("[data-edit-reply]");
    if (editReplyBtn) {
      var parentForEdit = findItem("sweets", editReplyBtn.getAttribute("data-parent"));
      var replyForEdit = findReply(
        parentForEdit,
        editReplyBtn.getAttribute("data-edit-reply")
      );
      if (parentForEdit && replyForEdit) {
        openSweetReplyModal(parentForEdit.id, replyForEdit);
      }
      return;
    }

    var delReplyBtn = e.target.closest("[data-delete-reply]");
    if (delReplyBtn) {
      var parentIdDel = delReplyBtn.getAttribute("data-parent");
      var replyIdDel = delReplyBtn.getAttribute("data-delete-reply");
      var parentDel = findItem("sweets", parentIdDel);
      if (!parentDel) return;
      if (!confirm("确定删除这条回复吗？")) return;
      markDeleted(replyIdDel);
      parentDel.replies = (parentDel.replies || []).filter(function (r) {
        return r.id !== replyIdDel;
      });
      touchUpdatedAt(parentDel);
      saveData();
      noteLocalWrite("sweets");
      renderList("sweets");
      showToast("已删除回复");
      return;
    }

    var editBtn = e.target.closest("[data-edit]");
    if (editBtn) {
      openEdit(editBtn.getAttribute("data-edit"), editBtn.getAttribute("data-id"));
      return;
    }

    var anniBtn = e.target.closest("[data-anni-act]");
    if (anniBtn) {
      var act = anniBtn.getAttribute("data-anni-act");
      var id = anniBtn.getAttribute("data-id");
      var list = data.anniversaries;
      var idx = list.findIndex(function (item) {
        return item.id === id;
      });
      if (idx < 0) return;
      var item = list[idx];

      if (act === "pin") {
        item.pinned = !item.pinned;
        touchUpdatedAt(item);
        reindexOrders(list);
        saveData();
        noteLocalWrite("anniversaries");
        renderAnniversaries();
        return;
      }

      if (act === "remind") {
        item.remind = !item.remind;
        touchUpdatedAt(item);
        saveData();
        noteLocalWrite("anniversaries");
        renderAnniversaries();
        renderReminders();
        showToast(item.remind ? "已加入提醒" : "已移出提醒");
        return;
      }

      if (act === "up" || act === "down") {
        var visible = sortAnniversaries(list);
        var vIdx = visible.findIndex(function (x) {
          return x.id === id;
        });
        var swapWith = act === "up" ? vIdx - 1 : vIdx + 1;
        if (swapWith < 0 || swapWith >= visible.length) return;
        if (!!visible[vIdx].pinned !== !!visible[swapWith].pinned) return;

        var orderA = visible[vIdx].order;
        var orderB = visible[swapWith].order;
        visible[vIdx].order = orderB;
        visible[swapWith].order = orderA;
        touchUpdatedAt(visible[vIdx]);
        touchUpdatedAt(visible[swapWith]);
        saveData();
        noteLocalWrite("anniversaries");
        renderAnniversaries();
        return;
      }
    }

    var delBtn = e.target.closest(".btn-delete");
    if (!delBtn) return;
    var type = delBtn.getAttribute("data-type");
    var delId = delBtn.getAttribute("data-id");
    if (!type || !delId) return;
    if (!confirm("确定删除这条记录吗？")) return;
    markDeleted(delId);
    data[type] = data[type].filter(function (row) {
      return row.id !== delId;
    });
    if (type === "anniversaries") reindexOrders(data.anniversaries);
    saveData();
    noteLocalWrite(type);
    renderList(type);
    if (type === "anniversaries") renderReminders();
    showToast("已删除");
  });

  document.body.addEventListener("click", function (e) {
    var chip = e.target.closest(".sort-chip");
    if (chip) {
      document.querySelectorAll(".sort-chip").forEach(function (el) {
        el.classList.remove("is-active");
      });
      chip.classList.add("is-active");
      renderAnniversaries();
      return;
    }

    var authorChip = e.target.closest(".author-chip");
    if (authorChip) {
      var bar = authorChip.closest(".filter-bar");
      if (!bar) return;
      bar.querySelectorAll(".author-chip").forEach(function (el) {
        el.classList.remove("is-active");
      });
      authorChip.classList.add("is-active");
      var type = bar.getAttribute("data-type");
      if (type) renderList(type);
      return;
    }

    var starFilterChip = e.target.closest(".star-filter-chip");
    if (starFilterChip) {
      var starBar = starFilterChip.closest(".filter-bar");
      if (!starBar) return;
      starBar.querySelectorAll(".star-filter-chip").forEach(function (el) {
        el.classList.remove("is-active");
      });
      starFilterChip.classList.add("is-active");
      var starFilterType = starBar.getAttribute("data-type");
      if (starFilterType) renderList(starFilterType);
    }
  });

  document.body.addEventListener("input", function (e) {
    if (!e.target.classList.contains("filter-search")) return;
    var bar = e.target.closest(".filter-bar");
    var type = bar && bar.getAttribute("data-type");
    if (type) renderList(type);
  });

  // ----- 启动（等门禁打开后再加载）-----
  var appStarted = false;
  function startApp() {
    if (appStarted) return;
    if (document.body.classList.contains("is-locked")) return;
    appStarted = true;
    wirePairControls();

    try {
      if (window.XinbaoCloud && XinbaoCloud.configured() && XinbaoCloud.getUser()) {
        XinbaoCloud.loadPair()
          .then(function () {
            renderPairPanel();
            if (!XinbaoCloud.canSync()) {
              // 已登录但未配对：仍用本机/种子
              applyPublishedSeedIfNeeded();
              bootWithData();
              return null;
            }
            return XinbaoCloud.pullJournal().then(function (payload) {
              if (payload) {
                var merged = applyRecoveredSweets(
                  mergeJournalPayload(loadData(), payload)
                );
                try {
                  persistLocalData(merged);
                } catch (err) {
                  console.warn(err);
                }
              } else {
                applyPublishedSeedIfNeeded();
              }
              bootWithData();
              // 确保云端有一份（含找回的想法）
              return XinbaoCloud.pushJournal(data);
            });
          })
          .catch(function (err) {
            console.warn("云端启动失败，回退本机", err);
            applyPublishedSeedIfNeeded();
            bootWithData();
          });
        return;
      }

      applyPublishedSeedIfNeeded();
      bootWithData();
    } catch (err) {
      console.warn("启动失败", err);
      try {
        data = JSON.parse(JSON.stringify(defaultData));
        renderAll();
      } catch (err2) {}
    }
  }

  startApp();
  document.addEventListener("site-unlocked", startApp);

  // 切回页面时再拉一次，另一端刚改的提醒能更快出现
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState !== "visible") return;
    if (!appStarted) return;
    if (!window.XinbaoCloud || !XinbaoCloud.canSync()) return;
    queueMergePush({ immediate: true });
  });
});
