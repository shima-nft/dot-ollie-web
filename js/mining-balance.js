// ============================================================
// DotMiningBalance —— 採掘の「成長の数字」を、ぜんぶここに集めた（2026-09-20(5) 島さんの指定）
// ============================================================
//
//   ★★ここだけ直せば、採掘全体のバランスが変わります（★コードの中に数字を散らさない）。
//   ★ゲーム（js/mining.js）も、確かめる道具（tools/mining-balance-sim.js）も、この同じ表を読みます
//     ＝ 二重管理にならない。
//
//   ■ この作品の成長の核（★絶対に守る）
//     ・最新の鉱石には苦戦する（★解禁した直後は 9〜10発）
//     ・昔の鉱石はどんどん簡単になる（★最後は ROCK が1発）
//     ・苦戦 → 突破 → 無双 → 新しい壁、の「ノコギリ型」をくり返す
//     ・最初の体験（岩6発 → 6発 → 炭素鋼 → 4発）は変えない
//
//   ■ 発数の決まり: hits = ceil(鉱石の hp / HEAD の power)
//   ■ 壊せるかの決まり: HEAD の段 >= 鉱石の req（★足りないと「カァン！」で弾かれる）
(function (global) {
"use strict";

// ============================================================
// ■ HEAD（★何を壊せるか・一撃の強さ）
// ============================================================
//   power = 一撃で削る量 ／ stars = 画面の星 ／ cost = その段を作る材料
//   col = 採掘中のツルハシの頭の色（暗い・中・明るい）／ edge = ふちを光らせる段か（★見た目の格）
var HEAD_TIERS = [
	{ id: "iron", name: "IRON", power: 1, stars: 1, cost: null,
		col: ["#5a5f70", "#9aa0ad", "#d6d9e0"], edge: 0 },
	{ id: "carbon", name: "CARBON STEEL", power: 1.5, stars: 2, cost: { iron: 12, carbon: 8 },
		col: ["#26304a", "#4f5c7a", "#a8b6d0"], edge: 0 },
	{ id: "chromoly", name: "CHROMOLY", power: 2.5, stars: 3, cost: { iron: 24, carbon: 14, chromite: 6 },
		col: ["#3a4258", "#8f97aa", "#f2f4ff"], edge: 1 },
	{ id: "tool", name: "TOOL STEEL", power: 4, stars: 4, cost: { iron: 75, carbon: 42, chromite: 24, tungsten: 10 },
		col: ["#1b1f2e", "#3d4560", "#8d99b8"], edge: 2 },
	{ id: "carbide", name: "TUNGSTEN CARBIDE", short: "CARBIDE", power: 6.5, stars: 5, cost: { tungsten: 53, carbon: 55, crystal: 31, chromite: 35 },
		col: ["#141726", "#2c3145", "#ffe9a8"], edge: 3 }
];

// ============================================================
// ■ HANDLE（★振る速さだけ。★攻撃力ではない）
// ============================================================
//   short = 画面の段に出す短い名前（★長い名前は数字と重なるため）
//   cycle = 1振りにかかる ms（★★1段で 15〜22% 速くなる ＝ 数字を見なくても、振りを見れば分かる差。2026-09-20(7) 島さんの指定）
//   col = 柄の色（暗い・明るい）／ weave = 織り目の出し方（0 無し / 1 木目 / 2 織り / 3 金属）
var HANDLE_TIERS = [
	//   ★★2026-09-20(8) 島さんの指定: 「最初の1段」をいちばん大胆に速くする（880 → 630 ＝ -28%）
	//   ★一度上げた速さは、あとから弱めない（★全体の長さは 鉱石と材料 で調整する）
	{ id: "wood", name: "WOOD", cycle: 880, stars: 1, cost: null, col: ["#4a3a2a", "#8a6a44"], weave: 1 },
	{ id: "hardwood", name: "HARDWOOD", cycle: 630, stars: 2, cost: { quartz: 10, carbon: 4 }, col: ["#3a2418", "#6b4526"], weave: 1 },
	{ id: "fiber", name: "FIBERGLASS", cycle: 530, stars: 3, cost: { quartz: 18, crystal: 4, carbon: 10 }, col: ["#8a7a3a", "#e8d9a0"], weave: 0 },
	{ id: "carbonfiber", name: "CARBON FIBER", cycle: 455, stars: 4, cost: { carbon: 75, quartz: 45, crystal: 17 }, col: ["#14161f", "#3e4456"], weave: 2 },
	{ id: "titanium", name: "TITANIUM COMPOSITE", short: "TITAN COMP", cycle: 395, stars: 5, cost: { titanium: 36, carbon: 75, crystal: 22 }, col: ["#2b3348", "#9fb0c8"], weave: 3 },
	//   ★★ここから T5〜T9（2026-09-20(11) 島さんの参考画像10枚から起こした5段）
	//   ★★速さの伸びは、だんだんゆるくする（★T0→T1 が最大 -28%、T5 以降は -5〜9%）
	//   ★★★材料は **仮**（★見た目を先に完成させる指定。★正式なバランスは、あとで別途調整）
	{ id: "forged", name: "FORGED STEEL", cycle: 360, stars: 5, cost: { titanium: 54, chromite: 60, carbon: 110 }, col: ["#5c6270", "#9aa2b4"], weave: 0, extra: {} },
	{ id: "damped", name: "DAMPED GRIP", cycle: 332, stars: 5, cost: { titanium: 85, tungsten: 120, crystal: 78 }, col: ["#4e4036", "#b08a3c"], weave: 2, extra: {} },
	{ id: "hollow", name: "HOLLOW ALLOY", cycle: 310, stars: 5, cost: { titanium: 135, chromite: 150, crystal: 115 }, col: ["#5f5c6c", "#a8adbc"], weave: 0, extra: {} },
	{ id: "impact", name: "IMPACT ALLOY", cycle: 292, stars: 5, cost: { titanium: 170, tungsten: 180, carbon: 220 }, col: ["#34384a", "#d4801e"], weave: 3, extra: {} },
	{ id: "master", name: "MASTER FITTING", short: "MASTER FIT", cycle: 278, stars: 5, cost: { titanium: 240, crystal: 130, tungsten: 250, core: 2 }, col: ["#3a3340", "#c39a44"], weave: 2, extra: {} }
];
//   ★extra = 将来ここに「反動・戻り・振り始め・当たりの復帰」などを足せる口（★いまは空 ＝ 何も変えない）

var SKIP_MUL = 1.6;   // ★飛び級（1段飛ばし）の材料は、その段の材料の何倍か（★順に2回作るより重い）

// ============================================================
// ■ 素材（8種類）
// ============================================================
//   rare = レア（★保証を薄くする・飛び級のカギ）／ icon = 絵の升目は tools/mine2sprites.py の MATERIAL_ICON_MAP
var MATERIAL_DEFS = {
	iron: { name: "IRON", col: ["#4c536b", "#9aa4b8", "#dfe6f0"] },
	carbon: { name: "CARBON", col: ["#0d101a", "#2e3142", "#6c7088"] },
	quartz: { name: "QUARTZ", col: ["#8d8580", "#e4dcd2", "#ffffff"] },
	crystal: { name: "CRYSTAL", col: ["#1a6fd0", "#2abceb", "#bff4ff"], rare: true },
	chromite: { name: "CHROMITE", col: ["#2a2f3a", "#5a6472", "#9fb0c0"] },
	tungsten: { name: "TUNGSTEN", col: ["#3a3348", "#6a5f7a", "#c8bcd8"] },
	titanium: { name: "TITANIUM", col: ["#26405a", "#4f7fa8", "#bfe4ff"] },
	core: { name: "RARE CORE", col: ["#5a1a2a", "#c8402a", "#ffcc4a"], rare: true }
};
var MATERIAL_IDS = ["iron", "carbon", "quartz", "crystal", "chromite", "tungsten", "titanium", "core"];

// ============================================================
// ■ 鉱石（6種類 ＋ 将来の ???）
// ============================================================
//   hp  = 耐久（★発数 = ceil(hp / power)）
//   req = 壊すのに要る HEAD の段（★足りないと「カァン！」）
//   base / fleck = 色（★同じ絵を色で塗り分ける）
//   feel = 壊れ方（dust 粉塵・chunk 大きな欠片・bits 細かい破片・spark 火花・shake 揺れ・tone 音の高さ）
//   drops = 落とす材料 [最小, 最大, 出る確率]（★確率 1 = 必ず）
//   ★「未来素材」: いま壊せる鉱石から、次の世代の素材がごくまれに出る（★飛び級のタネ）
var ORE_DEFS = [
	{ id: "rock", name: "ROCK", hp: 6, req: 0,
		base: ["#3e4359", "#53566b", "#7e7c89", "#b59c93"], fleck: null,
		feel: { dust: 1.35, chunk: 1.1, bits: .9, spark: .3, shake: 1, tone: .82 },
		drops: { iron: [1, 2, .55], carbon: [1, 2, .8], quartz: [1, 1, .12] } },
	{ id: "ironore", name: "IRON ORE", hp: 9, req: 0,
		base: ["#3e4359", "#574a53", "#6b616a", "#b59c93"], fleck: ["#8a3f22", "#c8683a", "#e89a62"],
		feel: { dust: .85, chunk: 1, bits: 1.15, spark: 1.4, shake: 1.05, tone: 1.05 },
		drops: { iron: [2, 4, 1], carbon: [1, 2, .6], quartz: [1, 2, .25], chromite: [1, 2, .16] } },
	{ id: "quartz", name: "QUARTZ CLUSTER", hp: 15, req: 1,
		base: ["#4a4a58", "#6f6f80", "#a9a9bd", "#f0f0ff"], fleck: ["#8d8580", "#e4dcd2", "#ffffff"],
		feel: { dust: .6, chunk: .85, bits: 1.5, spark: .8, shake: .9, tone: 1.45 },
		drops: { quartz: [2, 4, 1], crystal: [1, 1, .3], chromite: [1, 3, .4], tungsten: [1, 2, .22] } },
	{ id: "chromite", name: "CHROMITE ORE", hp: 25, req: 2,
		base: ["#23262f", "#3a4048", "#5a6472", "#9fb0c0"], fleck: ["#39404d", "#6c7787", "#b9c6d4"],
		feel: { dust: 1.1, chunk: 1.35, bits: .8, spark: .9, shake: 1.25, tone: .72 },
		drops: { chromite: [2, 3, 1], iron: [2, 4, .7], carbon: [1, 3, .5], crystal: [1, 2, .35], tungsten: [1, 3, .4], titanium: [1, 2, .22] } },
	{ id: "tungsten", name: "TUNGSTEN VEIN", hp: 40, req: 3,
		base: ["#262033", "#3d3550", "#6a5f7a", "#c8bcd8"], fleck: ["#7a6f8a", "#b9aec8", "#ffffff"],
		feel: { dust: .7, chunk: 1.2, bits: .6, spark: 1.6, shake: 1.35, tone: 1.15 },
		drops: { tungsten: [2, 3, 1], carbon: [2, 4, .7], crystal: [1, 2, .4], titanium: [1, 2, .25], core: [1, 1, .02] } },
	{ id: "titanium", name: "TITANIUM CRYSTAL", hp: 65, req: 4,
		base: ["#17273a", "#26405a", "#4f7fa8", "#bfe4ff"], fleck: ["#2abceb", "#8fe4ff", "#ffffff"],
		feel: { dust: .55, chunk: 1, bits: 1.35, spark: 1.2, shake: 1.2, tone: 1.6, glow: 1 },
		drops: { titanium: [2, 3, 1], crystal: [2, 3, .6], tungsten: [1, 3, .5], core: [1, 1, .04] } }
];
//   ★将来の謎の鉱石（★いまは出ない。★出す口だけ残してある）
var FUTURE_ORE = { id: "unknown", name: "???", hp: 120, req: 9,
	base: ["#141726", "#232a42", "#3a4466", "#6a7aa8"], fleck: ["#5a1a2a", "#c8402a", "#ffcc4a"],
	feel: { dust: 1, chunk: 1, bits: 1, spark: 2, shake: 1.5, tone: .6 },
	drops: { core: [1, 1, 1] } };

// ============================================================
// ■ どの鉱石がどれくらい出るか（★HEAD の段ごとに入れ替わる）
// ============================================================
//   ★古い鉱石を完全には消さない（★昔の鉱石を一撃で砕いて「強くなった」と感じるため）
//   ★いまは壊せない次の鉱石を 5〜8% だけ混ぜる（★「カァン！」→ 強化 → 戻って「ピシッ」）
var ORE_MIX = [
	{ rock: 70, ironore: 25, quartz: 5 },
	{ rock: 28, ironore: 37, quartz: 30, chromite: 5 },
	{ rock: 12, ironore: 18, quartz: 35, chromite: 30, tungsten: 5 },
	{ rock: 8, ironore: 8, quartz: 14, chromite: 40, tungsten: 25, titanium: 5 },
	{ rock: 4, ironore: 6, quartz: 10, chromite: 15, tungsten: 40, titanium: 25 }
];

// ============================================================
// ■ 運が悪いだけで止まらないように（★soft pity。★画面には出さない）
// ============================================================
//   ★ふつうの進行に要る素材（レアでないもの）が PITY.after 回ぶん出なかったら、次から必ず出す
//   ★レア（CRYSTAL / RARE CORE）と「未来素材」は保証しない（★飛び級は運も絡む）
var PITY = { after: 7, mats: ["iron", "carbon", "quartz", "chromite", "tungsten", "titanium"] };
// ★★はじめの体験（2026-09-20(8) 島さんの指定で作り替えた。★絶対に守る）
//   ★岩2個で必ず最初の「HANDLE」が作れる ＝ いちばん最初に変わるのは「振る速さ」
//   ★そのあと 45〜75秒で HEAD（＝ 発数が減る）。★速さの成長 → 力の成長、と2種類を続けて体験する
var STARTER = { breaks: 2, rocks: 3, part: "handle" };
// ★最初の2回の破壊で、最初の HANDLE の材料のうち足りない分を「残りの回数」で割って必ず落とす
//   （1個目 = およそ半分 ／ 2個目 = 必ず完成）
function starterDrops(head, handle, have, brokenCount) {
	var out = {}, left = STARTER.breaks - brokenCount + 1;
	var cost = handle === 0 && HANDLE_TIERS[1] ? HANDLE_TIERS[1].cost : null;
	if (!cost || left < 1) return out;
	Object.keys(cost).forEach(function (k) { var need = Math.max(0, cost[k] - (have[k] || 0)); if (need) out[k] = Math.ceil(need / left); });
	return out;
}

// ============================================================
// ■ 鉱石のかたまり（★1地点にならぶ 3〜5個）の決まり（2026-09-20(8) 島さんの指定）
// ============================================================
//   ★★「壊せない鉱石だけで埋まって進めなくなる」＝ 致命的なソフトロック。
//     運まかせにせず、★生成の決まりとして禁止する（★必ず1個、できれば2個は壊せる）
//   ★LOCKED そのものは残す（★「カァン！」→ 強化 → 戻って「ピシッ」は、この作品の面白さ）
var GROUP = {
	lockedRatio: [.25, .40, .40, .50, .50],   // ★HEAD の段ごとの「壊せない鉱石」の上限（割合）
	minBreakable: [2, 2, 2, 1, 1]             // ★壊せる鉱石の下限（★序盤〜中盤は2個・後半は1個）
};
function maxLocked(headTier, n) {
	var i = Math.min(headTier, GROUP.lockedRatio.length - 1);
	var minB = Math.min(GROUP.minBreakable[i], n);
	return Math.max(0, Math.min(Math.round(n * GROUP.lockedRatio[i]), n - minB));
}
function minBreakable(headTier, n) { return n - maxLocked(headTier, n); }

// ============================================================
// ■ 目標にしている時間（★確かめる道具が、ここと見くらべます）
// ============================================================
var GOALS = {
	firstHandle: [10, 25],      // ★★最初の HANDLE（秒）＝ いちばん最初の成長は「振る速さ」
	firstHead: [40, 80],        // ★★そのあとの HEAD（秒）＝ 2つ目の成長は「発数が減る」
	earlyUpgrade: [90, 180],    // そのあとの大きな1段（秒）
	midUpgrade: [120, 240],     // 中盤（秒）
	lateUpgrade: [240, 420],    // 後半（秒）
	newestHits: [6, 10],        // 解禁した直後の鉱石の発数
	oldestHits: 1,              // いちばん古い鉱石は、最後は1発
	stallEarly: 180, stallLate: 420,   // アップグレードの間があいてよい上限（秒。★序盤の4段まで／後半）
	skipChance: [.10, .30]      // 飛び級が現実的に狙えるランの割合
};

// ============================================================
// ■ 計算（★ゲームも確かめる道具も、この同じ関数を使う）
// ============================================================
function oreDef(id) { for (var i = 0; i < ORE_DEFS.length; i++) if (ORE_DEFS[i].id === id) return ORE_DEFS[i]; return id === FUTURE_ORE.id ? FUTURE_ORE : ORE_DEFS[0]; }
function hitsFor(oreId, headTier) {
	var d = oreDef(oreId), p = (HEAD_TIERS[headTier] || HEAD_TIERS[0]).power;
	return headTier < d.req ? Infinity : Math.max(1, Math.ceil(d.hp / p - 1e-9));
}
function canBreak(oreId, headTier) { return headTier >= oreDef(oreId).req; }
// ★1振りにかかる時間（ms）＝ 振り ＋ 当たって止まる分
function swingMs(handleTier, timing) { return (HANDLE_TIERS[handleTier] || HANDLE_TIERS[0]).cycle + (timing ? timing.hitStopMs : 45); }
// ★鉱石1個を壊すのにかかる時間（ms。★最後の一撃の止まり ＋ 次の鉱石が出るまでを含む）
function breakMs(oreId, headTier, handleTier, timing) {
	var t = timing || { hitStopMs: 45, breakStopMs: 75, nextOreMs: 220, revealMs: 140 };
	return hitsFor(oreId, headTier) * swingMs(handleTier, t) + t.breakStopMs + t.nextOreMs + t.revealMs * .5;
}

// ============================================================
// ★★★★★ 4 つの採掘ポインと、それぞれの役割（2026-09-21(8) 島さんの指定）
// ============================================================
//
//   ★左右になぞると移る 4 つの場所に、★★**違う意味**を持たせます。
//     ★新しい操作は足しません（★なぞる → 長押しする、だけ）。
//
//   | | 狙い | 出る鉱石 |
//   |---|---|---|
//   | ① SHALLOW  | ★**昔の鉱石を猛烈な速さで壊す** ／ 基本素材を短時間で大量に | ★進み具合の 3 世代下（★必ず壊せる） |
//   | ② STANDARD | ★ふつうに進む | ★いままでどおりの表 |
//   | ③ DEEP     | ★**いま壊せる中で硬いもの**を狙う | ★最新世代・1 世代前を強く |
//   | ④ RICH     | ★**何が出るか少し楽しみ** | ★レアが出る鉱石 ＋ 未来の鉱石を少し |
//
//   ★★★**RICH だけ掘れば全部解決、にはしません**。
//     ★RICH は壊すのに時間がかかり、★★壊せない鉱石も混ざります（★安定しない）。
//
//   ★★★★**「世界の進み」は `headMax`、「壊せるか」は `equipped`**。
//     ★古い HEAD へ戻しても、★★SHALLOW にはその HEAD で壊せる鉱石が残ります。
var POINTS = [
	// ★`back` … 何世代下の鉱石を中心にするか（★島さんの指定は「2〜4 世代下」）。
	//   ★★**4 にしてあります** ＝ ★★★「1発 1発 2発 1発」の手応え（★平均 1.35 発）。
	//   ★ 3 にすると平均 2.1 発になり、★★「猛烈な速さで壊す」感じが藄れます
	{ id: "shallow",  name: "SHALLOW",  back: 4, safe: 1, future: 0,   rareMul: 1,   locked: 0 },
	{ id: "standard", name: "STANDARD", back: 0, safe: 0, future: 0,   rareMul: 1,   locked: 1 },
	{ id: "deep",     name: "DEEP",     back: 0, safe: 0, future: 0,   rareMul: 1,   locked: 1 },
	// ★★★`rareDrop` … **レア素材（CRYSTAL / RARE CORE）の落ちやすさだけ**を少し上げる。
	//   ★島さんの指定「全素材×2 のような雑な倍率は避ける」に従い、★★**レアにしかかかりません**。
	//   ★★★鉱石の種類を寄せるだけでは、RARE CORE の 2% がボトルネックで差が出なかったため。
	{ id: "rich",     name: "RICH",     back: 0, safe: 0, future: .11, rareMul: 1.7, coreMul: 2.6, rareDrop: 1.6, locked: 1 }
];
var POINT_N = POINTS.length;
// ★DEEP の寄せ方（★最新・1世代前を厚く、★★古い岩はかなり減らす）
var DEEP_W = { top: 3.4, near: 1.0, old: .16, locked: .5 };
// ★その鉱石からレア素材（CRYSTAL / RARE CORE）が出るか
function oreHasRare(id) {
	var d = oreDef(id), k;
	for (k in d.drops) if (MATERIAL_DEFS[k] && MATERIAL_DEFS[k].rare) return true;
	return false;
}
// ★その鉱石から RARE CORE が出るか（★RICH だけこれをさらに厚くする）
function oreDropsCore(id) { return !!oreDef(id).drops.core; }
// ★★そのポイントの「出やすさの表」を作る
//   headTier  ＝ 世界の進み具合（headMax）
//   equipped  ＝ いま装備している HEAD（★壊せるかどうかはこちら）
function pointMix(headTier, equipped, pointIndex) {
	var P = POINTS[pointIndex] || POINTS[1], out = {}, k, base, total = 0;
	if (P.back > 0) {
		// ★★SHALLOW: 進み具合の 3 世代下。★★★ただし**いまの装備で壊せるものだけ**
		var idx = Math.max(0, Math.min(headTier - P.back, equipped));
		base = ORE_MIX[Math.min(idx, ORE_MIX.length - 1)];
		for (k in base) if (canBreak(k, equipped)) out[k] = base[k];
		if (!Object.keys(out).length) out.rock = 100;
		return out;
	}
	base = ORE_MIX[Math.min(headTier, ORE_MIX.length - 1)];
	for (k in base) out[k] = base[k];
	if (P.id === "deep") {
		for (k in out) {
			var req = oreDef(k).req;
			if (!canBreak(k, equipped)) { out[k] *= DEEP_W.locked; continue; }
			out[k] *= req >= equipped - 1 ? DEEP_W.top : (req >= equipped - 2 ? DEEP_W.near : DEEP_W.old);
		}
	} else if (P.id === "rich") {
		// ★レア素材が出る鉱石を厚く、★★**RARE CORE が出る鉱石はさらに厚く**
		for (k in out) { if (oreHasRare(k)) out[k] *= P.rareMul; if (oreDropsCore(k)) out[k] *= P.coreMul || 1; }
		for (k in out) total += out[k];
		// ★★未来の鉱石を少しだけ（★「お、これまだ無理だ」の予告。★★LOCKED だらけにはしない）
		if (P.future > 0 && total > 0) out[FUTURE_ORE.id] = total * P.future / (1 - P.future);
	}
	for (k in out) if (!(out[k] > 0)) delete out[k];
	if (!Object.keys(out).length) out.rock = 100;
	return out;
}
// ★作った表から 1 つ選ぶ
function pickFromMix(rand, mix) {
	var total = 0, k;
	for (k in mix) total += mix[k];
	var r = rand() * total;
	for (k in mix) { r -= mix[k]; if (r < 0) return k; }
	return "rock";
}
// ★★ポイントごとに 1 つ選ぶ（★`pickOreId` はいままでどおり残してあります）
function pickOreAt(rand, headTier, equipped, pointIndex) {
	return pickFromMix(rand, pointMix(headTier, equipped, pointIndex));
}

// ★その場所の「レアの落ちやすさの補正」（★RICH だけ 1 より大きい）
function rareDropOf(pointIndex) { var P = POINTS[pointIndex]; return (P && P.rareDrop) || 1; }
// ★次に出る鉱石を選ぶ（rand = 0〜1 を返す関数）
function pickOreId(rand, headTier) {
	var mix = ORE_MIX[Math.min(headTier, ORE_MIX.length - 1)], total = 0, k;
	for (k in mix) total += mix[k];
	var r = rand() * total;
	for (k in mix) { r -= mix[k]; if (r < 0) return k; }
	return "rock";
}
// ★壊したときに出る材料（★pity = { iron: 何回出ていないか, ... } を渡すと、運が悪いときだけ助ける）
// ★`rareDrop` を渡すと、★★**レア素材の落ちやすさだけ**がその倍率になる（★RICH 専用）
function rollDrops(rand, oreId, pity, rareDrop) {
	var d = oreDef(oreId), out = {}, k;
	for (k in d.drops) {
		var r = d.drops[k], chance = r[2] === undefined ? 1 : r[2];
		if (rareDrop > 1 && MATERIAL_DEFS[k] && MATERIAL_DEFS[k].rare) chance = Math.min(1, chance * rareDrop);
		var hit = rand() < chance;
		if (!hit && pity && PITY.mats.indexOf(k) >= 0 && (pity[k] || 0) >= PITY.after) hit = true;   // ★出なさすぎたら助ける
		if (pity && PITY.mats.indexOf(k) >= 0) pity[k] = hit ? 0 : (pity[k] || 0) + 1;
		if (!hit) continue;
		var n = r[0] + Math.floor(rand() * (r[1] - r[0] + 1));
		if (n > 0) out[k] = (out[k] || 0) + n;
	}
	return out;
}
// ★その段を作る材料（step 1 = すぐ上 ／ step 2 = 1段飛ばし ＝ SKIP_MUL 倍）
function costOf(list, cur, step) {
	var t = list[cur + step]; if (!t || !t.cost) return null;
	if (step === 1) return t.cost;
	var out = {}; Object.keys(t.cost).forEach(function (k) { out[k] = Math.ceil(t.cost[k] * SKIP_MUL); });
	return out;
}

global.DotMiningBalance = {
	HEAD_TIERS: HEAD_TIERS, HANDLE_TIERS: HANDLE_TIERS, MATERIAL_DEFS: MATERIAL_DEFS, MATERIAL_IDS: MATERIAL_IDS,
	ORE_DEFS: ORE_DEFS, FUTURE_ORE: FUTURE_ORE, ORE_MIX: ORE_MIX, PITY: PITY, GOALS: GOALS, SKIP_MUL: SKIP_MUL,
	// ★★★★★4 つの採掘ポイント（2026-09-21(8)）
	POINTS: POINTS, POINT_N: POINT_N, DEEP_W: DEEP_W, rareDropOf: rareDropOf, pointMix: pointMix, pickFromMix: pickFromMix, pickOreAt: pickOreAt, oreHasRare: oreHasRare, oreDropsCore: oreDropsCore,
	STARTER: STARTER, starterDrops: starterDrops, GROUP: GROUP, maxLocked: maxLocked, minBreakable: minBreakable,
	oreDef: oreDef, hitsFor: hitsFor, canBreak: canBreak, swingMs: swingMs, breakMs: breakMs,
	pickOreId: pickOreId, rollDrops: rollDrops, costOf: costOf
};
})(typeof window !== "undefined" ? window : globalThis);
