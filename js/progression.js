// Permanent journey knowledge. Wallet, HP and upgrade levels never enter this save.
(function (global) {
  'use strict';
  var KEY = 'dotollie-journey-v1', profile = null;
  // ★★★★★`caps` …… **転生で伸びた上限**（2026-09-12 島さんの指定）
  //   ★例: `{ speed: 3, coin: 5 }` ＝ SPEED の天井が +3、COIN が +5 伸びている。
  //   ★★`rank` は**転生した回数**です（★上限はありません）。
  //   ★★★これまでこの保存には「足跡」しか入れていませんでしたが、
  //     ★**島さんが「残るのは記録だけにこだわらない」と決めた**ので、
  //     ★★**初めて「力になるもの」が永久に残ります**。
  function fresh() { return { version: 1, rank: 0, ready: false, tricks: {}, doubleJump: false, fish: {}, routes: {}, lastDistance: 0, caps: {} }; }
  // ★上限が伸びる項目（★`js/upgrades.js` の id とそろえること）
  var CAP_IDS = ['speed', 'stamina', 'coin', 'rail'];
  function read(key) { try { return JSON.parse(global.localStorage.getItem(key)); } catch (e) { return null; } }
  function save() { try { global.localStorage.setItem(KEY, JSON.stringify(profile)); } catch (e) { /* Play remains available. */ } }
  function load() {
    var raw = read(KEY); profile = fresh();
    if (raw && raw.version === 1) {
      // ★★★★★2026-09-12、**`=== 1` の頭打ちを外しました**。
      //   ★前は 1 以外を全部 0 に潰していたので、★★**転生 2 回目が保存できません**でした。
      profile.rank = (Number.isFinite(raw.rank) && raw.rank > 0) ? Math.floor(raw.rank) : 0;
      // ★★伸びた上限を読む。★★★**id と数を確かめてから**入れる
      //   （★ほかの項目（魚の大きさ・距離）とまったく同じ作法。
      //   ★★壊れた保存を読んでも、★★★**遅びが壊れない**）
      CAP_IDS.forEach(function (id) {
        var v = raw.caps && raw.caps[id];
        if (Number.isFinite(v) && v > 0) profile.caps[id] = Math.floor(v);
      });
      profile.ready = false;
      profile.lastDistance = Number.isFinite(raw.lastDistance) ? Math.max(0, Math.floor(raw.lastDistance)) : 0;
      if (raw.routes && raw.routes.ridge === true) profile.routes.ridge = true;
      profile.doubleJump = raw.doubleJump === true;
      ['kickflip', 'pop'].forEach(function (id) { if (raw.tricks && raw.tricks[id] === true) profile.tricks[id] = true; });
      ['0', '1', '2'].forEach(function (id) {
        var cm = raw.fish && raw.fish[id];
        if (Number.isFinite(cm) && cm >= 6 && cm <= 40) profile.fish[id] = Math.floor(cm);
      });
    } else {
      // Existing players keep purchased actions and an already reached 5000m milestone.
      var old = read('dotollie-upg'), best = Number(read('dotollie-best'));
      ['kickflip', 'pop'].forEach(function (id) { if (old && old.un && old.un[id] === true) profile.tricks[id] = true; });
      profile.doubleJump = Number.isFinite(best) && best >= 5000;
    }
    if (profile.rank === 1) profile.tricks.kickflip = true;
    save(); return snapshot();
  }
  function get() { if (!profile) load(); return profile; }
  function snapshot() { return JSON.parse(JSON.stringify(get())); }
  function learn(id) {
    var p = get();
    if (id === 'doubleJump') p.doubleJump = true;
    else if (id === 'kickflip' || id === 'pop') p.tricks[id] = true;
    else return;
    save();
  }
  // ============================================================
  // ★★★★★転生（2026-09-12 島さんの指定）
  // ============================================================
  //
  //   ★受け取るのは「★★**その瞬間 MAX だった項目**」の id 一覧。
  //   ★★★**MAX でなかった項目は伸びません**（★島さんの指定）。
  //     ★これが「早く転生する／もっと育ててから転生する」の選択を作っています。
  //
  //   ★★★★**AI へ: ここで `tricks` / `doubleJump` / `fish` に触らないこと**
  //     （★差し出すのはコイン・レベル・道具と、いま走った距離だけ。
  //     ★★BEST も技も二段ジャンプも残ります）。
  function prestige(ids, step) {
    var p = get(), n = Math.max(1, Math.floor(step || 1)), got = 0;
    (ids || []).forEach(function (id) {
      if (CAP_IDS.indexOf(id) < 0) return;          // ★知らない id は無視
      p.caps[id] = (p.caps[id] || 0) + n;
      got++;
    });
    if (!got) return snapshot();                    // ★MAX が1つも無ければ、何も起きない
    p.rank = (p.rank || 0) + 1;
    save();
    return snapshot();
  }

  function finish(distance) { get().lastDistance = Math.max(0, Math.floor(distance)); save(); }
  function recordFish(fish) {
    var p = get(), id = String(fish.type);
    if (fish.cm > (p.fish[id] || 0)) { p.fish[id] = fish.cm; save(); }
  }
  global.DotProgression = { load: load, snapshot: snapshot, learn: learn, finish: finish, recordFish: recordFish,
    prestige: prestige, CAP_IDS: CAP_IDS,
    clear: function () { profile = fresh(); save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
