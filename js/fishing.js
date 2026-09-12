// Camp fishing: one button, one local clock, no effect on the running economy.
(function (global) {
  'use strict';
  var ENTRY = { x: 174, y: 8, w: 58, h: 22 };
  var BACK = { x: 178, y: 8, w: 54, h: 22 };
  var CAST_MS = 260, BITE_MS = 900, LAND_MS = 450, RESULT_GUARD_MS = 400;
  var FISH = [
    { name: 'MINNOW', min: 6, max: 14, color: 15 },
    { name: 'PERCH', min: 14, max: 28, color: 19 },
    { name: 'TROUT', min: 22, max: 40, color: 21 }
  ];
  function random(s) {
    var x = s.rng;
    x ^= x << 13; x ^= x >>> 17; x ^= x << 5;
    s.rng = x >>> 0;
    return s.rng / 4294967296;
  }
  function create(seed) {
    return { rng: (seed >>> 0) || 1, phase: 'idle', ms: 0, clock: 0,
      waitMs: 0, count: 0, largest: 0, fish: null, message: '', bobX: 150 };
  }
  function cast(s) {
    s.phase = 'cast'; s.ms = 0; s.message = ''; s.fish = null;
    s.waitMs = 1400 + Math.floor(random(s) * 2200);
    s.bobX = 132 + Math.floor(random(s) * 56);
  }
  function miss(s, message) { s.phase = 'result'; s.ms = 0; s.message = message; }
  function tap(s) {
    if (s.phase === 'idle' || (s.phase === 'result' && s.ms >= RESULT_GUARD_MS)) {
      cast(s); return true;
    }
    if (s.phase === 'wait') { miss(s, 'TOO SOON'); return true; }
    if (s.phase !== 'bite') return false;
    var roll = random(s), type = roll < 0.5 ? 0 : roll < 0.85 ? 1 : 2;
    var kind = FISH[type];
    s.fish = { type: type, name: kind.name, cm: kind.min + Math.floor(random(s) * (kind.max - kind.min + 1)) };
    s.count++; s.largest = Math.max(s.largest, s.fish.cm);
    s.phase = 'land'; s.ms = 0;
    return true;
  }
  function update(s, dt) {
    if (!s || !isFinite(dt) || dt <= 0) return;
    var left = dt * 1000;
    s.clock = (s.clock + left) % 60000;
    // Carry elapsed time across phase boundaries; long frames cannot extend a bite.
    while (left > 0) {
      var limit = s.phase === 'cast' ? CAST_MS : s.phase === 'wait' ? s.waitMs
        : s.phase === 'bite' ? BITE_MS : s.phase === 'land' ? LAND_MS : Infinity;
      var used = Math.min(left, limit - s.ms);
      s.ms += used; left -= used;
      if (s.ms + 1e-7 < limit) break;
      if (s.phase === 'cast') s.phase = 'wait';
      else if (s.phase === 'wait') s.phase = 'bite';
      else if (s.phase === 'bite') { miss(s, 'GOT AWAY'); continue; }
      else if (s.phase === 'land') { s.phase = 'result'; s.message = s.fish.name + ' ' + s.fish.cm + 'cm'; }
      s.ms = 0;
    }
  }
  function leave(s) {
    // Keep this run's catches; abandon only the unfinished cast.
    if (s) { s.phase = 'idle'; s.ms = 0; s.fish = null; s.message = ''; }
  }
  function contains(r, x, y) { return x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h; }
  function button(ctx, r, text, pressed) {
    var P = global.DotPalette.COLORS, F = global.DotFont;
    ctx.fillStyle = P[15]; ctx.fillRect(r.x, r.y, r.w, r.h);
    ctx.fillStyle = P[pressed ? 14 : 10]; ctx.fillRect(r.x + 1, r.y + 1, r.w - 2, r.h - 2);
    F.drawText(ctx, text, r.x + Math.floor((r.w - F.textWidth(text.length)) / 2), r.y + Math.floor((r.h - F.GLYPH_H) / 2), P[16]);
  }
  function draw(ctx, s, pressed, paused) {
    var P = global.DotPalette.COLORS, F = global.DotFont;
    function box(x, y, w, h, color) { ctx.fillStyle = P[color]; ctx.fillRect(Math.round(x), Math.round(y), w, h); }
    function text(label, x, y, color) { F.drawText(ctx, label, x, y, P[color]); }
    function center(label, y, color) { text(label, Math.floor((240 - F.textWidth(label.length)) / 2), y, color); }
    function line(x0, y0, x1, y1, color) {
      var n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0));
      for (var i = 0; i <= n; i++) box(x0 + (x1 - x0) * i / (n || 1), y0 + (y1 - y0) * i / (n || 1), 1, 1, color);
    }
    function fish(x, y, type) {
      var c = FISH[type].color;
      box(x, y + 1, 7, 3, c); box(x + 2, y, 3, 5, c);
      box(x - 2, y, 1, 5, c); box(x - 1, y + 1, 1, 3, c); box(x + 5, y + 1, 1, 1, 10);
    }
    // A separate waterside view over the unmodified camp art.
    box(6, 5, 228, 150, 14); box(7, 6, 226, 148, 10);
    box(8, 7, 224, 36, 10);
    var records = s.records || {};
    text('FISHING ' + Object.keys(records).length + ' OF 3', 14, 14, 16);
    button(ctx, BACK, 'BACK', pressed === 'back');
    text('CATCH ' + s.count, 14, 32, 15);
    var recordBest = Math.max.apply(null, [s.largest, 0].concat(Object.keys(records).map(function (id) { return records[id]; })));
    text('BEST ' + recordBest + 'cm', 128, 32, 15);
    box(8, 44, 224, 78, 10);
    // Water and shoreline use the existing palette, integer pixels only.
    box(9, 77, 222, 44, 0); box(9, 95, 222, 26, 10);
    for (var w = 0; w < 9; w++) {
      var wx = 86 + w * 16 + Math.floor(s.clock / 350 + w) % 4;
      box(wx, 82 + (w % 4) * 10, 5 + w % 3, 1, w % 2 ? 22 : 8);
    }
    box(9, 85, 57, 36, 38); box(9, 83, 62, 3, 12);
    box(59, 86, 11, 9, 37); box(66, 94, 8, 27, 38);
    // Reuse the player's existing camp pose, without changing its pixels.
    var A = global.DotCampWalkRight;
    if (A && A.FRAMES.length) {
      var f = A.FRAMES[0], ox = 43 - Math.round(A.CELL / 2) + f.x, oy = 84 - A.FEET_ROW + f.y;
      for (var r = 0; r < f.rows.length; r++) for (var c = 0; c < f.rows[r].length; c++) {
        var ch = f.rows[r][c];
        if (ch !== '.') box(ox + c, oy + r, 1, 1, global.DotPalette.indexOfChar(ch));
      }
    }
    line(50, 70, 81, 49, 36); line(51, 70, 82, 49, 19);
    var bx = s.bobX, by = 90 + Math.floor(s.clock / 300) % 2;
    if (s.phase === 'cast') {
      var t = s.ms / CAST_MS;
      bx = 82 + (s.bobX - 82) * t; by = 49 + 41 * t - Math.sin(t * Math.PI) * 18;
    }
    var nibble = s.phase === 'wait' && s.ms > s.waitMs * 0.48 && s.ms < s.waitMs * 0.48 + 130;
    if (nibble) by += 1;
    if (s.phase === 'bite') {
      by += 4; box(bx - 5, 91, 3, 1, 16); box(bx + 3, 91, 3, 1, 16);
      box(bx, 72, 1, 3, 19); box(bx, 76, 1, 1, 19);
    }
    if (s.phase === 'cast' || s.phase === 'wait' || s.phase === 'bite') {
      line(82, 49, Math.round(bx), Math.round(by), 15);
      box(bx, by - 3, 1, 2, 16); box(bx - 1, by - 1, 3, 2, 17); box(bx, by + 1, 1, 2, 16);
    } else if (s.phase === 'land') {
      var p = s.ms / LAND_MS;
      fish(s.bobX + (94 - s.bobX) * p, 89 - Math.sin(p * Math.PI / 2) * 32, s.fish.type);
    } else if (s.phase === 'result' && s.fish) fish(117, 64, s.fish.type);
    var label = s.phase === 'idle' ? 'TAP TO CAST' : s.phase === 'cast' ? 'CAST...'
      : s.phase === 'wait' ? 'WAIT...' : s.phase === 'bite' ? 'PULL!'
      : s.phase === 'land' ? 'CAUGHT!' : s.message;
    center(paused ? 'PAUSED' : label, 130, s.phase === 'bite' || s.fish ? 19 : 16);
    if (s.phase === 'result' && s.ms >= RESULT_GUARD_MS && !paused) center('TAP TO CAST', 143, 15);
    if (s.phase === 'idle' && !paused) center('PULL WHEN IT BITES', 143, 15);
  }
  global.DotFishing = { create: create, tap: tap, update: update, leave: leave, draw: draw,
    button: button, contains: contains, ENTRY: ENTRY, BACK: BACK,
    CAST_MS: CAST_MS, BITE_MS: BITE_MS, LAND_MS: LAND_MS, RESULT_GUARD_MS: RESULT_GUARD_MS };
})(typeof window !== 'undefined' ? window : globalThis);
