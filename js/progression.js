// Permanent journey knowledge. Wallet, HP and upgrade levels never enter this save.
(function (global) {
  'use strict';
  var KEY = 'dotollie-journey-v1', profile = null;
  // ============================================================
  // ★★★★★セーブの一本化（2026-09-21(6) 島さんの指定）
  // ============================================================
  //   ★★この作品の「ずっと残るもの」は、★★★**この1ファイルだけ**が書きます。
  //     ★ほかの場所から localStorage を直に触らないこと。
  //
  //   ★★★**版**: 2。★1（古い保存）も読めます。
  //   ★★★★**控え（バックアップ）を2世代**持ちます。
  //     ★本体が壊れて読めなかったら、★★自動で控えから戻します。
  //
  //   ★★★★★**記憶だけモード（memory-only）**:
  //     ★テストモード（TEST 4950m など）のときに使います。
  //     ★★**localStorage には1バイトも書きません**（★島さんの記録を汚さない）。
  //     ★★★でも**アプリを閉じるまでは覚えています** ＝
  //       ★★★★**採掘 → キャンプ → 採掘 で素材が消えない**。
  //     ★これが 2026-09-21 に見つかった「素材が消える」の原因でした
  //     （★前は「覚えない」ではなく**「毎回まっさらから作り直す」**になっていた）。
  var SAVE_VERSION = 2, BAK = '-bak', BAK2 = '-bak2';
  var memory = null;          // ★null = ふつう（localStorage） ／ {} = 記憶だけ
  var debug = 0, lastBak = 0, notes = [];
  function setMemoryOnly(on) {
    if (on) { if (!memory) memory = {}; }
    else memory = null;
    profile = null;           // ★次の get() で読み直す
    return !!memory;
  }
  function isMemoryOnly() { return !!memory; }
  function setDebug(on) { debug = on ? 1 : 0; return debug; }
  function note(msg) { notes.push(msg); if (notes.length > 20) notes.shift(); if (debug && global.console) global.console.warn('[save] ' + msg); }
  // ★★覚える場所はこの2つだけを通る（★記憶だけモードの切り替えが1か所で効く）
  function rawGet(key) {
    // ★★写し取り: 記憶だけモードでも、まだ書いていないものは本物を**読むだけ**
    if (memory && Object.prototype.hasOwnProperty.call(memory, key)) return memory[key];
    try { return global.localStorage.getItem(key); } catch (e) { return null; }
  }
  function rawSet(key, val) {
    if (memory) { memory[key] = String(val); return true; }
    try { global.localStorage.setItem(key, String(val)); return true; } catch (e) { return false; }
  }
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
  // ★★★★★`rev`（saveRevision）2026-09-22 島さんの指定。
  //   ★保存するたび +1 される**減らない番号**。
  //   ★★読むときは、本体と控えのうち**いちばん番号が大きいもの**を採ります。
  //   ★★★古い状態があとから書き戻そうとしたら、**断ります**（★`savedAt` だけより安全）。
  function fresh() { return { version: SAVE_VERSION, savedAt: 0, rev: 0, totalM: 0, resumeMode: '', rank: 0, ready: false, tricks: {}, doubleJump: false, fish: {}, fishSeen: {}, routes: {}, lastDistance: 0, caps: {}, panels: {coin:true}, mining: null }; }
  // ★上限が伸びる項目（★`js/upgrades.js` の id とそろえること）
  var CAP_IDS = ['speed', 'stamina', 'coin', 'rail', 'wheels', 'magnet', 'light', 'recover', 'live', 'drink'];
  var PANEL_IDS = CAP_IDS.concat(['shoes','railpass','maxdrink','kickflip','pop','prestige']);
  function read(key) { try { return JSON.parse(rawGet(key)); } catch (e) { return null; } }
  // ★読める形かどうか（★版が 1 か 2 で、中身が object）
  function valid(raw) { return !!(raw && typeof raw === 'object' && !Array.isArray(raw) && (raw.version === 1 || raw.version === 2)); }
  // ★★★開発用の見張り: **値が減ったら知らせる**。
  //   ★遊びは止めません。`DotProgression.setDebug(1)` で出ます
  function warnDrop(before, after) {
    if (!debug || !before) return;
    function cmp(name, a, b) { if (Number.isFinite(a) && Number.isFinite(b) && b < a) note(name + ' drop ' + a + ' -> ' + b); }
    cmp('rank', before.rank, after.rank);
    cmp('totalM', before.totalM, after.totalM);
    Object.keys(before.fish || {}).forEach(function (k) { cmp('fish[' + k + ']', before.fish[k], (after.fish || {})[k]); });
    var bm = before.mining, am = after.mining;
    if (bm && bm.mats) {
      if (!am) { note('mining lost'); return; }
      Object.keys(bm.mats).forEach(function (k) { cmp('mats[' + k + ']', bm.mats[k], (am.mats || {})[k]); });
      cmp('headMax', bm.headMax, am.headMax); cmp('handleMax', bm.handleMax, am.handleMax);
    }
  }
  function save() {
    if (!profile) return false;
    profile.version = SAVE_VERSION; profile.savedAt = Date.now();
    profile.rev = (Number.isFinite(profile.rev) ? profile.rev : 0) + 1;   // ★★書くたび +1
    var key = slotKey(KEY), cur = rawGet(key);
    if (debug && cur) { try { warnDrop(JSON.parse(cur), profile); } catch (e) { /* broken save is not compared */ } }
    // ★★控えを2世代（★書き込みのたびではなく 15 秒に1回。★保存を重くしない）
    if (cur && cur !== 'null' && (Date.now() - lastBak > 15000 || !rawGet(key + BAK))) {
      var b1 = rawGet(key + BAK);
      if (b1 && b1 !== cur) rawSet(key + BAK2, b1);
      rawSet(key + BAK, cur); lastBak = Date.now();
    }
    var ok = rawSet(key, JSON.stringify(profile));
    if (!ok) note('write failed');
    return ok;
  }
  function load() {
    profile = fresh();
    // ★★★★★本体と控え 2 世代から、**番号（rev）がいちばん大きいもの**を採る。
    //   ★前は「本体が壊れていたら控え」だけでしたが、
    //   ★★★それだと**本体が古い値で上書きされていた場合に救えません**。
    var cands = [
      { tag: 'current', raw: read(slotKey(KEY)) },
      { tag: 'backup1', raw: read(slotKey(KEY) + BAK) },
      { tag: 'backup2', raw: read(slotKey(KEY) + BAK2) }
    ].filter(function (c) { return valid(c.raw); });
    var raw = null, pick = null;
    cands.forEach(function (c) {
      var r = Number.isFinite(c.raw.rev) ? c.raw.rev : 0;
      var t = Number.isFinite(c.raw.savedAt) ? c.raw.savedAt : 0;
      if (!pick || r > pick.r || (r === pick.r && t > pick.t)) { pick = { r: r, t: t, tag: c.tag }; raw = c.raw; }
    });
    if (pick && pick.tag !== 'current') note('restored from ' + pick.tag + ' (rev ' + pick.r + ')');
    if (valid(raw)) {
      // ★★版 1（古い保存）は、足りない欄を足すだけでそのまま読めます
      profile.totalM = (Number.isFinite(raw.totalM) && raw.totalM > 0) ? Math.floor(raw.totalM) : 0;
      profile.resumeMode = (raw.resumeMode === 'camp' || raw.resumeMode === 'run') ? raw.resumeMode : '';
      profile.savedAt = Number.isFinite(raw.savedAt) ? raw.savedAt : 0;
      profile.rev = (Number.isFinite(raw.rev) && raw.rev > 0) ? Math.floor(raw.rev) : 0;
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
    // ★★★★★**読んだだけのときは書き戻さない**（2026-09-21(6)）。
    //   ★前は読むたびに書いていたので、★★**見ただけで保存の時刻が動いて**いました。
    //   ★★★古い版（1）や壊れていたときだけ、直した形で書き直します
    if (!valid(raw) || raw.version !== SAVE_VERSION) save();
    return snapshot();
  }
  // ★採掘の記録: 素材の数は 0 以上の整数だけ。★キャンプ側のクラフト・装備からも、この名前のまま読める
  function cleanMining(m) {
    if (!m || typeof m !== 'object') return null;
    // ★★head / handle = いま装備しているもの／★headMax / handleMax = これまでに作ったいちばん上（2026-09-21(5)）
    //   ★古いセーブには Max が無いので、「装備 ＝ 最高」として渡す（★装備状態は変わらない）
    var eqH = Number.isInteger(m.head) && m.head >= 0 ? m.head : 0, eqW = Number.isInteger(m.handle) && m.handle >= 0 ? m.handle : 0;
    var mxH = Number.isInteger(m.headMax) && m.headMax >= 0 ? m.headMax : eqH, mxW = Number.isInteger(m.handleMax) && m.handleMax >= 0 ? m.handleMax : eqW;
    var out = { mats: {}, head: eqH, handle: eqW, headMax: Math.max(eqH, mxH), handleMax: Math.max(eqW, mxW), broken: Number.isInteger(m.broken) && m.broken >= 0 ? m.broken : 0,
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
  // ★★★★★スケボの総距離（2026-09-21(6) 島さんの指定）。★足すだけ ＝ 減らない
  function addDistance(m) {
    var p = get(), n = Math.floor(m);
    if (!Number.isFinite(n) || n <= 0) return p.totalM;
    p.totalM = (p.totalM || 0) + n; save(); return p.totalM;
  }
  // ★★★次に開いたとき、どこから再開するか（'' / 'camp' / 'run'）
  // ★★★★★**ここを呼んでよいのは「手動 SAVE」だけ**（2026-09-22 島さんの指定）。
  //   ★★**自動保存からは絶対に命じないこと**。
  //   ★★★スケボで押したら 'run' ／ キャンプで押したら 'camp'。
  //     ★**「どこで SAVE しても camp」は禁止**（★これが 2026-09-22 の事故の原因）。
  function setResume(mode) { var p = get(); p.resumeMode = (mode === 'camp' || mode === 'run') ? mode : ''; save(); return p.resumeMode; }
  // ★★★★★いまの中身をまとめて確定して書く（★キャンプの SAVE ボタンから）
  function commit(data) {
    var p = get();
    if (data && data.mining !== undefined) p.mining = cleanMining(data.mining);
    if (data && Number.isFinite(data.addDistance) && data.addDistance > 0) p.totalM = (p.totalM || 0) + Math.floor(data.addDistance);
    if (data && data.resumeMode !== undefined) p.resumeMode = (data.resumeMode === 'camp' || data.resumeMode === 'run') ? data.resumeMode : '';
    return save();
  }
  // ★開発用: いま何が入っているか／何が起きたか
  function dump() { return { memoryOnly: !!memory, slot: slot, profile: snapshot(), notes: notes.slice() }; }
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
    SAVE_VERSION: SAVE_VERSION, setMemoryOnly: setMemoryOnly, isMemoryOnly: isMemoryOnly, setDebug: setDebug, dump: dump,
    addDistance: addDistance, setResume: setResume, commit: commit, flush: save,
    prestige: prestige, CAP_IDS: CAP_IDS, unlockPanels: unlockPanels,
    slot: function () { return slot; }, setSlot: setSlot, slotKey: slotKey,
    // ★そのスロットの記録を、切り替えずに覗く（★タイトルのスロット一覧用。無ければ null）
    peek: function (n) { var raw = read(slotKey(KEY, n)); return valid(raw) ? raw : null; },
    // ★★★★★NEW GAME（本当に最初から）。2026-09-22 に直しました。
    //
    //   ★★**前は `profile = fresh(); save();` だけでした。**
    //     ★`fresh()` の版（rev）は 0 なので、保存すると版は **1**。
    //     ★★一方で控えには古い記録（版 25 など）が残る。
    //     ★★★読むときは「版が最大のもの」を採るので、
    //       ★★★★**NEW GAME なのに古い控えが復活していました**
    //       （★ショップの解放も総距離も残っていた）。
    //
    //   ★★★★★だから 2 つやります:
    //     ① ★**版は絶対に戻さない**（★いま見えている中でいちばん大きい版の次へ）
    //     ② ★★**控えも新品にする**（★NEW GAME は「本当に最初から」だから）
    //
    //   ★★★★**CONTINUE / RESTART はここを通りません** ＝ 解放も財布も距離もそのまま。
    clear: function () {
      var key = slotKey(KEY), top = 0;
      [key, key + BAK, key + BAK2].forEach(function (k) {
        var o = read(k);
        if (o && Number.isFinite(o.rev) && o.rev > top) top = o.rev;
        if (o && Number.isFinite(o.savedAt) && o.savedAt > 0 && !Number.isFinite(o.rev)) top = Math.max(top, 1);
      });
      profile = fresh();
      profile.rev = top;            // ★save() で +1 される ＝ 必ず古い控えより新しい
      lastBak = Date.now();         // ★★この保存では控えを回さない（★古いものを残さない）
      save();
      // ★★★控え 2 世代も、まっさらの記録で上書きする
      var textNow = rawGet(key);
      if (textNow) { rawSet(key + BAK, textNow); rawSet(key + BAK2, textNow); }
      note('new game: cleared (rev ' + profile.rev + ')');
      return snapshot();
    } };
})(typeof window !== 'undefined' ? window : globalThis);
