/* =========================================
   馨宝与树宝 · script.js
   ========================================= */

document.addEventListener("DOMContentLoaded", function () {
  var START_DATE = "2025-12-04";
  var STORAGE_KEY = "xinbao-shubao-journal-v1";
  var SEED_VERSION_KEY = "xinbao-shubao-seed-v";

  var defaultData = {
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

  /** 按 id 合并两份列表：两边都有的条目以 newer 为准，只在一边的保留 */
  function mergeById(localArr, remoteArr) {
    var map = {};
    (localArr || []).forEach(function (item) {
      if (item && item.id) map[item.id] = item;
    });
    (remoteArr || []).forEach(function (item) {
      if (item && item.id) map[item.id] = item;
    });
    return Object.keys(map).map(function (id) {
      return map[id];
    });
  }

  /** 云端拉取后与本机合并：两边独有的都保留；同一 id 以本机为准（刚编辑的不会被旧云端盖掉） */
  function mergeJournalPayload(localData, remotePayload) {
    var local = localData || JSON.parse(JSON.stringify(defaultData));
    var remote = remotePayload || {};
    var out = {};
    Object.keys(defaultData).forEach(function (key) {
      out[key] = mergeById(remote[key], local[key]);
    });
    return out;
  }

  function applyRecoveredSweets(target) {
    if (!target) return target;
    target.sweets = mergeById(target.sweets, RECOVERED_SWEETS);
    return target;
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
    window.scrollTo({ top: 0, behavior: "smooth" });
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
        order: typeof item.order === "number" ? item.order : index
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
      localStorage.setItem(STORAGE_KEY, JSON.stringify(seed.data));
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
        if (!Array.isArray(parsed[key])) parsed[key] = [];
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
          note: item.note || ""
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
          reflection: item.reflection || ""
        };
      });
      // 甜蜜想法：去掉旧的自动标题，正文保留在 note
      parsed.sweets = (parsed.sweets || []).map(function (item) {
        var note = (item.note || "").trim();
        var title = (item.title || "").trim();
        if (!note && title) note = title;
        return {
          id: item.id || uid(),
          author: item.author || "",
          date: item.date || "",
          note: note,
          title: ""
        };
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
          photos: Array.isArray(item.photos) ? item.photos : []
        };
      });
      if (parsed.anniversaries.length === 0) {
        parsed.anniversaries = JSON.parse(JSON.stringify(defaultData.anniversaries));
      }
      return parsed;
    } catch (err) {
      return JSON.parse(JSON.stringify(defaultData));
    }
  }

  function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    if (window.XinbaoCloud && XinbaoCloud.canSync()) {
      // 先拉云端合并，再上传——避免两人各写各的时「后上传的整本盖掉先上传的」
      queueMergePush({ immediate: true });
    }
  }

  var mergePushTimer = null;
  var mergePushRunning = false;
  var mergePushAgain = false;

  function queueMergePush(options) {
    options = options || {};
    clearTimeout(mergePushTimer);
    var delay = options.immediate ? 0 : 120;
    mergePushTimer = setTimeout(function () {
      runMergePush();
    }, delay);
  }

  function runMergePush() {
    if (!window.XinbaoCloud || !XinbaoCloud.canSync()) return;
    if (mergePushRunning) {
      mergePushAgain = true;
      return;
    }
    mergePushRunning = true;
    mergePushAgain = false;
    var localSnapshot = data;
    XinbaoCloud.pullJournal()
      .then(function (remote) {
        if (remote) {
          var merged = applyRecoveredSweets(
            mergeJournalPayload(localSnapshot, remote)
          );
          data = merged;
          localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
          try {
            renderAll();
          } catch (err) {}
        }
        return XinbaoCloud.pushJournal(data);
      })
      .catch(function (err) {
        console.warn("合并同步失败", err);
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

  function renderPairPanel() {
    var panel = document.getElementById("pair-panel");
    var userBar = document.getElementById("cloud-user-bar");
    var note = document.getElementById("privacy-note");
    if (!window.XinbaoCloud || !XinbaoCloud.configured()) {
      if (panel) panel.hidden = true;
      if (userBar) userBar.hidden = true;
      return;
    }

    var user = XinbaoCloud.getUser();
    var pair = XinbaoCloud.getPair();
    if (userBar) {
      if (user) {
        userBar.hidden = false;
        var label = document.getElementById("cloud-user-label");
        if (label) label.textContent = "已登录：" + (user.email || "");
      } else {
        userBar.hidden = true;
      }
    }

    if (!user) {
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
      if (status) status.textContent = "还没有二人空间。创建后生成邀请码，或输入对方邀请码加入。";
      if (actions) actions.hidden = false;
      if (note) note.textContent = "已登录云端 · 配对后即可双向同步";
      return;
    }

    if (!pair.partner_id) {
      if (status) status.textContent = "二人空间已创建，等待另一半加入。";
      var codeEl = document.getElementById("pair-invite-code");
      if (codeEl) codeEl.textContent = pair.invite_code;
      if (waiting) waiting.hidden = false;
      if (note) note.textContent = "等待配对 · 目前仍主要保存在本机";
      return;
    }

    if (status) status.textContent = "你们已连接，正在同步同一本日记。";
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
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
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
            sessionStorage.removeItem("xinbao-shubao-gate-ok");
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
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
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
        XinbaoCloud.pushJournal(data)
          .then(function () {
            showToast("已同步到云端");
          })
          .catch(function (err) {
            setPairMsg((err && err.message) || "同步失败");
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

  function escapeText(s) {
    return String(s || "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function sortByDateDesc(arr) {
    return arr.slice().sort(function (a, b) {
      return (b.date || "").localeCompare(a.date || "");
    });
  }

  function sortEvents(arr) {
    return arr.slice().sort(function (a, b) {
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

  function textHasQuery(text, q) {
    if (!q) return true;
    return String(text || "").toLowerCase().indexOf(q) !== -1;
  }

  function itemMatchesFilters(item, type) {
    var q = getFilterQuery(type);
    var author = getFilterAuthor(type);

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
      return (
        textHasQuery(item.note, q) ||
        textHasQuery(item.title, q) ||
        textHasQuery(item.author, q)
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
          '<li class="entry-item">' +
          '<div class="entry-top">' +
          '<p class="entry-title">' +
          escapeText(item.title || "（无标题）") +
          "</p>" +
          '<p class="entry-date">' +
          escapeText(range) +
          "</p>" +
          "</div>" +
          meta +
          note +
          '<div class="entry-actions">' +
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

    if (mode === "date-desc") {
      return arr.sort(function (a, b) {
        return (b.date || "").localeCompare(a.date || "");
      });
    }
    if (mode === "date-asc") {
      return arr.sort(function (a, b) {
        return (a.date || "").localeCompare(b.date || "");
      });
    }
    if (mode === "days-desc") {
      return arr.sort(function (a, b) {
        return daysSince(b.date) - daysSince(a.date);
      });
    }

    // manual：置顶优先，再按 order
    return arr.sort(function (a, b) {
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
        '">' +
        '<div class="entry-top">' +
        '<p class="entry-title">' +
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
        '<li class="entry-item entry-item--place">' +
        '<div class="place-main">' +
        '<div class="entry-top">' +
        '<p class="entry-title">' +
        escapeText(item.title || "（未命名地点）") +
        "</p>" +
        '<p class="place-range">' +
        range +
        "</p>" +
        "</div>" +
        costHtml +
        note +
        '<div class="entry-actions">' +
        editButtonHtml("places", item.id) +
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

    var items = sortByDateDesc(
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
        return (
          '<li class="entry-item entry-item--sweet">' +
          '<div class="entry-top">' +
          '<p class="entry-meta" style="margin:0">' +
          (item.author ? "来自 " + escapeText(item.author) : "") +
          "</p>" +
          '<p class="entry-date">' +
          escapeText(item.date || "") +
          "</p>" +
          "</div>" +
          (sweetBody
            ? '<p class="entry-note entry-note--sweet">' + escapeText(sweetBody) + "</p>"
            : "") +
          '<div class="entry-actions">' +
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
        '<li class="entry-item">' +
        '<div class="entry-top">' +
        '<p class="entry-title">' +
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

  function renderAll() {
    ["anniversaries", "events", "sweets", "places", "fights"].forEach(renderList);
    renderReminders();
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
    modal.hidden = false;
    form.title.focus();
  }

  function closeAnniModal() {
    modal.hidden = true;
    document.getElementById("form-anniversary").reset();
    clearEditing();
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
    syncEventOngoingUI();
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
    sweetModal.hidden = false;
    form.note.focus();
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
    fightModal.hidden = false;
    form.title.focus();
  }

  function closeEventModal() {
    eventModal.hidden = true;
    document.getElementById("form-event").reset();
    clearEditing();
    setModalTitle("modal-event-title", "记下重要的事");
  }

  function closeSweetModal() {
    sweetModal.hidden = true;
    document.getElementById("form-sweet").reset();
    clearEditing();
    setModalTitle("modal-sweet-title", "想对你说");
  }

  function closeFightModal() {
    fightModal.hidden = true;
    document.getElementById("form-fight").reset();
    clearEditing();
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
    if (e.target.closest("[data-close-fight-modal]")) closeFightModal();
  });

  // ----- 足迹弹窗 + 照片 -----
  var placeModal = document.getElementById("modal-place");
  var btnPlaceAdd = document.getElementById("btn-place-add");
  var placePhotosInput = document.getElementById("place-photos-input");
  var placePhotoPreview = document.getElementById("place-photo-preview");
  var pendingPlacePhotos = []; // 待保存的压缩图（base64）
  var MAX_PLACE_PHOTOS = 5;

  function renderPlacePreview() {
    var html = pendingPlacePhotos
      .map(function (src, i) {
        return (
          '<div class="photo-preview-item">' +
          '<img src="' +
          src +
          '" alt="预览' +
          (i + 1) +
          '" />' +
          '<button type="button" data-remove-photo="' +
          i +
          '" aria-label="移除照片">×</button>' +
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
    var maxSide = 1280;
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
    var dataUrl = canvas.toDataURL("image/jpeg", 0.72);
    canvas.width = 0;
    canvas.height = 0;
    if (!dataUrl || dataUrl === "data:,") throw new Error("图片压缩失败");
    return dataUrl;
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
          quality: 0.82
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
      pendingPlacePhotos = Array.isArray(item.photos) ? item.photos.slice() : [];
    } else {
      form.dateStart.value = todayStr();
      form.dateEnd.value = todayStr();
      pendingPlacePhotos = [];
    }
    renderPlacePreview();
    placeModal.hidden = false;
    form.title.focus();
  }

  function closePlaceModal() {
    placeModal.hidden = true;
    document.getElementById("form-place").reset();
    pendingPlacePhotos = [];
    renderPlacePreview();
    clearEditing();
    setModalTitle("modal-place-title", "添加足迹");
  }

  btnPlaceAdd.addEventListener("click", function () {
    openPlaceModal(null);
  });

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
      if (placePhotosInput) placePhotosInput.click();
      return;
    }

    if (e.target.closest("[data-close-place-modal]")) closePlaceModal();

    var removeBtn = e.target.closest("[data-remove-photo]");
    if (removeBtn) {
      var idx = Number(removeBtn.getAttribute("data-remove-photo"));
      pendingPlacePhotos.splice(idx, 1);
      renderPlacePreview();
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
              if (isHeicFile(file) || (err && String(err.message || "").indexOf("HEIC") !== -1)) {
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

      // 足迹单独处理（含时间段、花销、照片）
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
          note: (fd.get("note") || "").toString().trim(),
          photos: pendingPlacePhotos.slice()
        };

        try {
          if (isEdit) {
            var oldPlace = findItem("places", editingId);
            if (!oldPlace) return;
            oldPlace.title = placeFields.title;
            oldPlace.dateStart = placeFields.dateStart;
            oldPlace.dateEnd = placeFields.dateEnd;
            oldPlace.cost = placeFields.cost;
            oldPlace.note = placeFields.note;
            oldPlace.photos = placeFields.photos;
            saveData();
          } else {
            placeFields.id = uid();
            data.places.push(placeFields);
            saveData();
          }
        } catch (err) {
          if (!isEdit) data.places.pop();
          alert("保存失败：照片可能太大或太多，请减少照片后再试。");
          return;
        }
        renderPlaces();
        closePlaceModal();
        showToast(isEdit ? "已更新足迹" : "已保存足迹");
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
        } else {
          eventFields.id = uid();
          data.events.push(eventFields);
        }
        saveData();
        renderEvents();
        closeEventModal();
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
        }
        if (type === "fights") {
          entry.author = fields.author;
          entry.resolve = fields.resolve;
          entry.reflection = fields.reflection;
        }
        data[type].push(entry);
      }

      saveData();
      renderList(type);
      if (type === "anniversaries") renderReminders();

      if (type === "anniversaries") closeAnniModal();
      if (type === "events") closeEventModal();
      if (type === "sweets") closeSweetModal();
      if (type === "fights") closeFightModal();

      if (type === "anniversaries") showToast(isEdit ? "已更新纪念日" : "已保存纪念日");
      else if (type === "sweets") showToast(isEdit ? "已更新" : "已写给对方");
      else if (type === "fights") showToast(isEdit ? "已更新和解" : "已记下和解");
    });
  });

  // ----- 编辑 / 删除 / 置顶 / 排序 -----
  document.body.addEventListener("click", function (e) {
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
        reindexOrders(list);
        saveData();
        renderAnniversaries();
        return;
      }

      if (act === "remind") {
        item.remind = !item.remind;
        saveData();
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
        saveData();
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
    data[type] = data[type].filter(function (row) {
      return row.id !== delId;
    });
    if (type === "anniversaries") reindexOrders(data.anniversaries);
    saveData();
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
                localStorage.setItem(STORAGE_KEY, JSON.stringify(merged));
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
});
