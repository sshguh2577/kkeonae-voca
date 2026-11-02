/* 꺼내보카 — 화면과 기록 관리 */
(function () {
  'use strict';

  var F = window.FSRS;
  var DAY = 86400000, MIN = 60000;
  var LONG_TERM_S = 21; // 안정도 21일 이상 = 머리에 남은 단어

  var DEFAULT_SETTINGS = {
    newPerDay: 15,
    minAnswers: 20,
    retention: 0.9,
    dayStartHour: 4,
    n1: { on: true, h: 21, m: 0 },
    n2: { on: true, h: 23, m: 0 },
    mix: true,
    autoReduce: true,
    sound: true,
    autoSpeak: false,
    shortMinutes: 5
  };

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
        var r = new FileReader();
        r.onload = function () { picked = String(r.result || ''); window.__native('picked', f.name); webFile.value = ''; };
        r.readAsText(f);
      });
    }
    function webDownload(text, name) {
      try {
        var blob = new Blob([text], { type: 'application/json' });
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
      version: function () { return has ? safe(function () { return A.appVersion(); }, '?') : '웹 미리보기'; }
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
      meta: { lastBackupAt: 0, bestStreak: 0, welcomed: false }
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
    o.days = o.days || {};
    o.meta = Object.assign(base.meta, o.meta || {});
    values(o.cards).forEach(function (c) { if (!c.h) c.h = []; if (c.sus == null) c.sus = false; });
    return o;
  }
  function loadDB() {
    var raw = '';
    try { raw = Native.load() || ''; } catch (e) { raw = ''; }
    if (raw) {
      try { DB = migrate(JSON.parse(raw)); return; }
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
    if (!d) d = DB.days[key] = { a: 0, c: 0, n: 0, ms: 0 };
    return d;
  }
  function firstDayKey() {
    var keys = Object.keys(DB.days).sort();
    var created = F.dayKey(DB.createdAt, dsh());
    return keys.length && keys[0] < created ? keys[0] : created;
  }

  /* ================= 카드 ================= */
  function cards() { return values(DB.cards); }
  function hasCards() { for (var k in DB.cards) { if (!DB.cards[k].sus) return true; } return false; }
  function deckOrder(id) { var d = DB.decks[id]; return d && d.order != null ? d.order : 9999; }
  function newQueueCards() {
    return cards().filter(function (c) { return c.st === 0 && !c.sus; }).sort(function (a, b) {
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
    for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && c.st !== 0 && c.due < endMs) n++; }
    return n;
  }
  function todayPlan() {
    var key = todayKey(), end = dayEndMs(key), rec = dayRec(key), s = DB.settings;
    var due = countDue(end);
    var newAvail = 0;
    for (var k in DB.cards) { var c = DB.cards[k]; if (c.st === 0 && !c.sus) newAvail++; }
    var capSig = s.newPerDay + '|' + (s.autoReduce ? 1 : 0);
    if (rec.dueStart == null) rec.dueStart = due;
    if (rec.cap == null || rec.capSig !== capSig) { rec.cap = newCapFor(rec.dueStart); rec.capSig = capSig; }
    var newLeft = Math.max(0, Math.min(newAvail, rec.cap - rec.n));
    if (!rec.att && !rec.rest && rec.a === 0 && due === 0 && newLeft === 0 && hasCards()) rec.rest = true;
    return { key: key, end: end, rec: rec, due: due, newLeft: newLeft, newAvail: newAvail, reduced: rec.cap < s.newPerDay };
  }
  function estMinutes(due, fresh) { return Math.max(1, Math.round((due * 8 + fresh * 25) / 60)); }

  /* ================= 출석 ================= */
  function attendedKey(k) { var d = DB.days[k]; return !!(d && (d.att || d.rest)); }
  function weekKey(key) {
    var d = keyToDate(key); var dow = (d.getDay() + 6) % 7;
    d.setDate(d.getDate() - dow);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  // refKey 시점의 연속 출석 (주마다 하루는 휴식권으로 이어 줌)
  function streakAt(refKey) {
    var first = firstDayKey();
    var k = attendedKey(refKey) ? refKey : F.addDaysKey(refKey, -1);
    var count = 0, frozen = [], pending = [], used = {};
    while (F.daysBetweenKeys(first, k) >= 0) {
      if (attendedKey(k)) { count++; if (pending.length) { frozen = frozen.concat(pending); pending = []; } }
      else {
        var wk = weekKey(k);
        if (used[wk]) break;
        used[wk] = true; pending.push(k);
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

  /* ================= 알림용 요약 (폰이 읽음) ================= */
  function buildSummary() {
    var s = DB.settings, key = todayKey(), now = Date.now();
    var perDay = {}, todayDue = 0, end = dayEndMs(key);
    cards().forEach(function (c) {
      if (c.sus || c.st === 0) return;
      if (c.due < end) { todayDue++; return; }
      var k = F.dayKey(c.due, s.dayStartHour);
      perDay[k] = (perDay[k] || 0) + 1;
    });
    var plan = todayPlan();
    var dueBy = {}, newBy = {}, streakBy = {};
    var cum = todayDue, newPool = Math.max(0, plan.newAvail - plan.newLeft);
    dueBy[key] = cum; newBy[key] = plan.newLeft;
    for (var i = 1; i <= 30; i++) {
      var k = F.addDaysKey(key, i);
      cum += perDay[k] || 0;
      dueBy[k] = cum;
      var cap = Math.min(newCapFor(cum), newPool);
      newBy[k] = cap; newPool -= cap;
    }
    for (var j = 0; j <= 7; j++) { var kk = F.addDaysKey(key, j); streakBy[kk] = streakAt(kk).count; }
    var attended = Object.keys(DB.days).filter(attendedKey).sort().slice(-60);
    return {
      v: 1, generatedAt: now, dayStartHour: s.dayStartHour,
      n1: { on: !!s.n1.on, h: s.n1.h, m: s.n1.m },
      n2: { on: !!s.n2.on, h: s.n2.h, m: s.n2.m },
      hasCards: hasCards(), attended: attended,
      dueBy: dueBy, newBy: newBy, streakBy: streakBy,
      minAnswers: s.minAnswers, lastBackupAt: DB.meta.lastBackupAt || 0
    };
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
      note: str(raw.note || raw.memo)
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
    var deck = DB.decks[deckId];
    if (!deck) {
      var maxOrder = 0; values(DB.decks).forEach(function (d) { if (d.order > maxOrder) maxOrder = d.order; });
      deck = DB.decks[deckId] = { id: deckId, title: title, day: hasDay ? +dayNum : null, order: hasDay ? +dayNum : maxOrder + 1, addedAt: Date.now() };
    } else { deck.title = title; }
    var byWord = {};
    cards().forEach(function (c) { if (c.deck === deckId) byWord[c.w.toLowerCase()] = c; });
    var added = 0, updated = 0;
    words.forEach(function (raw, i) {
      var f = wordFields(raw || {});
      if (!f.w) return;
      var id = raw.id ? String(raw.id) : null;
      var ex = (id && DB.cards[id]) || byWord[f.w.toLowerCase()];
      if (ex) { applyFields(ex, f); updated++; return; }
      var cid = id || uniqueId(deckId, f.w);
      var card = { id: cid, deck: deckId, ord: i, st: 0, step: 0, S: 0, D: 0, due: 0, last: 0, reps: 0, lapses: 0, sus: false, added: Date.now(), h: [] };
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
  function importText(text, name) {
    var obj;
    try { obj = parseLoose(text); }
    catch (e) { toast('파일 내용을 읽을 수 없어요. Claude가 준 Day 파일(.json)인지 확인해 주세요.'); return; }
    if (obj && obj.kind === 'kkeonae-backup' && obj.db) { confirmRestore(obj, name); return; }
    if (obj && obj.kind === 'kkeonae-patch') {
      var n = importPatch(obj); saveNow(); render();
      toast(n ? '단어 ' + n + '개에 메모를 붙였어요.' : '맞는 단어를 찾지 못했어요.');
      return;
    }
    try {
      var r = importDay(obj);
      saveNow(); closeAllModals(); render();
      var msg = r.deck.title + '을 가져왔어요. 새 단어 ' + r.added + '개';
      if (r.updated) msg += ', 고친 단어 ' + r.updated + '개';
      toast(msg + '.');
    } catch (e) {
      toast('단어 목록을 찾지 못했어요. Claude가 준 Day 파일인지 확인해 주세요.');
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
  function sealSVG(text, sub, rot, cls) {
    return '<svg class="seal ' + (cls || '') + '" viewBox="0 0 64 64" aria-hidden="true"><g transform="rotate(' + (rot || 0) + ' 32 32)">' +
      '<circle cx="32" cy="32" r="28.5" fill="none" style="stroke:var(--stamp)" stroke-width="3.4" stroke-dasharray="' + INK_DASH + '"/>' +
      '<circle cx="32" cy="32" r="23.6" fill="none" style="stroke:var(--stamp)" stroke-width="1.1" opacity=".9"/>' +
      '<text x="32" y="' + (sub ? 34.5 : 37.5) + '" text-anchor="middle" style="fill:var(--stamp);font-family:var(--font-ko);font-weight:800" font-size="' + (sub ? 14 : 15) + '">' + esc(text) + '</text>' +
      (sub ? '<text x="32" y="46.5" text-anchor="middle" style="fill:var(--stamp);font-family:var(--font-ko);font-weight:700" font-size="7.5">' + esc(sub) + '</text>' : '') +
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
  var state = { tab: 'home', calMonth: null, search: '', deckId: null, overlay: null };
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
  function weekStrip() {
    var key = todayKey();
    var monday = weekKey(key);
    var st = streakAt(key);
    var html = '<ol class="week">';
    for (var i = 0; i < 7; i++) {
      var k = F.addDaysKey(monday, i);
      var d = DB.days[k];
      var diff = F.daysBetweenKeys(key, k);
      var label = DOW[keyToDate(k).getDay()];
      var mark;
      if (d && d.att) mark = sealSVG('출석', '', dayRot(k));
      else if (d && d.rest) mark = '<span class="seal-rest" title="할 카드가 없던 날">' + ICON.moon + '</span>';
      else if (st.frozen.indexOf(k) !== -1) mark = '<span class="seal-empty" style="border-style:dashed;border-color:var(--ink-3)" title="휴식권 사용"></span>';
      else if (diff === 0) mark = '<span class="seal-empty today"></span>';
      else if (diff > 0) mark = '<span class="seal-empty future"></span>';
      else mark = '<span class="seal-empty"></span>';
      html += '<li class="' + (diff === 0 ? 'is-today' : '') + '"><span class="dow">' + label + '</span>' + mark + '</li>';
    }
    html += '</ol>';
    var usedThisWeek = st.frozen.some(function (k) { return weekKey(k) === monday; });
    var note = usedThisWeek ? '이번 주 휴식권을 썼어요. 다음 주 월요일에 다시 생겨요.' : '이번 주 휴식권 1장이 남았어요. 하루 빠져도 연속 기록이 이어져요.';
    return { html: html, note: note, streak: st.count };
  }

  function renderHome() {
    var plan = todayPlan();
    var key = plan.key;
    var head = '<header class="home-head"><h1 class="brand">꺼내보카</h1><p class="today-date">' + keyLabel(key, true) + '</p></header>';
    var notices = homeNotices();

    if (!hasCards() && !Object.keys(DB.cards).length) {
      return head + notices +
        '<section class="empty"><h2>아직 단어가 없어요</h2>' +
        '<p>Claude가 만들어 준 Day 파일을 가져오면 바로 시작할 수 있어요. 처음이라면 체험용 10단어로 먼저 써 보세요.</p>' +
        '<div class="stack-btns"><button class="btn primary" data-act="import-file">Day 파일 가져오기</button>' +
        '<button class="btn quiet" data-act="paste-import">붙여 넣어 가져오기</button>' +
        '<button class="btn text" data-act="load-sample">체험용 10단어 넣기</button></div></section>';
    }

    var ws = weekStrip();
    var streakLine = ws.streak > 0 ? '<p class="streak-line"><strong>' + ws.streak + '일</strong> 연속 출석</p>' : '<p class="streak-line">오늘 첫 도장을 찍어 보세요</p>';
    var total = plan.due + plan.newLeft;
    var desc, headline = total + '장', headClass = 'today-total';
    var dueTomorrow = Math.max(0, countDue(dayEndMs(F.addDaysKey(key, 1))) - plan.due);
    if (total === 0 && plan.rec.a > 0) { headline = '오늘 카드는 다 꺼냈어요'; headClass += ' word'; desc = '내일 복습 예정은 ' + dueTomorrow + '장이에요.'; }
    else if (total === 0) { headline = '오늘은 쉬어 가는 날이에요'; headClass += ' word'; desc = '복습할 카드가 없어요. 새 Day를 가져오면 새 단어가 생겨요.'; }
    else desc = '복습 ' + plan.due + '장, 새 단어 ' + plan.newLeft + '장이에요. 약 ' + estMinutes(plan.due, plan.newLeft) + '분 걸려요.';
    if (plan.reduced) desc += ' 복습이 많아서 오늘 새 단어를 ' + plan.rec.cap + '장으로 줄였어요.';
    var goal = DB.settings.minAnswers;
    var meter;
    if (plan.rec.att) meter = '<p class="meter-label">' + sealSVG('출석', '', -8) + '오늘 출석했어요. 더 하면 내일이 가벼워져요.</p>';
    else if (plan.rec.rest) meter = '<p class="meter-label">할 카드가 없는 날이라 출석으로 쳐 줘요.</p>';
    else {
      var pct = Math.min(100, Math.round(plan.rec.a / goal * 100));
      meter = '<div class="meter" role="progressbar" aria-label="출석까지" aria-valuemin="0" aria-valuemax="' + goal + '" aria-valuenow="' + Math.min(goal, plan.rec.a) + '"><span style="width:' + pct + '%"></span></div>' +
        '<p class="meter-label">출석까지 ' + goal + '문제 중 ' + Math.min(goal, plan.rec.a) + '문제</p>';
    }
    var counts = { new: 0, learn: 0, long: 0 };
    cards().forEach(function (c) { var s = stage(c); if (counts[s] != null) counts[s]++; });
    var totalWords = counts.new + counts.learn + counts.long;
    var canStudy = total > 0 || hasPendingLearning();
    var mins = DB.settings.shortMinutes;

    return head +
      '<section class="streak">' + streakLine + ws.html + '<p class="freeze-note">' + ws.note + '</p></section>' +
      '<section class="today"><div class="stack' + (total < 2 ? ' single' : '') + '"><div class="index-card">' +
      '<p class="card-kicker"><span>오늘 꺼낼 카드</span><span>' + (plan.rec.a ? '오늘 ' + plan.rec.a + '문제 풀었어요' : '') + '</span></p>' +
      '<p class="' + headClass + '">' + esc(headline) + '</p>' +
      '<p class="today-desc">' + esc(desc) + '</p>' + meter +
      '</div></div>' +
      '<div class="home-actions"><button class="btn primary" data-act="study" ' + (canStudy ? '' : 'disabled') + '>공부 시작</button>' +
      '<button class="btn quiet" data-act="short" ' + (canStudy ? '' : 'disabled') + '>' + mins + '분만</button></div></section>' +
      notices +
      '<section class="memory"><p class="lead"><strong>' + counts.long + '개</strong> 단어가 머리에 남았어요</p>' +
      '<p class="sub">전체 ' + totalWords + '개 중 익히는 중 ' + counts.learn + '개, 새 단어 ' + counts.new + '개</p></section>';
  }
  function hasPendingLearning() {
    for (var k in DB.cards) { var c = DB.cards[k]; if (!c.sus && (c.st === 1 || c.st === 3)) return true; }
    return false;
  }
  function homeNotices() {
    var out = '';
    if (loadProblem) {
      out += '<div class="notice"><p>저장된 기록을 읽지 못했어요. 기록이 지워지지 않게 저장을 멈춰 뒀어요. 자동 저장본이나 백업 파일로 되살릴 수 있어요.</p>' +
        '<div class="row"><button class="btn small primary" data-act="snapshots">자동 저장본 보기</button><button class="btn small quiet" data-act="import-file">백업 파일 불러오기</button><button class="btn small text" data-act="fresh-start">새로 시작</button></div></div>';
    }
    var ns = Native.notifStatus();
    if (ns && !ns.granted) {
      out += '<div class="notice"><p>알림이 꺼져 있어요. 켜 두면 정한 시간에 오늘 할 양과 출석 마감을 알려 드려요.</p><div class="row"><button class="btn small primary" data-act="notif-on">알림 켜기</button></div></div>';
    }
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

  /* ================= 공부 ================= */
  var S = null; // 진행 중인 공부

  function studyOpts() { return { retention: DB.settings.retention, dsh: dsh(), fuzz: true }; }
  function retrNow(c, now) { return c.last ? F.retrievability((now - c.last) / DAY, c.S || 0.1) : 0; }

  function startStudy(mode, extra) {
    var now = Date.now();
    var plan = todayPlan();
    var learning = [], reviews = [];
    cards().forEach(function (c) {
      if (c.sus) return;
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
      cur: null, answered: 0, good: 0, again: 0, newSeen: 0,
      attendedNow: false, undo: null, timer: null
    };
    openOverlay('study', '<div class="study" id="study"></div>');
    if (S.mode === 'short') S.timer = setInterval(updateStudyTop, 1000);
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
    var r = Math.random();
    if (c.S >= 7 && r < 0.25) return 'type';
    if (c.S >= 3 && r < 0.5 && clozeParts(c)) return 'cloze';
    return 'recall';
  }
  function nextCard() {
    if (S.mode === 'short' && S.deadline && Date.now() >= S.deadline && S.answered > 0) { finishStudy(); return; }
    var id = takeNext();
    while (id && (!DB.cards[id] || DB.cards[id].sus)) id = takeNext();
    if (!id) { finishStudy(); return; }
    var c = DB.cards[id];
    S.cur = { id: id, mode: chooseMode(c), revealed: false, shownAt: Date.now(), typed: null, verdict: null };
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
    return F.humanizePreview(F.preview(c, g, Date.now(), { retention: DB.settings.retention, dsh: dsh() })) + ' 뒤';
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
    var kicker = '<p class="card-kicker"><span>' + esc(deckTitle(c.deck)) + '</span>' + (isNew ? '<span class="badge new">새 단어</span>' : (isLeech(c) ? '<span class="badge">자주 틀림</span>' : '<span></span>')) + '</p>';
    var speakBtn = '<button class="icon-btn" data-act="speak" data-text="' + esc(c.w) + '" aria-label="발음 듣기">' + ICON.speak + '</button>';
    var body = '', actions = '';
    var answerBlock = '<div class="answer">' +
      (cur.mode !== 'type' ? '<p class="meaning">' + esc(c.m) + '</p>' : '') +
      (c.ex ? '<button class="speak-ex" data-act="speak" data-text="' + esc(c.ex) + '" aria-label="예문 듣기"><p class="example">' + exampleHTML(c.ex) + '</p></button>' : '') +
      (c.exKo ? '<p class="example-ko">' + esc(c.exKo) + '</p>' : '') +
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
    } else { // type
      var hint = (c.w || '').split(/[\/,;]/)[0].trim().split(/\s+/).map(function (part) {
        return part.charAt(0) + part.slice(1).replace(/[a-zA-Z]/g, '_');
      }).join('  ');
      body = kicker + '<p class="prompt-ko">' + esc(c.m) + '</p>' + (c.pos ? '<p class="pos">' + esc(c.pos) + '</p>' : '') +
        '<p class="type-hint">' + esc(hint) + '</p>';
      if (cur.verdict) {
        body += '<p class="verdict ' + (cur.verdict.ok ? 'ok' : 'no') + '">' +
          (cur.verdict.ok ? (cur.verdict.exact ? '맞았어요' : '거의 맞았어요. 철자를 확인하세요') : '정답은 이거예요') +
          (!cur.verdict.ok && cur.typed ? '<span class="typed">' + esc(cur.typed) + '</span>' : '') + '</p>' +
          '<div class="headword-row"><h2 class="headword ' + headwordClass(c.w) + '">' + esc(c.w) + '</h2>' + speakBtn + '</div>' + answerBlock;
      } else {
        body += '<form class="type-field" data-form="type"><input id="type-input" type="text" inputmode="latin" autocomplete="off" autocapitalize="off" autocorrect="off" spellcheck="false" placeholder="영어로 써 보세요" aria-label="영어 단어 입력"></form>';
      }
    }

    if (cur.mode === 'type') {
      if (cur.verdict) {
        actions = '<button class="btn primary tall wide" data-act="type-next">다음</button>' +
          '<div class="under-actions">' + (cur.verdict.ok ? '' : '<button class="btn text" data-act="type-override">사실 맞게 썼어요</button>') + '</div>';
      } else {
        actions = '<div class="grade-row"><button class="btn graphite" data-act="type-giveup">모르겠어요</button><button class="btn primary" data-act="type-check">확인</button></div><div class="under-actions"></div>';
      }
    } else if (!cur.revealed) {
      actions = '<button class="btn primary tall wide" data-act="reveal">' + (cur.mode === 'cloze' ? '정답 보기' : '뜻 보기') + '</button><div class="under-actions"></div>';
    } else {
      actions = '<div class="grade-row"><button class="btn graphite" data-act="grade" data-g="1">몰랐음<small>' + previewLabel(c, 1) + '</small></button>' +
        '<button class="btn primary" data-act="grade" data-g="3">알았음<small>' + previewLabel(c, 3) + '</small></button></div>' +
        '<div class="under-actions">' + (isNew ? '<button class="btn text" data-act="grade" data-g="4">이미 아는 단어예요 (' + previewLabel(c, 4) + ')</button>' : '') + '</div>';
    }

    root.innerHTML = top + '<div class="study-body"><article class="index-card study-card" aria-live="polite">' + body + '</article></div>' +
      '<footer class="study-actions">' + actions + '</footer>';
    updateStudyTop();
    var inp = document.getElementById('type-input');
    if (inp) setTimeout(function () { inp.focus(); }, 30);
  }

  function normalizeAns(s) {
    return String(s || '').toLowerCase().replace(/\(.*?\)/g, ' ').replace(/[^a-z0-9'\- ]/g, ' ').replace(/\s+/g, ' ').trim();
  }
  function lev(a, b) {
    var m = a.length, n = b.length, d = [], i, j;
    for (i = 0; i <= m; i++) { d[i] = [i]; }
    for (j = 0; j <= n; j++) { d[0][j] = j; }
    for (i = 1; i <= m; i++) for (j = 1; j <= n; j++) {
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    return d[m][n];
  }
  function checkTyped(input, word) {
    var a = normalizeAns(input);
    if (!a) return { ok: false };
    var vs = String(word).split(/[\/,;]/).map(normalizeAns).filter(Boolean);
    for (var i = 0; i < vs.length; i++) {
      var v = vs[i];
      if (a === v || a === v.replace(/^(be|to) /, '')) return { ok: true, exact: true };
    }
    for (var j = 0; j < vs.length; j++) {
      if (vs[j].length >= 7 && lev(a, vs[j]) <= 1) return { ok: true, exact: false };
    }
    return { ok: false };
  }

  function grade(g) {
    if (!S || !S.cur) return;
    var c = DB.cards[S.cur.id];
    var now = Date.now();
    var plan0 = todayPlan();
    var rec = plan0.rec;
    S.undo = {
      id: c.id, card: clone(c), rec: { a: rec.a, c: rec.c, n: rec.n, ms: rec.ms, att: !!rec.att, attAt: rec.attAt },
      queue: S.queue.slice(), pending: S.pending.map(function (x) { return { id: x.id, due: x.due }; }),
      stats: { answered: S.answered, good: S.good, again: S.again, newSeen: S.newSeen, attendedNow: S.attendedNow },
      cur: { id: S.cur.id, mode: S.cur.mode }
    };
    var wasNew = c.st === 0;
    var res = F.schedule(c, g, now, studyOpts());
    Object.assign(c, res.card);
    var modeCode = { recall: 0, cloze: 1, type: 2 }[S.cur.mode] || 0;
    c.h.push([Math.round(now / 1000), g, modeCode]);
    rec.a++; if (g >= 3) rec.c++; if (wasNew) rec.n++;
    rec.ms += Math.min(now - S.cur.shownAt, 90000);
    S.answered++; if (g >= 3) S.good++; else S.again++; if (wasNew) S.newSeen++;
    if (c.st === 1 || c.st === 3) S.pending.push({ id: c.id, due: c.due });
    var plan = todayPlan();
    var justAttended = checkAttendance(plan);
    saveSoon();
    if (justAttended) { S.attendedNow = true; showBigStamp(plan.key); }
    else sfx(g >= 3 ? 'good' : 'again');
    nextCard();
  }
  function undoLast() {
    if (!S || !S.undo) return;
    var u = S.undo;
    DB.cards[u.id] = u.card;
    var rec = dayRec(todayKey());
    rec.a = u.rec.a; rec.c = u.rec.c; rec.n = u.rec.n; rec.ms = u.rec.ms;
    if (!u.rec.att) { delete rec.att; delete rec.attAt; }
    S.queue = u.queue; S.pending = u.pending;
    S.answered = u.stats.answered; S.good = u.stats.good; S.again = u.stats.again; S.newSeen = u.stats.newSeen; S.attendedNow = u.stats.attendedNow;
    // u.queue / u.pending는 다음 카드를 꺼내기 전 모습이라 그대로 되돌리면 된다
    S.cur ={ id: u.id, mode: u.cur.mode, revealed: false, shownAt: Date.now(), typed: null, verdict: null };
    S.undo = null;
    saveSoon();
    renderStudy();
    toast('방금 답을 되돌렸어요.');
  }
  function showBigStamp(key) {
    var layer = document.getElementById('stamp-layer');
    var d = keyToDate(key);
    layer.innerHTML = sealSVG('출석', (d.getMonth() + 1) + '.' + pad2(d.getDate()), 0, 'big-stamp');
    var el = layer.firstChild;
    sfx('stamp');
    requestAnimationFrame(function () { el.classList.add('go'); });
    setTimeout(function () { layer.innerHTML = ''; }, 2000);
    var st = streakAt(key).count;
    toast(st > 1 ? '출석 도장을 찍었어요. ' + st + '일 연속이에요.' : '오늘 첫 출석 도장을 찍었어요.');
  }

  function finishStudy() {
    if (!S) return;
    if (S.timer) clearInterval(S.timer);
    saveNow();
    var s = S; S = null;
    if (!s.answered) { closeOverlay(); return; }
    var plan = todayPlan();
    var key = plan.key;
    var tomorrow = F.addDaysKey(key, 1);
    var dueTomorrow = countDue(dayEndMs(tomorrow)) - plan.due;
    var st = streakAt(key).count;
    var html = '<div class="result"><h2>' + s.answered + '장 꺼냈어요</h2>' +
      '<p class="lead">알았음 ' + s.good + '장, 몰랐음 ' + s.again + '장' + (s.newSeen ? '. 새 단어 ' + s.newSeen + '장을 처음 만났어요.' : '.') + '</p>';
    if (plan.rec.att) {
      html += '<div class="result-stamp">' + sealSVG('출석', '', dayRot(key)) + '<p><strong>오늘 출석했어요</strong>' + (st > 1 ? st + '일 연속이에요.' : '내일도 도장을 이어 가요.') + '</p></div>';
    } else {
      var left = Math.max(0, DB.settings.minAnswers - plan.rec.a);
      html += '<div class="result-stamp"><span class="seal-empty today" style="width:64px;height:64px;flex:none"></span><p><strong>출석까지 ' + left + '문제 남았어요</strong>조금만 더 하면 오늘 도장을 받아요.</p></div>';
    }
    var remainToday = plan.due + plan.newLeft;
    html += '<p class="next">' + (remainToday ? '오늘 남은 카드 ' + remainToday + '장. ' : '오늘 카드는 다 꺼냈어요. ') + '내일 복습 예정 ' + Math.max(0, dueTomorrow) + '장.</p>';
    html += '<div class="spacer"></div><div class="btns">';
    if (!plan.rec.att && (remainToday > 0 || hasPendingLearning())) html += '<button class="btn primary wide" data-act="study">이어서 하기</button>';
    else if (remainToday > 0) html += '<button class="btn quiet wide" data-act="study">남은 카드도 하기</button>';
    html += '<button class="btn ' + (plan.rec.att ? 'primary' : 'quiet') + ' wide" data-act="close-overlay">홈으로</button></div></div>';
    openOverlay('result', html);
  }

  /* ================= 출석 달력 ================= */
  function renderCalendar() {
    var key = todayKey();
    var t = keyToDate(key);
    if (!state.calMonth) state.calMonth = [t.getFullYear(), t.getMonth()];
    var y = state.calMonth[0], m = state.calMonth[1];
    var first = new Date(y, m, 1, 12), days = new Date(y, m + 1, 0, 12).getDate();
    var lead = (first.getDay() + 6) % 7;
    var st = streakAt(key);
    var html = '<h1 class="page-title">출석</h1>' +
      '<div class="cal-head"><button class="icon-btn" data-act="cal-prev" aria-label="이전 달">' + ICON.back + '</button><h2>' + y + '년 ' + (m + 1) + '월</h2>' +
      '<button class="icon-btn" data-act="cal-next" aria-label="다음 달">' + ICON.next + '</button></div><div class="cal-grid">';
    ['월', '화', '수', '목', '금', '토', '일'].forEach(function (d) { html += '<div class="cal-dow">' + d + '</div>'; });
    var monthCount = 0;
    for (var i = 0; i < lead; i++) html += '<div class="cal-cell out"><span class="num">.</span></div>';
    for (var d = 1; d <= days; d++) {
      var k = y + '-' + pad2(m + 1) + '-' + pad2(d);
      var rec = DB.days[k];
      var cls = 'cal-cell', inner = '<span class="num">' + d + '</span>', label = keyLabel(k);
      if (rec && rec.att) { cls += ' att'; inner = sealSVG(String(d), '', dayRot(k)) + inner; monthCount++; label += ' 출석'; }
      else if (rec && rec.rest) { inner = '<span class="mark"></span>' + inner; monthCount++; label += ' 할 카드가 없던 날'; }
      else if (st.frozen.indexOf(k) !== -1) { inner = '<span class="mark freeze"></span>' + inner; label += ' 휴식권 사용'; }
      if (k === key) cls += ' today';
      html += '<div class="' + cls + '" aria-label="' + esc(label) + '">' + inner + '</div>';
    }
    html += '</div><div class="cal-legend"><span>' + sealSVG('출석', '', -6) + '출석</span><span><i class="k"></i>할 카드가 없던 날</span><span><i class="k freeze"></i>휴식권 사용</span></div>';
    html += '<dl class="facts"><div><dt>이번 달 출석</dt><dd>' + monthCount + '일</dd></div><div><dt>지금 연속</dt><dd>' + st.count + '일</dd></div><div><dt>최장 연속</dt><dd>' + Math.max(DB.meta.bestStreak || 0, st.count) + '일</dd></div></dl>';

    // 앞으로 7일 복습
    var rows = [], max = 1;
    for (var j = 0; j < 7; j++) {
      var kk = F.addDaysKey(key, j);
      var start = j === 0 ? 0 : F.dayStartOfKey(kk, dsh());
      var end = dayEndMs(kk);
      var n = 0;
      cards().forEach(function (c) { if (!c.sus && c.st !== 0 && c.due >= start && c.due < end) n++; });
      rows.push([j === 0 ? '오늘' : j === 1 ? '내일' : keyLabel(kk).replace(/^\d+월 /, '') + ' ' + DOW[keyToDate(kk).getDay()], n]);
      if (n > max) max = n;
    }
    html += '<section class="section"><h2>앞으로 7일 복습</h2><table class="bar-table"><tbody>';
    rows.forEach(function (r) {
      html += '<tr><th scope="row">' + r[0] + '</th><td><div class="bar"><i style="width:' + Math.max(1, Math.round(r[1] / max * 78)) + '%"></i><b>' + r[1] + '장</b></div></td></tr>';
    });
    html += '</tbody></table><p class="hint">새 단어는 빼고 센 숫자예요.</p></section>';

    // 최근 7일 공부
    html += '<section class="section"><h2>최근 7일 공부</h2><table class="plain-table"><thead><tr><th>날짜</th><th class="num">문제</th><th class="num">알았음</th><th class="num">시간</th></tr></thead><tbody>';
    for (var q = 0; q < 7; q++) {
      var dk = F.addDaysKey(key, -q), r2 = DB.days[dk] || { a: 0, c: 0, ms: 0 };
      html += '<tr><td>' + (q === 0 ? '오늘' : keyLabel(dk)) + '</td><td class="num">' + r2.a + '</td><td class="num">' + (r2.a ? Math.round(r2.c / r2.a * 100) + '%' : '-') + '</td><td class="num">' + (r2.ms ? Math.max(1, Math.round(r2.ms / MIN)) + '분' : '-') + '</td></tr>';
    }
    html += '</tbody></table></section>';
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
  function renderWords() {
    return '<h1 class="page-title">단어</h1>' +
      '<input class="search" type="search" data-input="search" placeholder="단어나 뜻 검색" value="' + esc(state.search) + '" aria-label="단어 검색">' +
      '<div id="word-results">' + wordResults() + '</div>';
  }
  function wordResults() {
    var html = '';
    var q = state.search.trim().toLowerCase();
    if (q) {
      var found = cards().filter(function (c) { return (c.w + ' ' + c.m).toLowerCase().indexOf(q) !== -1; }).slice(0, 80);
      html += '<section class="section"><h2>검색 결과 ' + found.length + '개</h2><ul class="word-list">' + found.map(wordRow).join('') + '</ul></section>';
      return html;
    }
    var decks = values(DB.decks).sort(function (a, b) { return a.order - b.order; });
    if (!decks.length) {
      return '<section class="empty"><h2>아직 단어가 없어요</h2><p>Claude가 만들어 준 Day 파일을 가져와 주세요.</p><div class="stack-btns"><button class="btn primary" data-act="import-file">Day 파일 가져오기</button><button class="btn quiet" data-act="paste-import">붙여 넣어 가져오기</button><button class="btn text" data-act="load-sample">체험용 10단어 넣기</button></div></section>';
    }
    var leeches = cards().filter(isLeech);
    if (leeches.length) {
      html += '<section class="section"><div class="leech-head"><h2>자주 틀리는 단어 ' + leeches.length + '개</h2><button class="btn text" data-act="copy-leeches">목록 복사</button></div>' +
        '<p class="hint" style="margin-top:0">복사해서 Claude에게 보내면 외우기 쉬운 연상법을 붙여 줘요.</p><ul class="word-list">' +
        leeches.sort(function (a, b) { return fails(b) - fails(a); }).slice(0, 5).map(wordRow).join('') + '</ul></section>';
    }
    html += '<section class="section"><h2>Day별 진도</h2><div class="legend"><span><i class="seg-long"></i>머리에 남음</span><span><i class="seg-learn"></i>익히는 중</span><span><i class="seg-new"></i>새 단어</span></div><ul class="deck-list">';
    decks.forEach(function (d) {
      var s = deckStats(d.id);
      html += '<li class="deck-item"><button data-act="deck" data-id="' + esc(d.id) + '"><span class="deck-top"><span class="deck-tab">' + esc(d.title) + '</span><span class="deck-count">' + s.total + '개</span></span>' +
        segbar(s) + '<span class="deck-nums">' + deckNums(s) + '</span></button></li>';
    });
    html += '</ul></section><div class="btn-list"><button class="btn quiet wide" data-act="import-file">Day 파일 가져오기</button><button class="btn text" data-act="paste-import">붙여 넣어 가져오기</button></div>';
    return html;
  }
  function renderDeckOverlay() {
    var d = DB.decks[state.deckId];
    if (!d) { closeOverlay(); return; }
    var list = cards().filter(function (c) { return c.deck === d.id; }).sort(function (a, b) { return (a.ord || 0) - (b.ord || 0); });
    var s = deckStats(d.id);
    var html = '<div class="view" style="padding-bottom:28px"><div class="cal-head" style="grid-template-columns:44px 1fr 44px"><button class="icon-btn" data-act="close-overlay" aria-label="뒤로">' + ICON.back + '</button><h2>' + esc(d.title) + '</h2><span></span></div>' +
      segbar(s) + '<p class="deck-nums" style="margin:8px 0 0">' + deckNums(s) + '</p>' +
      '<ul class="word-list" style="margin-top:12px">' + list.map(wordRow).join('') + '</ul>' +
      '<div class="btn-list"><button class="btn danger-text" data-act="deck-delete" data-id="' + esc(d.id) + '">이 Day 지우기</button></div></div>';
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
      (c.note ? '<p class="memo">' + esc(c.note) + '</p>' : '') +
      '<dl><dt>상태</dt><dd>' + statusText(c).replace('<br>', ', ') + '</dd><dt>다음 복습</dt><dd>' + next + '</dd><dt>푼 횟수</dt><dd>' + (c.h || []).length + '번</dd><dt>틀린 횟수</dt><dd>' + fails(c) + '번</dd></dl>' +
      '<div class="btns two"><button class="btn quiet small" data-act="word-edit" data-id="' + esc(c.id) + '">고치기</button>' +
      '<button class="btn quiet small" data-act="word-suspend" data-id="' + esc(c.id) + '">' + (c.sus ? '보류 풀기' : '보류하기') + '</button>' +
      '<button class="btn quiet small" data-act="word-reset" data-id="' + esc(c.id) + '">처음부터 다시</button>' +
      '<button class="btn danger-text small" data-act="word-delete" data-id="' + esc(c.id) + '">지우기</button></div>' +
      '<p class="hint">보류한 단어는 복습에 나오지 않아요.</p></div>');
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
  function renderSettings() {
    var s = DB.settings;
    var html = '<h1 class="page-title">설정</h1>';
    html += '<section class="group"><h2>공부</h2>' +
      row('하루 새 단어', '처음 보는 단어를 하루에 몇 개까지 꺼낼지 정해요.', stepper('newPerDay', s.newPerDay, '개')) +
      row('출석 기준', '하루에 이만큼 풀면 출석 도장을 찍어요.', seg('minAnswers', [[10, '10'], [20, '20'], [30, '30'], [40, '40']], s.minAnswers)) +
      row('복습 양', '많이 하면 덜 까먹고, 적게 하면 시간이 덜 들어요.', seg('retention', [[0.85, '적게'], [0.9, '보통'], [0.95, '많이']], s.retention)) +
      row('짧게 공부하는 시간', '홈에서 \'' + s.shortMinutes + '분만\'을 누르면 이 시간만큼만 공부해요.', seg('shortMinutes', [[3, '3분'], [5, '5분'], [10, '10분']], s.shortMinutes)) +
      row('문제 섞어 내기', '익숙한 단어는 가끔 직접 쓰기나 예문 빈칸으로 나와요.', sw('mix', s.mix, '문제 섞어 내기')) +
      row('복습 많을 때 새 단어 줄이기', '밀린 복습이 쌓이면 새 단어를 자동으로 줄여요.', sw('autoReduce', s.autoReduce, '복습 많을 때 새 단어 줄이기')) +
      row('효과음', '', sw('sound', s.sound, '효과음')) +
      row('단어 자동으로 읽어 주기', '', sw('autoSpeak', s.autoSpeak, '단어 자동으로 읽어 주기')) +
      '</section>';

    var ns = Native.notifStatus();
    html += '<section class="group"><h2>알림</h2>' +
      row('오늘 공부 알림', '오늘 할 카드 수와 걸리는 시간을 알려 줘요.', '<input class="time-input" type="time" data-input="time" data-name="n1" value="' + timeVal(s.n1) + '" aria-label="오늘 공부 알림 시간">' + sw('n1on', s.n1.on, '오늘 공부 알림 켜기')) +
      row('출석 마감 알림', '아직 출석 전이면 한 번 더 알려 줘요. 출석했으면 오지 않아요.', '<input class="time-input" type="time" data-input="time" data-name="n2" value="' + timeVal(s.n2) + '" aria-label="출석 마감 알림 시간">' + sw('n2on', s.n2.on, '출석 마감 알림 켜기'));
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
      '<button class="btn quiet wide" data-act="import-file">백업·Day 파일 불러오기</button>' +
      '<button class="btn text" data-act="paste-import">붙여 넣어 가져오기</button>' +
      (Native.has ? '<button class="btn text" data-act="snapshots">자동 저장본에서 되살리기</button>' : '') + '</div>' +
      '<p class="hint">새 폰에서는 앱을 설치한 뒤 이 화면에서 백업 파일을 불러오면 출석, 진도, 단어가 모두 그대로 옮겨져요.</p></section>';

    var hasSample = Object.keys(DB.cards).some(function (k) { return DB.cards[k].deck === 'sample'; });
    html += '<section class="group"><h2>기타</h2>' +
      row('하루가 바뀌는 시각', '새벽 4시 전에 한 공부는 전날로 쳐요.', '<span class="muted small">새벽 4시</span>') +
      (hasSample ? row('체험용 10단어', '', '<button class="btn small quiet" data-act="remove-sample">빼기</button>') : row('체험용 10단어', '', '<button class="btn small quiet" data-act="load-sample">넣기</button>')) +
      row('앱 버전', '', '<span class="muted small">' + esc(Native.version()) + '</span>') +
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
    'type-next': function () { var ok = S.cur.verdict && S.cur.verdict.ok; grade(ok ? 3 : 1); },
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
      confirmSheet('이 단어를 지울까요?', '지운 단어와 기록은 되돌릴 수 없어요.', '지우기', function () { delete DB.cards[id]; saveNow(); closeAllModals(); render(); toast('단어를 지웠어요.'); }, true);
    },
    'deck-delete': function (el) {
      var id = el.dataset.id, d = DB.decks[id];
      confirmSheet(d.title + '을 지울까요?', '이 Day의 단어와 진도가 모두 지워져요.', '지우기', function () {
        cards().forEach(function (c) { if (c.deck === id) delete DB.cards[c.id]; });
        delete DB.decks[id]; saveNow(); closeAllModals(); closeOverlay(); toast('지웠어요.');
      }, true);
    },
    'copy-leeches': function () {
      var list = cards().filter(isLeech).sort(function (a, b) { return fails(b) - fails(a); });
      var text = '꺼내보카에서 자주 틀리는 단어예요. 외우기 쉬운 연상법을 붙여서 패치 파일로 만들어 줘.\n' +
        list.map(function (c, i) { return (i + 1) + '. ' + c.w + ' (' + c.m + ') - 틀린 횟수 ' + fails(c); }).join('\n');
      Native.copy(text); toast('목록을 복사했어요. Claude에게 붙여 넣어 보내세요.');
    },
    'step': function (el) {
      var name = el.dataset.name, d = +el.dataset.d;
      if (name === 'newPerDay') {
        var v = DB.settings.newPerDay + d * 5;
        DB.settings.newPerDay = Math.max(0, Math.min(60, v));
      }
      saveNow(); render();
    },
    'seg': function (el) {
      var name = el.dataset.name, v = el.dataset.v;
      DB.settings[name] = name === 'retention' ? parseFloat(v) : parseInt(v, 10);
      if (name === 'minAnswers' && checkAttendance(todayPlan())) toast('기준을 채워서 오늘 출석 도장을 찍었어요.');
      saveNow(); render();
    },
    'notif-on': function () { Native.requestNotif(); },
    'exact-alarm': function () { Native.openExactAlarm(); },
    'battery': function () { Native.requestBattery(); },
    'notif-test': function () { saveNow(); Native.testNotif(); toast('알림을 보냈어요. 안 오면 알림 허용을 확인해 주세요.'); },
    'backup-save': function () { Native.exportFile(backupPayload(), backupName()); },
    'backup-share': function () { Native.shareFile(backupPayload(), backupName()); },
    'import-file': function () { Native.pickFile(); },
    'paste-import': function () {
      openSheet('<h2>붙여 넣어 가져오기</h2><p>Claude가 준 Day 내용이나 백업 내용을 통째로 붙여 넣으세요.</p><textarea data-autofocus="1" id="paste-box" placeholder="{ &quot;kind&quot;: &quot;kkeonae-day&quot;, ... }"></textarea>' +
        '<div class="btns two"><button class="btn quiet" data-act="close-modal">취소</button><button class="btn primary" data-act="paste-go">가져오기</button></div>');
    },
    'paste-go': function () { var t = document.getElementById('paste-box').value; if (!t.trim()) { toast('붙여 넣은 내용이 없어요.'); return; } importText(t, '붙여 넣기'); },
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
    S.cur.verdict = checkTyped(v, c.w);
    renderStudy();
  }

  document.addEventListener('click', function (e) {
    var t = e.target.closest('[data-act]');
    if (!t) return;
    var act = t.dataset.act;
    var fn = actions[act];
    if (!fn) return;
    var needsCard = { 'reveal': 1, 'grade': 1, 'type-check': 1, 'type-giveup': 1, 'type-override': 1, 'type-next': 1 };
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
    if (evt === 'picked') {
      var text = Native.takePicked();
      if (!text) { if (arg) toast('빈 파일이에요.'); return; }
      importText(text, arg);
    } else if (evt === 'picked-fail') toast('파일을 열지 못했어요. 다른 파일을 골라 주세요.');
    else if (evt === 'exported') {
      if (arg === 'ok') { DB.meta.lastBackupAt = Date.now(); saveNow(); render(); toast('백업 파일을 저장했어요.'); }
      else if (arg === 'fail') toast('저장하지 못했어요. 다른 위치를 골라 주세요.');
    } else if (evt === 'shared') {
      if (arg === 'ok') { DB.meta.lastBackupAt = Date.now(); saveNow(); render(); toast('보낼 곳을 골라 주세요. 카톡 나에게 보내기나 구글 드라이브가 좋아요.'); }
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

  /* ================= 시작 ================= */
  loadDB();
  lastDayRendered = todayKey();
  render();
  if (!blockSave) saveNow();
  maybeWelcome();

  // 테스트용 접근점
  window.__kv = { get db() { return DB; }, todayPlan: todayPlan, streakAt: streakAt, buildSummary: buildSummary, importText: importText, checkTyped: checkTyped, clozeParts: clozeParts };
})();
