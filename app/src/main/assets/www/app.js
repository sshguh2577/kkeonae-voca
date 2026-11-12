/* 꺼내보카 — 화면과 기록 관리 */
(function () {
  'use strict';

  var F = window.FSRS;
  var DAY = 86400000, MIN = 60000;
  var LONG_TERM_S = 21; // 안정도 21일 이상 = 머리에 남은 단어

  var DEFAULT_SETTINGS = {
    newPerDay: 30, // 1.0.11부터 30 (전에는 15). 업데이트 뒤 처음 켤 때 한 번 30으로 맞춘다
    minAnswers: 20,
    retention: 0.9,
    dayStartHour: 4,
    n1: { on: true, h: 21, m: 0 },
    n2: { on: true, h: 23, m: 0 },
    mix: true,
    autoReduce: false, // 1.0.11부터 꺼 둠. 업데이트 뒤 처음 켤 때 한 번 끈다
    sound: true,
    autoSpeak: false,
    shortMinutes: 5,
    restDows: [6], // 쉬는 요일 (0 일요일 ~ 6 토요일)
    songNew: 10, // 노래 단어장 한 번에 꺼낼 새 단어 수
    majorPerDay: 5, // 전공 새 단어: 과목(금융·토목)마다 하루에
    majorMin: 10, // 전공 출석 기준(문제 수)
    bonusSame: true, // 쓰기 단어 수를 그 갈래의 하루 새 단어 수와 같게 (토익 30, 전공은 과목별 수의 두 배)
    bonusCount: 10, // bonusSame이 꺼졌을 때: 갈래마다 하루에 써 볼 단어 수 (0이면 오늘 맞힌 단어 전부)
    bonusMode: 'en' // 쓰기 방식: en 뜻 보고 영어 쓰기, ko 영어 보고 뜻 쓰기, mix 번갈아
  };
  // 검사용 스위치: 1.0.10까지의 검사를 그때의 처음 값(하루 15개, 줄이기 켬, 쓰기 10개)으로 돌릴 때만 쓴다. 앱에서는 켜지지 않는다
  if (window.__kvLegacyDefaults) { DEFAULT_SETTINGS.newPerDay = 15; DEFAULT_SETTINGS.autoReduce = true; DEFAULT_SETTINGS.bonusSame = false; }
  var PASS_ANCHOR = '2026-01-04'; // 일요일. 휴식권은 이날부터 2주 단위로 1장
  var PASS_DAYS = 14;

  var SAMPLE_DAY = {
    kind: 'kkeonae-day', version: 1,
    deck: { id: 'sample', title: '체험용 10단어', day: 0 },
    words: [
      { id: 'sample-01', w: 'attend', pos: '동사', m: '참석하다', ex: 'All managers must [attend] the budget meeting on Monday.', exKo: '모든 관리자는 월요일 예산 회의에 참석해야 한다.' },
      { id: 'sample-02', w: 'postpone', pos: '동사', m: '연기하다, 미루다', ex: 'The product launch was [postponed] until next spring.', exKo: '제품 출시가 내년 봄으로 연기되었다.', note: 'post(뒤에) + pone(놓다): 뒤로 놓다 → 미루다' },
      { id: 'sample-03', w: 'invoice', pos: '명사', m: '청구서, 송장', ex: 'Please send the [invoice] to our accounting department.', exKo: '청구서를 저희 회계 부서로 보내 주세요.' },
      { id: 'sample-04', w: 'deadline', pos: '명사', m: '마감 기한', ex: 'The [deadline] for applications is March 15.', exKo: '지원 마감일은 3월 15일이다.' },
      { id: 'sample-05', w: 'revenue', pos: '명사', m: '수익, 매출', ex: "The company's [revenue] rose by 12 percent last year.", exKo: '그 회사의 매출은 작년에 12퍼센트 늘었다.' },
      { id: 'sample-06', w: 'approve', pos: '동사', m: '승인하다', ex: 'The director [approved] the new travel policy.', exKo: '이사가 새 출장 규정을 승인했다.' },
      { id: 'sample-07', w: 'candidate', pos: '명사', m: '지원자, 후보자', ex: 'We interviewed five [candidates] for the position.', exKo: '우리는 그 자리에 지원자 다섯 명을 면접했다.', note: '옛 로마 후보자가 흰 옷(candidus)을 입던 데서 온 말' },
      { id: 'sample-08', w: 'refund', pos: '명사·동사', m: '환불(하다)', ex: 'Customers can get a full [refund] within 30 days.', exKo: '고객은 30일 안에 전액 환불을 받을 수 있다.' },
      { id: 'sample-09', w: 'expand', pos: '동사', m: '확장하다, 넓히다', ex: 'The store plans to [expand] its online services.', exKo: '그 매장은 온라인 서비스를 확장할 계획이다.' },
      { id: 'sample-10', w: 'colleague', pos: '명사', m: '동료', ex: 'She asked a [colleague] to review the report.', exKo: '그녀는 동료에게 보고서 검토를 부탁했다.' }
    ]
  };

  /* ================= 도우미 ================= */
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function clone(o) { return JSON.parse(JSON.stringify(o)); }
  function str(v) { return v == null ? '' : String(v).trim(); }
  function values(o) { return Object.keys(o).map(function (k) { return o[k]; }); }
  function plural(n, unit) { return n + unit; }
  var DOW = ['일', '월', '화', '수', '목', '금', '토'];
  function keyToDate(key) { var p = key.split('-'); return new Date(+p[0], +p[1] - 1, +p[2], 12); }
  function keyLabel(key, withDow) {
    var d = keyToDate(key);
    return (d.getMonth() + 1) + '월 ' + d.getDate() + '일' + (withDow ? ' ' + DOW[d.getDay()] + '요일' : '');
  }
  function shortDate(ms) { var d = new Date(ms); return (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  function hashStr(s) { var h = 0; for (var i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) | 0; } return Math.abs(h); }

  /* ================= 폰 연결부 ================= */
  var Native = (function () {
    var A = window.Android;
    var has = !!A;
    var picked = null;
    var webFile = document.getElementById('web-file');
    if (!has && webFile) {
      webFile.addEventListener('change', function () {
        var f = webFile.files && webFile.files[0];
        if (!f) return;
        if (/^(image|video|audio)\//.test(f.type || '')) { webFile.value = ''; window.__native('picked-fail', /^image/.test(f.type) ? 'image' : 'media'); return; }
        var r = new FileReader();
        r.onload = function () { picked = String(r.result || ''); window.__native('picked', f.name); webFile.value = ''; };
        r.readAsText(f);
      });
    }
    function webDownload(text, name) {
      try {
        var blob = new Blob([text], { type: /\.csv$/i.test(name) ? 'text/csv' : 'application/json' });
        var a = document.createElement('a');
        a.href = URL.createObjectURL(blob); a.download = name;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(function () { window.__native('exported', 'ok'); }, 50);
      } catch (e) { window.__native('exported', 'fail'); }
    }
    function safe(fn, fallback) { try { return fn(); } catch (e) { return fallback; } }
    return {
      has: has,
      load: function () { return has ? A.loadData() : safe(function () { return localStorage.getItem('kv-db'); }, ''); },
      save: function (s) { if (has) return A.saveData(s); localStorage.setItem('kv-db', s); return true; },
      saveSummary: function (s) { if (has) return A.saveSummary(s); safe(function () { localStorage.setItem('kv-summary', s); }); return true; },
      keepBeforeRestore: function (s) { if (has) A.saveRestorePoint(s); else safe(function () { localStorage.setItem('kv-before-restore', s); }); },
      snapshots: function () { return has ? safe(function () { return JSON.parse(A.listSnapshots()); }, []) : []; },
      loadSnapshot: function (name) { return has ? A.loadSnapshot(name) : ''; },
      exportFile: function (text, name) { if (has) A.exportFile(text, name); else webDownload(text, name); },
      shareFile: function (text, name) { if (has) A.shareFile(text, name); else { webDownload(text, name); window.__native('shared', 'ok'); } },
      pickFile: function () { if (has) A.pickFile(); else if (webFile) webFile.click(); },
      takePicked: function () { if (has) return A.takePickedText(); var t = picked; picked = null; return t || ''; },
      copy: function (t) {
        if (has) { A.copyText(t); return; }
        safe(function () { navigator.clipboard.writeText(t); });
      },
      speak: function (t) {
        if (has) return A.speak(t);
        if (!window.speechSynthesis) return -1;
        var u = new SpeechSynthesisUtterance(t); u.lang = 'en-US'; speechSynthesis.cancel(); speechSynthesis.speak(u); return 1;
      },
      notifStatus: function () {
        if (!has) return null;
        return safe(function () { return JSON.parse(A.notificationStatus()); }, null);
      },
      requestNotif: function () { if (has) A.requestNotificationPermission(); },
      openNotifSettings: function () { if (has) A.openNotificationSettings(); },
      openExactAlarm: function () { if (has) A.openExactAlarmSettings(); },
      requestBattery: function () { if (has) A.requestIgnoreBattery(); },
      testNotif: function () { if (has) A.testNotification(); },
      version: function () { return has ? safe(function () { return A.appVersion(); }, '?') : '웹 미리보기'; },
      canUpdate: has && typeof A.checkUpdate === 'function',
      versionCode: function () { return has && A.versionCode ? safe(function () { return A.versionCode(); }, 0) : 0; },
      checkUpdate: function () { if (has && A.checkUpdate) A.checkUpdate(); },
      downloadUpdate: function () { if (has && A.downloadUpdate) A.downloadUpdate(); },
      installUpdate: function () { if (has && A.installUpdate) A.installUpdate(); }
    };
  })();

  /* ================= 기록 ================= */
  var DB = null;
  var blockSave = false;     // 기록을 못 읽었을 때 덮어쓰지 않도록
  var loadProblem = false;

  function newDB() {
    return {
      schema: 1, createdAt: Date.now(),
      settings: clone(DEFAULT_SETTINGS),
      decks: {}, cards: {}, days: {},
      meta: {
        lastBackupAt: 0, bestStreak: 0, welcomed: false, d11: true,
        restHistory: [{ from: F.dayKey(Date.now(), DEFAULT_SETTINGS.dayStartHour), dows: DEFAULT_SETTINGS.restDows.slice() }]
      }
    };
  }
  function migrate(o) {
    if (!o || typeof o !== 'object' || !o.cards) throw new Error('bad');
    var base = newDB();
    o.schema = o.schema || 1;
    o.createdAt = o.createdAt || base.createdAt;
    o.settings = Object.assign(clone(DEFAULT_SETTINGS), o.settings || {});
    o.settings.n1 = Object.assign(clone(DEFAULT_SETTINGS.n1), o.settings.n1 || {});
    o.settings.n2 = Object.assign(clone(DEFAULT_SETTINGS.n2), o.settings.n2 || {});
    o.decks = o.decks || {};
    values(o.decks).forEach(function (d) { if (!d.track) d.track = d.free ? 'song' : 'toeic'; }); // 1.0.8부터 단어장마다 갈래가 있다
    o.days = o.days || {};
    var hadHistory = !!(o.meta && o.meta.restHistory);
    var hadD11 = !!(o.meta && o.meta.d11) || !!window.__kvLegacyDefaults; // 1.0.11의 새 기본값(하루 30개, 줄이기 끔)을 이미 맞춘 기록인가
    o.meta = Object.assign(base.meta, o.meta || {});
    if (!Array.isArray(o.settings.restDows)) o.settings.restDows = DEFAULT_SETTINGS.restDows.slice();
    if (!hadD11) { o.settings.newPerDay = DEFAULT_SETTINGS.newPerDay; o.settings.autoReduce = DEFAULT_SETTINGS.autoReduce; } // 한 번만. 그 뒤에는 설정에서 바꾼 값이 남는다
    // 쉬는 요일 기능이 생기기 전 기록이면, 업데이트한 날부터 적용한다 (지난 날을 소급하지 않음)
    if (!hadHistory) o.meta.restHistory = [{ from: F.dayKey(Date.now(), o.settings.dayStartHour), dows: o.settings.restDows.slice() }];
    values(o.cards).forEach(function (c) { if (!c.h) c.h = []; if (c.sus == null) c.sus = false; });
    return o;
  }
  function loadDB() {
    var raw = '';
    try { raw = Native.load() || ''; } catch (e) { raw = ''; }
    if (raw) {
      try { DB = migrate(JSON.parse(raw)); rebalanceRestDays(); return; }
      catch (e) { loadProblem = true; blockSave = true; }
    }
    DB = newDB();
  }
  var saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(saveNow, 500); }
  function saveNow() {
    clearTimeout(saveTimer); saveTimer = null;
    if (blockSave) return;
    try {
      var ok = Native.save(JSON.stringify(DB));
      if (ok === false) toast('기록을 저장하지 못했어요. 폰 저장 공간을 확인해 주세요.');
      Native.saveSummary(JSON.stringify(buildSummary()));
    } catch (e) { toast('기록을 저장하지 못했어요. 폰 저장 공간을 확인해 주세요.'); }
  }

  /* ================= 날짜 ================= */
  function dsh() { return DB.settings.dayStartHour; }
  function todayKey() { return F.dayKey(Date.now(), dsh()); }
  function dayEndMs(key) { return F.dayStartOfKey(F.addDaysKey(key, 1), dsh()); }
  function dayRec(key) {
    var d = DB.days[key];
    // ms: 그날 공부 시간 전체(연습 포함). mN·mR: 새 단어(처음·익히는 단계) / 복습에 쓴 시간. 1.0.6부터 따로 센다
    if (!d) d = DB.days[key] = { a: 0, c: 0, n: 0, ms: 0, mN: 0, mR: 0 };
    return d;
  }
  // 공부 시간 글자: 1분 미만도 1분으로, 60분부터는 '1시간 5분'
  function fmtMin(ms) {
    if (!ms) return '0분';
    var m = Math.max(1, Math.round(ms / MIN));
    if (m < 60) return m + '분';
    return Math.floor(m / 60) + '시간' + (m % 60 ? ' ' + (m % 60) + '분' : '');
  }
  function firstDayKey() {
    var keys = Object.keys(DB.days).sort();
    var created = F.dayKey(DB.createdAt, dsh());
    return keys.length && keys[0] < created ? keys[0] : created;
  }

  /* ================= 쉬는 요일 ================= */
  // 그날 적용되던 쉬는 요일 (요일을 바꿔도 지난 기록은 그때 설정대로 본다)
  function restDowsOn(key) {
    var hist = DB.meta.restHistory || [], dows = [], best = '';
    for (var i = 0; i < hist.length; i++) { if (hist[i].from <= key && hist[i].from >= best) { best = hist[i].from; dows = hist[i].dows; } }
    return dows;
  }
  function isRestDay(key) { return restDowsOn(key).indexOf(F.keyToDow(key)) !== -1; }
  // 바꾼 쉬는 요일은 내일부터 적용 (마감 직전에 오늘을 쉬는 날로 바꿔 연속 기록을 지키는 걸 막는다)
  function setRestDows(dows) {
    var from = F.addDaysKey(todayKey(), 1);
    var hist = (DB.meta.restHistory || []).filter(function (h) { return h.from < from; });
    hist.push({ from: from, dows: dows.slice() });
    DB.meta.restHistory = hist;
    DB.settings.restDows = dows.slice();
    return rebalanceRestDays();
  }
  // 이미 쉬는 날로 잡혀 있는 복습을 앞뒤 날로 옮긴다
  function rebalanceRestDays() {
    var dows = DB.settings.restDows || [];
    if (!dows.length) return 0;
    var today = todayKey(), moved = 0, i = 0;
    values(DB.cards).forEach(function (c) {
      if (c.sus || c.st !== 2) return;
      var k = F.dayKey(c.due, dsh());
      if (k <= today || dows.indexOf(F.keyToDow(k)) === -1) return;
      var ivl = F.daysBetweenKeys(today, k);
      var alt = (i++ % 2) ? 0.75 : 0.25;
      var fixed = F.avoidRestDays(today, ivl, dows, function () { return alt; });
      c.due = F.dayStartOfKey(F.addDaysKey(today, fixed), dsh());
      moved++;
    });
    return moved;
  }
  function josa(word, pair) { // pair: '을/를', '이/가', '은/는', '으로/로'
    var w = String(word || '').trim();
    var ch = w.charAt(w.length - 1);
    var code = ch.charCodeAt(0);
    var hasBatchim;
    if (code >= 0xAC00 && code <= 0xD7A3) hasBatchim = (code - 0xAC00) % 28 !== 0;
    else if (/[0-9]/.test(ch)) hasBatchim = '013678'.indexOf(ch) !== -1; // 영 일 삼 육 칠 팔 (십·백도 받침 있음)
    else hasBatchim = /[lmnr]/i.test(ch);
    var p = pair.split('/');
    return w + (hasBatchim ? p[0] : p[1]);
  }

  /* ================= 카드 ================= */
  function cards() { return values(DB.cards); }
  // 단어장 갈래: 토익(Day), 전공(금융·토목, 출석을 따로 셈), 노래(출석 없이 하고 싶을 때만)
  function deckTrack(id) { var d = DB.decks[id]; return !d ? 'toeic' : (d.track || (d.free ? 'song' : 'toeic')); }
  function trackOf(c) { return deckTrack(c.deck); }
  function isFreeDeck(id) { return deckTrack(id) === 'song'; }
  function inDaily(c) { return trackOf(c) === 'toeic'; }
  function inMajor(c) { return trackOf(c) === 'major'; }
  function majorSub(id) { var d = DB.decks[id]; return d && d.major === 'civ' ? 'civ' : 'fin'; }
  function hasCards() { for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && inDaily(c)) return true; } return false; }
  function deckOrder(id) { var d = DB.decks[id]; return d && d.order != null ? d.order : 9999; }
  function deckPaused(id) { var d = DB.decks[id]; return !!(d && d.paused); }
  function isFreshReady(c) { return c.st === 0 && !c.sus && !deckPaused(c.deck) && inDaily(c); } // 잠시 멈춘 Day의 새 단어는 안 꺼낸다
  function newQueueCards() {
    return cards().filter(isFreshReady).sort(function (a, b) {
      return (deckOrder(a.deck) - deckOrder(b.deck)) || ((a.ord || 0) - (b.ord || 0));
    });
  }
  function stage(c) {
    if (c.sus) return 'sus';
    if (c.st === 0) return 'new';
    if (c.st === 2 && c.S >= LONG_TERM_S) return 'long';
    return 'learn';
  }
  function fails(c) { var n = 0; (c.h || []).forEach(function (x) { if (x[1] === 1) n++; }); return n; }
  function isLeech(c) { return !c.sus && (c.lapses >= 3 || fails(c) >= 5); }

  function newCapFor(due) {
    var s = DB.settings, n = s.newPerDay;
    if (!s.autoReduce || n === 0) return n;
    if (due > n * 8) return 0;
    if (due > n * 5) return Math.ceil(n / 2);
    return n;
  }
  function countDue(endMs) {
    var n = 0;
    for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && c.st !== 0 && c.due < endMs && inDaily(c)) n++; }
    return n;
  }
  function todayPlan() {
    var key = todayKey(), end = dayEndMs(key), rec = dayRec(key), s = DB.settings;
    var due = countDue(end);
    var newAvail = 0;
    for (var k in DB.cards) { if (isFreshReady(DB.cards[k])) newAvail++; }
    var capSig = s.newPerDay + '|' + (s.autoReduce ? 1 : 0);
    if (rec.dueStart == null) rec.dueStart = due;
    if (rec.cap == null || rec.capSig !== capSig) { rec.cap = newCapFor(rec.dueStart); rec.capSig = capSig; }
    var restDay = isRestDay(key);
    var newLeft = restDay ? 0 : Math.max(0, Math.min(newAvail, rec.cap - rec.n));
    if (!restDay && !rec.att && !rec.rest && rec.a === 0 && due === 0 && newLeft === 0 && hasCards()) rec.rest = true;
    return { key: key, end: end, rec: rec, due: due, newLeft: newLeft, newAvail: newAvail, reduced: !restDay && rec.cap < s.newPerDay, restDay: restDay };
  }
  // 오늘 처음 배운 단어를 지우면 오늘 새 단어 몫을 돌려준다 (잘못 들어간 단어가 하루 몫을 먹지 않게)
  function refundNewToday(list) {
    var key = todayKey(), rec = DB.days[key];
    if (!rec) return 0;
    var start = F.dayStartOfKey(key, dsh()), n = 0;
    list.forEach(function (c) {
      var t = trackOf(c);
      if (t === 'song') return;
      (c.h || []).forEach(function (e) {
        if (e[3] !== 0 || e[0] * 1000 < start) return;
        if (t === 'toeic') { if (rec.n) { rec.n--; n++; } }
        else if (rec.mj) { var sub = majorSub(c.deck) === 'civ' ? 'nc' : 'nf'; if (rec.mj[sub]) { rec.mj[sub]--; rec.mj.n = Math.max(0, (rec.mj.n || 0) - 1); n++; } }
      });
    });
    return n;
  }
  /* 예상 시간: 최근 2주 내 기록으로 '새 단어 1개'와 '복습 1장'에 실제로 쓴 시간을 잰다.
     기록이 적을 때는 기본값(복습 8초, 새 단어 25초)을 5장 몫만큼 섞어 한두 번의 기록에 휘둘리지 않게 한다.
     새 단어 시간에는 처음 본 날 익히는 단계(1분·10분 뒤 다시)도 들어간다. 연습 시간은 뺀다. */
  var PACE_PRIOR = { rev: 8000, neu: 25000, k: 5 };
  function paceStats() {
    var today = todayKey(), from = F.addDaysKey(today, -13), d0 = dsh();
    var fromMs = F.dayStartOfKey(from, d0);
    var byDay = {};
    cards().forEach(function (c) {
      if (!inDaily(c)) return; // 노래 단어 시간은 따로 센다
      var h = c.h || [];
      for (var i = h.length - 1; i >= 0; i--) { // 기록은 시간순이라 2주보다 오래된 줄에서 멈춘다 (저장할 때마다 불려서 가볍게)
        var x = h[i], t = x[0] * 1000;
        if (t < fromMs) break;
        var k = F.dayKey(t, d0);
        if (k > today) continue;
        var b = byDay[k] || (byDay[k] = { nA: 0, nW: 0, rA: 0, rW: 0 });
        if (x[3] === 0 || x[3] === 1) { b.nA++; if (x[3] === 0) b.nW++; }
        else { b.rA++; if (x[3] === 2) b.rW++; }
      }
    });
    var msN = 0, wN = 0, msR = 0, wR = 0;
    Object.keys(byDay).forEach(function (k) {
      var b = byDay[k], r = DB.days[k];
      if (!r || !r.ms || !r.a) return;
      var mN, mR;
      if (r.mN != null && r.mR != null) { mN = r.mN; mR = r.mR; }
      else { var per = r.ms / r.a; mN = b.nA * per; mR = b.rA * per; } // 1.0.5까지의 기록: 그날 한 문제 평균으로 나눈다
      msN += mN; wN += b.nW; msR += mR; wR += b.rW;
    });
    var k0 = PACE_PRIOR.k;
    return {
      newMs: (PACE_PRIOR.neu * k0 + msN) / (k0 + wN),
      revMs: (PACE_PRIOR.rev * k0 + msR) / (k0 + wR),
      newWords: wN, reviews: wR, personal: wN + wR >= 10
    };
  }
  function estMinutes(due, fresh, pace) {
    var p = pace || paceStats();
    return Math.max(1, Math.round((due * p.revMs + fresh * p.newMs) / MIN));
  }

  /* ================= 출석 ================= */
  function studied(k, t) {
    var d = DB.days[k];
    if (!d) return false;
    if (t === 'major') return !!(d.mj && (d.mj.att || d.mj.rest));
    return !!(d.att || d.rest);
  }
  function attendedKey(k, t) { return studied(k, t) || isRestDay(k); }
  function weekStartKey(key) { return F.addDaysKey(key, -F.keyToDow(key)); } // 일요일 시작
  function passKey(key) { return Math.floor(F.daysBetweenKeys(PASS_ANCHOR, key) / PASS_DAYS); }
  function passWindow(key) {
    var start = F.addDaysKey(PASS_ANCHOR, passKey(key) * PASS_DAYS);
    return { start: start, end: F.addDaysKey(start, PASS_DAYS - 1) };
  }
  // refKey 시점의 연속 출석(공부한 날 수). 쉬는 요일은 세지 않고 건너뛰기만 하고(끊기지 않음),
  // 그 밖에 빠진 날은 2주마다 하루를 휴식권으로 이어 준다
  function streakAt(refKey, t) {
    var first = firstDayKey();
    var k = attendedKey(refKey, t) ? refKey : F.addDaysKey(refKey, -1);
    var count = 0, frozen = [], pending = [], used = {};
    while (F.daysBetweenKeys(first, k) >= 0) {
      if (studied(k, t)) { count++; if (pending.length) { frozen = frozen.concat(pending); pending = []; } }
      else if (isRestDay(k)) { /* 쉬는 날: 그냥 지나감 */ }
      else {
        var pk = passKey(k);
        if (used[pk]) break;
        used[pk] = true; pending.push(k);
      }
      k = F.addDaysKey(k, -1);
    }
    return { count: count, frozen: frozen };
  }
  function checkAttendance(plan) {
    var rec = plan.rec;
    if (rec.att) return false;
    if (rec.a >= DB.settings.minAnswers || (rec.a > 0 && plan.due === 0 && plan.newLeft === 0)) {
      rec.att = true; rec.attAt = Date.now();
      var st = streakAt(plan.key).count;
      if (st > (DB.meta.bestStreak || 0)) DB.meta.bestStreak = st;
      return true;
    }
    return false;
  }

  /* ================= 전공 (금융·토목, 출석을 따로 센다) ================= */
  function mjRec(key) { var r = dayRec(key); if (!r.mj) r.mj = { a: 0, c: 0, n: 0, ms: 0, nf: 0, nc: 0 }; return r.mj; }
  function hasMajorCards() { for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && inMajor(c)) return true; } return false; }
  function majorFresh(sub) {
    return cards().filter(function (c) { return c.st === 0 && !c.sus && inMajor(c) && !deckPaused(c.deck) && majorSub(c.deck) === sub; })
      .sort(function (a, b) { return (deckOrder(a.deck) - deckOrder(b.deck)) || ((a.ord || 0) - (b.ord || 0)); });
  }
  function majorDue(endMs) {
    var n = 0;
    for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && c.st !== 0 && c.due < endMs && inMajor(c)) n++; }
    return n;
  }
  // 복습이 많이 밀리면 전공 새 단어도 줄인다 (토익과 같은 기준: 하루 새 단어 수의 5배·8배)
  function majorCapFor(due, per) {
    if (!DB.settings.autoReduce || per === 0) return per;
    if (due > per * 16) return 0;
    if (due > per * 10) return Math.ceil(per / 2);
    return per;
  }
  function majorPlan() {
    var key = todayKey(), end = dayEndMs(key), m = mjRec(key), s = DB.settings;
    var due = majorDue(end), per = s.majorPerDay;
    var availF = majorFresh('fin').length, availC = majorFresh('civ').length;
    var capSig = per + '|' + (s.autoReduce ? 1 : 0);
    if (m.dueStart == null) m.dueStart = due;
    if (m.cap == null || m.capSig !== capSig) { m.cap = majorCapFor(m.dueStart, per); m.capSig = capSig; }
    var restDay = isRestDay(key);
    var leftF = restDay ? 0 : Math.max(0, Math.min(availF, m.cap - (m.nf || 0)));
    var leftC = restDay ? 0 : Math.max(0, Math.min(availC, m.cap - (m.nc || 0)));
    var has = hasMajorCards();
    if (has && !restDay && !m.att && !m.rest && m.a === 0 && due === 0 && leftF + leftC === 0) m.rest = true;
    return { key: key, end: end, rec: m, due: due, leftF: leftF, leftC: leftC, newLeft: leftF + leftC, availF: availF, availC: availC,
      restDay: restDay, has: has, reduced: !restDay && m.cap < per };
  }
  function checkMajorAttendance(mp) {
    var m = mp.rec;
    if (m.att) return false;
    if (m.a >= DB.settings.majorMin || (m.a > 0 && mp.due === 0 && mp.newLeft === 0)) {
      m.att = true; m.attAt = Date.now();
      var st = streakAt(mp.key, 'major').count;
      if (st > (DB.meta.bestStreakMajor || 0)) DB.meta.bestStreakMajor = st;
      return true;
    }
    return false;
  }
  function majorPending() {
    for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && inMajor(c) && (c.st === 1 || c.st === 3)) return true; }
    return false;
  }

  /* ================= 쓰기 (오늘 카드를 다 꺼낸 갈래에서 직접 써 보기) =================
     뜻을 보고 영어를 쓰거나(en), 영어를 보고 뜻을 쓴다(ko). 복습 일정은 건드리지 않는다.
     그날 쓰기를 끝내면 그 갈래의 도장이 꽉 찬 도장이 된다. 틀린 단어는 다음 쓰기에 먼저 나온다.
     날짜 기록: 토익은 days[key].b, 전공은 days[key].mj.b = { goal, n, ok, ms, done, at }
     단어 기록: bn 써 본 횟수, bk 맞힌 횟수, bAt 마지막으로 써 본 때, bm 틀린 채로 남은 때(맞히면 지운다) */
  function trackRecOf(key, track) { var d = DB.days[key]; return (track === 'major' ? (d && d.mj) : d) || null; } // 읽기만 (없으면 null)
  function bonusOn(rec) { return !!(rec && rec.b && rec.b.done); }
  function bonusRec(track) { var r = track === 'major' ? mjRec(todayKey()) : dayRec(todayKey()); if (!r.b) r.b = { n: 0, ok: 0, ms: 0 }; return r.b; }
  // 그 갈래의 오늘 카드를 다 꺼냈는가 (쓰기가 열리는 조건)
  function trackFinished(track) {
    if (track === 'major') {
      if (!hasMajorCards()) return false;
      var mp = majorPlan();
      return mp.rec.a > 0 && mp.due + mp.newLeft === 0 && !majorPending();
    }
    var p = todayPlan();
    return p.rec.a > 0 && p.due + p.newLeft === 0 && !hasPendingLearning();
  }
  // 오늘 쓰기에 낼 수 있는 단어: 지난 쓰기에서 틀린 단어, 오늘 맞힌 복습 단어, 오늘 새로 익힌 단어 순
  function bonusPool(track) {
    var start = F.dayStartOfKey(todayKey(), dsh());
    var carry = [], rev = [], fresh = [];
    cards().forEach(function (c) {
      if (c.sus || c.st === 0 || trackOf(c) !== track) return;
      if (c.bAt && c.bAt >= start) return; // 오늘 쓰기에서 이미 써 본 단어
      if (c.bm) { carry.push(c); return; }
      var h = c.h || [], last = h[h.length - 1];
      if (!last || last[0] * 1000 < start || last[1] < 3) return; // 오늘 마지막 답이 '알았음'인 단어만
      var review = false;
      for (var i = h.length - 1; i >= 0 && h[i][0] * 1000 >= start; i--) { if (h[i][3] === 2 || h[i][3] === 3) review = true; }
      (review ? rev : fresh).push(c);
    });
    carry.sort(function (a, b) { return a.bm - b.bm; });
    rev.sort(function (a, b) { return ((a.bAt || 0) - (b.bAt || 0)) || ((a.S || 0) - (b.S || 0)); });
    fresh.sort(function (a, b) { return (deckOrder(a.deck) - deckOrder(b.deck)) || ((a.ord || 0) - (b.ord || 0)); });
    return carry.concat(rev, fresh).map(function (c) { return c.id; });
  }
  // 오늘 쓰기 상태: done 끝냄, open 지금 할 수 있음(left개 남음), locked 아직 카드가 남아 안 열림
  function bonusState(track) {
    var rec = trackRecOf(todayKey(), track), b = rec && rec.b;
    if (b && b.done) return { done: true, open: false, n: b.n, ok: b.ok };
    if (!trackFinished(track)) return { done: false, open: false, locked: true };
    var pool = bonusPool(track), count = bonusCountFor(track);
    var goal = b && b.goal != null ? b.goal : (count > 0 ? Math.min(count, pool.length) : pool.length);
    var n = b ? b.n : 0;
    var fresh = Math.max(0, Math.min(pool.length, goal - n)); // 아직 한 번도 안 써 본 몫
    var redo = bonusOpenIds(b).length; // 틀린 뒤 아직 못 고친 단어
    var left = fresh + redo;
    if (b && n > 0 && left === 0) { b.done = true; if (!b.at) b.at = Date.now(); saveSoon(); return { done: true, open: false, n: b.n, ok: b.ok }; } // 낼 단어가 떨어졌으면 끝낸 걸로 친다
    return { done: false, open: left > 0, left: left, fresh: fresh, redo: redo, goal: goal, n: n };
  }
  // 쓰기 단계에서 하루에 낼 단어 수. '새 단어만큼'이면 그 갈래의 하루 새 단어 수와 같다 (새 단어가 다 떨어진 뒤에도 같은 수만큼 낸다)
  function bonusCountFor(track) {
    var s = DB.settings;
    if (s.bonusSame) { var n = track === 'major' ? s.majorPerDay * 2 : s.newPerDay; return n > 0 ? n : 10; }
    return s.bonusCount;
  }
  // 오늘 쓰기에서 틀린 뒤 아직 맞히지 못한 단어 (맞힐 때까지 다시 나온다)
  function bonusCountForSame(track) { var s = DB.settings, n = track === 'major' ? s.majorPerDay * 2 : s.newPerDay; return n > 0 ? n : 10; }
  function bonusOpenIds(b) { return ((b && b.open) || []).filter(function (id) { var c = DB.cards[id]; return c && !c.sus; }); }
  function bonusWhat() { var m = DB.settings.bonusMode; return m === 'ko' ? '영어 보고 뜻 쓰기' : m === 'mix' ? '영어·뜻 번갈아 쓰기' : '뜻 보고 영어 쓰기'; }
  function bonusButton(track) {
    var st = bonusState(track);
    if (!st.open) return '';
    return '<button class="btn primary wide" data-act="bonus" data-track="' + track + '">' +
      (st.n ? '쓰기 이어서 하기 (' + st.left + '개 남음)' : '쓰기 단계: ' + bonusWhat() + ' ' + st.left + '개') + '</button>';
  }
  var BONUS_HINT = '<p class="hint bonus-hint">틀려도 복습 일정은 그대로예요. 틀린 단어는 맞힐 때까지 다시 나오고, 다 맞히면 오늘 도장이 꽉 찬 도장이 돼요.</p>';
  function startBonus(track) {
    var st = bonusState(track);
    if (!st.open) { toast(st.done ? '오늘 쓰기는 이미 끝냈어요.' : st.locked ? '오늘 카드를 다 꺼내면 쓰기가 열려요.' : '오늘은 쓰기로 낼 단어가 없어요.'); return; }
    var b = bonusRec(track);
    if (b.goal == null) b.goal = st.goal;
    var redo = bonusOpenIds(b), tried = {};
    redo.forEach(function (id) { tried[id] = true; }); // 앞서 틀린 단어는 다시 맞혀도 기록 수에는 세지 않는다
    var ids = redo.concat(bonusPool(track).slice(0, st.fresh));
    var mode = DB.settings.bonusMode, dir = {};
    ids.forEach(function (id, i) { dir[id] = mode === 'ko' ? 'mean' : mode === 'mix' ? ((b.n + i) % 2 ? 'mean' : 'type') : 'type'; });
    S = {
      mode: 'bonus', bonus: true, track: track, startedAt: Date.now(), deadline: 0,
      queue: ids, pending: [], dir: dir, tried: tried, missed: {}, fixed: 0,
      cur: null, answered: 0, good: 0, again: 0, newSeen: 0, ms: 0, first: 0, firstOk: 0,
      attendedNow: false, doneNow: false, undo: null, timer: null
    };
    saveSoon();
    openOverlay('study', '<div class="study" id="study"></div>');
    nextCard();
  }
  // 쓰기 답 기록: 복습 일정(S, due)은 그대로 둔다. 처음 답만 기록에 센다.
  // 틀린 단어는 세 장쯤 뒤에 다시 나오고, 맞힐 때까지 되풀이한다. 다 고쳐야 꽉 찬 도장이 된다.
  // 처음에 틀렸던 단어는 그날 고쳤어도 다음 쓰기에 먼저 나온다 (bm을 지우지 않는다)
  function bonusGrade(ok) {
    var c = DB.cards[S.cur.id], now = Date.now(), track = S.track;
    var b = bonusRec(track), rec = track === 'major' ? mjRec(todayKey()) : dayRec(todayKey());
    var spent = answerMs(now);
    if (!b.open) b.open = [];
    var at = b.open.indexOf(c.id);
    if (!S.tried[c.id]) {
      S.tried[c.id] = true;
      b.n++; if (ok) b.ok++;
      c.bn = (c.bn || 0) + 1; if (ok) c.bk = (c.bk || 0) + 1;
      c.bAt = now;
      if (ok) delete c.bm;
      else { c.bm = now; S.missed[c.id] = true; if (at === -1) b.open.push(c.id); }
      rec.a++; if (ok) rec.c++;
      S.first++; if (ok) S.firstOk++;
    } else if (ok && at !== -1) { b.open.splice(at, 1); S.fixed++; }
    if (!ok) S.queue.splice(Math.min(3, S.queue.length), 0, c.id);
    if (!b.done && b.n >= (b.goal || 0) && !bonusOpenIds(b).length) { b.done = true; b.at = now; S.doneNow = true; }
    b.ms = (b.ms || 0) + spent; rec.ms += spent; // 쓰기 시간은 오늘 공부 시간에 들어가고, 예상 시간 계산(mN·mR)에는 안 들어간다
    S.ms += spent; S.answered++; if (ok) S.good++; else S.again++;
    saveSoon();
    sfx(ok ? 'good' : 'again');
    nextCard();
  }
  function showBonusStamp(key, track) {
    var mj = track === 'major', d = keyToDate(key);
    var layer = document.getElementById('stamp-layer');
    layer.innerHTML = sealSVG(mj ? '전공' : '출석', (d.getMonth() + 1) + '.' + pad2(d.getDate()), 0, 'big-stamp', true);
    var el = layer.firstChild;
    sfx('stamp');
    requestAnimationFrame(function () { el.classList.add('go'); });
    setTimeout(function () { layer.innerHTML = ''; }, 2000);
    toast((mj ? '전공 ' : '') + '쓰기까지 끝냈어요. 오늘 도장이 꽉 찼어요.');
  }
  function bonusResult(s) {
    var track = s.track, mj = track === 'major', key = todayKey();
    var b = bonusRec(track), st = bonusState(track), rec = trackRecOf(key, track) || { ms: 0 };
    var missed = Object.keys(s.missed).filter(function (id) { return DB.cards[id]; });
    var rot = dayRot(key) + (mj ? 4 : 0);
    var html = '<div class="result"><h2>' + (s.first ? (mj ? '전공 ' : '') + '쓰기 ' + s.first + '개를 했어요' : '틀렸던 단어 ' + (s.fixed || 0) + '개를 고쳤어요') + '</h2>' +
      '<p class="lead">' + (s.first ? '맞음 ' + s.firstOk + '개, 틀림 ' + (s.first - s.firstOk) + '개. ' : '') + '복습 일정은 바뀌지 않았어요.</p>' + timeLine(s.ms, rec.ms);
    if (b.done) html += '<div class="result-stamp">' + sealSVG(mj ? '전공' : '출석', '', rot, '', true) + '<p><strong>오늘 ' + (mj ? '전공 ' : '') + '쓰기까지 끝냈어요</strong>오늘 도장이 꽉 찬 도장이 됐어요.</p></div>';
    else html += '<div class="result-stamp">' + sealSVG(mj ? '전공' : '출석', '', rot) + '<p><strong>' + (st.open ? (st.fresh ? '쓰기 ' + st.left + '개가 남았어요' : '틀린 단어 ' + st.redo + '개를 아직 못 고쳤어요') : '쓰기가 아직 남았어요') + '</strong>' + (st.open ? '마저 하면 오늘 도장이 꽉 찬 도장이 돼요.' : '오늘 카드를 다 꺼내면 이어서 할 수 있어요.') + '</p></div>';
    if (missed.length) {
      html += '<ul class="miss-list">' + missed.slice(0, 12).map(function (id) { var c = DB.cards[id]; return '<li><b>' + esc(c.w) + '</b><span>' + esc(c.m) + '</span></li>'; }).join('') + '</ul>' +
        (missed.length > 12 ? '<p class="hint">그 밖에 ' + (missed.length - 12) + '개 더 있어요.</p>' : '') +
        '<p class="hint">틀린 단어는 다음 쓰기에 먼저 나와요.</p>';
    }
    html += '<div class="spacer"></div><div class="btns">' +
      (st.open ? '<button class="btn primary wide" data-act="bonus" data-track="' + track + '">쓰기 이어서 하기 (' + st.left + '개 남음)</button>' : '') +
      '<button class="btn ' + (st.open ? 'quiet' : 'primary') + ' wide" data-act="close-overlay">홈으로</button></div></div>';
    openOverlay('result', html);
    if (s.doneNow) showBonusStamp(key, track);
  }

  /* ================= 업데이트 내역 ================= */
  function appVer() { return window.__kvVersion || Native.version(); }
  function isRealVer(v) { return /^\d+\.\d+\.\d+$/.test(String(v)); }
  // 이 폰에서 각 버전을 처음 켠 날을 적어 둔다. 처음 켠 버전이면 그 버전 이름을 돌려준다
  function noteVersion() {
    var v = appVer();
    if (!isRealVer(v)) return null;
    var m = DB.meta;
    if (!m.verSeen) m.verSeen = {};
    var first = !m.verSeen[v];
    if (first) m.verSeen[v] = Date.now();
    m.lastVer = v;
    return first ? v : null;
  }
  function changeList() { return window.KKChanges || []; }
  function changeDate(d) { var p = String(d).split('-'); return (+p[1]) + '월 ' + (+p[2]) + '일'; }
  function changeItems(e) { return '<ul class="chg-list">' + (e.items || []).map(function (x) { return '<li>' + esc(x) + '</li>'; }).join('') + '</ul>'; }
  function openChanges() {
    var cur = appVer(), seen = DB.meta.verSeen || {}, year = '';
    var html = '<div class="view changes" style="padding-bottom:28px"><div class="cal-head" style="grid-template-columns:44px 1fr 44px"><button class="icon-btn" data-act="close-overlay" aria-label="뒤로">' + ICON.back + '</button><h2>업데이트 내역</h2><span></span></div>' +
      '<p class="hint" style="margin:0 0 4px">' + (isRealVer(cur) ? '지금 쓰는 버전은 ' + esc(cur) + '이에요. ' : '') + '언제 무엇이 바뀌었는지 새 버전부터 차례로 적어 둬요.</p>';
    changeList().forEach(function (e) {
      var y = String(e.d).slice(0, 4);
      if (y !== year) { year = y; html += '<p class="chg-year">' + y + '년</p>'; }
      html += '<article class="chg' + (e.v === cur ? ' now' : '') + '"><h3><span class="v">' + esc(e.v) + '</span><span class="d">' + changeDate(e.d) + '</span>' + (e.v === cur ? '<span class="badge">지금</span>' : '') + '</h3>' +
        '<p class="t">' + esc(e.t) + '</p>' + changeItems(e) +
        (seen[e.v] ? '<p class="seen">이 폰에서는 ' + shortDate(seen[e.v]) + '에 처음 켰어요.</p>' : '') + '</article>';
    });
    openOverlay('changes', html + '</div>');
  }
  /* ================= 설명서 (설정 > 설명서 보기). 내용은 guide.js ================= */
  function openGuide() {
    var list = window.KKGuide || [];
    var html = '<div class="view changes guide" style="padding-bottom:28px"><div class="cal-head" style="grid-template-columns:44px 1fr 44px"><button class="icon-btn" data-act="close-overlay" aria-label="뒤로">' + ICON.back + '</button><h2>설명서</h2><span></span></div>' +
      '<p class="hint" style="margin:0 0 4px">앱이 어떻게 움직이는지, 그리고 앞으로의 계획을 적어 둬요. 버전이 바뀌면 여기도 같이 고쳐요.</p>';
    list.forEach(function (e) {
      html += '<article class="chg"><h3>' + esc(e.t) + '</h3>' +
        (e.p || []).map(function (x) { return '<p class="g">' + esc(x) + '</p>'; }).join('') +
        (e.items && e.items.length ? changeItems(e) : '') +
        (e.note ? '<p class="seen">' + esc(e.note) + '</p>' : '') + '</article>';
    });
    openOverlay('guide', html + '</div>');
  }
  // 업데이트하고 처음 켰을 때 한 번, 그 버전에서 달라진 점을 보여 준다
  function showWhatsNew(v) {
    var e = changeList().filter(function (x) { return x.v === v; })[0];
    if (!e) return;
    openSheet('<h2>' + esc(v) + '에서 달라진 점</h2><p>' + esc(e.t) + '</p>' + changeItems(e) +
      '<div class="btns two"><button class="btn quiet" data-act="changes">지난 내역 보기</button><button class="btn primary" data-act="close-modal">알겠어요</button></div>');
  }

  /* ================= 알림용 요약 (폰이 읽음) ================= */
  function buildSummary() {
    var s = DB.settings, key = todayKey(), now = Date.now();
    var perDay = {}, todayDue = 0, end = dayEndMs(key);
    cards().forEach(function (c) {
      if (c.sus || c.st === 0 || !inDaily(c)) return;
      if (c.due < end) { todayDue++; return; }
      var k = F.dayKey(c.due, s.dayStartHour);
      perDay[k] = (perDay[k] || 0) + 1;
    });
    var plan = todayPlan();
    var dueBy = {}, newBy = {}, streakBy = {}, restDays = [];
    var cum = todayDue, newPool = Math.max(0, plan.newAvail - plan.newLeft);
    dueBy[key] = cum; newBy[key] = plan.newLeft;
    if (plan.restDay) restDays.push(key);
    for (var i = 1; i <= 30; i++) {
      var k = F.addDaysKey(key, i);
      cum += perDay[k] || 0;
      dueBy[k] = cum;
      var rest = isRestDay(k);
      if (rest) restDays.push(k);
      var cap = rest ? 0 : Math.min(newCapFor(cum), newPool);
      newBy[k] = cap; newPool -= cap;
    }
    for (var j = 0; j <= 7; j++) { var kk = F.addDaysKey(key, j); streakBy[kk] = streakAt(kk).count; }
    var attended = Object.keys(DB.days).filter(function (k) { return studied(k); }).sort().slice(-60);
    var pace = paceStats();
    var major = majorSummary(key, end);
    return {
      v: 1, generatedAt: now, dayStartHour: s.dayStartHour,
      revMs: Math.round(pace.revMs), newMs: Math.round(pace.newMs), // 알림의 '약 N분'도 홈 화면과 같은 내 속도로 잰다
      n1: { on: !!s.n1.on, h: s.n1.h, m: s.n1.m },
      n2: { on: !!s.n2.on, h: s.n2.h, m: s.n2.m },
      hasCards: hasCards(), attended: attended,
      restDays: restDays, restUntil: F.addDaysKey(key, 30), restDows: (s.restDows || []).slice(),
      dueBy: dueBy, newBy: newBy, streakBy: streakBy,
      minAnswers: s.minAnswers, lastBackupAt: DB.meta.lastBackupAt || 0,
      major: major // 전공 카드가 있을 때만 (없으면 null)
    };
  }
  // 알림용 전공 요약: 30일치 복습 누적·새 단어 예정, 연속 기록, 출석한 날
  function majorSummary(key, end) {
    if (!hasMajorCards()) return null; // 전공 카드가 없으면 날짜 기록에 전공 칸을 만들지 않는다
    var mp = majorPlan(), s = DB.settings;
    var perDay = {}, cum = 0;
    cards().forEach(function (c) {
      if (c.sus || c.st === 0 || !inMajor(c)) return;
      if (c.due < end) { cum++; return; }
      var k = F.dayKey(c.due, s.dayStartHour);
      perDay[k] = (perDay[k] || 0) + 1;
    });
    var dueBy = {}, newBy = {}, streakBy = {};
    var poolF = Math.max(0, mp.availF - mp.leftF), poolC = Math.max(0, mp.availC - mp.leftC);
    dueBy[key] = cum; newBy[key] = mp.newLeft;
    for (var i = 1; i <= 30; i++) {
      var k = F.addDaysKey(key, i);
      cum += perDay[k] || 0; dueBy[k] = cum;
      var per = isRestDay(k) ? 0 : majorCapFor(cum, s.majorPerDay);
      var f = Math.min(per, poolF), c = Math.min(per, poolC);
      poolF -= f; poolC -= c; newBy[k] = f + c;
    }
    for (var j = 0; j <= 7; j++) { var kk = F.addDaysKey(key, j); streakBy[kk] = streakAt(kk, 'major').count; }
    return { dueBy: dueBy, newBy: newBy, streakBy: streakBy, minAnswers: s.majorMin,
      attended: Object.keys(DB.days).filter(function (k) { return studied(k, 'major'); }).sort().slice(-60) };
  }

  /* ================= 복습 기억률 (복습 카드만 셈) ================= */
  // 기록 한 줄: [시각(초), 평가, 문제방식, 풀기 전 상태] — 상태 2(복습)인 것만 센다
  function reviewStats(fromKey, toKey, t) {
    var out = { total: 0, good: 0, byDay: {} };
    var d0 = dsh();
    cards().forEach(function (c) {
      if (trackOf(c) !== (t || 'toeic')) return;
      (c.h || []).forEach(function (x) {
        if (x[3] !== 2) return;
        var k = F.dayKey(x[0] * 1000, d0);
        if (k < fromKey || k > toKey) return;
        out.total++; if (x[1] >= 3) out.good++;
        var b = out.byDay[k] || (out.byDay[k] = { total: 0, good: 0 });
        b.total++; if (x[1] >= 3) b.good++;
      });
    });
    out.rate = out.total ? Math.round(out.good / out.total * 100) : null;
    return out;
  }

  /* ================= 가져오기·백업 ================= */
  function uniqueId(deckId, w) {
    var base = deckId + '-' + w.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    var id = base, i = 2;
    while (DB.cards[id]) { id = base + '-' + i++; }
    return id;
  }
  function wordFields(raw) {
    return {
      w: str(raw.w || raw.word),
      pos: str(raw.pos),
      m: str(raw.m || raw.meaning),
      ex: str(raw.ex || raw.example),
      exKo: str(raw.exKo || raw.example_ko || raw.exampleKo),
      note: str(raw.note || raw.memo),
      cue: str(raw.cue), // 쓰기에서 보여 줄 긴 뜻
      nu: str(raw.nu || raw.nuance) // 비슷한 말과 쓰임이 어떻게 다른지
    };
  }
  function applyFields(card, f) {
    Object.keys(f).forEach(function (k) { if (f[k]) card[k] = f[k]; });
  }
  function importDay(obj) {
    var words = Array.isArray(obj) ? obj : (obj.words || obj.cards || []);
    if (!words.length) throw new Error('empty');
    var info = obj.deck || {};
    var dayNum = info.day != null ? info.day : obj.day;
    var hasDay = dayNum != null && dayNum !== '' && !isNaN(+dayNum);
    var deckId = String(info.id || obj.deckId || (hasDay ? 'day-' + pad2(+dayNum) : 'deck-' + Date.now()));
    var title = info.title || obj.title || (hasDay ? 'Day ' + pad2(+dayNum) : '가져온 단어');
    var track = obj.kind === 'kkeonae-song' || info.free || info.track === 'song' ? 'song' : info.track === 'major' ? 'major' : 'toeic';
    var isDay = hasDay && track === 'toeic';
    var deck = DB.decks[deckId];
    if (!deck) {
      var maxOrder = 0; values(DB.decks).forEach(function (d) { if (d.order > maxOrder) maxOrder = d.order; });
      deck = DB.decks[deckId] = { id: deckId, title: title, day: isDay ? +dayNum : null, order: isDay ? +dayNum : maxOrder + 1, addedAt: Date.now(), track: track };
    } else { deck.title = title; if (!deck.track) deck.track = track; }
    if (deck.track === 'song') { deck.free = true; if (info.song) deck.song = str(info.song); if (info.artist) deck.artist = str(info.artist); }
    if (deck.track === 'major') deck.major = info.major === 'civ' ? 'civ' : (deck.major || 'fin');
    var byWord = {}, baseOrd = 0;
    cards().forEach(function (c) { if (c.deck === deckId) { byWord[c.w.toLowerCase()] = c; baseOrd = Math.max(baseOrd, (c.ord || 0) + 1); } });
    var added = 0, updated = 0;
    words.forEach(function (raw, i) {
      var f = wordFields(raw || {});
      if (!f.w) return;
      var id = raw.id ? String(raw.id) : null;
      var ex = (id && DB.cards[id]) || byWord[f.w.toLowerCase()];
      if (ex) { applyFields(ex, f); updated++; return; }
      var cid = id || uniqueId(deckId, f.w);
      var card = { id: cid, deck: deckId, ord: baseOrd + i, st: 0, step: 0, S: 0, D: 0, due: 0, last: 0, reps: 0, lapses: 0, sus: false, added: Date.now(), h: [] };
      applyFields(card, f);
      DB.cards[cid] = card; byWord[f.w.toLowerCase()] = card; added++;
    });
    return { deck: deck, added: added, updated: updated };
  }
  function importPatch(obj) {
    var items = obj.words || obj.items || [];
    var byWord = {};
    cards().forEach(function (c) { byWord[c.w.toLowerCase()] = c; });
    var n = 0;
    items.forEach(function (raw) {
      var f = wordFields(raw || {});
      var c = (raw.id && DB.cards[raw.id]) || (f.w && byWord[f.w.toLowerCase()]);
      if (!c) return;
      f.w = ''; applyFields(c, f); n++;
    });
    return n;
  }
  function parseLoose(text) {
    var t = String(text || '').trim().replace(/^```[a-z]*\s*/i, '').replace(/```\s*$/, '').trim();
    try { return JSON.parse(t); } catch (e) { /* 아래에서 다시 시도 */ }
    var a = t.indexOf('{'), b = t.lastIndexOf('}');
    var a2 = t.indexOf('['), b2 = t.lastIndexOf(']');
    if (a2 !== -1 && (a === -1 || a2 < a)) { a = a2; b = b2; }
    if (a !== -1 && b > a) return JSON.parse(t.slice(a, b + 1));
    throw new Error('parse');
  }
  // '단어 - 뜻' 줄 목록 읽기: 줄마다 단어와 뜻 사이를 -, –, :, =, 탭으로 나누거나, 영어 뒤에 바로 한글을 써도 된다
  function parseLines(text) {
    var words = [], bad = 0;
    String(text || '').split(/\r?\n/).forEach(function (line) {
      var t = line.replace(/^\s*(?:[-*•·]|\d+[.)])\s*/, '').trim();
      if (!t) return;
      var m = t.match(/^([A-Za-z(][A-Za-z0-9'’()\/.,\- ]*?)\s*(?:\t|\s[-–—=:]\s?|\s?[:=]\s*|\s{2,})\s*(.+)$/) ||
        t.match(/^([A-Za-z(][A-Za-z0-9'’()\/.,\- ]*?)\s+([~(（\[가-힣].*)$/);
      if (m && m[1].trim() && m[2].trim()) words.push({ w: m[1].trim().replace(/’/g, "'"), m: m[2].trim() });
      else bad++;
    });
    return { words: words, bad: bad };
  }
  function listTitle() { var d = new Date(); return '붙여 넣은 단어 ' + (d.getMonth() + 1) + '월 ' + d.getDate() + '일'; }
  // 사진·문서처럼 글자 파일이 아닌 것을 글자로 읽으면 깨진 글자(U+FFFD)나 0번 글자가 잔뜩 나온다
  function looksBinary(text) {
    var s = String(text || '').slice(0, 65536);
    if (!s) return false;
    if (s.indexOf('\u0000') !== -1) return true;
    var broken = (s.match(/�/g) || []).length;
    return broken > 8 && broken / s.length > 0.01;
  }
  function explainNotWordFile(kind) {
    var photo = kind === 'image' || kind === 'media';
    openSheet('<h2>' + (photo ? '사진은 앱이 읽을 수 없어요' : '단어 파일이 아니에요') + '</h2>' +
      '<p>' + (photo ? '앱에는 사진 속 글자를 읽는 기능이 없어요.' : 'Claude가 준 Day 파일이나, 한 줄에 \'단어 - 뜻\'으로 적은 목록만 가져올 수 있어요.') + '</p>' +
      '<p>책 사진은 Claude에게 보내면 Day 파일로 바꿔 줘요. 직접 넣으려면 단어장 화면의 \'단어 추가\'나 \'붙여 넣어 추가\'를 써 주세요.</p>' +
      '<div class="btns"><button class="btn primary" data-act="close-modal">알겠어요</button></div>');
  }
  // 전공 파일: 과목별 단어장 여러 개를 한 파일에 담는다 (decks: [{deck, words}])
  function importMajor(obj) {
    var parts = Array.isArray(obj.decks) ? obj.decks : [obj];
    var out = { added: 0, updated: 0, titles: [] };
    parts.forEach(function (p) {
      if (!p || !(p.words || []).length) return;
      var r = importDay({ deck: Object.assign({}, p.deck || {}, { track: 'major' }), words: p.words });
      out.added += r.added; out.updated += r.updated; out.titles.push(r.deck.title);
    });
    if (!out.titles.length) throw new Error('empty');
    return out;
  }
  var PLACE = { toeic: '단어 탭의 토익 칸', major: '단어 탭의 전공 칸', song: '노래 탭' };
  var FILE_NAME = { toeic: 'Day 파일', major: '전공 단어 파일', song: '노래 단어 파일' };
  // 다른 갈래 파일을 넣으면 섞이지 않게 막고, 맞는 곳을 알려 준다
  function wrongPlace(fileTrack) {
    openSheet('<h2>' + FILE_NAME[fileTrack] + '이에요</h2><p>토익, 전공, 노래 단어는 섞이지 않게 따로 받아요. 이 파일은 ' + PLACE[fileTrack] + '에서 가져와 주세요.</p>' +
      '<div class="btns two"><button class="btn quiet" data-act="close-modal">닫기</button><button class="btn primary" data-act="goto-place" data-place="' + fileTrack + '">' + (fileTrack === 'song' ? '노래 탭으로' : '단어 탭으로') + '</button></div>');
  }
  function importText(text, name, opts) {
    var obj;
    var target = (opts && opts.target) || 'toeic'; // 어느 화면의 가져오기 버튼인지: toeic, major, song, backup
    if (looksBinary(text)) { explainNotWordFile('binary'); return; }
    try { obj = parseLoose(text); }
    catch (e) {
      if (target === 'backup') { toast('백업 파일이 아니에요. 꺼내보카에서 저장한 백업 파일을 골라 주세요.'); return; }
      var lines = parseLines(text);
      if (!lines.words.length) { toast('파일 내용을 읽을 수 없어요. Claude가 준 파일이거나, 한 줄에 \'단어 - 뜻\' 형식인지 확인해 주세요.'); return; }
      // 파일에서 읽은 줄 목록은 뜻 절반 이상에 한글이 있어야 단어 목록으로 본다 (다른 앱 파일이 단어로 들어가는 것을 막음)
      if (opts && opts.file && lines.words.filter(function (x) { return /[가-힣]/.test(x.m); }).length * 2 < lines.words.length) { explainNotWordFile('text'); return; }
      var title = (opts && str(opts.title)) || (target === 'song' ? '노래 단어' : listTitle());
      var same = values(DB.decks).filter(function (d) { return deckTrack(d.id) === target && d.title.trim().toLowerCase() === title.trim().toLowerCase(); })[0];
      if (target === 'major' && !same) { toast('전공 단어는 전공 단어 파일로 넣거나, 전공 단어장 화면의 \'붙여 넣어 추가\'로 넣어 주세요.'); return; }
      var r0 = importDay({ deck: { id: same ? same.id : (target === 'song' ? 'song-list-' : 'list-') + hashStr(title), title: same ? same.title : title, track: target }, words: lines.words });
      saveNow(); closeAllModals(); render();
      if (state.overlay === 'deck' && state.deckId) renderDeckOverlay(); // 단어장 화면에서 붙여 넣었으면 그 화면도 새로 그린다
      toast((same ? r0.deck.title + '에 더했어요' : josa(r0.deck.title, '을/를') + ' 만들었어요') + '. 새 단어 ' + r0.added + '개' + (r0.updated ? ', 고친 단어 ' + r0.updated + '개' : '') + (lines.bad ? '. 못 읽은 줄 ' + lines.bad + '개' : '') + '.');
      return;
    }
    if (obj && obj.kind === 'kkeonae-backup' && obj.db) { confirmRestore(obj, name); return; }
    if (target === 'backup') { toast('백업 파일이 아니에요. 단어 파일은 단어 탭이나 노래 탭에서 가져와 주세요.'); return; }
    if (obj && obj.kind === 'kkeonae-patch') {
      var n = importPatch(obj); saveNow(); render();
      toast(n ? '단어 ' + n + '개에 설명을 붙였어요.' : '맞는 단어를 찾지 못했어요.');
      return;
    }
    var kind = obj && obj.kind;
    var fileTrack = kind === 'kkeonae-song' ? 'song' : kind === 'kkeonae-major' ? 'major' : 'toeic';
    if (fileTrack !== target) { wrongPlace(fileTrack); return; }
    try {
      if (fileTrack === 'major') {
        var rm = importMajor(obj);
        saveNow(); closeAllModals(); render();
        toast('전공 단어를 가져왔어요(' + rm.titles.join(', ') + '). 새 단어 ' + rm.added + '개' + (rm.updated ? ', 고친 단어 ' + rm.updated + '개' : '') + '. 하루에 과목별 ' + DB.settings.majorPerDay + '개씩 나와요.');
        return;
      }
      var r = importDay(obj);
      saveNow(); closeAllModals(); render();
      var msg = josa(r.deck.title, '을/를') + ' 가져왔어요. 새 단어 ' + r.added + '개';
      if (r.updated) msg += ', 고친 단어 ' + r.updated + '개';
      if (deckTrack(r.deck.id) === 'song') msg += '. 노래 탭에서 하고 싶을 때 공부해요';
      toast(msg + '.');
    } catch (e) {
      toast('단어 목록을 찾지 못했어요. Claude가 준 ' + FILE_NAME[target] + '인지 확인해 주세요.');
    }
  }
  function backupPayload() {
    return JSON.stringify({
      kind: 'kkeonae-backup', version: 1, app: '꺼내보카', exportedAt: Date.now(),
      counts: { cards: Object.keys(DB.cards).length, decks: Object.keys(DB.decks).length, attended: Object.keys(DB.days).filter(attendedKey).length },
      db: DB
    });
  }
  function backupName() {
    var d = new Date();
    return 'kkeonae-backup-' + d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' + pad2(d.getHours()) + pad2(d.getMinutes()) + '.json';
  }
  function confirmRestore(obj, name) {
    var c = obj.counts || {};
    var when = obj.exportedAt ? new Date(obj.exportedAt) : null;
    var whenText = when ? (when.getFullYear() + '년 ' + shortDate(obj.exportedAt) + ' ' + pad2(when.getHours()) + ':' + pad2(when.getMinutes())) : '날짜 모름';
    openSheet(
      '<h2>백업을 불러올까요?</h2>' +
      '<p>지금 폰에 있는 기록이 백업 내용으로 바뀌어요.</p>' +
      '<p class="small muted">' + esc(whenText) + '에 만든 백업이에요. 단어 ' + (c.cards != null ? c.cards : '?') + '개, 출석 ' + (c.attended != null ? c.attended : '?') + '일이 들어 있어요.</p>' +
      '<div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn primary" data-act="do-restore">불러오기</button></div>',
      { restore: obj }
    );
  }
  function doRestore(obj) {
    var next;
    try { next = migrate(clone(obj.db)); } catch (e) { toast('백업 파일이 손상돼서 불러올 수 없어요.'); return; }
    if (!blockSave) Native.keepBeforeRestore(JSON.stringify(DB));
    DB = next; blockSave = false; loadProblem = false;
    saveNow(); closeAllModals(); closeOverlay(true); render();
    toast('백업을 불러왔어요.');
  }

  /* ================= 소리 ================= */
  var AC = null;
  function sfx(kind) {
    if (!DB.settings.sound) return;
    try {
      AC = AC || new (window.AudioContext || window.webkitAudioContext)();
      if (AC.state === 'suspended') AC.resume();
      var t = AC.currentTime;
      var notes = kind === 'good' ? [[660, 0], [880, 0.07]] : kind === 'stamp' ? [[150, 0], [95, 0.03]] : [[300, 0]];
      notes.forEach(function (n) {
        var o = AC.createOscillator(), g = AC.createGain();
        o.type = kind === 'again' ? 'triangle' : 'sine';
        o.frequency.value = n[0];
        g.gain.setValueAtTime(0.0001, t + n[1]);
        g.gain.exponentialRampToValueAtTime(kind === 'stamp' ? 0.25 : 0.06, t + n[1] + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t + n[1] + (kind === 'stamp' ? 0.18 : 0.12));
        o.connect(g); g.connect(AC.destination);
        o.start(t + n[1]); o.stop(t + n[1] + 0.2);
      });
    } catch (e) { /* 소리 없이 진행 */ }
  }
  function speak(text) {
    var r = Native.speak(String(text || '').replace(/[\[\]]/g, ''));
    if (r === 0) toast('발음을 준비하고 있어요. 잠시 뒤 다시 눌러 주세요.');
    else if (r === -1) toast('폰에 영어 음성이 없어요. 폰 설정에서 텍스트 음성 변환(TTS) 영어를 설치해 주세요.');
  }

  /* ================= 그림 조각 ================= */
  var INK_DASH = '46 1.4 19 0.9 33 1.6 58 1.1 21 1.3';
  // solid: 가운데를 꽉 채운 도장 (쓰기까지 끝낸 날)
  function sealSVG(text, sub, rot, cls, solid) {
    var ink = solid ? 'var(--card)' : 'var(--stamp)';
    return '<svg class="seal ' + (cls || '') + (solid ? ' solid' : '') + '" viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(' + (rot || 0) + ' 32 32)">' +
      '<circle cx="32" cy="32" r="28.5" fill="none" style="stroke:var(--stamp)" stroke-width="3.4" stroke-dasharray="' + INK_DASH + '"/>' +
      (solid ? '<circle cx="32" cy="32" r="23.8" style="fill:var(--stamp)"/>'
        : '<circle cx="32" cy="32" r="23.6" fill="none" style="stroke:var(--stamp)" stroke-width="1.1" opacity=".9"/>') +
      '<text x="32" y="' + (sub ? 34.5 : 37.5) + '" text-anchor="middle" style="fill:' + ink + ';font-family:var(--font-ko);font-weight:800" font-size="' + (sub ? 14 : 15) + '">' + esc(text) + '</text>' +
      (sub ? '<text x="32" y="46.5" text-anchor="middle" style="fill:' + ink + ';font-family:var(--font-ko);font-weight:700" font-size="7.5">' + esc(sub) + '</text>' : '') +
      '</g></svg>';
  }
  function dayRot(key) { return (hashStr(key) % 17) - 9; }
  var ICON = {
    close: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><path d="M6 6l12 12M18 6L6 18"/></svg>',
    undo: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 7L4.5 11.5 9 16"/><path d="M5 11.5h9a5 5 0 0 1 0 10h-2"/></svg>',
    speak: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M4.5 9.5h3l4-3.5v12l-4-3.5h-3z"/><path d="M15.5 9a4 4 0 0 1 0 6M18 6.5a7.5 7.5 0 0 1 0 11"/></svg>',
    back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M15 5l-7 7 7 7"/></svg>',
    next: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 5l7 7-7 7"/></svg>',
    moon: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M19 14.5A7.5 7.5 0 0 1 9.5 5a7.5 7.5 0 1 0 9.5 9.5z"/></svg>'
  };
  function exampleHTML(ex) {
    var s = esc(ex);
    if (/\[[^\]]+\]/.test(ex)) return s.replace(/\[([^\]]+)\]/g, '<b>$1</b>');
    return s;
  }
  function clozeParts(c) {
    var ex = c.ex || '';
    var m = ex.match(/^(.*?)\[([^\]]+)\](.*)$/);
    if (m) return { before: m[1], target: m[2], after: m[3].replace(/[\[\]]/g, '') };
    var w = (c.w || '').split(/[\/,;]/)[0].replace(/\(.*?\)/g, '').trim();
    if (!w || /\s/.test(w)) return null;
    var stem = w.length >= 5 ? w.replace(/(e|y)$/i, '') : w;
    var re = new RegExp('\\b(' + stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\w*)\\b', 'i');
    var mm = ex.match(re);
    if (!mm) return null;
    var i = mm.index;
    return { before: ex.slice(0, i), target: mm[1], after: ex.slice(i + mm[1].length) };
  }

  /* ================= 화면 상태 ================= */
  var state = { tab: 'home', calMonth: null, calTrack: 'toeic', search: '', deckId: null, overlay: null, pickTarget: null, lookFlip: false };
  var view = document.getElementById('view');
  var overlay = document.getElementById('overlay');
  var modalRoot = document.getElementById('modal-root');
  var modalCtx = [];

  function setTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(function (b) {
      if (b.dataset.tab === tab) b.setAttribute('aria-current', 'page'); else b.removeAttribute('aria-current');
    });
    render();
    window.scrollTo(0, 0);
  }
  function render() {
    if (state.tab === 'home') view.innerHTML = renderHome();
    else if (state.tab === 'calendar') view.innerHTML = renderCalendar();
    else if (state.tab === 'words') view.innerHTML = renderWords();
    else if (state.tab === 'songs') view.innerHTML = renderSongs();
    else view.innerHTML = renderSettings();
    if (state.overlay === 'deck') renderDeckOverlay();
  }

  var toastTimer = null;
  function toast(msg) {
    var t = document.getElementById('toast');
    t.textContent = msg; t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { t.classList.remove('show'); }, 3200);
  }

  function openSheet(html, ctx) {
    var back = document.createElement('div');
    back.className = 'modal-back';
    back.innerHTML = '<div class="sheet" role="dialog" aria-modal="true">' + html + '</div>';
    back.addEventListener('click', function (e) { if (e.target === back) closeTopModal(); });
    modalRoot.appendChild(back);
    modalCtx.push(ctx || {});
    var first = back.querySelector('textarea, input');
    if (first && first.dataset.autofocus) first.focus();
    return back;
  }
  function closeTopModal() {
    var last = modalRoot.lastElementChild;
    if (!last) return false;
    last.remove(); modalCtx.pop();
    return true;
  }
  function closeAllModals() { while (closeTopModal()) { /* 모두 닫기 */ } }
  function topCtx() { return modalCtx[modalCtx.length - 1] || {}; }

  function openOverlay(name, html) {
    state.overlay = name;
    overlay.innerHTML = html;
    overlay.hidden = false;
    document.body.classList.add('overlay-open');
    overlay.scrollTop = 0;
  }
  function closeOverlay(silent) {
    state.overlay = null; state.deckId = null;
    overlay.hidden = true; overlay.innerHTML = '';
    document.body.classList.remove('overlay-open');
    if (!silent) render();
  }

  /* ================= 홈 ================= */
  function weekStrip(t) {
    var key = todayKey();
    var sunday = weekStartKey(key);
    var st = streakAt(key, t);
    var mj = t === 'major', pre = mj ? '전공 ' : '';
    var html = '<ol class="week' + (mj ? ' major' : '') + '">';
    for (var i = 0; i < 7; i++) {
      var k = F.addDaysKey(sunday, i);
      var d0 = DB.days[k], d = mj ? (d0 && d0.mj) : d0;
      var diff = F.daysBetweenKeys(key, k);
      var label = DOW[F.keyToDow(k)];
      var mark;
      if (d && d.att) mark = sealSVG(mj ? '전공' : '출석', '', dayRot(k), '', bonusOn(d));
      else if (isRestDay(k)) mark = '<span class="seal-rest' + (diff > 0 ? ' later' : '') + '" title="쉬는 날">' + ICON.moon + '</span>';
      else if (d && d.rest) mark = '<span class="seal-rest" title="할 카드가 없던 날">' + ICON.moon + '</span>';
      else if (st.frozen.indexOf(k) !== -1) mark = '<span class="seal-empty pass" title="휴식권 사용"></span>';
      else if (diff === 0) mark = '<span class="seal-empty today"></span>';
      else if (diff > 0) mark = '<span class="seal-empty future"></span>';
      else mark = '<span class="seal-empty"></span>';
      html += '<li class="' + (diff === 0 ? 'is-today' : '') + '"><span class="dow">' + label + '</span>' + mark + '</li>';
    }
    html += '</ol>';
    var win = passWindow(key);
    var used = st.frozen.some(function (k) { return passKey(k) === passKey(key); });
    var note = used
      ? pre + '휴식권을 썼어요. ' + keyLabel(F.addDaysKey(win.end, 1), true) + '에 새로 생겨요.'
      : pre + '휴식권 1장이 있어요. ' + keyLabel(win.end) + '까지 하루 빠져도 ' + pre + '연속 기록이 이어져요.';
    return { html: html, note: note, streak: st.count };
  }

  /* 홈은 토익과 전공 중 고른 쪽만 보여 준다. 도장판·오늘 카드·공 캐릭터가 갈래마다 따로다 */
  function homeTrack() { return DB.meta.homeTrack === 'major' ? 'major' : 'toeic'; }
  function hasMajorDeck() { return values(DB.decks).some(function (d) { return deckTrack(d.id) === 'major'; }); }
  function ballSVG(kind, mood, px, label) { return window.KKBalls ? window.KKBalls.svg(kind, mood, px, label) : ''; }
  // 전공 공이 오늘 입을 옷: 날마다 금융과 토목을 번갈아, 공을 누르면 바뀐다
  function majorLook(key) {
    var fin = F.daysBetweenKeys(PASS_ANCHOR, key) % 2 === 0;
    if (state.lookFlip) fin = !fin;
    return fin ? 'fin' : 'civ';
  }
  function trackToggle(cur, plan) {
    var mp = hasMajorDeck() ? majorPlan() : null;
    function badge(att, n) { return att ? '<span class="n done">출석</span>' : n > 0 ? '<span class="n">' + n + '장</span>' : ''; }
    function b(t, label, face, bd) {
      return '<button class="track-btn' + (t === 'major' ? ' major' : '') + '" data-act="home-track" data-v="' + t + '" aria-pressed="' + (cur === t) + '">' +
        ballSVG(face, 'idle', 30) + '<span class="t">' + label + '</span>' + bd + '</button>';
    }
    return '<div class="track-toggle" role="group" aria-label="공부 고르기">' +
      b('toeic', '토익', 'vol', badge(plan.rec.att, plan.restDay ? 0 : plan.due + plan.newLeft)) +
      b('major', '전공', 'fice', mp ? badge(mp.rec.att, mp.restDay ? 0 : mp.due + mp.newLeft) : '') + '</div>';
  }
  function memorySection(track) {
    var counts = { new: 0, learn: 0, long: 0 };
    cards().forEach(function (c) { if (trackOf(c) !== track) return; var s = stage(c); if (counts[s] != null) counts[s]++; });
    var totalWords = counts.new + counts.learn + counts.long;
    if (track === 'major' && !totalWords) return '';
    return '<section class="memory"><p class="lead"><strong>' + counts.long + '개</strong> ' + (track === 'major' ? '전공 ' : '') + '단어가 머리에 남았어요</p>' +
      '<p class="sub">전체 ' + totalWords + '개 중 익히는 중 ' + counts.learn + '개, 새 단어 ' + counts.new + '개</p>' +
      retentionLine(track) + '</section>';
  }
  function renderHome() {
    var plan = todayPlan();
    var key = plan.key;
    var head = '<header class="home-head"><h1 class="brand">꺼내보카</h1><p class="today-date">' + keyLabel(key, true) + '</p></header>';
    var notices = homeNotices();

    if (!hasCards() && !Object.keys(DB.cards).length) {
      return head + notices +
        '<section class="empty"><div class="empty-ball">' + ballSVG('lib', 'idle', 96) + '</div><h2>아직 단어가 없어요</h2>' +
        '<p>Claude가 만들어 준 Day 파일을 가져오면 바로 시작할 수 있어요. 처음이라면 체험용 10단어로 먼저 써 보세요.</p>' +
        '<div class="stack-btns"><button class="btn primary" data-act="import-file" data-target="toeic">Day 파일 가져오기</button>' +
        '<button class="btn quiet" data-act="paste-import" data-target="toeic">붙여 넣어 가져오기</button>' +
        '<button class="btn text" data-act="load-sample">체험용 10단어 넣기</button></div></section>';
    }
    var track = homeTrack();
    return head + trackToggle(track, plan) + (track === 'major' ? homeMajor() : homeToeic(plan)) + notices + memorySection(track);
  }
  function homeToeic(plan) {
    var key = plan.key;
    var ws = weekStrip();
    var streakLine = ws.streak > 0 ? '<p class="streak-line"><strong>' + ws.streak + '일</strong> 연속 출석</p>' : '<p class="streak-line">오늘 첫 도장을 찍어 보세요</p>';
    var total = plan.due + plan.newLeft;
    var desc, headline = total + '장', headClass = 'today-total';
    var dueTomorrow = Math.max(0, countDue(dayEndMs(F.addDaysKey(key, 1))) - plan.due);
    if (plan.restDay && plan.rec.a === 0) {
      headline = '오늘은 쉬는 날이에요'; headClass += ' word';
      desc = plan.due ? '밀린 복습 ' + plan.due + '장이 있어요. 하고 싶으면 해도 되고, 내일 해도 돼요.' : '오늘은 복습이 잡혀 있지 않아요. 푹 쉬고 내일 만나요.';
    }
    else if (total === 0 && plan.rec.a > 0) { headline = '오늘 카드는 다 꺼냈어요'; headClass += ' word'; desc = isRestDay(F.addDaysKey(key, 1)) ? '내일은 쉬는 날이에요.' : '내일 복습 예정은 ' + dueTomorrow + '장이에요.'; }
    else if (total === 0) { headline = '오늘은 쉬어 가는 날이에요'; headClass += ' word'; desc = '복습할 카드가 없어요. 새 Day를 가져오면 새 단어가 생겨요.'; }
    else {
      var pace = paceStats();
      desc = '복습 ' + plan.due + '장, 새 단어 ' + plan.newLeft + '장이에요. 약 ' + estMinutes(plan.due, plan.newLeft, pace) + '분 걸려요' + (pace.personal ? '(내 속도 기준).' : '.');
    }
    if (plan.reduced) desc += ' 복습이 많아서 오늘 새 단어를 ' + plan.rec.cap + '장으로 줄였어요.';
    var goal = DB.settings.minAnswers;
    var meter;
    if (plan.rec.att) meter = bonusOn(plan.rec) ? '<p class="meter-label">' + sealSVG('출석', '', -8, '', true) + '오늘 쓰기까지 끝냈어요.</p>'
      : '<p class="meter-label">' + sealSVG('출석', '', -8) + '오늘 출석했어요. 더 하면 내일이 가벼워져요.</p>';
    else if (plan.restDay) meter = '<p class="meter-label">쉬는 날이라 공부를 안 해도 연속 기록이 이어져요.</p>';
    else if (plan.rec.rest) meter = '<p class="meter-label">할 카드가 없는 날이라 출석으로 쳐 줘요.</p>';
    else {
      var pct = Math.min(100, Math.round(plan.rec.a / goal * 100));
      meter = '<div class="meter" role="progressbar" aria-label="출석까지" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(goal, plan.rec.a) + '"><span style="width:' + pct + '%"></span></div>' +
        '<p class="meter-label">출석까지 ' + goal + '문제 중 ' + Math.min(goal, plan.rec.a) + '문제</p>';
    }
    var canStudy = total > 0 || hasPendingLearning();
    var mins = DB.settings.shortMinutes;
    var bb = bonusButton('toeic');
    var mood = plan.rec.att ? 'happy' : (plan.restDay && plan.rec.a === 0) || plan.rec.rest ? 'sleep' : 'idle';

    return '<section class="streak">' + streakLine + ws.html + '<p class="freeze-note">' + ws.note + '</p></section>' +
      '<section class="today"><div class="stack' + (total < 2 ? ' single' : '') + '"><div class="index-card has-mascot">' +
      '<p class="card-kicker"><span>오늘 꺼낼 카드</span><span>' + (plan.rec.a ? '오늘 ' + fmtMin(plan.rec.ms) + ' 동안 ' + plan.rec.a + '문제' : '') + '</span></p>' +
      '<div class="mascot">' + ballSVG('lib', mood, 92) + '</div>' +
      '<p class="' + headClass + '">' + esc(headline) + '</p>' +
      '<p class="today-desc">' + esc(desc) + '</p>' + meter +
      '</div></div>' +
      (bb ? '<div class="home-actions one">' + bb + '</div>' + BONUS_HINT
        : '<div class="home-actions"><button class="btn ' + (plan.restDay && !plan.rec.a ? 'quiet' : 'primary') + '" data-act="study" ' + (canStudy ? '' : 'disabled') + '>' + (plan.restDay ? '복습만 하기' : '공부 시작') + '</button>' +
          '<button class="btn quiet" data-act="short" ' + (canStudy ? '' : 'disabled') + '>' + mins + '분만</button></div>') + weekMissButton(plan, 'toeic') + '</section>';
  }
  // 홈의 전공 쪽: 금융·토목 새 단어와 전공 복습. 출석·연속 기록·휴식권은 토익과 따로 센다
  function homeMajor() {
    var s = DB.settings;
    if (!hasMajorDeck()) {
      return '<section class="empty major-home track-major"><div class="empty-ball">' + ballSVG('fin', 'idle', 96) + '</div><h2>전공 단어가 아직 없어요</h2>' +
        '<p>금융·보험과 토목 단어를 하루에 과목별 ' + s.majorPerDay + '개씩 따로 외워요. 출석도 토익과 따로 찍어요. Claude가 준 전공 단어 파일을 넣으면 시작돼요.</p>' +
        '<div class="stack-btns"><button class="btn primary" data-act="import-file" data-target="major">전공 단어 파일 가져오기</button></div></section>';
    }
    var mp = majorPlan(), m = mp.rec, ws = weekStrip('major');
    var total = mp.due + mp.newLeft;
    var headline = total + '장', headClass = 'today-total', desc;
    if (mp.restDay && m.a === 0) {
      headline = '오늘은 쉬는 날이에요'; headClass += ' word';
      desc = mp.due ? '밀린 전공 복습 ' + mp.due + '장이 있어요. 하고 싶으면 해도 되고, 내일 해도 돼요.' : '오늘은 전공 복습도 없어요.';
    } else if (total === 0 && m.a > 0) { headline = '오늘 전공 카드는 다 꺼냈어요'; headClass += ' word'; desc = '내일 또 과목별로 ' + s.majorPerDay + '개씩 나와요.'; }
    else if (total === 0) {
      headline = '오늘은 쉬어 가는 날이에요'; headClass += ' word';
      desc = mp.availF + mp.availC ? '오늘 할 전공 카드가 없어요.' : '전공 새 단어를 다 만났어요. Claude에게 다음 전공 단어 파일을 받아 주세요.';
    } else {
      var parts = [];
      if (mp.due) parts.push('복습 ' + mp.due + '장');
      if (mp.leftF) parts.push('금융·보험 새 단어 ' + mp.leftF + '장');
      if (mp.leftC) parts.push('토목 새 단어 ' + mp.leftC + '장');
      desc = parts.join(', ') + '이에요. 약 ' + estMinutes(mp.due, mp.newLeft) + '분 걸려요.';
    }
    if (mp.reduced) desc += ' 전공 복습이 많아서 새 단어를 과목별 ' + m.cap + '장으로 줄였어요.';
    var goal = s.majorMin, meter;
    if (m.att) meter = bonusOn(m) ? '<p class="meter-label">' + sealSVG('전공', '', -8, '', true) + '오늘 전공 쓰기까지 끝냈어요.</p>'
      : '<p class="meter-label">' + sealSVG('전공', '', -8) + '오늘 전공 출석했어요.</p>';
    else if (mp.restDay) meter = '<p class="meter-label">쉬는 날이라 안 해도 전공 연속 기록이 이어져요.</p>';
    else if (m.rest) meter = '<p class="meter-label">할 전공 카드가 없는 날이라 출석으로 쳐 줘요.</p>';
    else {
      var pct = Math.min(100, Math.round(m.a / goal * 100));
      meter = '<div class="meter" role="progressbar" aria-label="전공 출석까지" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(goal, m.a) + '"><span style="width:' + pct + '%"></span></div>' +
        '<p class="meter-label">전공 출석까지 ' + goal + '문제 중 ' + Math.min(goal, m.a) + '문제</p>';
    }
    var canStudy = total > 0 || majorPending();
    var mood = m.att ? 'happy' : (mp.restDay && m.a === 0) || m.rest ? 'sleep' : 'idle';
    var look = majorLook(mp.key);
    var bbm = bonusButton('major');
    return '<div class="major-home track-major"><section class="streak"><p class="streak-line">' +
      (ws.streak > 0 ? '<strong>' + ws.streak + '일</strong> 전공 연속 출석' : '오늘 첫 전공 도장을 찍어 보세요') + '</p>' + ws.html + '<p class="freeze-note">' + ws.note + '</p></section>' +
      '<section class="today"><div class="stack' + (total < 2 ? ' single' : '') + '"><div class="index-card major-card has-mascot">' +
      '<p class="card-kicker"><span>오늘 꺼낼 전공 카드</span><span>' + (m.a ? '오늘 ' + fmtMin(m.ms) + ' 동안 ' + m.a + '문제' : '') + '</span></p>' +
      '<button class="mascot" data-act="mascot" aria-label="' + (look === 'fin' ? '금융 옷이에요. 누르면 토목 옷으로 바뀌어요' : '토목 옷이에요. 누르면 금융 옷으로 바뀌어요') + '">' + ballSVG(look, mood, 92) + '</button>' +
      '<p class="' + headClass + '">' + esc(headline) + '</p><p class="today-desc">' + esc(desc) + '</p>' + meter + '</div></div>' +
      '<div class="home-actions one">' + (bbm || '<button class="btn ' + (mp.restDay && !m.a ? 'quiet' : 'primary') + '" data-act="major-study" ' + (canStudy ? '' : 'disabled') + '>' + (mp.restDay ? '전공 복습만 하기' : '전공 공부 시작') + '</button>') + '</div>' +
      (bbm ? BONUS_HINT : '') + weekMissButton(mp, 'major') + '</section></div>';
  }
  function weekMissButton(plan, track) {
    var mj = track === 'major';
    var n = weekMissedIds(track).length;
    if (!n) return '';
    var lead = plan.restDay && !(plan.due > 0);
    return '<button class="btn ' + (lead ? 'primary' : 'text') + ' wide week-miss" data-act="practice-week"' + (mj ? ' data-track="major"' : '') + '>이번 주 틀린 ' + (mj ? '전공 ' : '') + '단어 ' + n + '개 연습</button>';
  }
  function retentionLine(t) {
    var key = todayKey();
    var r = reviewStats(F.addDaysKey(key, -13), key, t);
    if (r.total < 20) return '';
    var prev = reviewStats(F.addDaysKey(key, -27), F.addDaysKey(key, -14), t); // 그 앞 2주. 올랐는지 내렸는지 견주어 보라고
    return '<p class="sub">최근 2주 복습 기억률 ' + r.rate + '% (복습 ' + r.total + '번 중 ' + r.good + '번 기억)' +
      (prev.total >= 20 ? '. 그 전 2주는 ' + prev.rate + '%였어요.' : '') + '</p>';
  }
  function hasPendingLearning() {
    for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && inDaily(c) && (c.st === 1 || c.st === 3)) return true; }
    return false;
  }
  function homeNotices() {
    var out = '';
    if (loadProblem) {
      out += '<div class="notice"><p>저장된 기록을 읽지 못했어요. 기록이 지워지지 않게 저장을 멈춰 뒀어요. 자동 저장본이나 백업 파일로 되살릴 수 있어요.</p>' +
        '<div class="row"><button class="btn small primary" data-act="snapshots">자동 저장본 보기</button><button class="btn small quiet" data-act="import-file" data-target="backup">백업 파일 불러오기</button><button class="btn small text" data-act="fresh-start">새로 시작</button></div></div>';
    }
    var ns = Native.notifStatus();
    if (ns && !ns.granted) {
      out += '<div class="notice"><p>알림이 꺼져 있어요. 켜 두면 정한 시간에 오늘 할 양과 출석 마감을 알려 드려요.</p><div class="row"><button class="btn small primary" data-act="notif-on">알림 켜기</button></div></div>';
    }
    out += lowNewNotice();
    if (Object.keys(DB.cards).length) {
      var last = DB.meta.lastBackupAt || 0;
      var age = last ? Math.floor((Date.now() - last) / DAY) : Math.floor((Date.now() - DB.createdAt) / DAY);
      if ((last && age >= 7) || (!last && age >= 3)) {
        var msg = last ? '마지막 백업이 ' + age + '일 전이에요.' : '아직 백업한 적이 없어요.';
        out += '<div class="notice"><p>' + msg + ' 폰을 바꾸거나 앱을 지우면 기록이 사라지니 백업 파일을 폰 밖에도 하나 두세요.</p>' +
          '<div class="row"><button class="btn small primary" data-act="backup-share">카톡·드라이브로 보내기</button><button class="btn small quiet" data-act="backup-save">파일로 저장</button></div></div>';
      }
    }
    return out;
  }

  // 토익 새 단어가 이틀 치보다 적게 남으면 알려 준다. '더 넣을 단어가 없어요'를 누르면 새 단어장을 넣을 때까지 안 보인다
  function toeicCardCount() { var n = 0; for (var k in DB.cards) { if (inDaily(DB.cards[k])) n++; } return n; }
  function lowNewNotice() {
    var per = DB.settings.newPerDay;
    if (homeTrack() !== 'toeic' || per <= 0) return '';
    var total = toeicCardCount();
    if (!total || DB.meta.lowNewOff === total) return '';
    var left = todayPlan().newAvail;
    if (left >= per * 2) return '';
    return '<div class="notice"><p>' + (left > 0 ? '새 단어가 ' + left + '개 남았어요. 하루 ' + per + '개씩이면 이틀 안에 다 떨어져요.' : '새 단어가 다 떨어졌어요.') +
      ' 다음 Day 파일을 가져오면 이어서 나와요.</p><div class="row"><button class="btn small primary" data-act="import-file" data-target="toeic">Day 파일 가져오기</button>' +
      '<button class="btn small text" data-act="lownew-off">더 넣을 단어가 없어요</button></div></div>';
  }

  /* ================= 공부 ================= */
  var S = null; // 진행 중인 공부

  function studyOpts() { return { retention: DB.settings.retention, dsh: dsh(), fuzz: true, restDows: DB.settings.restDows || [] }; }
  function retrNow(c, now) { return c.last ? F.retrievability((now - c.last) / DAY, c.S || 0.1) : 0; }
  // 카드 한 장에 쓴 시간: 카드가 뜬 뒤 답할 때까지. 자리를 비운 시간이 들어가지 않게 한 장에 90초까지만 센다
  function answerMs(now) { return Math.max(0, Math.min(now - S.cur.shownAt, 90000)); }
  function recSnap(rec) { return { a: rec.a, c: rec.c, n: rec.n, ms: rec.ms, mN: rec.mN, mR: rec.mR, sa: rec.sa || 0, sms: rec.sms || 0, att: !!rec.att, attAt: rec.attAt, mj: rec.mj ? clone(rec.mj) : null }; }

  function startStudy(mode, extra) {
    var now = Date.now();
    var plan = todayPlan();
    var learning = [], reviews = [];
    cards().forEach(function (c) {
      if (c.sus || !inDaily(c)) return;
      if (c.st === 1 || c.st === 3) learning.push({ id: c.id, due: c.due });
      else if (c.st === 2 && c.due < plan.end) reviews.push(c);
    });
    var newCards = newQueueCards().slice(0, plan.newLeft);
    if (mode === 'short') {
      reviews.sort(function (a, b) { return retrNow(a, now) - retrNow(b, now); });
      var cap = Math.max(12, DB.settings.shortMinutes * 8);
      reviews = reviews.slice(0, cap);
      newCards = reviews.length < 15 ? newCards.slice(0, 5) : [];
    } else {
      reviews.sort(function (a, b) { return a.due - b.due; });
    }
    if (extra && extra.more) newCards = newCards.slice(0, Math.max(0, extra.more));
    var queue = [], ni = 0;
    reviews.forEach(function (c, i) {
      queue.push(c.id);
      if ((i + 1) % 4 === 0 && ni < newCards.length) queue.push(newCards[ni++].id);
    });
    while (ni < newCards.length) queue.push(newCards[ni++].id);
    var nowLearning = learning.filter(function (x) { return x.due <= now; }).map(function (x) { return x.id; });
    var pending = learning.filter(function (x) { return x.due > now; });
    S = {
      mode: mode, startedAt: now,
      deadline: mode === 'short' ? now + DB.settings.shortMinutes * MIN : 0,
      queue: nowLearning.concat(queue), pending: pending,
      cur: null, answered: 0, good: 0, again: 0, newSeen: 0, ms: 0,
      attendedNow: false, undo: null, timer: null
    };
    openOverlay('study', '<div class="study" id="study"></div>');
    if (S.mode === 'short') S.timer = setInterval(updateStudyTop, 1000);
    nextCard();
  }

  /* 범위 연습: 복습 일정은 건드리지 않고 한 Day만 훑는다. 푼 문제는 출석에 들어간다 */
  function startPractice(deckId, onlyIds, track) {
    var now = Date.now();
    var list = cards().filter(function (c) { return (!deckId || c.deck === deckId) && !c.sus && (!onlyIds || onlyIds.indexOf(c.id) !== -1); });
    if (!list.length) { toast('연습할 단어가 없어요.'); return; }
    var seen = list.filter(function (c) { return c.st !== 0; }).sort(function (a, b) { return retrNow(a, now) - retrNow(b, now); });
    var fresh = list.filter(function (c) { return c.st === 0; }).sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); });
    S = {
      mode: 'practice', practice: true, track: deckId ? deckTrack(deckId) : (track === 'major' ? 'major' : 'toeic'), free: !!(deckId && isFreeDeck(deckId)), deckId: deckId, startedAt: now, deadline: 0,
      queue: seen.concat(fresh).map(function (c) { return c.id; }), pending: [],
      cur: null, answered: 0, good: 0, again: 0, newSeen: 0, ms: 0, attendedNow: false, undo: null, timer: null,
      retry: {}, missed: {}, initialIds: onlyIds ? onlyIds.slice() : null
    };
    openOverlay('study', '<div class="study" id="study"></div>');
    nextCard();
  }
  function practiceGrade(g) {
    var c = DB.cards[S.cur.id];
    var now = Date.now();
    var rec = todayPlan().rec;
    S.undo = {
      id: c.id, card: clone(c), rec: recSnap(rec),
      queue: S.queue.slice(), pending: [], retry: clone(S.retry), missed: clone(S.missed),
      stats: { answered: S.answered, good: S.good, again: S.again, newSeen: S.newSeen, ms: S.ms, attendedNow: S.attendedNow },
      cur: { id: S.cur.id, mode: S.cur.mode }
    };
    var spent = answerMs(now);
    if (S.free) { rec.sa = (rec.sa || 0) + 1; rec.sms = (rec.sms || 0) + spent; } // 노래 단어 연습은 출석·오늘 공부 시간과 따로 센다
    else if (S.track === 'major') { var pm = mjRec(todayKey()); pm.a++; if (g >= 3) pm.c++; pm.ms += spent; } // 전공 연습은 전공 출석에 들어간다
    else { rec.a++; if (g >= 3) rec.c++; rec.ms += spent; } // 연습 시간은 오늘 공부 시간에는 들어가고, 예상 시간 계산(mN·mR)에는 안 들어간다
    S.ms += spent;
    S.answered++;
    if (g >= 3) S.good++;
    else {
      S.again++; S.missed[c.id] = true; c.pw = (c.pw || 0) + 1; c.pwAt = now; // 연습에서 틀린 횟수와 마지막 시각 (복습 기록과 따로 센다)
      var r = S.retry[c.id] || 0;
      if (r < 2) { S.retry[c.id] = r + 1; S.queue.splice(Math.min(3, S.queue.length), 0, c.id); }
    }
    var plan = todayPlan();
    var justAttended = S.free ? false : S.track === 'major' ? checkMajorAttendance(majorPlan()) : checkAttendance(plan);
    saveSoon();
    if (justAttended) { S.attendedNow = true; showBigStamp(plan.key, S.track); }
    else sfx(g >= 3 ? 'good' : 'again');
    nextCard();
  }

  /* 전공 공부: 밀린 복습 + 금융·토목 새 단어를 번갈아. 출석은 전공 쪽에 따로 찍는다 */
  function startMajorStudy() {
    var now = Date.now(), mp = majorPlan();
    var learning = [], reviews = [];
    cards().forEach(function (c) {
      if (c.sus || !inMajor(c)) return;
      if (c.st === 1 || c.st === 3) learning.push({ id: c.id, due: c.due });
      else if (c.st === 2 && c.due < mp.end) reviews.push(c);
    });
    reviews.sort(function (a, b) { return a.due - b.due; });
    var nf = majorFresh('fin').slice(0, mp.leftF), nc = majorFresh('civ').slice(0, mp.leftC), newCards = [];
    for (var i = 0; i < Math.max(nf.length, nc.length); i++) { if (nf[i]) newCards.push(nf[i]); if (nc[i]) newCards.push(nc[i]); }
    var queue = [], ni = 0;
    reviews.forEach(function (c, j) {
      queue.push(c.id);
      if ((j + 1) % 4 === 0 && ni < newCards.length) queue.push(newCards[ni++].id);
    });
    while (ni < newCards.length) queue.push(newCards[ni++].id);
    var nowLearning = learning.filter(function (x) { return x.due <= now; }).map(function (x) { return x.id; });
    var pending = learning.filter(function (x) { return x.due > now; });
    if (!queue.length && !nowLearning.length && !pending.length) { toast('지금 할 전공 카드가 없어요.'); return; }
    S = {
      mode: 'major', track: 'major', startedAt: now, deadline: 0,
      queue: nowLearning.concat(queue), pending: pending,
      cur: null, answered: 0, good: 0, again: 0, newSeen: 0, ms: 0,
      attendedNow: false, undo: null, timer: null
    };
    openOverlay('study', '<div class="study" id="study"></div>');
    nextCard();
  }

  /* 노래 단어장: 복습 일정(FSRS)은 그대로 쓰지만 오늘 할 일·출석·알림에는 넣지 않고, 원할 때만 꺼낸다 */
  function songPlan(deckId) {
    var end = dayEndMs(todayKey());
    var p = { learning: [], due: [], fresh: [], missed: [], total: 0, dropped: 0, nextDue: 0 };
    cards().forEach(function (c) {
      if (c.deck !== deckId) return;
      p.total++;
      if (c.sus) { p.dropped++; return; }
      if (c.st === 1 || c.st === 3) p.learning.push(c);
      else if (c.st === 0) p.fresh.push(c);
      else if (c.due < end) p.due.push(c);
      else if (!p.nextDue || c.due < p.nextDue) p.nextDue = c.due;
      if (c.st !== 0 && (fails(c) > 0 || c.pw)) p.missed.push(c.id);
    });
    p.fresh.sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); });
    p.due.sort(function (a, b) { return a.due - b.due; });
    p.newNext = Math.min(p.fresh.length, DB.settings.songNew || 10);
    p.todo = p.due.length + p.learning.length + p.newNext;
    return p;
  }
  function startSongStudy(deckId) {
    var now = Date.now(), p = songPlan(deckId);
    var newCards = p.fresh.slice(0, p.newNext);
    var queue = [], ni = 0;
    p.due.forEach(function (c, i) {
      queue.push(c.id);
      if ((i + 1) % 4 === 0 && ni < newCards.length) queue.push(newCards[ni++].id);
    });
    while (ni < newCards.length) queue.push(newCards[ni++].id);
    var nowL = p.learning.filter(function (c) { return c.due <= now; }).map(function (c) { return c.id; });
    var pending = p.learning.filter(function (c) { return c.due > now; }).map(function (c) { return { id: c.id, due: c.due }; });
    if (!queue.length && !nowL.length && !pending.length) { toast('지금 할 노래 단어가 없어요. 틀린 단어 연습이나 전체 훑어보기를 해 보세요.'); return; }
    S = {
      mode: 'song', free: true, deckId: deckId, startedAt: now, deadline: 0,
      queue: nowL.concat(queue), pending: pending,
      cur: null, answered: 0, good: 0, again: 0, newSeen: 0, ms: 0, attendedNow: false, undo: null, timer: null,
      missed: {}, dropped: 0
    };
    openOverlay('study', '<div class="study" id="study"></div>');
    nextCard();
  }
  // 공부 중에 '아는 단어라 빼기': 보류로 돌려 다시 안 나오게 한다 (되돌리기 가능)
  function songDrop() {
    var c = DB.cards[S.cur.id], rec = dayRec(todayKey());
    S.undo = {
      id: c.id, card: clone(c), rec: recSnap(rec),
      queue: S.queue.slice(), pending: S.pending.map(function (x) { return { id: x.id, due: x.due }; }), missed: clone(S.missed || {}),
      stats: { answered: S.answered, good: S.good, again: S.again, newSeen: S.newSeen, ms: S.ms, attendedNow: S.attendedNow, dropped: S.dropped },
      cur: { id: S.cur.id, mode: S.cur.mode }
    };
    c.sus = true; c.known = true; S.dropped = (S.dropped || 0) + 1;
    saveSoon();
    toast(josa(c.w, '을/를') + ' 뺐어요. 단어장 목록에서 보류를 풀면 다시 나와요.');
    nextCard();
  }

  function takeNext() {
    var now = Date.now();
    S.pending.sort(function (a, b) { return a.due - b.due; });
    if (S.pending.length && S.pending[0].due <= now) return S.pending.shift().id;
    if (S.queue.length) return S.queue.shift();
    if (S.pending.length && S.pending[0].due - now <= 20 * MIN) return S.pending.shift().id;
    return null;
  }
  function chooseMode(c) {
    if (window.__kvForceMode && c.st === 2) return window.__kvForceMode === 'cloze' && !clozeParts(c) ? 'recall' : window.__kvForceMode;
    if (!DB.settings.mix || c.st !== 2) return 'recall';
    // 직접 쓰기는 1.0.10부터 쓰기 단계로 옮겼다. 평소 복습에는 예문 빈칸만 섞는다 (나오는 비율은 전과 같게)
    // 1.0.11: 복습에서 한 번이라도 맞힌 단어만 빈칸으로 낸다 (처음부터 알던 단어도 첫 복습은 그냥 떠올리기)
    if (c.S >= 3 && passedReview(c) && Math.random() < (c.S >= 7 ? 0.25 : 0.5) && clozeParts(c)) return 'cloze';
    return 'recall';
  }
  function passedReview(c) {
    var h = c.h || [];
    for (var i = 0; i < h.length; i++) { if (h[i][3] === 2 && h[i][1] >= 3) return true; }
    return false;
  }
  function nextCard() {
    if (S.mode === 'short' && S.deadline && Date.now() >= S.deadline && S.answered > 0) { finishStudy(); return; }
    var id = takeNext();
    while (id && (!DB.cards[id] || DB.cards[id].sus)) id = takeNext();
    if (!id) { finishStudy(); return; }
    var c = DB.cards[id];
    S.cur = { id: id, mode: S.bonus ? (S.dir[id] || 'type') : S.practice ? 'recall' : chooseMode(c), revealed: false, shownAt: Date.now(), typed: null, verdict: null };
    renderStudy();
    if (DB.settings.autoSpeak && S.cur.mode === 'recall') speak(c.w);
  }
  function remainingCount() { return S.queue.length + S.pending.length + (S.cur ? 1 : 0); }
  function updateStudyTop() {
    var cnt = document.getElementById('study-count');
    var bar = document.getElementById('study-progress');
    if (!cnt || !S) return;
    if (S.mode === 'short') {
      var left = Math.max(0, S.deadline - Date.now());
      var s = Math.ceil(left / 1000);
      cnt.textContent = Math.floor(s / 60) + ':' + pad2(s % 60);
      bar.style.width = Math.min(100, (1 - left / (DB.settings.shortMinutes * MIN)) * 100) + '%';
    } else {
      var rem = remainingCount();
      cnt.textContent = '남은 ' + rem;
      bar.style.width = (S.answered + rem ? Math.round(S.answered / (S.answered + rem) * 100) : 100) + '%';
    }
  }
  function headwordClass(w) { return w.length > 16 ? 'xlong' : w.length > 11 ? 'long' : ''; }
  function previewLabel(c, g) {
    return F.humanizePreview(F.preview(c, g, Date.now(), studyOpts())) + ' 뒤';
  }
  function deckTitle(id) { var d = DB.decks[id]; return d ? d.title : ''; }

  function renderStudy() {
    var root = document.getElementById('study');
    if (!root || !S || !S.cur) return;
    var c = DB.cards[S.cur.id], cur = S.cur;
    if (cur.mode === 'cloze' && !clozeParts(c)) cur.mode = 'recall';
    var isNew = c.st === 0;
    var top = '<header class="study-top"><button class="icon-btn" data-act="study-close" aria-label="공부 그만하기">' + ICON.close + '</button>' +
      '<div class="progress" aria-hidden="true"><span id="study-progress"></span></div><span class="study-count" id="study-count"></span>' +
      '<button class="icon-btn" data-act="undo" aria-label="방금 답 되돌리기" ' + (S.undo ? '' : 'style="visibility:hidden"') + '>' + ICON.undo + '</button></header>';
    var kicker = '<p class="card-kicker"><span>' + esc(deckTitle(c.deck)) + '</span>' + (S.bonus ? '<span class="badge">쓰기</span>' : S.practice ? '<span class="badge">연습</span>' : isNew ? '<span class="badge new">새 단어</span>' : (isLeech(c) ? '<span class="badge">자주 틀림</span>' : '<span></span>')) + '</p>';
    var speakBtn = '<button class="icon-btn" data-act="speak" data-text="' + esc(c.w) + '" aria-label="발음 듣기">' + ICON.speak + '</button>';
    var body = '', actions = '';
    var promptKo = S.bonus && c.cue ? c.cue : c.m; // 쓰기에서는 긴 뜻으로 묻는다 (없으면 짧은 뜻)
    var answerBlock = '<div class="answer">' +
      (cur.mode !== 'type' || promptKo !== c.m ? '<p class="meaning">' + esc(c.m) + '</p>' : '') +
      (c.ex ? '<button class="speak-ex" data-act="speak" data-text="' + esc(c.ex) + '" aria-label="예문 듣기"><p class="example">' + exampleHTML(c.ex) + '</p></button>' : '') +
      (c.exKo ? '<p class="example-ko">' + esc(c.exKo) + '</p>' : '') +
      (S.bonus && c.nu ? '<p class="nuance"><b>쓰임</b>' + esc(c.nu) + '</p>' : '') +
      (c.note ? '<p class="memo">' + esc(c.note) + '</p>' : '') + '</div>';

    if (cur.mode === 'recall') {
      body = kicker + '<div class="headword-row"><h2 class="headword ' + headwordClass(c.w) + '">' + esc(c.w) + '</h2>' + speakBtn + '</div>' +
        (c.pos ? '<p class="pos">' + esc(c.pos) + '</p>' : '') +
        (cur.revealed ? answerBlock : '<p class="recall-hint">뜻을 먼저 떠올려 보세요</p>');
    } else if (cur.mode === 'cloze') {
      var p = clozeParts(c);
      body = kicker + '<p class="cloze">' + esc(p.before) +
        (cur.revealed ? '<span class="filled">' + esc(p.target) + '</span>' : '<span class="blank" aria-label="빈칸"></span>') + esc(p.after) + '</p>' +
        (c.exKo ? '<p class="example-ko">' + esc(c.exKo) + '</p>' : '') +
        (cur.revealed ? '<div class="answer"><div class="headword-row"><h2 class="headword long">' + esc(c.w) + '</h2>' + speakBtn + '</div><p class="meaning" style="margin-top:8px">' + esc(c.m) + '</p>' + (c.note ? '<p class="memo">' + esc(c.note) + '</p>' : '') + '</div>'
          : '<p class="recall-hint">빈칸에 들어갈 영어 단어를 떠올려 보세요</p>');
    } else if (cur.mode === 'mean') { // 쓰기: 영어를 보고 뜻을 쓴다
      body = kicker + '<div class="headword-row"><h2 class="headword ' + headwordClass(c.w) + '">' + esc(c.w) + '</h2>' + speakBtn + '</div>' +
        (c.pos ? '<p class="pos">' + esc(c.pos) + '</p>' : '');
      if (cur.verdict) {
        body += '<p class="verdict ' + (cur.verdict.ok ? 'ok' : 'no') + '">' +
          (cur.verdict.ok ? (cur.verdict.exact ? '맞았어요' : '거의 맞았어요. 뜻을 확인하세요') : '정답은 이거예요') +
          (!cur.verdict.ok && cur.typed ? '<span class="typed ko">' + esc(cur.typed) + '</span>' : '') + '</p>' + answerBlock;
      } else {
        body += '<form class="type-field" data-form="type"><input id="type-input" class="ko" type="text" lang="ko" autocomplete="off" autocorrect="off" spellcheck="false" placeholder="한국어 뜻을 써 보세요" aria-label="한국어 뜻 입력"></form>';
      }
    } else { // type
      var hint = (c.w || '').split(/[\/,;]/)[0].trim().split(/\s+/).map(function (part) {
        return part.charAt(0) + part.slice(1).replace(/[a-zA-Z]/g, '_');
      }).join('  ');
      body = kicker + '<p class="prompt-ko' + (promptKo.length > 15 ? ' long' : '') + '">' + esc(promptKo) + '</p>' + (c.pos ? '<p class="pos">' + esc(c.pos) + '</p>' : '') +
        '<p class="type-hint">' + esc(hint) + '</p>';
      if (cur.verdict) {
        body += '<p class="verdict ' + (cur.verdict.ok ? 'ok' : 'no') + '">' +
          (cur.verdict.ok ? (cur.verdict.exact ? '맞았어요' : '거의 맞았어요. 철자를 확인하세요') : cur.verdict.near ? '한 글자가 달라요' : '정답은 이거예요') +
          (!cur.verdict.ok && cur.typed ? '<span class="typed' + (cur.verdict.near ? ' near' : '') + '">' + (cur.verdict.near ? diffHTML(cur.typed, cur.verdict.target) : esc(cur.typed)) + '</span>' : '') + '</p>' +
          '<div class="headword-row"><h2 class="headword ' + headwordClass(c.w) + '">' + esc(c.w) + '</h2>' + speakBtn + '</div>' + answerBlock;
      } else {
        body += '<form class="type-field" data-form="type"><input id="type-input" type="text" inputmode="latin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="영어로 써 보세요" aria-label="영어 단어 입력"></form>';
      }
    }

    if (cur.mode === 'type' || cur.mode === 'mean') {
      if (cur.verdict) {
        actions = '<button class="btn primary tall wide" data-act="type-next">다음</button>' +
          '<div class="under-actions">' + (cur.verdict.ok ? '' : '<button class="btn text" data-act="type-override">사실 맞게 썼어요</button>') + '</div>';
      } else {
        actions = '<div class="grade-row"><button class="btn graphite" data-act="type-giveup">모르겠어요</button><button class="btn primary" data-act="type-check">확인</button></div><div class="under-actions"></div>';
      }
    } else if (!cur.revealed) {
      actions = '<button class="btn primary tall wide" data-act="reveal">' + (cur.mode === 'cloze' ? '정답 보기' : '뜻 보기') + '</button><div class="under-actions">' +
        (S.free && !S.practice && isNew ? '<button class="btn text" data-act="song-drop">아는 단어라 빼기</button>' : '') + '</div>';
    } else if (S.practice) {
      actions = '<div class="grade-row"><button class="btn graphite" data-act="grade" data-g="1">몰랐음<small>조금 뒤 다시</small></button>' +
        '<button class="btn primary" data-act="grade" data-g="3">알았음<small>일정 그대로</small></button></div><div class="under-actions"></div>';
    } else {
      actions = '<div class="grade-row"><button class="btn graphite" data-act="grade" data-g="1">몰랐음<small>' + previewLabel(c, 1) + '</small></button>' +
        '<button class="btn primary" data-act="grade" data-g="3">알았음<small>' + previewLabel(c, 3) + '</small></button></div>' +
        '<div class="under-actions">' + (isNew ? (S.free ? '<button class="btn text" data-act="song-drop">아는 단어라 빼기</button>' : '<button class="btn text" data-act="grade" data-g="4">이미 아는 단어예요 (' + previewLabel(c, 4) + ')</button>') : '') + '</div>';
    }

    root.innerHTML = top + '<div class="study-body"><article class="index-card study-card" aria-live="polite">' + body + '</article></div>' +
      '<footer class="study-actions">' + actions + '</footer>';
    updateStudyTop();
    var inp = document.getElementById('type-input');
    if (inp) setTimeout(function () { inp.focus(); }, 30);
  }

  function normalizeAns(s) {
    return String(s || '').toLowerCase().replace(/[’`]/g, "'").replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9'\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  // 글자 하나를 넣기·빼기·바꾸기, 또는 옆 글자와 자리 바꾸기를 1로 센 거리
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
    return d[m][n];
  }
  function tightAns(s) { return s.replace(/[ '\-]/g, ''); } // 띄어쓰기·하이픈·작은따옴표 차이는 따지지 않는다
  function dropLead(s) { return s.replace(/^(to|be|a|an|the) /, ''); }
  /* 영어 답 채점: 대소문자·띄어쓰기·하이픈·앞에 붙인 to/be는 따지지 않는다.
     정답이 여러 개(/ , ;)면 하나만 맞아도 된다. 1.0.11부터 한 글자만 달라도 틀린 걸로 치고(near), 어디가 다른지 보여 준다 */
  function checkTyped(input, word) {
    var a = normalizeAns(input);
    if (!a) return { ok: false };
    var vs = [];
    String(word).split(/[\/,;]/).forEach(function (part) {
      [normalizeAns(part), normalizeAns(part.replace(/[()]/g, ' '))].forEach(function (v) { if (v && vs.indexOf(v) === -1) vs.push(v); }); // look (at) -> look, look at
    });
    var a1 = tightAns(a), a2 = tightAns(dropLead(a));
    for (var i = 0; i < vs.length; i++) {
      var t1 = tightAns(vs[i]), t2 = tightAns(dropLead(vs[i]));
      if (a1 === t1 || a1 === t2 || a2 === t1 || a2 === t2) return { ok: true, exact: true };
    }
    for (var j = 0; j < vs.length; j++) {
      var w = tightAns(dropLead(vs[j]));
      if (w.length >= 4 && (lev(a1, w) <= 1 || lev(a2, w) <= 1)) return { ok: false, near: true, target: vs[j] };
    }
    return { ok: false };
  }
  // 한 글자 다른 답에서 다른 자리를 표시한다: 앞뒤로 같은 부분을 빼고 남는 곳. 글자가 빠졌으면 빈 네모를 넣는다
  function diffHTML(typed, target) {
    var a = String(typed).trim(), al = a.toLowerCase(), bl = String(target || '').toLowerCase();
    var p = 0; while (p < al.length && p < bl.length && al.charAt(p) === bl.charAt(p)) p++;
    var q = 0; while (q < al.length - p && q < bl.length - p && al.charAt(al.length - 1 - q) === bl.charAt(bl.length - 1 - q)) q++;
    var mid = a.slice(p, a.length - q);
    return esc(a.slice(0, p)) + '<mark class="diff">' + (mid ? esc(mid) : '&#9647;') + '</mark>' + esc(a.slice(a.length - q));
  }
  /* 한국어 뜻 채점: 띄어쓰기·문장부호·조사를 따지지 않는다 ('배포를 하다' = '배포하다').
     뜻이 여러 개면 하나만 써도 되고, 괄호 안 말은 써도 안 써도 된다. 뜻이 같은 다른 말은 가리지 못한다 */
  function koCore(s) {
    var n = String(s || '').toLowerCase().replace(/[~…·.,!?'"“”‘’`\-–—:;()\[\]{}<>\/\s]/g, '');
    n = n.replace(/(을|를)(하다|한다|해요|합니다|했다|함)$/, '하다'); // 배포를 하다 -> 배포하다
    return n.replace(/(한다|해요|합니다|했다)$/, '하다');               // 배포한다 -> 배포하다
  }
  function koVariants(meaning) {
    var out = [];
    String(meaning || '').split(/[,;\/]/).forEach(function (part) {
      [part.replace(/\([^)]*\)/g, ''), part.replace(/[()]/g, '')].forEach(function (v) { // '(손을) 뻗다' -> 뻗다, 손을뻗다 / '환불(하다)' -> 환불, 환불하다
        var n = koCore(v); if (n && out.indexOf(n) === -1) out.push(n);
      });
    });
    return out;
  }
  function koStem(x) { return x.replace(/(하다|되다|이다|다)$/, ''); }
  function checkMeaning(input, meaning) {
    var vs = koVariants(meaning);
    var tries = [koCore(input)].concat(String(input || '').split(/[,;\/]/).map(koCore)).filter(Boolean); // 뜻을 쉼표로 여러 개 써도 그중 하나만 맞으면 된다
    if (!tries.length) return { ok: false };
    var i, j, a, v;
    for (i = 0; i < tries.length; i++) if (vs.indexOf(tries[i]) !== -1) return { ok: true, exact: true };
    for (i = 0; i < tries.length; i++) for (j = 0; j < vs.length; j++) {
      a = tries[i]; v = vs[j];
      if (koStem(a).length >= 2 && koStem(a) === koStem(v)) return { ok: true, exact: true }; // 배포 = 배포하다
      // 앞에 꾸미는 말을 붙이거나 뺀 답: '자리를 차지하다' = '차지하다' (끝 4글자 이상이 같을 때만)
      if (a.length >= 4 && v.length >= 4 && (a.slice(-v.length) === v || v.slice(-a.length) === a)) return { ok: true, exact: true };
    }
    for (i = 0; i < tries.length; i++) for (j = 0; j < vs.length; j++) {
      // 4글자 이상은 자판을 하나 잘못 누른 정도(자음·모음 하나 차이)까지 봐준다. 글자가 통째로 빠지거나 바뀐 것은 다른 말로 본다
      if (vs[j].length >= 4 && lev(koJamo(tries[i]), koJamo(vs[j])) <= 1) return { ok: true, exact: false };
    }
    return { ok: false };
  }
  // 한글을 자음·모음으로 풀어 쓴다: 배포 -> ㅂㅐㅍㅗ (오타를 자판 한 번 단위로 세려고)
  function koJamo(s) {
    var out = [];
    for (var i = 0; i < s.length; i++) {
      var x = s.charCodeAt(i) - 0xAC00;
      if (x < 0 || x > 11171) { out.push(s.charAt(i)); continue; }
      out.push('c' + Math.floor(x / 588), 'v' + Math.floor((x % 588) / 28));
      if (x % 28) out.push('t' + (x % 28));
    }
    return out;
  }

  function grade(g) {
    if (!S || !S.cur) return;
    if (S.practice) { practiceGrade(g); return; }
    var c = DB.cards[S.cur.id];
    var now = Date.now();
    var plan0 = todayPlan();
    var rec = plan0.rec;
    S.undo = {
      id: c.id, card: clone(c), rec: recSnap(rec),
      queue: S.queue.slice(), pending: S.pending.map(function (x) { return { id: x.id, due: x.due }; }),
      missed: S.free ? clone(S.missed || {}) : null,
      stats: { answered: S.answered, good: S.good, again: S.again, newSeen: S.newSeen, ms: S.ms, attendedNow: S.attendedNow, dropped: S.dropped || 0 },
      cur: { id: S.cur.id, mode: S.cur.mode }
    };
    var wasNew = c.st === 0;
    var stBefore = c.st;
    var res = F.schedule(c, g, now, studyOpts());
    Object.assign(c, res.card);
    var modeCode = { recall: 0, cloze: 1, type: 2 }[S.cur.mode] || 0;
    c.h.push([Math.round(now / 1000), g, modeCode, stBefore]);
    var spent = answerMs(now);
    if (S.free) { // 노래 단어장: 출석·오늘 공부 시간·예상 시간과 따로 센다
      rec.sa = (rec.sa || 0) + 1; rec.sms = (rec.sms || 0) + spent;
      if (g < 3) S.missed[c.id] = true;
    } else if (S.track === 'major') { // 전공: 전공 기록에 따로 센다
      var mr = mjRec(todayKey());
      mr.a++; if (g >= 3) mr.c++; mr.ms += spent;
      if (wasNew) { mr.n++; if (majorSub(c.deck) === 'civ') mr.nc = (mr.nc || 0) + 1; else mr.nf = (mr.nf || 0) + 1; }
    } else {
      rec.a++; if (g >= 3) rec.c++; if (wasNew) rec.n++;
      rec.ms += spent;
      if (rec.mN != null && rec.mR != null) { // 1.0.6 이후에 생긴 날짜 기록만 나눠 센다 (예전 기록은 평균으로 나눈다)
        if (stBefore === 0 || stBefore === 1) rec.mN += spent; else rec.mR += spent;
      }
    }
    S.ms += spent;
    S.answered++; if (g >= 3) S.good++; else S.again++; if (wasNew) S.newSeen++;
    if (c.st === 1 || c.st === 3) S.pending.push({ id: c.id, due: c.due });
    var plan = todayPlan();
    var justAttended = S.free ? false : S.track === 'major' ? checkMajorAttendance(majorPlan()) : checkAttendance(plan);
    saveSoon();
    if (justAttended) { S.attendedNow = true; showBigStamp(plan.key, S.track); }
    else sfx(g >= 3 ? 'good' : 'again');
    nextCard();
  }
  function undoLast() {
    if (!S || !S.undo) return;
    var u = S.undo;
    DB.cards[u.id] = u.card;
    var rec = dayRec(todayKey());
    rec.a = u.rec.a; rec.c = u.rec.c; rec.n = u.rec.n; rec.ms = u.rec.ms;
    if (u.rec.mN != null) { rec.mN = u.rec.mN; rec.mR = u.rec.mR; }
    if (u.rec.sa || rec.sa) { rec.sa = u.rec.sa || 0; rec.sms = u.rec.sms || 0; }
    if (u.rec.mj) rec.mj = clone(u.rec.mj); else if (u.rec.mj === null) delete rec.mj;
    if (!u.rec.att) { delete rec.att; delete rec.attAt; }
    S.queue = u.queue; S.pending = u.pending;
    S.answered = u.stats.answered; S.good = u.stats.good; S.again = u.stats.again; S.newSeen = u.stats.newSeen; S.attendedNow = u.stats.attendedNow;
    S.ms = u.stats.ms || 0;
    if (u.stats.dropped != null) S.dropped = u.stats.dropped;
    if (u.retry) S.retry = u.retry;
    if (u.missed) S.missed = u.missed;
    // u.queue / u.pending는 다음 카드를 꺼내기 전 모습이라 그대로 되돌리면 된다
    S.cur ={ id: u.id, mode: u.cur.mode, revealed: false, shownAt: Date.now(), typed: null, verdict: null };
    S.undo = null;
    saveSoon();
    renderStudy();
    toast('방금 답을 되돌렸어요.');
  }
  function showBigStamp(key, t) {
    var major = t === 'major';
    var layer = document.getElementById('stamp-layer');
    var d = keyToDate(key);
    layer.innerHTML = sealSVG(major ? '전공' : '출석', (d.getMonth() + 1) + '.' + pad2(d.getDate()), 0, 'big-stamp');
    var el = layer.firstChild;
    sfx('stamp');
    requestAnimationFrame(function () { el.classList.add('go'); });
    setTimeout(function () { layer.innerHTML = ''; }, 2000);
    var st = streakAt(key, major ? 'major' : 'toeic').count;
    if (major) toast(st > 1 ? '전공 출석 도장을 찍었어요. ' + st + '일 연속이에요.' : '오늘 전공 출석 도장을 찍었어요.');
    else toast(st > 1 ? '출석 도장을 찍었어요. ' + st + '일 연속이에요.' : '오늘 첫 출석 도장을 찍었어요.');
  }

  function finishStudy() {
    if (!S) return;
    if (S.timer) clearInterval(S.timer);
    saveNow();
    var s = S; S = null;
    if (!s.answered && !s.dropped) { closeOverlay(); return; }
    if (s.bonus) { bonusResult(s); return; }
    if (s.practice) { practiceResult(s); return; }
    if (s.free) { songResult(s); return; }
    if (s.track === 'major') { majorResult(s); return; }
    var plan = todayPlan();
    var key = plan.key;
    var tomorrow = F.addDaysKey(key, 1);
    var dueTomorrow = countDue(dayEndMs(tomorrow)) - plan.due;
    var st = streakAt(key).count;
    var html = '<div class="result"><h2>' + s.answered + '장 꺼냈어요</h2>' +
      '<p class="lead">알았음 ' + s.good + '장, 몰랐음 ' + s.again + '장' + (s.newSeen ? '. 새 단어 ' + s.newSeen + '장을 처음 만났어요.' : '.') + '</p>' +
      timeLine(s.ms, plan.rec.ms);
    if (plan.rec.att) {
      html += '<div class="result-stamp">' + sealSVG('출석', '', dayRot(key)) + '<p><strong>오늘 출석했어요</strong>' + (st > 1 ? st + '일 연속이에요.' : '내일도 도장을 이어 가요.') + '</p></div>';
    } else if (plan.restDay) {
      html += '<div class="result-stamp"><span class="seal-rest" style="width:64px;height:64px;flex:none">' + ICON.moon + '</span><p><strong>오늘은 쉬는 날이에요</strong>안 채워도 연속 기록은 그대로 이어져요.</p></div>';
    } else {
      var left = Math.max(0, DB.settings.minAnswers - plan.rec.a);
      html += '<div class="result-stamp"><span class="seal-empty today" style="width:64px;height:64px;flex:none"></span><p><strong>출석까지 ' + left + '문제 남았어요</strong>조금만 더 하면 오늘 도장을 받아요.</p></div>';
    }
    var remainToday = plan.due + plan.newLeft;
    html += '<p class="next">' + (remainToday ? '오늘 남은 카드 ' + remainToday + '장. ' : '오늘 카드는 다 꺼냈어요. ') + (isRestDay(tomorrow) ? '내일은 쉬는 날이에요.' : '내일 복습 예정 ' + Math.max(0, dueTomorrow) + '장.') + '</p>';
    html += '<div class="spacer"></div><div class="btns">';
    if (!plan.rec.att && !plan.restDay && (remainToday > 0 || hasPendingLearning())) html += '<button class="btn primary wide" data-act="study">이어서 하기</button>';
    else if (remainToday > 0) html += '<button class="btn quiet wide" data-act="study">남은 카드도 하기</button>';
    var bb = bonusButton('toeic'); // 오늘 카드를 다 꺼냈으면 쓰기가 열린다
    html += bb + '<button class="btn ' + (!bb && (plan.rec.att || plan.restDay) ? 'primary' : 'quiet') + ' wide" data-act="close-overlay">홈으로</button></div></div>';
    openOverlay('result', html);
  }

  // 결과 화면의 공부 시간 줄: 이번에 걸린 시간과 오늘 전체
  function timeLine(sessionMs, todayMs) {
    var same = Math.round(sessionMs / MIN) === Math.round(todayMs / MIN);
    return '<p class="time-line">이번에 <strong>' + fmtMin(sessionMs) + '</strong> 걸렸어요.' +
      (same ? '' : ' 오늘 모두 ' + fmtMin(todayMs) + '이에요.') + '</p>';
  }
  function weekMissedIds(track) {
    var t = track === 'major' ? 'major' : 'toeic';
    var since = F.dayStartOfKey(weekStartKey(todayKey()), dsh());
    return cards().filter(function (c) {
      if (c.sus || trackOf(c) !== t) return false;
      if (c.pwAt && c.pwAt >= since) return true;
      var h = c.h || [];
      for (var i = h.length - 1; i >= 0; i--) { if (h[i][0] * 1000 < since) break; if (h[i][1] === 1) return true; }
      return false;
    }).map(function (c) { return c.id; });
  }
  function whenText(ms) {
    var days = F.daysBetweenKeys(todayKey(), F.dayKey(ms, dsh()));
    return days <= 0 ? '오늘' : days === 1 ? '내일' : days + '일 뒤';
  }
  // 결과 화면의 전공 출석 칸
  function majorStampBlock() {
    var mp = majorPlan(), m = mp.rec, st = streakAt(mp.key, 'major').count;
    if (m.att) return '<div class="result-stamp">' + sealSVG('전공', '', dayRot(mp.key) + 4) + '<p><strong>오늘 전공 출석했어요</strong>' + (st > 1 ? st + '일 연속이에요.' : '내일도 도장을 이어 가요.') + '</p></div>';
    if (mp.restDay) return '<div class="result-stamp"><span class="seal-rest" style="width:64px;height:64px;flex:none">' + ICON.moon + '</span><p><strong>오늘은 쉬는 날이에요</strong>안 채워도 전공 연속 기록은 그대로 이어져요.</p></div>';
    return '<div class="result-stamp"><span class="seal-empty today" style="width:64px;height:64px;flex:none"></span><p><strong>전공 출석까지 ' + Math.max(0, DB.settings.majorMin - m.a) + '문제 남았어요</strong>조금만 더 하면 전공 도장을 받아요.</p></div>';
  }
  // 전공 공부를 마쳤을 때
  function majorResult(s) {
    var mp = majorPlan(), remain = mp.due + mp.newLeft, bb = bonusButton('major');
    var html = '<div class="result"><h2>전공 ' + s.answered + '장 꺼냈어요</h2>' +
      '<p class="lead">알았음 ' + s.good + '장, 몰랐음 ' + s.again + '장' + (s.newSeen ? '. 새 단어 ' + s.newSeen + '장을 처음 만났어요.' : '.') + '</p>' +
      timeLine(s.ms, mp.rec.ms) + majorStampBlock() +
      '<p class="next">' + (remain ? '오늘 남은 전공 카드 ' + remain + '장.' : '오늘 전공 카드는 다 꺼냈어요.') + '</p>' +
      '<div class="spacer"></div><div class="btns">' +
      (remain > 0 || majorPending() ? '<button class="btn ' + (mp.rec.att ? 'quiet' : 'primary') + ' wide" data-act="major-study">이어서 하기</button>' : '') +
      bb + '<button class="btn ' + (!bb && (mp.rec.att || !remain) ? 'primary' : 'quiet') + ' wide" data-act="close-overlay">홈으로</button></div></div>';
    openOverlay('result', html);
  }
  // 노래 단어장 공부를 마쳤을 때
  function songResult(s) {
    var p = songPlan(s.deckId), rec = dayRec(todayKey());
    var missed = Object.keys(s.missed || {}).filter(function (id) { return DB.cards[id] && !DB.cards[id].sus; });
    state.lastMissed = { deck: s.deckId, ids: missed };
    state.lastPractice = { deck: s.deckId, ids: null };
    var html = '<div class="result"><h2>노래 단어 ' + s.answered + '장 꺼냈어요</h2>' +
      '<p class="lead">알았음 ' + s.good + '장, 몰랐음 ' + s.again + '장' + (s.newSeen ? '. 새 단어 ' + s.newSeen + '장을 처음 만났어요' : '') +
      (s.dropped ? '. 아는 단어 ' + s.dropped + '개는 뺐어요' : '') + '.</p>' +
      timeLine(s.ms, rec.sms || 0) + '<p class="next">노래 단어는 출석과 오늘 할 일에 들어가지 않아요.</p>';
    if (missed.length) {
      html += '<ul class="miss-list">' + missed.slice(0, 12).map(function (id) { var c = DB.cards[id]; return '<li><b>' + esc(c.w) + '</b><span>' + esc(c.m) + '</span></li>'; }).join('') + '</ul>' +
        (missed.length > 12 ? '<p class="hint">그 밖에 ' + (missed.length - 12) + '개 더 있어요.</p>' : '');
    }
    var left = p.due.length + p.newNext;
    html += '<p class="next">' + (p.fresh.length ? '아직 안 배운 단어 ' + p.fresh.length + '개가 남았어요. ' : '이 노래 단어는 다 만났어요. ') +
      (p.due.length ? '지금 복습할 단어 ' + p.due.length + '개.' : p.nextDue ? '다음 복습은 ' + whenText(p.nextDue) + '이에요.' : '') + '</p>';
    html += '<div class="spacer"></div><div class="btns">' +
      (left ? '<button class="btn primary wide" data-act="song-study" data-id="' + esc(s.deckId) + '">이어서 하기</button>' : '') +
      (missed.length ? '<button class="btn ' + (left ? 'quiet' : 'primary') + ' wide" data-act="practice-missed">틀린 ' + missed.length + '개만 다시</button>' : '') +
      '<button class="btn quiet wide" data-act="deck" data-id="' + esc(s.deckId) + '">단어장으로</button>' +
      '<button class="btn text wide" data-act="close-overlay">홈으로</button></div></div>';
    openOverlay('result', html);
  }
  function practiceResult(s) {
    var plan = todayPlan(), key = plan.key, st = streakAt(key).count;
    var missed = Object.keys(s.missed).filter(function (id) { return DB.cards[id]; });
    state.lastMissed = { deck: s.deckId, ids: missed, track: s.track };
    state.lastPractice = { deck: s.deckId, ids: s.initialIds, track: s.track };
    var html = '<div class="result"><h2>연습 ' + s.answered + '문제 했어요</h2>' +
      '<p class="lead">알았음 ' + s.good + ', 몰랐음 ' + s.again + '. 복습 일정은 바뀌지 않았어요.</p>' +
      timeLine(s.ms, s.free ? (plan.rec.sms || 0) : plan.rec.ms);
    if (missed.length) {
      html += '<ul class="miss-list">' + missed.slice(0, 12).map(function (id) { var c = DB.cards[id]; return '<li><b>' + esc(c.w) + '</b><span>' + esc(c.m) + '</span></li>'; }).join('') + '</ul>' +
        (missed.length > 12 ? '<p class="hint">그 밖에 ' + (missed.length - 12) + '개 더 있어요.</p>' : '');
    }
    if (s.free) html += '<p class="next">노래 단어 연습은 출석과 오늘 할 일에 들어가지 않아요.</p>';
    else if (s.track === 'major') html += majorStampBlock();
    else if (plan.rec.att) html += '<div class="result-stamp">' + sealSVG('출석', '', dayRot(key)) + '<p><strong>오늘 출석했어요</strong>' + (st > 1 ? st + '일 연속이에요.' : '내일도 도장을 이어 가요.') + '</p></div>';
    else if (!plan.restDay) html += '<div class="result-stamp"><span class="seal-empty today" style="width:64px;height:64px;flex:none"></span><p><strong>출석까지 ' + Math.max(0, DB.settings.minAnswers - plan.rec.a) + '문제 남았어요</strong>연습한 문제도 출석에 들어가요.</p></div>';
    html += '<div class="spacer"></div><div class="btns">' +
      (missed.length ? '<button class="btn primary wide" data-act="practice-missed">틀린 ' + missed.length + '개만 다시</button>' : '') +
      '<button class="btn quiet wide" data-act="practice-again">처음부터 다시</button>' +
      (s.free && s.deckId ? '<button class="btn quiet wide" data-act="deck" data-id="' + esc(s.deckId) + '">단어장으로</button>' : '') +
      '<button class="btn ' + (missed.length ? 'text' : 'primary') + ' wide" data-act="close-overlay">홈으로</button></div></div>';
    openOverlay('result', html);
  }

  /* ================= 학습 기록 표 (엑셀에서 열 수 있는 CSV) ================= */
  function csvCell(v) { v = v == null ? '' : String(v); return /[",\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v; }
  function studyRows() {
    var now = Date.now();
    var stName = { 'new': '새 단어', learn: '익히는 중', 'long': '머리에 남음', sus: '보관' };
    var rows = cards().map(function (c) {
      var h = c.h || [], last = h[h.length - 1];
      var seen = c.st !== 0;
      return {
        c: c, deck: deckTitle(c.deck), order: deckOrder(c.deck), seen: seen, fails: fails(c),
        r: c.st === 2 ? Math.round(retrNow(c, now) * 100) : null,
        cells: [deckTitle(c.deck), c.w, c.m, stName[stage(c)], h.length, fails(c), c.pw || 0,
          last ? (last[1] >= 3 ? '알았음' : '몰랐음') : '',
          c.last ? F.dayKey(c.last, dsh()) : '',
          c.st === 2 ? Math.round(retrNow(c, now) * 100) : '',
          seen && !c.sus ? F.dayKey(c.due, dsh()) : '']
      };
    });
    rows.sort(function (a, b) {
      if (a.seen !== b.seen) return a.seen ? -1 : 1;
      if (a.seen) return (b.fails - a.fails) || ((a.r == null ? 101 : a.r) - (b.r == null ? 101 : b.r));
      return (a.order - b.order) || ((a.c.ord || 0) - (b.c.ord || 0));
    });
    return rows;
  }
  function studyCsv() {
    var head = ['Day', '단어', '뜻', '상태', '본 횟수', '틀린 횟수', '연습에서 틀림', '마지막 결과', '마지막으로 본 날', '지금 기억할 확률(%)', '다음 복습일'];
    var lines = [head].concat(studyRows().map(function (r) { return r.cells; }));
    return '\uFEFF' + lines.map(function (row) { return row.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function csvName() { return 'kkeonae-study-' + todayKey() + '.csv'; }
  var exportKind = 'backup';
  function openExportSheet() {
    var n = cards().filter(function (c) { return c.st !== 0; }).length;
    openSheet('<h2>학습 기록 표</h2><p>단어마다 본 횟수, 틀린 횟수, 마지막 결과, 지금 기억할 확률을 엑셀에서 열리는 표(CSV)로 내보내요. 많이 틀린 단어가 맨 위에 와요.</p>' +
      '<p class="hint">배운 단어 ' + n + '개, 전체 ' + cards().length + '개</p>' +
      '<div class="btns"><button class="btn primary wide" data-act="csv-share">카톡·드라이브로 보내기</button><button class="btn quiet wide" data-act="csv-save">파일로 저장</button>' +
      '<button class="btn text" data-act="close-modal">닫기</button></div>');
  }

  /* ================= 출석 달력 ================= */
  function renderCalendar() {
    var key = todayKey();
    var t = keyToDate(key);
    if (!state.calMonth) state.calMonth = [t.getFullYear(), t.getMonth()];
    var y = state.calMonth[0], m = state.calMonth[1];
    var first = new Date(y, m, 1, 12), days = new Date(y, m + 1, 0, 12).getDate();
    var lead = first.getDay(); // 일요일 시작
    var hasMajor = values(DB.decks).some(function (dd) { return deckTrack(dd.id) === 'major'; });
    var tr = hasMajor && state.calTrack === 'major' ? 'major' : 'toeic', mj = tr === 'major';
    var st = streakAt(key, tr);
    var html = '<h1 class="page-title">출석</h1>' +
      (hasMajor ? '<div class="seg cal-track" role="group" aria-label="어느 출석을 볼지"><button data-act="cal-track" data-v="toeic" aria-pressed="' + !mj + '">토익</button><button data-act="cal-track" data-v="major" aria-pressed="' + mj + '">전공</button></div>' : '') +
      '<div class="cal-head"><button class="icon-btn" data-act="cal-prev" aria-label="이전 달">' + ICON.back + '</button><h2>' + y + '년 ' + (m + 1) + '월</h2>' +
      '<button class="icon-btn" data-act="cal-next" aria-label="다음 달">' + ICON.next + '</button></div><div class="cal-grid">';
    DOW.forEach(function (d) { html += '<div class="cal-dow">' + d + '</div>'; });
    var monthCount = 0, fullCount = 0;
    for (var i = 0; i < lead; i++) html += '<div class="cal-cell out"><span class="num">.</span></div>';
    for (var d = 1; d <= days; d++) {
      var k = y + '-' + pad2(m + 1) + '-' + pad2(d);
      var rec = mj ? (DB.days[k] && DB.days[k].mj) : DB.days[k];
      var cls = 'cal-cell', inner = '<span class="num">' + d + '</span>', label = keyLabel(k);
      if (rec && rec.att) {
        var full = bonusOn(rec);
        cls += ' att' + (full ? ' full' : ''); inner = sealSVG(String(d), '', dayRot(k), '', full) + inner; monthCount++; if (full) fullCount++;
        label += (mj ? ' 전공 출석' : ' 출석') + (full ? ', 쓰기까지' : '');
      }
      else if (isRestDay(k)) { cls += ' rest' + (k > key ? ' later' : ''); inner = '<span class="moon">' + ICON.moon + '</span>' + inner; label += ' 쉬는 날'; }
      else if (rec && rec.rest) { inner = '<span class="mark"></span>' + inner; monthCount++; label += ' 할 카드가 없던 날'; }
      else if (st.frozen.indexOf(k) !== -1) { inner = '<span class="mark freeze"></span>' + inner; label += ' 휴식권 사용'; }
      if (k === key) cls += ' today';
      html += '<div class="' + cls + '" aria-label="' + esc(label) + '">' + inner + '</div>';
    }
    html += '</div><div class="cal-legend"><span>' + sealSVG('출석', '', -6) + '출석</span><span>' + sealSVG('출석', '', -6, '', true) + '쓰기까지</span><span><i class="k moon">' + ICON.moon + '</i>쉬는 날</span><span><i class="k"></i>할 카드가 없던 날</span><span><i class="k freeze"></i>휴식권 사용</span></div>';
    html += '<dl class="facts four"><div><dt>이번 달 출석</dt><dd>' + monthCount + '일</dd></div><div><dt>그중 쓰기까지</dt><dd>' + fullCount + '일</dd></div><div><dt>지금 연속</dt><dd>' + st.count + '일</dd></div><div><dt>최장 연속</dt><dd>' + Math.max((mj ? DB.meta.bestStreakMajor : DB.meta.bestStreak) || 0, st.count) + '일</dd></div></dl>';

    // 앞으로 7일 복습
    var rows = [], max = 1;
    for (var j = 0; j < 7; j++) {
      var kk = F.addDaysKey(key, j);
      var start = j === 0 ? 0 : F.dayStartOfKey(kk, dsh());
      var end = dayEndMs(kk);
      var n = 0;
      cards().forEach(function (c) { if (!c.sus && c.st !== 0 && c.due >= start && c.due < end && trackOf(c) === tr) n++; });
      rows.push([j === 0 ? '오늘' : j === 1 ? '내일' : keyLabel(kk).replace(/^\d+월 /, '') + '(' + DOW[F.keyToDow(kk)] + ')', n, j > 0 && isRestDay(kk)]);
      if (n > max) max = n;
    }
    html += '<section class="section"><h2>앞으로 7일 ' + (mj ? '전공 ' : '') + '복습</h2><table class="bar-table"><tbody>';
    rows.forEach(function (r) {
      var cell = r[2] && !r[1] ? '<span class="muted small">쉬는 날</span>' : '<div class="bar"><i style="width:' + Math.max(1, Math.round(r[1] / max * 78)) + '%"></i><b>' + r[1] + '장</b></div>';
      html += '<tr><th scope="row">' + r[0] + '</th><td>' + cell + '</td></tr>';
    });
    html += '</tbody></table><p class="hint">새 단어는 빼고 센 숫자예요.</p></section>';

    // 복습 기억률: 며칠 지나 다시 나온 카드(복습 상태)를 기억했는지. 새 단어와 같은 날 반복은 빼고 센다
    var rs = reviewStats(F.addDaysKey(key, -13), key, tr);
    html += '<section class="section"><h2>' + (mj ? '전공 ' : '') + '복습 기억률</h2>';
    if (rs.total < 20) {
      html += '<p class="hint" style="margin-top:0">며칠 지나 다시 나온 단어를 얼마나 기억했는지 보여 줘요. 복습을 20번 넘게 하면 계산해요. 지금까지 ' + rs.total + '번.</p>';
    } else {
      var verdict = rs.rate >= 85 ? '잘 되고 있어요.' : rs.rate >= 75 ? '조금 낮아요. 이대로 1주 더 지켜봐요.' : '많이 까먹고 있어요. 설정에서 복습 양을 \'많이\'로 바꿔 보세요.';
      html += '<p class="rate-line"><strong>' + rs.rate + '%</strong> 최근 2주, 복습 ' + rs.total + '번 중 ' + rs.good + '번 기억</p>' +
        '<p class="hint">' + verdict + ' 90% 안팎이 정상이에요. 새 단어를 처음 볼 때 틀린 건 여기에 안 들어가요.</p>';
    }
    html += '</section>';

    // 최근 7일 공부
    html += '<section class="section"><h2>최근 7일 ' + (mj ? '전공 ' : '') + '공부</h2><table class="plain-table"><thead><tr><th>날짜</th><th class="num">문제</th><th class="num">복습 기억</th><th class="num">시간</th></tr></thead><tbody>';
    var sumA = 0, sumMs = 0;
    for (var q = 0; q < 7; q++) {
      var dk = F.addDaysKey(key, -q), r2 = (mj ? (DB.days[dk] && DB.days[dk].mj) : DB.days[dk]) || { a: 0, c: 0, ms: 0 };
      var rb = rs.byDay[dk];
      var dayName = q === 0 ? '오늘' : keyLabel(dk) + '(' + DOW[F.keyToDow(dk)] + ')';
      sumA += r2.a || 0; sumMs += r2.ms || 0;
      html += '<tr><td>' + dayName + (isRestDay(dk) && !r2.a ? ' <span class="muted small">쉼</span>' : '') + '</td><td class="num">' + r2.a + '</td><td class="num">' + (rb ? rb.good + '/' + rb.total : '-') + '</td><td class="num">' + (r2.ms ? fmtMin(r2.ms) : '-') + '</td></tr>';
    }
    html += '</tbody><tfoot><tr><th scope="row">7일 합계</th><td class="num">' + sumA + '</td><td class="num"></td><td class="num">' + (sumMs ? fmtMin(sumMs) : '-') + '</td></tr></tfoot></table>' +
      '<p class="hint">복습 기억은 기억한 수/복습한 수예요. 시간은 카드를 보고 답하기까지 걸린 시간만 세요(한 장에 90초까지).</p></section>';
    return html;
  }

  /* ================= 단어 ================= */
  function deckStats(id) {
    var s = { total: 0, new: 0, learn: 0, long: 0, sus: 0 };
    cards().forEach(function (c) { if (c.deck !== id) return; s.total++; s[stage(c)]++; });
    return s;
  }
  function segbar(s) {
    var t = s.new + s.learn + s.long;
    if (!t) return '<div class="segbar"></div>';
    var parts = [['seg-long', s.long], ['seg-learn', s.learn], ['seg-new', s.new]];
    return '<div class="segbar" role="img" aria-label="머리에 남음 ' + s.long + ', 익히는 중 ' + s.learn + ', 새 단어 ' + s.new + '">' +
      parts.filter(function (p) { return p[1] > 0; }).map(function (p) { return '<i class="' + p[0] + '" style="flex:' + p[1] + '"></i>'; }).join('') + '</div>';
  }
  function deckNums(s) {
    return '머리에 남음 ' + s.long + ', 익히는 중 ' + s.learn + ', 새 단어 ' + s.new + (s.sus ? ', 보류 ' + s.sus : '');
  }
  function statusText(c) {
    var s = stage(c);
    if (s === 'sus') return '보류';
    if (s === 'new') return '새 단어';
    var days = F.daysBetweenKeys(todayKey(), F.dayKey(c.due, dsh()));
    var when = days <= 0 ? '오늘 복습' : days === 1 ? '내일 복습' : days + '일 뒤 복습';
    return (s === 'long' ? '머리에 남음' : '익히는 중') + '<br>' + when;
  }
  function wordRow(c) {
    return '<li class="word-item"><button data-act="word" data-id="' + esc(c.id) + '"><span class="w">' + esc(c.w) + '</span><span class="s">' + statusText(c) + '</span><span class="m">' + esc(c.m) + '</span></button></li>';
  }
  // 노래 탭의 노래 단어장 목록
  function songList(songs) {
    return '<ul class="deck-list" id="song-section">' + songs.map(function (d) {
      var st = deckStats(d.id), p = songPlan(d.id);
      return '<li class="deck-item"><button data-act="deck" data-id="' + esc(d.id) + '"><span class="deck-top"><span class="deck-tab">' + esc(d.title) + '</span><span class="deck-count">' +
        (p.todo ? '<span class="badge new">할 단어 ' + p.todo + '</span> ' : '') + st.total + '개</span></span>' + segbar(st) + '<span class="deck-nums">' + deckNums(st) + '</span></button></li>';
    }).join('') + '</ul>';
  }
  /* ================= 노래 ================= */
  function renderSongs() {
    var songs = values(DB.decks).filter(function (d) { return deckTrack(d.id) === 'song'; }).sort(function (a, b) { return (a.addedAt || 0) - (b.addedAt || 0); });
    var html = '<div class="songs-head"><h1 class="page-title">노래</h1><div class="songs-ball">' + ballSVG('rock', 'idle', 84) + '</div></div>';
    if (!songs.length) {
      html += '<section class="empty" style="padding-top:4px"><h2>아직 노래 단어장이 없어요</h2><p>좋아하는 노래의 영어 가사를 Claude에게 보내면 노래 단어 파일을 만들어 줘요. 여기서 가져오면 오늘 할 일·출석·알림과 따로, 하고 싶을 때만 공부해요.</p></section>';
    } else {
      html += '<p class="hint" style="margin:-8px 0 14px">오늘 할 일·출석·알림과 따로, 하고 싶을 때만 공부해요. 복습할 때가 된 단어는 \'할 단어\'로 알려 줘요.</p>' +
        '<div class="legend"><span><i class="seg-long"></i>머리에 남음</span><span><i class="seg-learn"></i>익히는 중</span><span><i class="seg-new"></i>새 단어</span></div>' + songList(songs);
    }
    return html + '<div class="btn-list" style="margin-top:20px"><button class="btn ' + (songs.length ? 'quiet' : 'primary') + ' wide" data-act="import-file" data-target="song">노래 단어 파일 가져오기</button>' +
      '<button class="btn text" data-act="paste-import" data-target="song">붙여 넣어 가져오기</button><button class="btn text" data-act="deck-new" data-target="song">새 노래 단어장 만들기</button></div>';
  }
  // 노래 단어장 화면
  function songDeckHTML(d, list, st) {
    var p = songPlan(d.id), now = Date.now();
    var revNow = p.due.length + p.learning.filter(function (c) { return c.due <= now + 20 * MIN; }).length;
    var todo = revNow + p.newNext;
    var plan = todo
      ? '지금 할 단어 ' + todo + '개: 복습 ' + revNow + '개, 새 단어 ' + p.newNext + '개' + (p.fresh.length > p.newNext ? ' (안 배운 단어 ' + p.fresh.length + '개 중)' : '')
      : (p.fresh.length ? '' : '새 단어는 다 만났어요. ') + (p.nextDue ? '다음 복습은 ' + whenText(p.nextDue) + '이에요.' : '');
    var info = [d.song, d.artist].filter(Boolean).join(', ');
    var n = DB.settings.songNew || 10;
    return '<div class="view" style="padding-bottom:28px"><div class="cal-head" style="grid-template-columns:44px 1fr 44px"><button class="icon-btn" data-act="close-overlay" aria-label="뒤로">' + ICON.back + '</button><h2>' + esc(d.title) + '</h2><span></span></div>' +
      (info ? '<p class="song-info">' + esc(info) + '</p>' : '') +
      segbar(st) + '<p class="deck-nums" style="margin:8px 0 0">' + deckNums(st) + '</p>' +
      '<p class="deck-flag">노래 단어장이에요. 오늘 할 일·출석·알림에 들어가지 않고, 하고 싶을 때만 공부해요. 복습 날짜는 기억해 뒀다가 여기서 알려 줘요.</p>' +
      '<div class="deck-actions">' + (plan ? '<p class="song-plan">' + esc(plan) + '</p>' : '') +
      '<button class="btn primary wide" data-act="song-study" data-id="' + esc(d.id) + '" ' + (todo || p.learning.length ? '' : 'disabled') + '>공부하기</button>' +
      '<div class="song-new"><span>한 번에 새 단어</span>' + seg('songNew', [[5, '5개'], [10, '10개'], [20, '20개']], n) + '</div>' +
      (p.missed.length ? '<button class="btn quiet wide" data-act="song-missed" data-id="' + esc(d.id) + '">틀린 적 있는 단어 ' + p.missed.length + '개 연습</button>' : '') +
      '<button class="btn quiet wide" data-act="practice" data-id="' + esc(d.id) + '">전체 훑어보기</button>' +
      '<p class="hint">훑어보기와 틀린 단어 연습은 복습 날짜를 바꾸지 않아요. 아는 단어는 공부할 때 \'아는 단어라 빼기\'를 누르거나, 아래 목록에서 눌러 보류하면 돼요.</p>' +
      '<div class="pair"><button class="btn quiet" data-act="word-new" data-id="' + esc(d.id) + '">단어 추가</button><button class="btn quiet" data-act="deck-rename" data-id="' + esc(d.id) + '">이름 바꾸기</button></div></div>' +
      '<ul class="word-list" style="margin-top:12px">' + list.map(wordRow).join('') + '</ul>' +
      '<div class="btn-list"><button class="btn danger-text" data-act="deck-delete" data-id="' + esc(d.id) + '">이 노래 단어장 지우기</button></div></div>';
  }
  function renderWords() {
    return '<h1 class="page-title">단어</h1>' +
      '<input class="search" type="search" data-input="search" placeholder="단어나 뜻 검색" value="' + esc(state.search) + '" aria-label="단어 검색">' +
      '<div id="word-results">' + wordResults() + '</div>';
  }
  function deckItem(d) {
    var st = deckStats(d.id);
    var flag = d.paused ? '<span class="badge new">멈춤</span> ' : d.first ? '<span class="badge">먼저</span> ' : '';
    return '<li class="deck-item"><button data-act="deck" data-id="' + esc(d.id) + '"><span class="deck-top"><span class="deck-tab">' + esc(d.title) + '</span><span class="deck-count">' + flag + st.total + '개</span></span>' +
      segbar(st) + '<span class="deck-nums">' + deckNums(st) + '</span></button></li>';
  }
  function majorSection(majors) {
    var s = DB.settings;
    var html = '<section class="section" id="major-section"><h2>전공 단어</h2>';
    if (!majors.length) {
      html += '<p class="hint" style="margin-top:0">Claude가 고른 전공 단어(금융·보험, 토목)를 넣으면 하루에 과목별 ' + s.majorPerDay + '개씩 나와요. 출석은 토익과 따로 찍어요.</p>';
    } else {
      var fF = majorFresh('fin').length, fC = majorFresh('civ').length;
      html += '<p class="hint" style="margin-top:0">하루에 금융·보험 ' + s.majorPerDay + '개, 토목 ' + s.majorPerDay + '개씩 새로 나와요. 출석은 토익과 따로 찍어요.</p><ul class="deck-list">' + majors.map(deckItem).join('') + '</ul>' +
        '<p class="hint">아직 안 나온 단어: 금융·보험 ' + fF + '개, 토목 ' + fC + '개.' + (Math.min(fF, fC) <= s.majorPerDay * 3 ? ' 곧 떨어지니 Claude에게 다음 전공 단어를 받아 주세요.' : '') + '</p>';
    }
    return html + '<div class="btn-list"><button class="btn quiet wide" data-act="import-file" data-target="major">전공 단어 파일 가져오기</button></div></section>';
  }
  function wordResults() {
    var html = '';
    var q = state.search.trim().toLowerCase();
    if (q) { // 노래 단어는 노래 탭에서 따로 본다
      var found = cards().filter(function (c) { return trackOf(c) !== 'song' && (c.w + ' ' + c.m).toLowerCase().indexOf(q) !== -1; }).slice(0, 80);
      html += '<section class="section"><h2>검색 결과 ' + found.length + '개</h2><ul class="word-list">' + found.map(wordRow).join('') + '</ul></section>';
      return html;
    }
    var decks = values(DB.decks).filter(function (d) { return deckTrack(d.id) === 'toeic'; }).sort(function (a, b) { return a.order - b.order; });
    var majors = values(DB.decks).filter(function (d) { return deckTrack(d.id) === 'major'; })
      .sort(function (a, b) { return ((majorSub(a.id) === 'civ') - (majorSub(b.id) === 'civ')) || (a.order - b.order); });
    var leeches = cards().filter(function (c) { return trackOf(c) !== 'song' && isLeech(c); });
    if (leeches.length) {
      html += '<section class="section"><div class="leech-head"><h2>자주 틀리는 단어 ' + leeches.length + '개</h2><button class="btn text" data-act="copy-leeches">목록 복사</button></div>' +
        '<p class="hint" style="margin-top:0">복사해서 Claude에게 보내면 외우기 쉬운 연상법을 붙여 줘요.</p><ul class="word-list">' +
        leeches.sort(function (a, b) { return fails(b) - fails(a); }).slice(0, 5).map(wordRow).join('') + '</ul></section>';
    }
    html += '<section class="section"><h2>토익 Day별 진도</h2>';
    if (decks.length) html += '<div class="legend"><span><i class="seg-long"></i>머리에 남음</span><span><i class="seg-learn"></i>익히는 중</span><span><i class="seg-new"></i>새 단어</span></div><ul class="deck-list">' + decks.map(deckItem).join('') + '</ul>';
    else html += '<p class="hint" style="margin-top:0">아직 Day가 없어요. Claude가 만들어 준 Day 파일을 가져와 주세요. 처음이라면 체험용 10단어로 먼저 써 보세요.</p>';
    html += '<div class="btn-list"><button class="btn quiet wide" data-act="import-file" data-target="toeic">Day 파일 가져오기</button><button class="btn text" data-act="paste-import" data-target="toeic">붙여 넣어 가져오기</button>' +
      '<button class="btn text" data-act="deck-new" data-target="toeic">새 단어장 만들기</button>' + (decks.length ? '' : '<button class="btn text" data-act="load-sample">체험용 10단어 넣기</button>') + '</div></section>';
    html += majorSection(majors);
    html += '<div class="btn-list" style="margin-top:26px"><button class="btn text" data-act="export-study">학습 기록 표 내보내기</button></div>';
    return html;
  }
  function renderDeckOverlay() {
    var d = DB.decks[state.deckId];
    if (!d) { closeOverlay(); return; }
    var list = cards().filter(function (c) { return c.deck === d.id; }).sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); });
    var s = deckStats(d.id);
    var tr = deckTrack(d.id);
    if (tr === 'song') { overlay.innerHTML = songDeckHTML(d, list, s); return; }
    var kind = tr === 'major' ? '전공 단어장' : d.day != null ? 'Day' : '단어장';
    var html = '<div class="view" style="padding-bottom:28px"><div class="cal-head" style="grid-template-columns:44px 1fr 44px"><button class="icon-btn" data-act="close-overlay" aria-label="뒤로">' + ICON.back + '</button><h2>' + esc(d.title) + '</h2><span></span></div>' +
      segbar(s) + '<p class="deck-nums" style="margin:8px 0 0">' + deckNums(s) + '</p>' +
      (d.paused ? '<p class="deck-flag">새 단어를 잠시 멈췄어요. 이미 배운 단어 복습은 그대로 나와요.</p>' : '') +
      (tr === 'major' && !d.paused ? '<p class="deck-flag">' + (majorSub(d.id) === 'civ' ? '토목' : '금융·보험') + ' 전공 단어장이에요. 홈의 전공 칸에서 하루에 ' + DB.settings.majorPerDay + '개씩 새로 나와요.</p>' : '') +
      '<div class="deck-actions"><button class="btn primary wide" data-act="practice" data-id="' + esc(d.id) + '">이 ' + kind + ' 연습하기</button>' +
      '<p class="hint">복습 일정은 그대로 두고 이 ' + kind + '만 훑어봐요. 푼 문제는 ' + (tr === 'major' ? '전공 출석' : '출석') + '에 들어가요.</p>' +
      '<div class="pair"><button class="btn quiet" data-act="deck-first" data-id="' + esc(d.id) + '">' + (d.first ? '원래 순서로' : '새 단어 먼저 하기') + '</button>' +
      '<button class="btn quiet" data-act="deck-pause" data-id="' + esc(d.id) + '">' + (d.paused ? '새 단어 다시 시작' : '새 단어 멈추기') + '</button></div>' +
      '<div class="pair"><button class="btn quiet" data-act="word-new" data-id="' + esc(d.id) + '">단어 추가</button><button class="btn quiet" data-act="paste-import" data-target="' + tr + '" data-title="' + esc(d.title) + '">붙여 넣어 추가</button></div>' +
      '<button class="btn text" data-act="deck-rename" data-id="' + esc(d.id) + '">이름 바꾸기</button></div>' +
      (list.length ? '' : '<p class="hint" style="margin-top:14px">아직 단어가 없어요. 단어 추가로 하나씩 넣거나, 붙여 넣어 추가에서 한 줄에 \'단어 - 뜻\'으로 한꺼번에 넣을 수 있어요.</p>') +
      '<ul class="word-list" style="margin-top:12px">' + list.map(wordRow).join('') + '</ul>' +
      '<div class="btn-list"><button class="btn danger-text" data-act="deck-delete" data-id="' + esc(d.id) + '">이 ' + kind + ' 지우기</button></div></div>';
    overlay.innerHTML = html;
  }
  function openWordSheet(id) {
    var c = DB.cards[id];
    if (!c) return;
    var next = c.st === 0 ? '아직 안 배움' : shortDate(c.due);
    openSheet('<div class="word-sheet"><div class="headword-row" style="justify-content:flex-start"><p class="w">' + esc(c.w) + '</p><button class="icon-btn" data-act="speak" data-text="' + esc(c.w) + '" aria-label="발음 듣기">' + ICON.speak + '</button></div>' +
      '<p style="font-size:19px;font-weight:700;color:var(--ink);margin:4px 0 0">' + esc(c.m) + (c.pos ? ' <span class="small muted">' + esc(c.pos) + '</span>' : '') + '</p>' +
      (c.ex ? '<p class="example" style="margin-top:12px">' + exampleHTML(c.ex) + '</p>' : '') +
      (c.exKo ? '<p class="example-ko">' + esc(c.exKo) + '</p>' : '') +
      (c.nu ? '<p class="nuance"><b>쓰임</b>' + esc(c.nu) + '</p>' : '') +
      (c.note ? '<p class="memo">' + esc(c.note) + '</p>' : '') +
      '<dl><dt>상태</dt><dd>' + statusText(c).replace('<br>', ', ') + '</dd><dt>다음 복습</dt><dd>' + next + '</dd><dt>푼 횟수</dt><dd>' + (c.h || []).length + '번</dd><dt>틀린 횟수</dt><dd>' + fails(c) + '번</dd></dl>' +
      '<div class="btns two"><button class="btn quiet small" data-act="word-edit" data-id="' + esc(c.id) + '">고치기</button>' +
      '<button class="btn quiet small" data-act="word-suspend" data-id="' + esc(c.id) + '">' + (c.sus ? '보류 풀기' : '보류하기') + '</button>' +
      '<button class="btn quiet small" data-act="word-reset" data-id="' + esc(c.id) + '">처음부터 다시</button>' +
      '<button class="btn danger-text small" data-act="word-delete" data-id="' + esc(c.id) + '">지우기</button></div>' +
      '<p class="hint">보류한 단어는 복습에 나오지 않아요.</p></div>');
  }
  function openWordAdd(deckId) {
    var d = DB.decks[deckId]; if (!d) return;
    function field(name, label, multi, hint) {
      return '<label class="field">' + label + (multi ? '<textarea data-field="' + name + '" placeholder="' + esc(hint || '') + '"></textarea>' : '<input data-field="' + name + '" placeholder="' + esc(hint || '') + '"' + (name === 'w' ? ' autocapitalize="off" autocorrect="off" spellcheck="false"' : '') + '>') + '</label>';
    }
    openSheet('<h2>' + esc(d.title) + '에 단어 추가</h2><p>영어와 뜻만 있으면 돼요. 나머지는 비워 둬도 괜찮아요.</p>' +
      field('w', '영어', false, 'stack') + field('m', '뜻', false, '쌓다; 더미') + field('pos', '품사', false, '동사') +
      field('ex', '예문 (핵심 단어는 [ ]로 감싸기)', true, 'Chairs have been [stacked] near the door.') + field('exKo', '예문 해석', true) + field('note', '메모·연상법', true) +
      '<div class="btns two"><button class="btn quiet" data-act="word-add" data-deck="' + esc(d.id) + '" data-more="1">추가하고 하나 더</button><button class="btn primary" data-act="word-add" data-deck="' + esc(d.id) + '">추가</button></div>' +
      '<div class="btns"><button class="btn text" data-act="close-modal">닫기</button></div>');
    var first = modalRoot.lastElementChild.querySelector('[data-field="w"]'); if (first) setTimeout(function () { first.focus(); }, 60);
  }
  function createDeck(title, track) {
    var maxOrder = 0; values(DB.decks).forEach(function (d) { if (!d.first && d.order > maxOrder) maxOrder = d.order; });
    var id = (track === 'song' ? 'song-my-' : 'my-') + Date.now().toString(36);
    DB.decks[id] = { id: id, title: title, day: null, order: maxOrder + 1, addedAt: Date.now(), own: true, track: track === 'song' ? 'song' : 'toeic' };
    if (track === 'song') DB.decks[id].free = true;
    return DB.decks[id];
  }
  function openWordEdit(id) {
    var c = DB.cards[id];
    if (!c) return;
    function field(name, label, val, multi) {
      return '<label class="field">' + label + (multi ? '<textarea data-field="' + name + '">' + esc(val) + '</textarea>' : '<input data-field="' + name + '" value="' + esc(val) + '">') + '</label>';
    }
    openSheet('<h2>단어 고치기</h2>' + field('w', '영어', c.w) + field('m', '뜻', c.m) + field('pos', '품사', c.pos) +
      field('ex', '예문 (핵심 단어는 [ ]로 감싸기)', c.ex, true) + field('exKo', '예문 해석', c.exKo, true) + field('note', '메모·연상법', c.note, true) +
      '<div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn primary" data-act="word-save" data-id="' + esc(c.id) + '">저장</button></div>');
  }

  /* ================= 설정 ================= */
  function stepper(name, val, unit) {
    return '<div class="stepper"><button data-act="step" data-name="' + name + '" data-d="-1" aria-label="줄이기">−</button><output>' + val + unit + '</output><button data-act="step" data-name="' + name + '" data-d="1" aria-label="늘리기">+</button></div>';
  }
  function seg(name, options, cur) {
    return '<div class="seg" role="group">' + options.map(function (o) {
      return '<button data-act="seg" data-name="' + name + '" data-v="' + o[0] + '" aria-pressed="' + (String(o[0]) === String(cur)) + '">' + o[1] + '</button>';
    }).join('') + '</div>';
  }
  function sw(name, on, label) {
    return '<label class="switch"><input type="checkbox" data-input="toggle" data-name="' + name + '" ' + (on ? 'checked' : '') + ' aria-label="' + esc(label) + '"><span></span></label>';
  }
  function timeVal(n) { return pad2(n.h) + ':' + pad2(n.m); }
  function row(label, desc, control) {
    return '<div class="row"><div class="label"><p>' + label + '</p>' + (desc ? '<p class="desc">' + desc + '</p>' : '') + '</div>' + control + '</div>';
  }
  function restDowRow(s) {
    var cur = (s.restDows || [])[0];
    var pendingNote = '';
    var today = todayKey(), tomorrow = F.addDaysKey(today, 1);
    var nowDows = restDowsOn(today), nextDows = restDowsOn(tomorrow);
    if (String(nowDows) !== String(nextDows)) pendingNote = ' 오늘은 바꾸기 전 설정대로 가요.';
    return '<div class="row col"><div class="label"><p>쉬는 요일</p><p class="desc">이날은 새 단어 없이 쉬고, 복습은 앞뒤 날로 옮겨요. 알림도 안 와요. 바꾸면 내일부터 적용돼요.' + pendingNote + ' 한 번 더 누르면 쉬는 요일이 없어져요.</p></div>' +
      '<div class="seg days" role="group" aria-label="쉬는 요일">' + DOW.map(function (d, i) {
        return '<button data-act="rest-dow" data-v="' + i + '" aria-pressed="' + (cur === i) + '">' + d + '</button>';
      }).join('') + '</div>' +
      '<p class="desc">휴식권: 쉬는 요일 말고도 2주에 하루는 빠져도 연속 기록이 이어져요.</p></div>';
  }
  function renderSettings() {
    var s = DB.settings;
    var html = '<h1 class="page-title">설정</h1>';
    html += '<section class="group"><h2>토익 공부</h2>' +
      row('하루 새 단어', '처음 보는 단어를 하루에 몇 개까지 꺼낼지 정해요.', stepper('newPerDay', s.newPerDay, '개')) +
      row('출석 기준', '하루에 이만큼 풀면 출석 도장을 찍어요.', seg('minAnswers', [[10, '10'], [20, '20'], [30, '30'], [40, '40']], s.minAnswers)) +
      restDowRow(s) +
      row('복습 양', '많이 하면 덜 까먹고, 적게 하면 시간이 덜 들어요.', seg('retention', [[0.85, '적게'], [0.9, '보통'], [0.95, '많이']], s.retention)) +
      row('짧게 공부하는 시간', '홈에서 \'' + s.shortMinutes + '분만\'을 누르면 이 시간만큼만 공부해요.', seg('shortMinutes', [[3, '3분'], [5, '5분'], [10, '10분']], s.shortMinutes)) +
      row('문제 섞어 내기', '복습에서 한 번이라도 맞힌 단어는 가끔 예문 빈칸으로 나와요. 직접 써 보는 건 쓰기 단계에서 해요.', sw('mix', s.mix, '문제 섞어 내기')) +
      row('복습 많을 때 새 단어 줄이기', '켜면 밀린 복습이 쌓일 때 새 단어를 자동으로 줄여요. 끄면 정한 수만큼 매일 나와요. 전공에도 같이 적용돼요.', sw('autoReduce', s.autoReduce, '복습 많을 때 새 단어 줄이기')) +
      row('효과음', '', sw('sound', s.sound, '효과음')) +
      row('단어 자동으로 읽어 주기', '', sw('autoSpeak', s.autoSpeak, '단어 자동으로 읽어 주기')) +
      '</section>';

    html += '<section class="group"><h2>전공 공부</h2>' +
      row('하루 새 단어 (과목별)', '금융·보험과 토목에서 하루에 이만큼씩 꺼내요. 쉬는 요일과 복습 양은 토익과 같아요.', stepper('majorPerDay', s.majorPerDay, '개')) +
      row('전공 출석 기준', '전공 카드를 이만큼 풀거나, 오늘 전공 카드를 다 끝내면 전공 도장을 찍어요.', seg('majorMin', [[5, '5'], [10, '10'], [20, '20']], s.majorMin)) +
      '</section>';

    html += '<section class="group"><h2>쓰기 (직접 써 보기)</h2>' +
      row('쓰기 단어 수', '오늘 카드를 다 꺼내면 쓰기 단계가 열려요. \'새 단어만큼\'은 하루 새 단어 수와 같은 수예요(토익 ' + bonusCountForSame('toeic') + '개, 전공 ' + bonusCountForSame('major') + '개). 토익과 전공에 따로 적용돼요.',
        seg('bonusPick', [['same', '새 단어만큼'], [10, '10'], [20, '20'], [0, '전부']], s.bonusSame ? 'same' : s.bonusCount)) +
      row('무엇을 쓸지', '뜻을 보고 영어를 쓸지, 영어를 보고 뜻을 쓸지 골라요. 틀려도 복습 일정은 바뀌지 않고, 틀린 단어는 맞힐 때까지 다시 나와요.', seg('bonusMode', [['en', '영어'], ['ko', '뜻'], ['mix', '번갈아']], s.bonusMode)) +
      '</section>';

    var ns = Native.notifStatus();
    html += '<section class="group"><h2>알림</h2>' +
      row('오늘 공부 알림', '오늘 할 카드 수와 걸리는 시간을 알려 줘요. 전공 카드가 있으면 같이 알려 줘요.', '<input class="time-input" type="time" data-input="time" data-name="n1" value="' + timeVal(s.n1) + '" aria-label="오늘 공부 알림 시간">' + sw('n1on', s.n1.on, '오늘 공부 알림 켜기')) +
      row('출석 마감 알림', '아직 출석 전이면 한 번 더 알려 줘요. 토익과 전공 출석을 다 했으면 오지 않아요.', '<input class="time-input" type="time" data-input="time" data-name="n2" value="' + timeVal(s.n2) + '" aria-label="출석 마감 알림 시간">' + sw('n2on', s.n2.on, '출석 마감 알림 켜기'));
    if (ns) {
      html += row('알림 허용', '', ns.granted ? '<span class="status-ok">켜짐</span>' : '<button class="btn small primary" data-act="notif-on">켜기</button>');
      if (ns.sdk >= 31) html += row('정확한 시간에 알림', '꺼져 있으면 알림이 몇 분 늦게 올 수 있어요.', ns.exact ? '<span class="status-ok">켜짐</span>' : '<button class="btn small quiet" data-act="exact-alarm">허용하기</button>');
      html += row('배터리 최적화 예외', (String(ns.maker).toLowerCase() === 'samsung' ? '삼성 폰은 이걸 해 둬야 알림이 늦지 않아요.' : '알림이 늦게 오면 이걸 해 주세요.'), ns.battery ? '<span class="status-ok">적용됨</span>' : '<button class="btn small quiet" data-act="battery">예외 설정</button>');
      html += '<div class="btn-list"><button class="btn quiet wide" data-act="notif-test">지금 알림 보내 보기</button></div>';
    } else {
      html += '<p class="hint">웹 미리보기에서는 알림을 쓸 수 없어요. 앱에서 확인해 주세요.</p>';
    }
    html += '</section>';

    var last = DB.meta.lastBackupAt;
    html += '<section class="group"><h2>백업·폰 옮기기</h2>' +
      '<p class="hint" style="margin:4px 0 0">마지막 백업: ' + (last ? shortDate(last) + ' ' + pad2(new Date(last).getHours()) + ':' + pad2(new Date(last).getMinutes()) : '아직 없어요') + '</p>' +
      '<div class="btn-list"><button class="btn primary wide" data-act="backup-share">카톡·드라이브로 보내기</button>' +
      '<button class="btn quiet wide" data-act="backup-save">파일로 저장</button>' +
      '<button class="btn quiet wide" data-act="import-file" data-target="backup">백업 파일 불러오기</button>' +
      '<button class="btn text" data-act="export-study">학습 기록 표 내보내기</button>' +
      (Native.has ? '<button class="btn text" data-act="snapshots">자동 저장본에서 되살리기</button>' : '') + '</div>' +
      '<p class="hint">새 폰에서는 앱을 설치한 뒤 이 화면에서 백업 파일을 불러오면 출석, 진도, 단어가 모두 그대로 옮겨져요. 단어 파일은 단어 탭과 노래 탭에서 따로 가져와요.</p></section>';

    var hasSample = Object.keys(DB.cards).some(function (k) { return DB.cards[k].deck === 'sample'; });
    html += '<section class="group"><h2>기타</h2>' +
      row('하루가 바뀌는 시각', '새벽 4시 전에 한 공부는 전날로 쳐요.', '<span class="muted small">새벽 4시</span>') +
      (hasSample ? row('체험용 10단어', '', '<button class="btn small quiet" data-act="remove-sample">빼기</button>') : row('체험용 10단어', '', '<button class="btn small quiet" data-act="load-sample">넣기</button>')) +
      row('앱 버전', Native.canUpdate ? '새 버전이 나오면 여기서 바로 설치할 수 있어요. 기록은 그대로 남아요.' : '', '<span class="muted small">' + esc(Native.version()) + '</span>') +
      '<div class="btn-list">' + (Native.canUpdate ? '<button class="btn quiet wide" data-act="update-check">업데이트 확인</button>' : '') +
      '<button class="btn quiet wide" data-act="guide">설명서 보기</button>' +
      '<button class="btn quiet wide" data-act="changes">업데이트 내역 보기</button></div>' +
      '<div class="btn-list"><button class="btn danger-text" data-act="wipe">모든 기록 지우기</button></div></section>';
    return html;
  }
  function openSnapshots() {
    var list = Native.snapshots() || [];
    if (!list.length) { toast('아직 자동 저장본이 없어요. 하루에 한 번 자동으로 만들어져요.'); return; }
    openSheet('<h2>자동 저장본</h2><p>그날 처음 공부하기 직전 상태를 하루에 하나씩, 최근 7일치 보관해요. 폰 안에만 있어서 폰을 바꿀 때는 백업 파일을 써 주세요.</p><ul class="snap-list">' +
      list.map(function (x) {
        var m = /^data-(\d{4})(\d{2})(\d{2})\.json$/.exec(x.name);
        var label = m ? (+m[2]) + '월 ' + (+m[3]) + '일 공부 전' : x.name === 'data-before-restore.json' ? '마지막 불러오기·지우기 직전' : x.name;
        return '<li><button data-act="snap-pick" data-name="' + esc(x.name) + '"><span>' + esc(label) + '</span><span class="muted small">' + Math.max(1, Math.round(x.size / 1024)) + 'KB</span></button></li>';
      }).join('') + '</ul><div class="btns"><button class="btn quiet" data-act="close-modal">닫기</button></div>');
  }

  /* ================= 첫 실행 ================= */
  function maybeWelcome() {
    if (DB.meta.welcomed || loadProblem) return;
    DB.meta.welcomed = true; saveSoon();
    var ns = Native.notifStatus();
    openSheet('<h2>꺼내보카를 시작해요</h2>' +
      '<p>뜻을 먼저 떠올린 다음 확인하는 단어장이에요. 잊을 때쯤 다시 꺼내 주니까, 매일 조금씩만 하면 돼요.</p>' +
      (ns && !ns.granted ? '<p><strong>알림을 켜 주세요.</strong> 매일 정한 시간에 오늘 할 양을 알려 드리고, 출석 전이면 한 번 더 알려 드려요.</p><div class="btns"><button class="btn primary" data-act="notif-on">알림 켜기</button></div>' : '') +
      '<p style="margin-top:16px">단어는 Claude가 만들어 준 Day 파일로 넣어요. 처음이라면 체험용 10단어로 먼저 써 보세요.</p>' +
      '<div class="btns two"><button class="btn quiet" data-act="close-modal">나중에</button><button class="btn primary" data-act="load-sample">체험용 10단어 넣기</button></div>');
  }

  /* ================= 버튼 처리 ================= */
  var actions = {
    'tab': function (el) { closeAllModals(); setTab(el.dataset.tab); },
    'study': function () { closeAllModals(); startStudy('normal'); },
    'short': function () { startStudy('short'); },
    'study-close': function () { finishStudy(); },
    'close-overlay': function () { closeOverlay(); },
    'close-modal': function () { closeTopModal(); },
    'reveal': function () { S.cur.revealed = true; renderStudy(); },
    'grade': function (el) { grade(+el.dataset.g); },
    'undo': function () { undoLast(); },
    'speak': function (el) { speak(el.dataset.text); },
    'type-check': function () { submitTyped(); },
    'type-giveup': function () { S.cur.typed = ''; S.cur.verdict = { ok: false }; renderStudy(); },
    'type-override': function () { S.cur.verdict = { ok: true, exact: true }; renderStudy(); },
    'type-next': function () { var ok = !!(S.cur.verdict && S.cur.verdict.ok); if (S.bonus) bonusGrade(ok); else grade(ok ? 3 : 1); },
    'cal-prev': function () { var cm = state.calMonth; state.calMonth = cm[1] === 0 ? [cm[0] - 1, 11] : [cm[0], cm[1] - 1]; render(); },
    'cal-next': function () { var cm = state.calMonth; state.calMonth = cm[1] === 11 ? [cm[0] + 1, 0] : [cm[0], cm[1] + 1]; render(); },
    'deck': function (el) { state.deckId = el.dataset.id; openOverlay('deck', ''); renderDeckOverlay(); },
    'word': function (el) { openWordSheet(el.dataset.id); },
    'word-edit': function (el) { closeTopModal(); openWordEdit(el.dataset.id); },
    'word-save': function (el) {
      var c = DB.cards[el.dataset.id]; if (!c) return;
      var sheet = modalRoot.lastElementChild;
      sheet.querySelectorAll('[data-field]').forEach(function (inp) { var v = inp.value.trim(); if (inp.dataset.field === 'w' && !v) return; c[inp.dataset.field] = v; });
      saveNow(); closeTopModal(); render(); toast('단어를 고쳤어요.');
    },
    'word-suspend': function (el) { var c = DB.cards[el.dataset.id]; c.sus = !c.sus; saveNow(); closeTopModal(); render(); toast(c.sus ? '보류했어요. 복습에 나오지 않아요.' : '보류를 풀었어요.'); },
    'word-reset': function (el) {
      var c = DB.cards[el.dataset.id];
      confirmSheet('처음부터 다시 배울까요?', '이 단어의 진도가 새 단어 상태로 돌아가요. 푼 기록은 남아요.', '처음부터 다시', function () {
        c.st = 0; c.step = 0; c.S = 0; c.D = 0; c.due = 0; c.last = 0; c.reps = 0; c.lapses = 0;
        saveNow(); closeAllModals(); render(); toast('새 단어로 돌렸어요.');
      });
    },
    'word-delete': function (el) {
      var id = el.dataset.id;
      confirmSheet('이 단어를 지울까요?', '지운 단어와 기록은 되돌릴 수 없어요.', '지우기', function () {
        if (DB.cards[id]) refundNewToday([DB.cards[id]]);
        delete DB.cards[id]; saveNow(); closeAllModals(); render(); toast('단어를 지웠어요.');
      }, true);
    },
    'deck-delete': function (el) {
      var id = el.dataset.id, d = DB.decks[id];
      var tr = deckTrack(id), kind = tr === 'song' ? '노래 단어장' : tr === 'major' ? '전공 단어장' : d.day != null ? 'Day' : '단어장';
      confirmSheet(josa(d.title, '을/를') + ' 지울까요?', '이 ' + kind + '의 단어와 진도가 모두 지워져요.', '지우기', function () {
        var gone = cards().filter(function (c) { return c.deck === id; });
        refundNewToday(gone);
        gone.forEach(function (c) { delete DB.cards[c.id]; });
        delete DB.decks[id]; saveNow(); closeAllModals(); closeOverlay(); toast('지웠어요.');
      }, true);
    },
    'copy-leeches': function () {
      var list = cards().filter(function (c) { return trackOf(c) !== 'song' && isLeech(c); }).sort(function (a, b) { return fails(b) - fails(a); });
      var text = '꺼내보카에서 자주 틀리는 단어예요. 외우기 쉬운 연상법을 붙여서 패치 파일로 만들어 줘.\n' +
        list.map(function (c, i) { return (i + 1) + '. ' + c.w + ' (' + c.m + ') - 틀린 횟수 ' + fails(c); }).join('\n');
      Native.copy(text); toast('목록을 복사했어요. Claude에게 붙여 넣어 보내세요.');
    },
    'step': function (el) {
      var name = el.dataset.name, d = +el.dataset.d;
      if (name === 'newPerDay') {
        var v = DB.settings.newPerDay + d * 5;
        DB.settings.newPerDay = Math.max(0, Math.min(60, v));
      } else if (name === 'majorPerDay') {
        DB.settings.majorPerDay = Math.max(0, Math.min(10, DB.settings.majorPerDay + d));
      }
      saveNow(); render();
    },
    'seg': function (el) {
      var name = el.dataset.name, v = el.dataset.v;
      if (name === 'bonusPick') { // 쓰기 단어 수: '새 단어만큼'이거나 정한 수. 오늘 이미 시작한 쓰기의 목표는 그대로 둔다
        DB.settings.bonusSame = v === 'same';
        if (v !== 'same') DB.settings.bonusCount = parseInt(v, 10);
        saveNow(); render(); return;
      }
      DB.settings[name] = name === 'retention' ? parseFloat(v) : name === 'bonusMode' ? v : parseInt(v, 10);
      if (name === 'minAnswers' && checkAttendance(todayPlan())) toast('기준을 채워서 오늘 출석 도장을 찍었어요.');
      if (name === 'majorMin' && checkMajorAttendance(majorPlan())) toast('기준을 채워서 오늘 전공 도장을 찍었어요.');
      saveNow(); render();
    },
    'rest-dow': function (el) {
      var v = parseInt(el.dataset.v, 10);
      var next = (DB.settings.restDows || []).indexOf(v) !== -1 ? [] : [v];
      var moved = setRestDows(next);
      saveNow(); render();
      toast(next.length ? '내일부터 ' + DOW[v] + '요일에 쉬어요.' + (moved ? ' 그날 복습 ' + moved + '장은 앞뒤 날로 옮겼어요.' : '') : '쉬는 요일을 없앴어요. 내일부터 매일 공부해요.');
    },
    'lownew-off': function () { DB.meta.lowNewOff = toeicCardCount(); saveNow(); render(); toast('새 단어장을 넣을 때까지 이 알림을 안 보여 드려요.'); },
    'guide': function () { closeAllModals(); openGuide(); },
    'notif-on': function () { Native.requestNotif(); },
    'exact-alarm': function () { Native.openExactAlarm(); },
    'battery': function () { Native.requestBattery(); },
    'notif-test': function () { saveNow(); Native.testNotif(); toast('알림을 보냈어요. 안 오면 알림 허용을 확인해 주세요.'); },
    'backup-save': function () { exportKind = 'backup'; Native.exportFile(backupPayload(), backupName()); },
    'backup-share': function () { exportKind = 'backup'; Native.shareFile(backupPayload(), backupName()); },
    'export-study': function () { openExportSheet(); },
    'csv-save': function () { exportKind = 'csv'; closeAllModals(); Native.exportFile(studyCsv(), csvName()); },
    'csv-share': function () { exportKind = 'csv'; closeAllModals(); Native.shareFile(studyCsv(), csvName()); },
    'practice': function (el) { closeAllModals(); startPractice(el.dataset.id); },
    'practice-again': function () { var p = state.lastPractice; if (p) startPractice(p.deck, p.ids, p.track); },
    'practice-week': function (el) {
      var t = el.dataset.track === 'major' ? 'major' : 'toeic';
      var ids = weekMissedIds(t);
      if (!ids.length) { toast('이번 주에 틀린 ' + (t === 'major' ? '전공 ' : '') + '단어가 없어요.'); return; }
      startPractice(null, ids, t);
    },
    'word-new': function (el) { openWordAdd(el.dataset.id); },
    'word-add': function (el) {
      var d = DB.decks[el.dataset.deck]; if (!d) return;
      var sheet = modalRoot.lastElementChild, f = {};
      sheet.querySelectorAll('[data-field]').forEach(function (inp) { f[inp.dataset.field] = inp.value.trim(); });
      if (!f.w || !f.m) { toast('영어와 뜻은 꼭 적어 주세요.'); return; }
      var r = importDay({ deck: { id: d.id, title: d.title }, words: [f] });
      saveNow();
      var msg = r.added ? josa(f.w, '을/를') + ' 추가했어요.' : '이미 있는 단어라 내용을 고쳤어요.';
      if (el.dataset.more) {
        sheet.querySelectorAll('[data-field]').forEach(function (inp) { inp.value = ''; });
        var w = sheet.querySelector('[data-field="w"]'); if (w) w.focus();
        toast(msg + ' 다음 단어를 적어 주세요.');
      } else { closeTopModal(); renderDeckOverlay(); toast(msg); }
    },
    'deck-new': function (el) {
      var song = el && el.dataset.target === 'song';
      openSheet(song
        ? '<h2>새 노래 단어장 만들기</h2><p>노래 제목처럼 알아보기 쉬운 이름을 정해 주세요. 만든 뒤 단어를 하나씩 넣을 수 있어요.</p><label class="field">이름<input id="deck-title" type="text" placeholder="좋아하는 노래"></label>' +
          '<div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn primary" data-act="deck-create" data-target="song">만들기</button></div>'
        : '<h2>새 단어장 만들기</h2><p>캠프 단어나 수업 단어처럼 따로 모을 이름을 정해 주세요. 만든 뒤 단어를 하나씩 넣거나, 붙여 넣기로 한꺼번에 넣을 수 있어요.</p>' +
          '<label class="field">이름<input id="deck-title" type="text" placeholder="캠프 1주차"></label>' +
          '<div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn primary" data-act="deck-create" data-target="toeic">만들기</button></div>');
      var t = document.getElementById('deck-title'); if (t) setTimeout(function () { t.focus(); }, 60);
    },
    'deck-create': function (el) {
      var t = (document.getElementById('deck-title') || {}).value || '';
      t = t.trim(); if (!t) { toast('이름을 적어 주세요.'); return; }
      var d = createDeck(t, el && el.dataset.target); saveNow(); closeAllModals(); render();
      state.deckId = d.id; openOverlay('deck', ''); renderDeckOverlay();
      toast(josa(d.title, '을/를') + ' 만들었어요. 단어 추가를 눌러 넣어 보세요.');
    },
    'deck-rename': function (el) {
      var d = DB.decks[el.dataset.id]; if (!d) return;
      openSheet('<h2>이름 바꾸기</h2><label class="field">이름<input id="deck-title" type="text" value="' + esc(d.title) + '"></label>' +
        '<div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn primary" data-act="deck-rename-save" data-id="' + esc(d.id) + '">저장</button></div>');
    },
    'deck-rename-save': function (el) {
      var d = DB.decks[el.dataset.id]; if (!d) return;
      var t = ((document.getElementById('deck-title') || {}).value || '').trim(); if (!t) { toast('이름을 적어 주세요.'); return; }
      d.title = t; saveNow(); closeTopModal(); renderDeckOverlay(); render(); toast('이름을 바꿨어요.');
    },
    'update-check': function () { updateSilent = false; toast('새 버전을 찾고 있어요…'); Native.checkUpdate(); },
    'update-download': function (el) {
      Native.keepBeforeRestore(backupPayload()); // 설치 전에 지금 기록을 자동 저장본으로 하나 남긴다
      el.disabled = true; el.textContent = '내려받는 중…';
      var bar = document.getElementById('update-bar'); if (bar) bar.hidden = false;
      Native.downloadUpdate();
    },
    'update-install': function () { Native.installUpdate(); },
    'practice-missed': function () { var m = state.lastMissed; if (m && m.ids.length) startPractice(m.deck, m.ids, m.track); },
    'song-study': function (el) { closeAllModals(); startSongStudy(el.dataset.id); },
    'song-missed': function (el) { var p = songPlan(el.dataset.id); if (!p.missed.length) { toast('틀린 적 있는 단어가 없어요.'); return; } startPractice(el.dataset.id, p.missed); },
    'song-drop': function () { songDrop(); },
    'song-open': function () { closeAllModals(); setTab('songs'); },
    'major-study': function () { closeAllModals(); startMajorStudy(); },
    'bonus': function (el) { closeAllModals(); startBonus(el.dataset.track === 'major' ? 'major' : 'toeic'); },
    'changes': function () { closeAllModals(); openChanges(); },
    'home-track': function (el) { DB.meta.homeTrack = el.dataset.v === 'major' ? 'major' : 'toeic'; state.calTrack = DB.meta.homeTrack; saveSoon(); render(); },
    'mascot': function () { state.lookFlip = !state.lookFlip; render(); },
    'cal-track': function (el) { state.calTrack = el.dataset.v === 'major' ? 'major' : 'toeic'; render(); },
    'goto-place': function (el) {
      var p = el.dataset.place;
      closeAllModals(); if (state.overlay) closeOverlay(true);
      if (p === 'song') { setTab('songs'); return; }
      setTab('words');
      if (p === 'major') { var sec = document.getElementById('major-section'); if (sec) sec.scrollIntoView(); }
    },
    'deck-pause': function (el) {
      var d = DB.decks[el.dataset.id]; if (!d) return;
      d.paused = !d.paused; if (!d.paused) delete d.paused;
      saveNow(); renderDeckOverlay();
      toast(d.paused ? josa(d.title, '은/는') + ' 새 단어를 멈췄어요. 복습은 그대로 나와요.' : d.title + '의' + ' 새 단어를 다시 꺼내요.');
    },
    'deck-first': function (el) {
      var d = DB.decks[el.dataset.id]; if (!d) return;
      var others = values(DB.decks).filter(function (x) { return x.id !== d.id; });
      if (!d.first) {
        var min = others.reduce(function (m, x) { return Math.min(m, x.order != null ? x.order : 9999); }, 9999);
        d.order = Math.min(min, d.order != null ? d.order : 9999) - 1; d.first = true;
      } else {
        var max = others.reduce(function (m, x) { return Math.max(m, x.first ? 0 : (x.order || 0)); }, 0);
        d.order = d.day != null ? d.day : max + 1; delete d.first;
      }
      saveNow(); renderDeckOverlay();
      toast(d.first ? d.title + '의' + ' 새 단어를 가장 먼저 꺼내요.' : josa(d.title, '을/를') + ' 원래 순서로 돌렸어요.');
    },
    'import-file': function (el) { state.pickTarget = (el && el.dataset.target) || 'toeic'; Native.pickFile(); },
    'paste-import': function (el) {
      var tgt = (el && el.dataset && el.dataset.target) || 'toeic', title = el && el.dataset && el.dataset.title || '';
      var head = tgt === 'song' ? '<h2>노래 단어 붙여 넣기</h2><p>Claude가 준 노래 단어 파일 내용을 통째로 붙여 넣으세요. 직접 적을 때는 한 줄에 하나씩 \'단어 - 뜻\'으로 쓰면 돼요.</p>'
        : tgt === 'major' ? '<h2>전공 단어 붙여 넣기</h2><p>한 줄에 하나씩 \'단어 - 뜻\'으로 적으면 이 전공 단어장에 더해요.</p>'
        : '<h2>붙여 넣어 가져오기</h2><p>Claude가 준 Day 내용을 통째로 붙여 넣으세요. 직접 적을 때는 한 줄에 하나씩 \'단어 - 뜻\'으로 쓰면 돼요.</p>';
      openSheet(head +
        '<textarea data-autofocus="1" id="paste-box" placeholder="stack - 쌓다&#10;kneel - 무릎을 꿇다"></textarea>' +
        (tgt === 'major' ? '<input id="paste-title" type="hidden" value="' + esc(title) + '">'
          : '<label class="field">이름 (줄 목록일 때만, 있는 단어장 이름이면 거기에 더해요)<input id="paste-title" type="text" placeholder="' + esc(tgt === 'song' ? '노래 단어' : listTitle()) + '" value="' + esc(title) + '"></label>') +
        '<div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn primary" data-act="paste-go" data-target="' + tgt + '">가져오기</button></div>');
    },
    'paste-go': function (el) {
      var t = document.getElementById('paste-box').value;
      if (!t.trim()) { toast('붙여 넣은 내용이 없어요.'); return; }
      var ti = document.getElementById('paste-title');
      importText(t, '붙여 넣기', { title: ti ? ti.value : '', target: (el && el.dataset.target) || 'toeic' });
    },
    'do-restore': function () { var ctx = topCtx(); if (ctx.restore) doRestore(ctx.restore); },
    'snapshots': function () { openSnapshots(); },
    'snap-pick': function (el) {
      var name = el.dataset.name;
      var text = Native.loadSnapshot(name);
      if (!text) { toast('저장본을 읽지 못했어요.'); return; }
      var obj; try { obj = JSON.parse(text); } catch (e) { toast('저장본이 손상됐어요. 다른 날짜를 골라 주세요.'); return; }
      confirmRestore({ kind: 'kkeonae-backup', db: obj, counts: { cards: Object.keys(obj.cards || {}).length, attended: Object.keys(obj.days || {}).filter(function (k) { return obj.days[k].att || obj.days[k].rest; }).length } }, name);
    },
    'fresh-start': function () {
      confirmSheet('새로 시작할까요?', '읽지 못한 기록 위에 새 기록을 저장해요. 먼저 자동 저장본을 확인해 보세요.', '새로 시작', function () {
        DB = newDB(); blockSave = false; loadProblem = false; saveNow(); closeAllModals(); render();
      }, true);
    },
    'load-sample': function () {
      if (DB.decks.sample) { toast('체험용 단어가 이미 들어 있어요.'); closeAllModals(); return; }
      var r = importDay(clone(SAMPLE_DAY)); saveNow(); closeAllModals(); render();
      toast('체험용 단어 ' + r.added + '개를 넣었어요. 공부 시작을 눌러 보세요.');
    },
    'remove-sample': function () {
      cards().forEach(function (c) { if (c.deck === 'sample') delete DB.cards[c.id]; });
      delete DB.decks.sample; saveNow(); render(); toast('체험용 단어를 뺐어요.');
    },
    'wipe': function () {
      confirmSheet('모든 기록을 지울까요?', '단어, 진도, 출석 기록이 모두 지워져요. 백업 파일이 없으면 되돌릴 수 없어요.', '모두 지우기', function () {
        Native.keepBeforeRestore(JSON.stringify(DB));
        DB = newDB(); DB.meta.welcomed = true; saveNow(); closeAllModals(); render(); toast('모든 기록을 지웠어요.');
      }, true);
    },
    'confirm-yes': function () { var ctx = topCtx(); if (ctx.onYes) ctx.onYes(); }
  };
  function confirmSheet(title, body, yes, onYes, danger) {
    openSheet('<h2>' + esc(title) + '</h2><p>' + esc(body) + '</p><div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn ' + (danger ? 'graphite' : 'primary') + '" data-act="confirm-yes">' + esc(yes) + '</button></div>', { onYes: onYes });
  }
  function submitTyped() {
    var inp = document.getElementById('type-input');
    if (!inp || !S || !S.cur) return;
    var c = DB.cards[S.cur.id];
    var v = inp.value;
    if (!v.trim()) { inp.focus(); return; }
    S.cur.typed = v;
    S.cur.verdict = S.cur.mode === 'mean' ? checkMeaning(v, c.m) : checkTyped(v, c.w);
    renderStudy();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act;
    var fn = actions[act];
    if (!fn) return;
    var needsCard = { 'reveal': 1, 'grade': 1, 'type-check': 1, 'type-giveup': 1, 'type-override': 1, 'type-next': 1, 'song-drop': 1 };
    if (needsCard[act] && (!S || !S.cur)) return;
    e.preventDefault();
    fn(t, e);
  });
  document.addEventListener('submit', function (e) {
    if (e.target.dataset.form === 'type') { e.preventDefault(); submitTyped(); }
  });
  document.addEventListener('input', function (e) {
    var t = e.target;
    if (t.dataset.input === 'search') {
      // 입력창은 그대로 두고 결과만 바꿔야 한글 조합이 끊기지 않는다
      state.search = t.value;
      var box = document.getElementById('word-results');
      if (box) box.innerHTML = wordResults();
    }
  });
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (t.dataset.input === 'toggle') {
      var name = t.dataset.name;
      if (name === 'n1on') DB.settings.n1.on = t.checked;
      else if (name === 'n2on') DB.settings.n2.on = t.checked;
      else DB.settings[name] = t.checked;
      saveNow();
      if ((name === 'n1on' || name === 'n2on') && t.checked) { var ns = Native.notifStatus(); if (ns && !ns.granted) Native.requestNotif(); }
    } else if (t.dataset.input === 'time') {
      var p = String(t.value || '').split(':');
      if (p.length < 2) return;
      DB.settings[t.dataset.name].h = parseInt(p[0], 10) || 0;
      DB.settings[t.dataset.name].m = parseInt(p[1], 10) || 0;
      saveNow();
      toast('알림 시간을 ' + t.value + '으로 바꿨어요.');
    }
  });

  /* ================= 폰에서 오는 신호 ================= */
  var lastDayRendered = null;
  window.__native = function (evt, arg) {
    if (evt === 'update-info') { onUpdateInfo(arg); return; }
    if (evt === 'update-progress') {
      var fill = document.querySelector('#update-bar span'); if (fill) fill.style.width = Math.max(0, Math.min(100, +arg || 0)) + '%';
      var lab = document.getElementById('update-msg'); if (lab) lab.textContent = '내려받는 중 ' + (+arg || 0) + '%';
      return;
    }
    if (evt === 'update-done') { onUpdateDone(arg); return; }
    if (evt === 'picked') {
      var text = Native.takePicked();
      if (!text) { if (arg) toast('빈 파일이에요.'); return; }
      var tgt = state.pickTarget || 'toeic'; state.pickTarget = null;
      importText(text, arg, { file: true, target: tgt });
    } else if (evt === 'picked-fail') {
      if (/^(image|media|pdf|doc|binary)$/.test(arg || '')) explainNotWordFile(arg);
      else toast('파일을 열지 못했어요. 다른 파일을 골라 주세요.');
    }
    else if (evt === 'exported') {
      if (arg === 'ok' && exportKind === 'csv') toast('학습 기록 표를 저장했어요. 엑셀이나 구글 시트로 열 수 있어요.');
      else if (arg === 'ok') { DB.meta.lastBackupAt = Date.now(); saveNow(); render(); toast('백업 파일을 저장했어요.'); }
      else if (arg === 'fail') toast('저장하지 못했어요. 다른 위치를 골라 주세요.');
    } else if (evt === 'shared') {
      if (arg === 'ok' && exportKind === 'csv') toast('보낼 곳을 골라 주세요. Claude에게 보내면 자주 틀린 단어를 같이 볼 수 있어요.');
      else if (arg === 'ok') { DB.meta.lastBackupAt = Date.now(); saveNow(); render(); toast('보낼 곳을 골라 주세요. 카톡 나에게 보내기나 구글 드라이브가 좋아요.'); }
      else toast('보내기 화면을 열지 못했어요. 파일로 저장을 써 주세요.');
    } else if (evt === 'notif-permission') { closeAllModals(); render(); }
    else if (evt === 'resume') {
      if (todayKey() !== lastDayRendered && !S) { lastDayRendered = todayKey(); render(); }
      else if (!S && !state.overlay) render();
    } else if (evt === 'pause') { saveNow(); }
  };
  window.__handleBack = function () {
    if (closeTopModal()) return true;
    if (state.overlay === 'study') { finishStudy(); return true; }
    if (state.overlay) { closeOverlay(); return true; }
    if (state.tab !== 'home') { setTab('home'); return true; }
    return false;
  };
  document.addEventListener('visibilitychange', function () { if (document.hidden) saveNow(); });
  window.addEventListener('pagehide', saveNow);

  /* ================= 앱 업데이트 ================= */
  var updateSilent = false;
  function onUpdateInfo(arg) {
    var o = null; try { o = JSON.parse(arg); } catch (e) { o = null; }
    var silent = updateSilent; updateSilent = false;
    if (!o || !o.ok) { if (!silent) toast('업데이트 정보를 못 받았어요. 인터넷 연결을 확인해 주세요.'); return; }
    var cur = o.current || Native.versionCode();
    if (!(o.ready && o.build > cur)) { if (!silent) toast('지금이 최신 버전이에요 (1.0.' + cur + ').'); return; }
    if (silent) { toast('새 버전 1.0.' + o.build + '이 나왔어요. 설정의 업데이트 확인에서 설치할 수 있어요.'); return; }
    openSheet('<h2>새 버전 1.0.' + o.build + '</h2><p>지금은 1.0.' + cur + '을 쓰고 있어요. 내려받아 설치해도 출석, 진도, 단어는 그대로 남아요. 설치 전에 지금 기록을 자동 저장본으로 하나 남겨 둘게요.</p>' +
      '<div class="update-bar" id="update-bar" hidden><span></span></div><p class="hint" id="update-msg"></p>' +
      '<div class="btns two"><button class="btn quiet" data-act="close-modal">나중에</button><button class="btn primary" data-act="update-download">내려받아 설치</button></div>');
  }
  function onUpdateDone(arg) {
    var msg = document.getElementById('update-msg');
    var btn = document.querySelector('[data-act="update-download"], [data-act="update-install"]');
    var say = function (t) { if (msg) msg.textContent = t; else toast(t); };
    if (arg === 'installer') say('설치 화면이 열렸어요. [업데이트]를 누르면 끝나요.');
    else if (arg === 'permission') {
      say('설정에서 \'이 출처 허용\'을 켠 뒤 돌아와서 [설치하기]를 눌러 주세요. 처음 한 번만 하면 돼요.');
      if (btn) { btn.disabled = false; btn.textContent = '설치하기'; btn.dataset.act = 'update-install'; }
    } else if (arg === 'same') say('이미 최신 버전이에요.');
    else {
      say('내려받지 못했어요. 인터넷 연결을 확인하고 다시 눌러 주세요.');
      if (btn) { btn.disabled = false; btn.textContent = '다시 내려받기'; btn.dataset.act = 'update-download'; }
    }
  }
  function autoCheckUpdate() { // 하루에 한 번, 앱을 열 때 조용히 확인한다
    if (!Native.canUpdate) return;
    var last = DB.meta.updCheckedAt || 0;
    if (Date.now() - last < 20 * 3600000) return;
    DB.meta.updCheckedAt = Date.now(); saveSoon();
    updateSilent = true; Native.checkUpdate();
  }

  /* ================= 시작 ================= */
  loadDB();
  lastDayRendered = todayKey();
  var returningUser = !!DB.meta.welcomed; // 새로 깐 앱의 첫 실행에는 '달라진 점'을 띄우지 않는다
  var newVer = loadProblem ? null : noteVersion();
  render();
  if (!blockSave) saveNow();
  maybeWelcome();
  if (newVer && returningUser) showWhatsNew(newVer);
  setTimeout(autoCheckUpdate, 1500);

  // 테스트용 접근점
  window.__kv = { get db() { return DB; }, parseLines: parseLines, weekMissedIds: weekMissedIds, studyCsv: studyCsv, newQueueCards: newQueueCards, todayPlan: todayPlan, streakAt: streakAt, buildSummary: buildSummary, importText: importText, checkTyped: checkTyped, clozeParts: clozeParts,
    isRestDay: isRestDay, passWindow: passWindow, reviewStats: reviewStats, josa: josa, rebalanceRestDays: rebalanceRestDays,
    paceStats: paceStats, estMinutes: estMinutes, fmtMin: fmtMin, songPlan: songPlan, isFreeDeck: isFreeDeck, hasCards: hasCards,
    majorPlan: majorPlan, deckTrack: deckTrack, hasMajorCards: hasMajorCards, majorFresh: majorFresh, setTab: setTab, homeTrack: homeTrack, majorLook: majorLook, get state() { return state; },
    checkMeaning: checkMeaning, bonusState: bonusState, bonusPool: bonusPool, startBonus: startBonus, trackFinished: trackFinished, appVer: appVer, openChanges: openChanges, openGuide: openGuide, passedReview: passedReview, chooseMode: chooseMode, retentionLine: retentionLine, bonusCountFor: bonusCountFor, lowNewNotice: lowNewNotice, get session() { return S; } };
})();
