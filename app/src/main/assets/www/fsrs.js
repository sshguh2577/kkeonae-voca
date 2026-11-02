/*
 * 꺼내보카 - 복습 계산 엔진
 * FSRS-5 (Free Spaced Repetition Scheduler) 공개 알고리즘을 기본 파라미터로 구현.
 * 카드 상태: 0 새 단어, 1 처음 익히는 중, 2 복습, 3 다시 익히는 중
 * 평가: 1 몰랐음, 3 알았음, 4 이미 앎 (2는 쓰지 않음)
 */
(function (root) {
  'use strict';

  var W = [0.40255, 1.18385, 3.173, 15.69105, 7.1949, 0.5345, 1.4604, 0.0046,
    1.54575, 0.1192, 1.01925, 1.9395, 0.11, 0.29605, 2.2698, 0.2315, 2.9898,
    0.51655, 0.6621];
  var DECAY = -0.5;
  var FACTOR = Math.pow(0.9, 1 / DECAY) - 1; // 19/81
  var DAY = 86400000;
  var MIN = 60000;
  var MIN_S = 0.01;

  var LEARN_STEPS = [1 * MIN, 10 * MIN];
  var RELEARN_STEPS = [10 * MIN];

  function clamp(x, a, b) { return Math.min(b, Math.max(a, x)); }

  /* ---------- 날짜 (하루 시작 시각 기준) ---------- */
  function pad2(n) { return (n < 10 ? '0' : '') + n; }
  function dayKey(ms, dsh) {
    var d = new Date(ms - dsh * 3600000);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function keyParts(key) {
    var p = key.split('-');
    return [parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10)];
  }
  function dayStartOfKey(key, dsh) {
    var p = keyParts(key);
    return new Date(p[0], p[1], p[2], dsh, 0, 0, 0).getTime();
  }
  function addDaysKey(key, n) {
    var p = keyParts(key);
    var d = new Date(p[0], p[1], p[2] + n, 12, 0, 0, 0);
    return d.getFullYear() + '-' + pad2(d.getMonth() + 1) + '-' + pad2(d.getDate());
  }
  function daysBetweenKeys(a, b) { // b - a
    var pa = keyParts(a), pb = keyParts(b);
    var ta = Date.UTC(pa[0], pa[1], pa[2]), tb = Date.UTC(pb[0], pb[1], pb[2]);
    return Math.round((tb - ta) / DAY);
  }

  /* ---------- FSRS 수식 ---------- */
  function initS(g) { return Math.max(W[g - 1], 0.1); }
  function initD(g) { return clamp(W[4] - Math.exp(W[5] * (g - 1)) + 1, 1, 10); }
  function retrievability(elapsedDays, S) {
    if (!(S > 0)) return 0;
    return Math.pow(1 + FACTOR * Math.max(0, elapsedDays) / S, DECAY);
  }
  function nextD(D, g) {
    var delta = -W[6] * (g - 3);
    var d2 = D + delta * (10 - D) / 9;
    return clamp(W[7] * initD(4) + (1 - W[7]) * d2, 1, 10);
  }
  function shortTermS(S, g) {
    return Math.max(MIN_S, S * Math.exp(W[17] * (g - 3 + W[18])));
  }
  function recallS(D, S, R, g) {
    var hard = g === 2 ? W[15] : 1;
    var easy = g === 4 ? W[16] : 1;
    return S * (1 + Math.exp(W[8]) * (11 - D) * Math.pow(S, -W[9]) *
      (Math.exp((1 - R) * W[10]) - 1) * hard * easy);
  }
  function forgetS(D, S, R) {
    var longTerm = W[11] * Math.pow(D, -W[12]) * (Math.pow(S + 1, W[13]) - 1) *
      Math.exp((1 - R) * W[14]);
    var shortTerm = S / Math.exp(W[17] * W[18]);
    return Math.max(MIN_S, Math.min(longTerm, shortTerm));
  }
  function intervalDays(S, retention) {
    var ivl = S / FACTOR * (Math.pow(retention, 1 / DECAY) - 1);
    return clamp(Math.round(ivl), 1, 36500);
  }
  function fuzzDays(ivl, rnd) {
    if (ivl < 3) return ivl;
    var f = Math.max(1, Math.round(ivl * 0.05));
    return Math.max(1, ivl + Math.round((rnd() * 2 - 1) * f));
  }

  /*
   * 카드 한 장을 평가해서 새 상태를 돌려준다.
   * opts: { retention, dsh(하루 시작 시각), fuzz(bool), rnd(fn) }
   */
  function schedule(card, g, now, opts) {
    var retention = opts.retention || 0.9;
    var dsh = opts.dsh == null ? 4 : opts.dsh;
    var rnd = opts.rnd || Math.random;
    var c = {
      st: card.st || 0, step: card.step || 0, S: card.S || 0, D: card.D || 0,
      due: card.due || 0, last: card.last || 0, reps: card.reps || 0,
      lapses: card.lapses || 0
    };
    var elapsed = c.last ? (now - c.last) / DAY : 0;
    var sameDay = c.last && dayKey(c.last, dsh) === dayKey(now, dsh);
    var todayKey = dayKey(now, dsh);

    function toReview() {
      var ivl = intervalDays(c.S, retention);
      if (opts.fuzz) ivl = fuzzDays(ivl, rnd);
      c.st = 2; c.step = 0;
      c.due = dayStartOfKey(addDaysKey(todayKey, ivl), dsh);
      return ivl;
    }

    var ivlDays = 0;
    if (c.st === 0) {
      c.S = initS(g); c.D = initD(g);
      if (g === 4) { ivlDays = toReview(); }
      else if (g === 1) { c.st = 1; c.step = 0; c.due = now + LEARN_STEPS[0]; }
      else { c.st = 1; c.step = 1; c.due = now + LEARN_STEPS[1]; }
    } else if (c.st === 1 || c.st === 3) {
      var steps = c.st === 1 ? LEARN_STEPS : RELEARN_STEPS;
      if (sameDay || !c.last) { c.S = shortTermS(c.S, g); }
      else {
        var R0 = retrievability(elapsed, c.S);
        c.S = g === 1 ? forgetS(c.D, c.S, R0) : recallS(c.D, c.S, R0, g);
      }
      c.D = nextD(c.D, g);
      if (g === 1) { c.step = 0; c.due = now + steps[0]; }
      else if (g === 4) { ivlDays = toReview(); }
      else {
        var nextStep = c.step + 1;
        if (nextStep < steps.length) { c.step = nextStep; c.due = now + steps[nextStep]; }
        else { ivlDays = toReview(); }
      }
    } else { // 복습 카드
      var R = retrievability(elapsed, c.S);
      if (g === 1) {
        c.S = sameDay ? shortTermS(c.S, g) : forgetS(c.D, c.S, R);
        c.D = nextD(c.D, g);
        c.lapses += 1;
        c.st = 3; c.step = 0; c.due = now + RELEARN_STEPS[0];
      } else {
        c.S = sameDay ? shortTermS(c.S, g) : recallS(c.D, c.S, R, g);
        c.D = nextD(c.D, g);
        ivlDays = toReview();
      }
    }
    c.reps += 1;
    c.last = now;
    return { card: c, ivlDays: ivlDays };
  }

  /* 버튼 아래 보여 줄 다음 복습 시점 (흔들림 없이) */
  function preview(card, g, now, opts) {
    var o = { retention: opts.retention, dsh: opts.dsh, fuzz: false };
    var r = schedule(card, g, now, o);
    if (r.card.st === 2) return { days: Math.round((r.card.due - dayStartOfKey(dayKey(now, o.dsh), o.dsh)) / DAY) };
    return { minutes: Math.max(1, Math.round((r.card.due - now) / MIN)) };
  }

  function humanizePreview(p) {
    if (p.minutes != null) return p.minutes < 60 ? p.minutes + '분' : Math.round(p.minutes / 60) + '시간';
    var d = p.days;
    if (d < 14) return d + '일';
    if (d < 60) return Math.round(d / 7) + '주';
    if (d < 365) return Math.round(d / 30) + '달';
    var y = d / 365;
    return (y < 10 ? Math.round(y * 10) / 10 : Math.round(y)) + '년';
  }

  root.FSRS = {
    W: W, DAY: DAY, MIN: MIN,
    dayKey: dayKey, dayStartOfKey: dayStartOfKey, addDaysKey: addDaysKey,
    daysBetweenKeys: daysBetweenKeys,
    retrievability: retrievability, intervalDays: intervalDays,
    schedule: schedule, preview: preview, humanizePreview: humanizePreview
  };
})(typeof window !== 'undefined' ? window : globalThis);
