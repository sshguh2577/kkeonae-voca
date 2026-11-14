// 꺼내보카 공 캐릭터. 컨트리볼 그림체(삐뚤빼뚤한 공, 눈동자 없는 흰 눈, 입·팔다리 없음)로 직접 그렸다.
// 국기 무늬는 쓰지 않는다. 볼륨(사서, 파란 공): 토익 / 노래 친구(황혼색 공, 선글라스·기타): 노래
// FICE(대학생): 금융보험은 초록 공에 학사모·동전, 토목은 연두 공에 안전모·계산기 (1.0.18)
(function (root) {
  'use strict';
  var INK = '#1B2233';
  var gradSeq = 0; // 그러데이션 id를 그림마다 따로 둔다 (같은 id가 여러 번 있으면 숨은 그림의 것을 가리킬 수 있다)
  function f(n) { return String(Math.round(n * 10) / 10); }
  function prng(seed) { var s = seed % 2147483647; if (s <= 0) s += 2147483646; return function () { s = s * 16807 % 2147483647; return (s - 1) / 2147483646; }; }
  // 손으로 그린 듯 살짝 찌그러진 공
  function blob(rx, ry, seed, jit) {
    var rnd = prng(seed), n = 14, pts = [], i;
    for (i = 0; i < n; i++) { var a = Math.PI * 2 * i / n, k = 1 + (rnd() - 0.5) * 2 * jit; pts.push([Math.cos(a) * rx * k, Math.sin(a) * ry * k]); }
    var d = 'M' + f(pts[0][0]) + ' ' + f(pts[0][1]);
    for (i = 0; i < n; i++) {
      var p0 = pts[(i + n - 1) % n], p1 = pts[i], p2 = pts[(i + 1) % n], p3 = pts[(i + 2) % n];
      d += ' C' + f(p1[0] + (p2[0] - p0[0]) / 6) + ' ' + f(p1[1] + (p2[1] - p0[1]) / 6) + ' ' + f(p2[0] - (p3[0] - p1[0]) / 6) + ' ' + f(p2[1] - (p3[1] - p1[1]) / 6) + ' ' + f(p2[0]) + ' ' + f(p2[1]);
    }
    return d + ' Z';
  }
  var WHO = {
    vol: { d: blob(91, 90, 7, 0.011), fill: '#6C9AEA', shade: '#4C7BD0' },
    fice: { d: blob(91, 90, 31, 0.011), fill: '#5CBF99', shade: '#3F9F7C' },
    civb: { d: blob(91, 90, 53, 0.011), fill: '#93C95E', shade: '#72AA41' },
    mus: { d: blob(91, 90, 7, 0.011), shade: '#D2643C', dusk: true } // 황혼색: 위는 노랑, 아래로 갈수록 주홍
  };
  function P(d, fill, sw, extra) {
    return '<path d="' + d + '" fill="' + (fill || 'none') + '"' + (sw ? ' stroke="' + INK + '" stroke-width="' + sw + '" stroke-linejoin="round" stroke-linecap="round"' : '') + (extra ? ' ' + extra : '') + '/>';
  }
  function body(who) {
    var w = WHO[who], fill = w.fill, defs = '';
    if (w.dusk) {
      var id = 'kk-dusk-' + (++gradSeq);
      defs = '<defs><linearGradient id="' + id + '" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#FFD86E"/><stop offset=".52" stop-color="#FFA552"/><stop offset="1" stop-color="#F2795A"/></linearGradient></defs>';
      fill = 'url(#' + id + ')';
    }
    return defs + P(w.d, w.shade) + '<g transform="translate(-4 -5) scale(.93)">' + P(w.d, fill) + '</g>' +
      '<path d="M-58 -52 C-48 -66 -34 -74 -20 -77" fill="none" stroke="#FFFFFF" stroke-width="7" stroke-linecap="round" opacity=".35"/>' + P(w.d, null, 4.2);
  }
  // 눈: 흰 눈에 검은 테, 눈동자 없음. 기분은 눈 모양으로만 나타낸다
  function eyes(mood, ex, ey) {
    var W = 'fill="#FFFFFF" stroke="' + INK + '" stroke-width="3.6" stroke-linejoin="round" stroke-linecap="round"';
    function one(sx) {
      var cx = sx * ex;
      if (mood === 'happy') return '<path d="M' + f(cx - 17) + ' ' + f(ey + 7) + ' C' + f(cx - 17) + ' ' + f(ey - 27) + ' ' + f(cx + 17) + ' ' + f(ey - 27) + ' ' + f(cx + 17) + ' ' + f(ey + 7) + ' Q' + f(cx) + ' ' + f(ey - 10) + ' ' + f(cx - 17) + ' ' + f(ey + 7) + ' Z" ' + W + '/>';
      if (mood === 'sleep') return '<path d="M' + f(cx - 16) + ' ' + f(ey) + ' Q' + f(cx) + ' ' + f(ey + 12) + ' ' + f(cx + 16) + ' ' + f(ey) + '" fill="none" stroke="' + INK + '" stroke-width="3.8" stroke-linecap="round"/>';
      if (mood === 'worry') return '<path d="M' + f(cx + sx * 16) + ' ' + f(ey - 7.9) + ' A17 23 0 1 ' + (sx < 0 ? 0 : 1) + ' ' + f(cx - sx * 8.5) + ' ' + f(ey - 19.9) + ' Z" ' + W + '/>';
      return '<ellipse cx="' + f(cx) + '" cy="' + f(ey) + '" rx="17" ry="23" ' + W + '/>';
    }
    return one(-1) + one(1);
  }
  function zzz() {
    return '<g fill="none" stroke="currentColor" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"><path d="M70 -86 h13 l-13 14 h13"/><path d="M92 -112 h9 l-9 10 h9"/></g>';
  }
  function glasses(ex, ey) {
    var s = '';
    [-1, 1].forEach(function (sx) { s += '<circle cx="' + sx * ex + '" cy="' + ey + '" r="27" fill="#FFFFFF" fill-opacity=".2" stroke="' + INK + '" stroke-width="3.4"/>'; });
    return s + '<path d="M-3 ' + (ey - 5) + ' Q0 ' + (ey - 9) + ' 3 ' + (ey - 5) + ' M' + (-ex - 26.5) + ' ' + (ey - 5) + ' L-87 ' + (ey - 14) + ' M' + (ex + 26.5) + ' ' + (ey - 5) + ' L87 ' + (ey - 14) + '" fill="none" stroke="' + INK + '" stroke-width="3.4" stroke-linecap="round"/>';
  }
  function shades() {
    var L = 'M-47 -42 H-6 C-3 -42 -2 -40 -3 -36 L-6 -21 C-8 -11 -15 -6 -26 -6 C-37 -6 -45 -13 -47 -25 Z';
    return P('M-8 -38 H8', null, 5.5) + P('M-47 -38 L-87 -45 M47 -38 L87 -45', null, 4) + P(L, INK, 3) + '<g transform="scale(-1 1)">' + P(L, INK, 3) + '</g>' +
      '<path d="M-39 -34 l8 0 M-39 -28 l4 0 M15 -34 l8 0 M15 -28 l4 0" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" opacity=".75"/>';
  }
  function book() {
    return '<g transform="translate(44 58) rotate(-9)"><rect x="-27" y="-19" width="60" height="45" rx="3" fill="#FFF8E7" stroke="' + INK + '" stroke-width="3"/>' +
      '<rect x="-32" y="-24" width="60" height="45" rx="4" fill="#E2574C" stroke="' + INK + '" stroke-width="3.2"/><path d="M-22 -24 V21" stroke="' + INK + '" stroke-width="2.4"/>' +
      '<rect x="-16" y="-15" width="38" height="16" rx="2.5" fill="#FFF4D6" stroke="' + INK + '" stroke-width="2"/>' +
      '<text x="3" y="-2.6" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-weight="700" font-size="11.5" fill="' + INK + '">VOCA</text>' +
      '<path d="M-14 9 H18" stroke="#FFFFFF" stroke-width="2.6" stroke-linecap="round" opacity=".7"/></g>';
  }
  // 전기기타: 뿔 두 개인 일반적인 솔리드 바디 (상표·로고 없음)
  function guitar() {
    var BODY = 'M-46 2 C-47 -16 -40 -33 -26 -33 C-16 -33 -10 -26 -2 -25 C6 -24 10 -31 18 -34 C28 -38 40 -41 42 -35 C43 -30 34 -22 28 -15 C26 -12 27 -8 30 -6 L30 6 C27 8 26 12 28 15 C32 20 40 26 38 31 C36 36 26 34 18 30 C10 27 4 28 -4 30 C-14 33 -20 37 -28 36 C-40 35 -46 20 -46 2 Z';
    var GUARD = 'M27 -13 C19 -22 8 -23 0 -19 C-8 -16 -15 -14 -17 -6 L-19 7 C-23 13 -30 19 -27 25 C-21 30 -8 28 2 26 C12 24 23 22 28 14 Z';
    var s = '<g transform="translate(-20 54) rotate(-20) scale(.98)">';
    s += P('M28 -5.4 L118 -4.4 L118 4.4 L28 5.4 Z', '#EBCB92', 3);
    s += P('M118 -5.2 C124 -7 130 -9 138 -9.5 C146 -10 151 -7 150 -2 C149 3 142 5.5 134 6 C128 6.3 122 5.6 118 5.2 Z', '#EBCB92', 3);
    s += '<g fill="' + INK + '"><circle cx="126" cy="-10" r="2.2"/><circle cx="134" cy="-11.8" r="2.2"/><circle cx="142" cy="-12" r="2.2"/><circle cx="149" cy="-9.4" r="2.2"/></g>';
    s += '<path d="M106 -4.6 V4.6 M94 -4.7 V4.7 M81 -4.9 V4.9 M67 -5 V5 M52 -5.1 V5.1 M38 -5.3 V5.3" stroke="' + INK + '" stroke-width="1.5" opacity=".55"/>';
    s += P(BODY, '#E5483F', 3.4);
    s += P(GUARD, '#FFFDF6', 2.2);
    s += '<g fill="#FFFDF6" stroke="' + INK + '" stroke-width="1.8"><rect x="12.5" y="-10" width="6" height="20" rx="3"/><rect x="-1.5" y="-10" width="6" height="20" rx="3"/><rect x="-15" y="-10.5" width="6" height="21" rx="3" transform="rotate(-9 -12 0)"/></g>';
    s += '<rect x="-31" y="-10" width="9" height="20" rx="2" fill="#D8DCE6" stroke="' + INK + '" stroke-width="1.8"/>';
    s += '<g fill="#FFFDF6" stroke="' + INK + '" stroke-width="1.8"><circle cx="-11" cy="19" r="3.6"/><circle cx="1" cy="20.5" r="3.6"/></g>';
    s += '<path d="M-27 -5 L118 -2.6 M-27 0 L118 0 M-27 5 L118 2.6" stroke="' + INK + '" stroke-width="1" opacity=".5"/>';
    return s + '</g>';
  }
  function notes() {
    return '<g fill="currentColor" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><g transform="translate(-104 -74) rotate(-10)"><path d="M6 0 V-24 L22 -28 V-5" fill="none" stroke-width="3.6"/><ellipse cx="0.5" cy="0.5" rx="6.5" ry="5" stroke-width="1"/><ellipse cx="16.5" cy="-4.5" rx="6.5" ry="5" stroke-width="1"/></g>' +
      '<g transform="translate(96 -92) rotate(12)"><path d="M6 0 V-22 C12 -20 16 -16 15 -9" fill="none" stroke-width="3.6"/><ellipse cx="0.5" cy="0.5" rx="6.5" ry="5" stroke-width="1"/></g></g>';
  }
  function gradCap() {
    return '<g transform="rotate(-7 0 -90)">' + P('M-38 -100 L-38 -78 C-20 -66 20 -66 38 -78 L38 -100 L0 -86 Z', '#2B3147', 3.6) +
      P('M0 -130 L66 -108 L0 -86 L-66 -108 Z', '#3A4160', 3.6) +
      '<path d="M0 -108 Q34 -106 48 -92 V-74" fill="none" stroke="#F6C24A" stroke-width="3.6" stroke-linecap="round"/><path d="M43 -74 H53 L55 -58 H41 Z" fill="#F6C24A" stroke="' + INK + '" stroke-width="2.2" stroke-linejoin="round"/>' +
      '<circle cx="0" cy="-108" r="4.4" fill="#F6C24A" stroke="' + INK + '" stroke-width="2"/></g>';
  }
  function hardHat() {
    return P('M-66 -60 C-70 -106 -36 -134 0 -134 C36 -134 70 -106 66 -60 Z', '#FFD23F', 3.8) +
      '<path d="M30 -124 C52 -112 64 -90 63 -62 L44 -62 C46 -86 42 -108 30 -124 Z" fill="#EDB21E" opacity=".75"/>' +
      P('M-9 -133 C-11 -110 -11 -86 -10 -62 L10 -62 C11 -86 11 -110 9 -133', '#FFE27A', 2.6) +
      P('M-86 -58 C-86 -67 -70 -71 0 -71 C70 -71 86 -67 86 -58 C86 -49 70 -45 0 -45 C-70 -45 -86 -49 -86 -58 Z', '#FFD23F', 3.8) +
      '<path d="M-52 -106 C-46 -116 -36 -123 -26 -127" fill="none" stroke="#FFF3B8" stroke-width="6" stroke-linecap="round"/>';
  }
  function calc() {
    var k = '';
    for (var r = 0; r < 3; r++) for (var c = 0; c < 3; c++) k += '<rect x="' + (-13 + c * 9.4) + '" y="' + (-3 + r * 8) + '" width="7" height="5.6" rx="1.4" fill="' + (r === 0 && c === 2 ? '#FFD166' : r === 2 && c === 2 ? '#FF8A7A' : '#F1F3F8') + '"/>';
    return '<g transform="translate(54 54) rotate(10)"><rect x="-20" y="-27" width="40" height="54" rx="6" fill="#5D6885" stroke="' + INK + '" stroke-width="3.2"/>' +
      '<rect x="-14" y="-21" width="28" height="12" rx="2.5" fill="#C8F0C0" stroke="' + INK + '" stroke-width="2"/><path d="M-2 -15 H9" stroke="#2F6B3A" stroke-width="2.2" stroke-linecap="round"/>' + k + '</g>';
  }
  // 동전: 원(₩) 표시는 글꼴 대신 선으로 그린다
  function coin() {
    return '<g transform="translate(56 58) rotate(-10)"><circle cx="4" cy="5" r="24" fill="#D9A21B" stroke="' + INK + '" stroke-width="3.2"/>' +
      '<circle cx="0" cy="0" r="24" fill="#F6C24A" stroke="' + INK + '" stroke-width="3.2"/><circle cx="0" cy="0" r="17" fill="none" stroke="#C98F12" stroke-width="2"/>' +
      '<path d="M-10 -9 L-5 9 L0 -2 L5 9 L10 -9 M-12 -1 H12 M-12 4 H12" fill="none" stroke="' + INK + '" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>' +
      '<path d="M-15 -11 Q-9 -18 -1 -19" fill="none" stroke="#FFF3C4" stroke-width="3" stroke-linecap="round"/></g>';
  }
  function sweat() { return '<path d="M-84 -66 C-78 -56 -74 -50 -74 -44 C-74 -37 -79 -33 -84 -33 C-89 -33 -94 -37 -94 -44 C-94 -50 -90 -56 -84 -66 Z" fill="#A9D8F7" stroke="' + INK + '" stroke-width="2.6" stroke-linejoin="round"/>'; }
  function bandaid() {
    return '<g transform="translate(-52 30) rotate(-38)"><rect x="-15" y="-6.5" width="30" height="13" rx="6.5" fill="#F6CFA6" stroke="' + INK + '" stroke-width="2.4"/><rect x="-5.5" y="-6.5" width="11" height="13" fill="#FBE3C7" stroke="' + INK + '" stroke-width="1.6"/></g>';
  }
  // kind: lib(사서) · rock(노래 친구) · fin(금융보험) · civ(토목) · vol(파란 공 얼굴) · fice(금융보험 얼굴) · civf(토목 얼굴) / mood: idle · happy · sleep
  function inner(kind, mood) {
    mood = mood || 'idle';
    var s = '<ellipse cx="0" cy="97" rx="68" ry="8" fill="#1D2B45" opacity=".13"/>';
    if (kind === 'lib' || kind === 'vol') {
      s += body('vol') + eyes(mood, 29, -22) + glasses(29, -22);
      if (kind === 'lib') s += book();
    } else if (kind === 'rock') {
      s += body('mus') + shades() + guitar() + notes();
    } else if (kind === 'civ' || kind === 'civf') {
      s += body('civb') + eyes(mood, 24, -10) + (kind === 'civ' ? bandaid() : '') + hardHat() + (kind === 'civ' ? calc() : '');
    } else {
      s += body('fice') + eyes(mood === 'idle' && kind === 'fin' ? 'worry' : mood, 24, -16) + gradCap();
      if (kind === 'fin') s += (mood === 'idle' ? sweat() : '') + coin();
    }
    if (mood === 'sleep' && kind !== 'rock') s += zzz();
    return s;
  }
  var BOX = { vol: [34, 46, 192, 192], fice: [30, 4, 200, 236], civf: [30, 4, 200, 236] };
  function svg(kind, mood, px, label) {
    var b = BOX[kind] || [0, 0, 260, 250];
    px = px || 96;
    return '<svg class="ball ball-' + kind + '" viewBox="' + b.join(' ') + '" width="' + px + '" height="' + Math.round(px * b[3] / b[2]) + '"' +
      (label ? ' role="img" aria-label="' + label + '"' : ' aria-hidden="true"') + ' xmlns="http://www.w3.org/2000/svg"><g transform="translate(130 140)">' + inner(kind, mood) + '</g></svg>';
  }
  root.KKBalls = { svg: svg };
})(typeof window !== 'undefined' ? window : globalThis);
if (typeof module !== 'undefined' && module.exports) module.exports = globalThis.KKBalls;
