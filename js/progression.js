// Permanent journey knowledge. Wallet, HP and upgrade levels never enter this save.
(function (global) {
  'use strict';
  var KEY = 'dotollie-journey-v1', profile = null;
  // ★★★★★セーブスロット（2026-09-13 島さんの指定「セーブスロットを2つに」）。
  //   ★スロット1 は昔からの名前のまま（★いまの記録がそのままスロット1）。スロット2 は名前の後ろに "-s2"。
  //   ★★旅の記録・途中セーブ・BEST はスロットごと。★音・オプション・会ったモンスターは共通
  var SLOT_KEY = 'dotollie-slot', slot = 1;
  try { if (Number(global.localStorage.getItem(SLOT_KEY)) === 2) slot = 2; } catch (e) { /* 読めなければスロット1 */ }
  function slotKey(base, n) { return (n || slot) === 2 ? base + '-s2' : base; }
  function setSlot(n) {
    slot = n === 2 ? 2 : 1; profile = null;
    try { global.localStorage.setItem(SLOT_KEY, String(slot)); } catch (e) { /* 保存できなくても遊べる */ }
    return slot;
  }
  // ★★★★★`caps` …… **転生で伸びた上限**（2026-09-12 島さんの指定）
  //   ★例: `{ speed: 3, coin: 5 }` ＝ SPEED の天井が +3、COIN が +5 伸びている。
  //   ★★`rank` は**転生した回数**です（★上限はありません）。
  //   ★★★これまでこの保存には「足跡」しか入れていませんでしたが、
  //     ★**島さんが「残るのは記録だけにこだわらない」と決めた**ので、
  //     ★★**初めて「力になるもの」が永久に残ります**。
  function fresh() { return { version: 1, rank: 0, ready: false, tricks: {}, doubleJump: false, fish: {}, fishSeen: {}, routes: {}, lastDistance: 0, caps: {}, panels: {coin:true}, mining: null }; }
  // ★上限が伸びる項目（★`js/upgrades.js` の id とそろえること）
  var CAP_IDS = ['speed', 'stamina', 'coin', 'rail', 'wheels', 'magnet', 'light', 'recover', 'live', 'drink'];
  var PANEL_IDS = CAP_IDS.concat(['shoes','railpass','maxdrink','kickflip','pop','prestige']);
  function read(key) { try { return JSON.parse(global.localStorage.getItem(key)); } catch (e) { return null; } }
  function save() { try { global.localStorage.setItem(slotKey(KEY), JSON.stringify(profile)); } catch (e) { /* Play remains available. */ } }
  function load() {
    var raw = read(slotKey(KEY)); profile = fresh();
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
      PANEL_IDS.forEach(function(id){ if(raw.panels && raw.panels[id] === true) profile.panels[id]=true; });
      if (!raw.panels) {
        var oldGear=read('dotollie-upg');
        PANEL_IDS.forEach(function(id){ if(profile.caps[id] || (oldGear && oldGear.lv && oldGear.lv[id]>0)) profile.panels[id]=true; });
        if(profile.doubleJump) profile.panels.shoes=true;
      }
      ['kickflip', 'pop'].forEach(function (id) { if (raw.tricks && raw.tricks[id] === true) profile.tricks[id] = true; });
      ['0', '1', '2', '3', '4'].forEach(function (id) {
        var cm = raw.fish && raw.fish[id];
        if (Number.isFinite(cm) && cm >= 6 && cm <= 120) { profile.fish[id] = Math.round(cm * 10) / 10; profile.fishSeen[id] = true; }
        if (raw.fishSeen && raw.fishSeen[id] === true) profile.fishSeen[id] = true;
      });
      // ★★★★★採掘（2026-09-19）: 素材・ツルハシ（HEAD / HANDLE）・その地点の鉱石。★中身の確かめは DotMining.create がもう一度する
      profile.mining = cleanMining(raw.mining);
    } else if (slot === 1) {
      // ★引き継ぎはスロット1だけ（★スロット2に昔の技が紛れ込まないように）
      // Existing players keep purchased actions and an already reached 5000m milestone.
      var old = read('dotollie-upg'), best = Number(read('dotollie-best'));
      ['kickflip', 'pop'].forEach(function (id) { if (old && old.un && old.un[id] === true) profile.tricks[id] = true; });
      profile.doubleJump = Number.isFinite(best) && best >= 5000;
    }
    if (profile.rank > 0) { profile.panels.prestige = true; profile.panels.railpass = true; }
    save(); return snapshot();
  }
  // ★採掘の記録: 素材の数は 0 以上の整数だけ。★キャンプ側のクラフト・装備からも、この名前のまま読める
  function cleanMining(m) {
    if (!m || typeof m !== 'object') return null;
    var out = { mats: {}, head: Number.isInteger(m.head) && m.head >= 0 ? m.head : 0, handle: Number.isInteger(m.handle) && m.handle >= 0 ? m.handle : 0, broken: Number.isInteger(m.broken) && m.broken >= 0 ? m.broken : 0,
      headMade: Number.isInteger(m.headMade) && m.headMade >= 0 ? m.headMade : 0, handleMade: Number.isInteger(m.handleMade) && m.handleMade >= 0 ? m.handleMade : 0,
      seenOre: {}, seenMat: {}, matOrder: [], site: null };
    // ★★見つけた鉱石・見つけた素材（★一度見つけたものが「?」に戻らないように保存する。2026-09-20(9)）
    Object.keys(m.seenOre || {}).forEach(function (k) { if (/^[a-z]+$/.test(k) && m.seenOre[k]) out.seenOre[k] = 1; });
    Object.keys(m.seenMat || {}).forEach(function (k) { if (/^[a-z]+$/.test(k) && m.seenMat[k]) out.seenMat[k] = 1; });
    if (Array.isArray(m.matOrder)) m.matOrder.forEach(function (k) { if (/^[a-z]+$/.test(k) && out.matOrder.indexOf(k) < 0 && out.matOrder.length < 32) out.matOrder.push(k); });
    Object.keys(m.mats || {}).forEach(function (k) { var v = m.mats[k]; if (/^[a-z]+$/.test(k) && Number.isFinite(v) && v >= 0) out.mats[k] = Math.floor(Math.min(v, 1e9)); });
    if (m.site && Array.isArray(m.site.ores) && m.site.ores.length <= 8) out.site = JSON.parse(JSON.stringify(m.site));
    return out;
  }
  function saveMining(m) { var p = get(); p.mining = cleanMining(m); save(); }
  function get() { if (!profile) load(); return profile; }
  function snapshot() { return JSON.parse(JSON.stringify(get())); }
  function unlockPanels(ids) {
    var p=get(),added=[];
    (ids||[]).forEach(function(id){if(PANEL_IDS.indexOf(id)>=0 && !p.panels[id]){p.panels[id]=true;added.push(id);}});
    if(added.length) save(); return added;
  }
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
    if (!fish || !Number.isInteger(fish.type) || fish.type < 0 || fish.type > 4 || !Number.isFinite(fish.cm) || fish.cm < 6 || fish.cm > 120) return;
    var p = get(), id = String(fish.type);
    if (fish.cm > (p.fish[id] || 0)) { p.fish[id] = Math.round(fish.cm * 10) / 10; p.fishSeen[id] = true; save(); }
  }
  function observeFish(ids) {
    var p = get(), changed = false;
    ids.forEach(function (id) { if (Number.isInteger(id) && id >= 0 && id <= 4 && !p.fishSeen[id]) { p.fishSeen[id] = true; changed = true; } });
    if (changed) save();
  }
  global.DotProgression = { load: load, snapshot: snapshot, learn: learn, finish: finish, recordFish: recordFish, observeFish: observeFish, saveMining: saveMining,
    prestige: prestige, CAP_IDS: CAP_IDS, unlockPanels: unlockPanels,
    slot: function () { return slot; }, setSlot: setSlot, slotKey: slotKey,
    // ★そのスロットの記録を、切り替えずに覗く（★タイトルのスロット一覧用。無ければ null）
    peek: function (n) { var raw = read(slotKey(KEY, n)); return raw && raw.version === 1 ? raw : null; },
    clear: function () { profile = fresh(); save(); } };
})(typeof window !== 'undefined' ? window : globalThis);
