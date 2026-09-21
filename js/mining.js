// ============================================================
// DotMining —— キャンプの中のミニゲーム「採掘」（2026-09-19 島さんの指定）
// ============================================================
//
//   一人称。目の前の壁に半分埋まった鉱石を、ツルハシで砕いて素材を集める。
//   画面を長押し ＝ 振り上げ → 命中 → 戻る → 次の一撃 をくり返す。離すと止まる。
//   左右スワイプ ＝ 洞窟の壁ごと横へスライドして、隣の鉱石へ（その地点に 3〜5 個だけ）。
//   左上の小さなツルハシ印 ＝ クラフト（HEAD ＝ 何を砕けるか／HANDLE ＝ 振る速さ）。
//
//   ★いちばん大事なのは「長押ししているだけで気持ちいいか」。★調整値は下の FEEL にまとめてある
//   ★HP バーや「壊せない」の文字は出さない。★ヒビ・火花・音で伝える
//   ★絵は島さんの絵（assets/mining/）→ tools/mine2art.py → js/mining-art.js（背景と、壁に埋まった鉱石）。
//     その上に、動くもの（ヒビ・破片・素材・ツルハシと手・所持数）をこのファイルが描く。
//     ★js/mining-art.js が無いときだけ、壁と鉱石をその場で作る（★仮の絵）
//   ★Math.random() は使わない（★この画面だけのサイコロ）
(function (global) {
"use strict";
var W = 240, H = 160;

// ============================================================
// ■ 手ざわり（★島さんと何度も調整するところ）
// ============================================================
var FEEL = {
	windup: 0.46,        // 1周期のうち、振り上げの割合
	strike: 0.16,        // 振り下ろし（★だんだん速くなる）
	hitStopMs: 45,       // ふつうの命中で止まる時間
	breakStopMs: 75,     // 最後の一撃で止まる時間（★2〜3コマ）
	clangStopMs: 60,     // 弾かれたとき
	shakeHit: 1, shakeBreak: 3, shakeMs: 170,
	chunks: 8, bits: 18, dust: 24,        // 大きな破片・細かい破片・粉塵
	// ★素材の飛び方（爆散 → 滞空 → 吸引）は下の FLY にまとめた（2026-09-19）
	nextOreMs: 220,      // 次の鉱石が出るまで
	revealMs: 140,       // 次の鉱石が浮かび上がる時間
	slideMs: 260         // スワイプで壁が動く時間
};

// ============================================================
// ■ ツルハシ・鉱石・素材（★仮の数値）
// ============================================================
//   ★★★数字は js/mining-balance.js にまとめてある（2026-09-20(5) 島さんの指定）。
//     ここでは、その表を読むだけ ＝ バランスを直すときは、あのファイル1つだけ直す。
//     ★確かめる道具（tools/mining-balance-sim.js）も同じ表を読む ＝ 二重管理にならない
var B = global.DotMiningBalance;
var HEADS = B.HEAD_TIERS;          // 何を壊せるか（段）と一撃の強さ（power）
var HANDLES = B.HANDLE_TIERS;      // 振る速さ（cycle ms）
var SKIP_MUL = B.SKIP_MUL;         // 飛び級（1段飛ばし）の重さ
var MATS = B.MATERIAL_DEFS;        // 素材8種
var MAT_IDS = B.MATERIAL_IDS;
var ORES = B.ORE_DEFS;             // 鉱石6種（★hp / req（要る HEAD の段）/ drops / 色 / 壊れ方）
var STARTER_BREAKS = B.STARTER.breaks, STARTER_ROCKS = B.STARTER.rocks;
function oreDef(id) { return B.oreDef(id); }

// ---- 画面の置き場 ----
var ORE_X = 112, ORE_Y = 76, ORE_RX = 58, ORE_RY = 64;   // 鉱石の中心と大きさ（★島さんの絵の鉱石に合わせた）
var SPACING = W;                                           // 隣の鉱石との間（★背景の絵1枚ぶん。★壁の絵がそのまま並ぶ）
// ★★鉱石の中心（2026-09-19 島さんの指定）: ツルハシの先・火花・粉・ヒビの始まりは、みんなここを使う
//   ★いま表示している鉱石の絵の「実際の中心」（★下で絵の形から計算する。★絵が変わっても自動で合う）
var ORE_CENTER = { x: ORE_X, y: ORE_Y };
var HIT = ORE_CENTER;                                      // ツルハシの先が当たる所 ＝ 鉱石の中心（★同じもの）
// ★★左上のツルハシの印 → 右上へ（2026-09-20(6) 島さんの指定）。★少し大きく（押しやすく）
// ★★見た目 24×24・押せる範囲 30×28（2026-09-20(10) 島さんの指定。★見た目以上に押しやすく）
var CRAFT_ICON = { x: 212, y: 2, w: 24, h: 24, hit: { x: 210, y: 0, w: 30, h: 28 } };
// ★★所持数は「画面の左はしに、上から縦に、ぜんぶ」（2026-09-20(6) 島さんの指定）
//   ★アイコン＋数字だけ（枠なし）。★素材はそれぞれ自分のアイコンへ飛んでいく

var UPGRADE_FX_MS = 400;
// ★★初めての素材だけ: ほんの少し長く浮いてから吸い込まれる／届いたあと光っている長さ（2026-09-20(9)）
var MAT_NEW_HANG = 110, MATFX_MS = 700;
// ★スワイプの案内（2026-09-19(2) 島さんの指定）: 壊せない鉱石を叩いて止まったら、隣へ行ける向きへ小さな光が流れる
//   ★文字は出さない。★流れて消える → 少し待つ → また流れる。★スワイプを始めたら消える
//   ★このプレイ中に一度スワイプしたら、次からは短く・薄く（★保存はしない）
// ★「NEW」（2026-09-20 島さんの指定）: HEAD か HANDLE のどちらかが今すぐ作れるときだけ、左上のツルハシの横に小さく出す
//   ★未読の知らせではなく「いま作れる」という状態の表示 ＝ クラフト画面を開いても消えない。作れなくなったら消える
//   ★出るのは「最後の素材が所持数に届いた瞬間」（★飛んでいる途中では出ない ＝ s.mats だけで判定）
var NEW_TEXT = "NEW", NEW_POP_MS = 220, NEW_BREATH_MS = 1300;
// ★★NEW を「キラッ」のあとに回す分（ms。★2026-09-21(3) 島さんの指定「数字 → キラッ → NEW」）
var NEW_AFTER_SPARK = 180;
// ★作り上げたときの演出（★音と合わせる）: 沈んでカチッとはまる → 火花 → ふちを光が1周
var MAKE_FX = { sinkMs: 110, sink: 3, sparkAt: 90, sweepFrom: 170, sweepMs: 220 };
// ★初めて見る鉱石は、少しだけ光る（★文字では説明しない。★叩いてみて「カァン！」で分かる）
var DISCOVER_MS = 500;
// ★HANDLE を上げた直後に、同じ鉱石を何個出すか（★速さを見くらべるため）
var FAMILIAR_N = 3;
var GUIDE = { delayMs: 260, travelMs: 460, pauseMs: 420, dist: 34, loops: 4, loopsLearned: 1, dy: 20 };
var swipeLearned = false;
// ============================================================
// ■ 素材の飛び方（2026-09-19 島さんの指定）: 爆散 → 短い滞空 → 曲線で吸い込まれる
// ============================================================
//   ★採掘を止めない: 素材は採掘の上に重なって流れるだけ（★次の鉱石・振り・ヒットストップとは無関係）
//   ★軌道は生まれた瞬間に全部決める（★初速・角度・制御点・軌道タイプ・吸い込み開始）。★毎フレーム乱数を引かない
//   ★吸引 ＝ 3次ベジェ曲線（P0 滞空の終わり → P3 アイコンのまん中）。★速さは「遅い → 中 → 最後だけ速い」
//   時間は ms。[最小, 最大] はその間で1回だけ決める
var FLY = {
	// ★★4つの時間に分けた（2026-09-20(10) 島さんの指定）: 爆散 → 自由飛行 → 短い滞空 → 吸引
	//   ★★合計を長くしてよい（★採掘とは別に流れるので、次の鉱石は待たせない）
	//   ★★最初の 345ms 以上は「所持数の場所をまったく気にしない自由な動き」
	burstMs: [120, 165], freeMs: [150, 225], hangMs: [75, 120], pullMs: [280, 350],   // 通常: 合計 625〜860ms
	rareBurstMs: [130, 170], rareFreeMs: [190, 270], rareHangMs: [110, 150], rarePullMs: [320, 400],   // レア: 合計 750〜990ms
	burstKeep: .45,           // ★爆散の終わりに残る速さ（★1 = 落ちない。★前は .2 ＝ すぐ止まっていた）
	freeKeep: .4,             // ★自由飛行の終わりに残る速さ（★爆散の終わりに対して）
	hangKeep: .22,            // ★滞空の終わりに残る速さ（★自由飛行の終わりに対して）
	stagger: [20, 40],        // 同じ素材が何個も出たとき、1個ごとに吸い込みを遅らせる（★カチッ カチッ と1つずつ）
	burstSpeed: [260, 400],   // 爆散の初速（px/秒。★鉱石の中から広く飛び散る）
	upBias: .15,              // 爆散を上向きに寄せる強さ（★左右・斜め上・斜め下へ広く）
	slingMix: .18,            // ★通常素材が「反対側まで飛んでから戻る」割合（★飛び方の差を見せる）
	spiralMix: .1,            // ★通常素材が最後に弱い螺旋を描く割合
	hangGravity: 140,         // 滞空のわずかな重力（px/秒²）
	freeGravity: 95,          // 自由飛行のゆるい重力（px/秒²。★少し沈んでから戻ってくる）
	curve: .5,                // 吸引のふくらみ（★まっすぐな線からのずれ ＝ 距離 × これ × 群れの強さ）
	sMix: .3,                 // 通常素材のうち、弱いS字にする割合
	spiralTurn: [.25, .5], spiralR: 9,   // 螺旋: 1/4〜1/2 回転・半径
	easeStart: .35,           // 吸引の出だしの速さ（★1 で一定速。★小さいほど「最後だけ速い」）
	max: 48,                  // 同時に飛べる数（★超えたら古いものから、すぐ所持数へ）
	popMs: 120, popScale: .15 // 届いたとき: アイコンが 100% → 115% → 100%
};
//   ★軌道タイプ（★ここで切り替え・足す）: sling = 最初にアイコンと反対へ飛ぶ／s = 弱いS字／spiral = 最後に弱い螺旋／glint = 滞空で光る
var FLIGHTS = {
	normal_curve: {},
	s_curve: { s: true },
	slingshot: { sling: true },
	spiral: { spiral: true },
	rare: { sling: true, spiral: true, glint: true }
};
//   ★群れ: 同じ素材の何個目か → 飛び出す向き（dir）・ふくらむ側（bulge: -1 上 / 1 下 / 0 どちらでも）・ふくらみの強さ（bend）
//     ・速さ（speed）・吸い込みの長さ（pull）・S字か（s）。★届くのは 20〜40ms ずつ（FLY.stagger）
var FLOCK = [
	{ dir: Math.PI, bulge: -1, bend: 1.1, speed: 1, pull: 1 },              // 1個目: 左へ飛ぶ → 大きな上カーブ
	{ dir: 0, bulge: 1, bend: 1, speed: 1, pull: 1 },                      // 2個目: 右へ飛ぶ → 下から回り込む
	{ dir: -Math.PI / 2, bulge: 0, bend: .45, speed: .9, pull: 1 },        // 3個目: 上へ飛ぶ → 小さなカーブ
	{ dir: null, bulge: 0, bend: .7, speed: .45, pull: .8, hang: 40 },     // 4個目: 手前で少し漂う → 速く吸い込まれる
	{ dir: null, bulge: 0, bend: .6, speed: .7, pull: 1, s: true }         // 5個目: まん中寄り → 短いS字
];   // ★作ったときの演出の長さ（★アイコンがふくらむ・光が飛ぶ・新しい名前）
// ★★★★★ 4 つの採掘ポイント（2026-09-21(8) 島さんの指定）。
//   ★前は 3〜5 個の「ちょうど良い数」でしたが、★★**役割を持たせるので 4 つに固定**。
//   ★★★SHALLOW / STANDARD / DEEP / RICH（★中身は `js/mining-balance.js` の `POINTS`）
var SITE_MIN = 3, SITE_MAX = 5;
var POINT_N = (B.POINT_N || 4);

// ============================================================
// ★★★★★ポイントごとの状態（`s.site.pts[i]`）2026-09-21(8)
// ============================================================
//
//   ★★**これが無かったのが「空の穴」バグの原因でした**。
//     ★前は `s.nextIn`（次の鉱石までの時間）が★★**画面全体で 1 つだけ**で、
//     ★★★時間が来たときに**「その瞬間見ている場所」**へ置いていました。
//     ★だから壊した直後になぞると、★★壊した場所は**永久に空**、
//     ★★★しかも隣の鉱石が**上書き**されていました（═ なぞるだけで引き直せた）。
//
//   ★★★★**いまは、時間も次の鉱石もポイントが自分で持ちます**。
//     ★見ていなくても進みます（★戻ったらもう出ている）。
//     ★★**次の鉱石は「壊した瞬間」に決まります**（═ なぞっても変わらない）。
function ptRng(pt) { var x = pt.rng || 1; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; pt.rng = x >>> 0; return pt.rng / 4294967296; }
function points(s) { return (s.site && s.site.pts) || []; }
function pointAt(s, i) { var a = points(s); return a[i] || a[0] || null; }
function curPt(s) { return pointAt(s, s.site ? s.site.at : 0); }
// ★そのポイントの役割にあった鉱石を 1 つ（★ポイント自分のサイコロを使う）
//   ★★世界の進みは `headProg(s)`（headMax）／★壊せるかは `s.head`（いまの装備）
function pickOreAtPoint(s, i) {
	var pt = pointAt(s, i); if (!pt) return pickOre(s);
	return B.pickOreAt(function () { return ptRng(pt); }, headProg(s), s.head, pt.role);
}
// ★そのポイントで、いまの装備で壊せる鉱石を 1 つ
function pickBreakableAtPoint(s, i) {
	for (var k = 0; k < 12; k++) { var id = pickOreAtPoint(s, i); if (B.canBreak(id, s.head)) return id; }
	return ORES[0].id;
}
// ★★そのポイントに置く鉱石を 1 つ作る（★役割 ＋ ソフトロックの決まりを通して）
function newOreAt(s, i, want) {
	var pt = pointAt(s, i);
	var id = want || pickOreAtPoint(s, i);
	// ★★★SHALLOW は**原則 100% 壊せる**（★古い HEAD へ戻しても遊べる）
	if (pt && B.POINTS[pt.role] && B.POINTS[pt.role].safe && !B.canBreak(id, s.head)) id = pickBreakableAtPoint(s, i);
	var d = oreDef(id);
	return { type: d.id, hp: d.hp, max: d.hp, seed: Math.floor((pt ? ptRng(pt) : rng(s)) * 1e9) >>> 0, met: false };
}
// ★★★★★ 4 ポイント全体の安全保証（★島さんの指定：**2 つ以上は必ず壊せる**）
var SAFE_POINTS = 2;

// ★★★★★ポイントごとの小さな見た目の差（2026-09-21(8) 島さんの指定）
//   ★★**今回は大がかりな新背景を作りません**。★壁の色をごくわずか寄せるだけ。
//   ★★★**将来、この表を差し替えれば背景ごと変えられます**（★拡張口）。
//   ★★★★**鉱石の見やすさを邪魔しない**こと（★混ぜるのは 1 割前後まで）
var POINT_TINT = [
	{ r: 18, g: 8, b: -6, mix: .10 },    // ① SHALLOW … 少し茶色寄り
	{ r: 0, g: 0, b: 0, mix: 0 },        // ② STANDARD … いまの色のまま
	{ r: -10, g: -8, b: 0, mix: .12 },   // ③ DEEP … 少し暗い
	{ r: -2, g: 4, b: 16, mix: .09 }     // ④ RICH … ごく少量の結晶寄り
];
// ★★★★★いまどこにいるかの目印（● ○ ○ ○）
//   ★**文字は出しません**（★島さんの指定「長い説明文は不要」）。
//   ★★切り替わった瞬間だけ、一瞬大きくなる
//   ★★下は瓦礫の絵で暗いので、★**小さな下敷き**を敷いてから描きます（★無いと埋もれて読めない）
// ★★★★★目印の出し入れ（2026-09-22 島さんの指定）
// ============================================================
//
//   ★★**掘っている間は、鉱石と素材だけに集中させる**。
//   ★★★**指を離したら、ふわっと戻ってくる**。
//
//   ★★★★**押した瞬間には消しません**。
//     ★なぞるために触っただけで消えてしまうからです。
//     ★★消すのは、★★★**ツルハシが実際に 1 発当たった瞬間**（`s.digging`）。
//     ★短いタップは当たる前に戻るので、★★**ちらつきません**。
//
//   ★★★★★**新しいタイマーは作っていません**（★既存の命中の仕組みをそのまま使う）。
//     ★`setTimeout` も使いません（★毎フレーム、濃さを目標へ近づけるだけ）。
var PFADE = {
	out: 120,     // ★掘り始めたら消えるまで（ms）
	wait: 60,     // ★★離してから、戻り始めるまでの「間」
	in: 180       // ★★★戻るのは少しゆっくり（★邪魔にならず、ふわっと戻る）
};
var PIND = { on: 1, y: 152, gap: 11, r: 3, pop: 220,
	dim: "#6f7691", lit: "#fff1e8", ring: "#141827",
	pad: 4, padH: 9, plate: "#0d101a", plateTop: "#232a42" };
// ★壁の色に、その場所の味を少しだけ混ぜる
function tintWall(col, t) {
	if (!t || !t.mix) return col;
	var v = parseInt(col.slice(1), 16), R = v >> 16, G = (v >> 8) & 255, Bl = v & 255;
	R = clamp(Math.round(R + t.r * t.mix * 10), 0, 255);
	G = clamp(Math.round(G + t.g * t.mix * 10), 0, 255);
	Bl = clamp(Math.round(Bl + t.b * t.mix * 10), 0, 255);
	return "#" + ((1 << 24) + (R << 16) + (G << 8) + Bl).toString(16).slice(1);
}
function ensureSafePoints(s) {
	var ores = s.site.ores, have = breakableCount(s, ores), i;
	if (have >= Math.min(SAFE_POINTS, ores.length)) return false;
	// ★SHALLOW（役割 0）から順に、壊せる鉱石へ差し替える（★作り直しはしない）
	var order = ores.map(function (o, j) { return j; }).sort(function (a, b) {
		var ra = pointAt(s, a), rb = pointAt(s, b);
		return (ra ? ra.role : a) - (rb ? rb.role : b);
	});
	for (i = 0; i < order.length && have < Math.min(SAFE_POINTS, ores.length); i++) {
		var j = order[i];
		if (ores[j] && B.canBreak(ores[j].type, s.head)) continue;
		ores[j] = newOreAt(s, j, pickBreakableAtPoint(s, j)); have++;
	}
	return true;
}

// ---- この画面だけのサイコロ（★世界のサイコロには触らない） ----
function rng(s) { var x = s.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; s.rng = x >>> 0; return s.rng / 4294967296; }
function hash(n) { n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); n = Math.imul(n ^ (n >>> 16), 0x45d9f3b); return ((n ^ (n >>> 16)) >>> 0) / 4294967296; }
function h2(a, b) { return hash(Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 0x9e37, 668265263)); }
function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }
function event(s, type, data) { if (s.events.length < 24) s.events.push({ type: type, data: data || {} }); }
// ★どの鉱石が出るかは HEAD の段で変わる（★古い鉱石も残る／次の鉱石が 5% 混ざる）
// ★★どの鉱石が出るかは **進み具合**（headMax）。★装備を戻しても、世界は巻き戻らない
function pickOre(s) { return B.pickOreId(function () { return rng(s); }, headProg(s)); }
// ★いまの HEAD の「ひとつ上」の鉱石（★未来予告に使う）
function nextLockedOre(s) {
	for (var i = 0; i < ORES.length; i++) if (ORES[i].req === headProg(s) + 1) return ORES[i].id;
	return ORES[ORES.length - 1].id;
}
function newOre(s, id) { var d = oreDef(id || pickOre(s)); return { type: d.id, hp: d.hp, max: d.hp, seed: Math.floor(rng(s) * 1e9) >>> 0, met: false }; }
// ============================================================
// ■ 「壊せない鉱石だけで詰む」を、生成の決まりとして禁止する（2026-09-20(8) 島さんの指定）
// ============================================================
//   ★かたまり（1地点の 3〜5個）には、必ず「いまの HEAD で壊せる鉱石」が残る
//   ★上限は js/mining-balance.js の GROUP（初期 25% / 中盤 40% / 後半 50%）
//   ★★スワイプでは鉱石を作り直さない（＝ レア厳選にならない）。★決めるのは「生まれるとき」だけ
function lockedCount(s, ores) {
	var n = 0; (ores || []).forEach(function (o) { if (o && !B.canBreak(o.type, s.head)) n++; });
	return n;
}
function breakableCount(s, ores) {
	var n = 0; (ores || []).forEach(function (o) { if (o && B.canBreak(o.type, s.head)) n++; });
	return n;
}
// ★いまの HEAD で壊せる鉱石を1つ（★ふだんの出やすさのまま選び、どうしても出なければ岩）
function pickBreakableOre(s) {
	for (var i = 0; i < 12; i++) { var id = pickOre(s); if (B.canBreak(id, s.head)) return id; }
	return ORES[0].id;
}
// ★これから置く鉱石が「壊せない」とき、上限を超えるなら壊せる鉱石に差し替える
//   slot = いま空けている場所（★そこは数に入れない）
function guardOre(s, o, slot) {
	var ores = s.site ? s.site.ores : [], n = ores.length, locked = 0;
	for (var i = 0; i < n; i++) { if (i === slot) continue; var q = ores[i]; if (q && !B.canBreak(q.type, s.head)) locked++; }
	if (B.canBreak(o.type, s.head)) return o;
	// ★★差し替えるときも、★その場所の役割とサイコロを使う（2026-09-21(8)）
	return locked + 1 > B.maxLocked(headProg(s), n)
		? (Number.isFinite(slot) && pointAt(s, slot) ? newOreAt(s, slot, pickBreakableAtPoint(s, slot)) : newOre(s, pickBreakableOre(s)))
		: o;
}
// ★かたまり全体を決まりに合わせる（★生まれたとき・読み込んだときだけ呼ぶ）
//   need = 壊せる鉱石の下限。★足りない分だけ差し替え、ほかの LOCKED はそのまま残す
function fixGroup(s, ores, need) {
	var n = ores.length, have = breakableCount(s, ores);
	for (var i = n - 1; i >= 0 && have < need; i--) {
		if (ores[i] && B.canBreak(ores[i].type, s.head)) continue;
		ores[i] = pointAt(s, i) ? newOreAt(s, i, pickBreakableAtPoint(s, i)) : newOre(s, pickBreakableOre(s)); have++;
	}
	return ores;
}

// ============================================================
// ■ 状態
// ============================================================
//   saved = 保存から戻す分（mats / head / handle / site）。★無ければ最初から
function create(seed, saved) {
	var s = { rng: (seed >>> 0) || 1, clock: 0, phase: "mine", held: false, swinging: false, swingT: 0, cycleMs: 0,
		stop: 0, shake: 0, shakeAmp: 0, blocked: false, events: [], sfx: [],
		mats: { iron: 0, carbon: 0, quartz: 0, crystal: 0 }, head: 0, handle: 0, headMax: 0, handleMax: 0, equipSel: -1,   // ★★head / handle = いま装備しているもの／★headMax / handleMax = これまでに作ったいちばん上
		site: null, camX: 0, slideFrom: 0, slideT: 1, chunks: [], bits: [], dust: [], sparks: [], pickups: [],
		nextIn: 0, reveal: 1, craftKind: null, craftSel: -1, menuT: 0, craftT: 0, pulse: 0, flash: 0, dirty: false, pressX: null, swiped: false,
		broken: 0, pop: {}, chain: {}, hudBits: [], iconDown: false, canUp: false, newPop: 0, pity: {}, seenOre: {}, discover: 0, hud: null, hudKey: "", lastOre: null, familiar: null,
		seenMat: {}, matOrder: [], matFx: {},   // ★★見つけた素材（★見つけた順に並ぶ）／見つけた直後の光
		sparkQ: [], spark: null, newHold: 0, pendingShow: null, show: null,
		// ★★★★★「いま作れるよ」のキラキラ（2026-09-21(7)）。★光っているのは常に1つだけ
		uspark: null, usparkWait: USPARK.first, usparkTurn: 0, usparkKey: "", usparkSeq: 0,
		pindPop: 0,   // ★★場所の目印の反応（2026-09-21(8)）
		// ★★★★★目印の濃さと「間」（2026-09-22）。★`digging` = ツルハシが当たったか
		digging: false, pindA: 1, pindWait: 0, pindHide: false,   // ★★強化したあとの「予告」（★次に採掘画面へ戻ったとき、一度だけ）   // ★★届いたあとの「キラッ」の待ち行列と、いま光っているもの／NEW を少しだけ後ろへ
		canUpHead: false, canUpHandle: false, newPopHead: 0, newPopHandle: 0,   // ★部位ごとの NEW
		headMade: 0, handleMade: 0, scroll: 0, scrollV: 0, snap: null, snapPop: 0, dragClock: 0, tapAt: null, craftDrag: false, side: 0, sideAnim: null, sideOther: null };   // chain = 続けて届いた数（★音が少しずつ高く）／hudBits = 届いたときの粒   // broken = これまでに砕いた数（★はじめの体験に使う）／pop = 所持数が一瞬ふくらむ残り時間
	if (saved) {
		MAT_IDS.forEach(function (k) { var v = saved.mats && saved.mats[k]; if (Number.isFinite(v) && v >= 0) s.mats[k] = Math.floor(v); });
		// ★★古いセーブには headMax が無いので、「装備 ＝ 最高」として移す（★装備状態は変えない）
		if (saved.head >= 0 && saved.head < HEADS.length) s.head = saved.head | 0;
		if (saved.handle >= 0 && saved.handle < HANDLES.length) s.handle = saved.handle | 0;
		s.headMax = Number.isFinite(saved.headMax) && saved.headMax >= 0 && saved.headMax < HEADS.length ? saved.headMax | 0 : s.head;
		s.handleMax = Number.isFinite(saved.handleMax) && saved.handleMax >= 0 && saved.handleMax < HANDLES.length ? saved.handleMax | 0 : s.handle;
		if (s.head > s.headMax) s.headMax = s.head;                    // ★こわれた値でも、つじつまが合うように
		if (s.handle > s.handleMax) s.handleMax = s.handle;
		if (saved.broken >= 0) s.broken = Math.floor(saved.broken);
		if (saved.seenOre && typeof saved.seenOre === "object") ORES.forEach(function (o) { if (saved.seenOre[o.id]) s.seenOre[o.id] = 1; });
		// ★★見つけた素材（2026-09-20(9)）: 順番 → 一覧 → ★古い保存には無いので「1つでも持っていれば発見済み」
		//   ★一度見つけた素材が「?」に戻ることは無い
		if (Array.isArray(saved.matOrder)) saved.matOrder.forEach(function (k) { if (MAT_IDS.indexOf(k) >= 0) { reserveMat(s, k); s.seenMat[k] = 1; } });
		if (saved.seenMat && typeof saved.seenMat === "object") MAT_IDS.forEach(function (k) { if (saved.seenMat[k]) { reserveMat(s, k); s.seenMat[k] = 1; } });
		MAT_IDS.forEach(function (k) { if (s.mats[k] > 0) { reserveMat(s, k); s.seenMat[k] = 1; } });
		// ★作った段の記録（★古い保存には無いので、いまの段までは「作った」とみなす）
		["head", "handle"].forEach(function (k) { var v = saved[madeKey(k)], cur = tierMax(s, k);
			s[madeKey(k)] = Number.isFinite(v) && v >= 0 ? Math.floor(v) : (cur ? (1 << (cur + 1)) - 1 : 0); });
		if (saved.site && Array.isArray(saved.site.ores) && saved.site.ores.length >= SITE_MIN && saved.site.ores.length <= SITE_MAX) {
			var sv = saved.site, base = sv.seed >>> 0;
			s.site = { seed: base, at: clamp(sv.at | 0, 0, sv.ores.length - 1), ores: sv.ores.map(function (o) {
				var d = oreDef(o.type); return { type: d.id, hp: clamp(Number(o.hp) || d.hp, 1, d.hp), max: d.hp, seed: o.seed >>> 0, met: !!o.met }; }), pts: [] };
			// ★★★★★ポイントごとの状態を戻す（2026-09-21(8)）。
			//   ★古い保存には `pts` が無いので、★★**並び順をそのまま役割にする**（★鉱石は 1 つも作り直さない）
			var pv = Array.isArray(sv.pts) ? sv.pts : [];
			s.site.ores.forEach(function (o, i) {
				var q = pv[i] || {};
				s.site.pts.push({
					role: clamp(Number.isFinite(q.role) ? q.role : i, 0, POINT_N - 1),
					rng: (q.rng >>> 0) || ((base + i * 2654435761) >>> 0) || (i + 1),
					nextIn: Math.max(0, Math.min(FEEL.nextOreMs, Number(q.nextIn) || 0)),
					next: null, reveal: 1
				});
				// ★★空の場所を保存から戻したときは、★★★**必ず次の鉱石を持たせる**
				//   （★古い保存は空を岩として保存していたので、ここはふつうは通らない）
				if (!o) { var pt = s.site.pts[i]; pt.next = newOreAt(s, i); pt.nextIn = pt.nextIn || FEEL.nextOreMs; }
			});
			// ★★古い保存の救済（2026-09-20(8)）: 全部が壊せない状態なら、1個だけ壊せる鉱石に差し替える
			//   ★作り直さない／ほかの LOCKED はそのまま残す（★戻ってきて砕く楽しみを消さない）
			if (breakableCount(s, s.site.ores) === 0) fixGroup(s, s.site.ores, 1);
		}
	}
	if (!s.site) {
		// ★★★★★**必ず 4 つ**（2026-09-21(8)）。★左から SHALLOW / STANDARD / DEEP / RICH
		var n = POINT_N, ores = [], seed0 = Math.floor(rng(s) * 1e9) >>> 0, i, j;
		s.site = { seed: seed0, at: 0, ores: ores, pts: [] };
		for (i = 0; i < n; i++) s.site.pts.push({ role: i, rng: ((seed0 + i * 2654435761) >>> 0) || (i + 1), nextIn: 0, next: null, reveal: 1 });
		for (i = 0; i < n; i++) ores.push(newOreAt(s, i));
		// ★いまの HEAD では壊せない鉱石を1つ混ぜる（★「カァン！」→ 強化 → 戻って「ピシッ」）
		//   ★★置くのはいちばん右（RICH）だけ。★★★SHALLOW には絶対に置かない
		if (B.maxLocked(headProg(s), n) >= 1 && !ores.some(function (o) { return !B.canBreak(o.type, s.head); })) ores[n - 1] = newOreAt(s, n - 1, nextLockedOre(s));
		// ★★壊せる鉱石が足りなければ差し替える（★ソフトロックを生成の決まりとして禁止）
		fixGroup(s, ores, B.minBreakable(headProg(s), n));
		if (s.broken < STARTER_ROCKS) ores[0] = newOreAt(s, 0, "rock");   // ★はじめの体験は岩から
	}
	// ★★★★★どんなときも、**2 つ以上は壊せる**（★全部 LOCKED は禁止）
	ensureSafePoints(s);
	s.camX = s.site.at * SPACING;
	s.canUpHead = canUpgradePart(s, "head"); s.canUpHandle = canUpgradePart(s, "handle"); s.canUp = s.canUpHead || s.canUpHandle;   // ★読み込み直後は音を鳴らさない
	return s;
}
// ★保存する分（★キャンプ側のクラフト・装備からも読めるように、素材はそのままの名前で）
function saveData(s) {
	return { mats: JSON.parse(JSON.stringify(s.mats)), head: s.head, handle: s.handle, headMax: s.headMax, handleMax: s.handleMax, broken: s.broken, headMade: s.headMade, handleMade: s.handleMade, seenOre: JSON.parse(JSON.stringify(s.seenOre)),
		seenMat: JSON.parse(JSON.stringify(s.seenMat)), matOrder: s.matOrder.slice(),   // ★見つけた素材と、その順番
		site: { seed: s.site.seed, at: s.site.at, ores: s.site.ores.map(function (o, i) {
			// ★★★★★砕けた直後（次の鉱石が出る前）は、★**もう決まっている次の鉱石**を保存する。
			//   ★前は「ふつうの岩」にすり替えていたので、★★保存すると鉱石が変わっていました
			var pt = (s.site.pts || [])[i], q = o || (pt && pt.next);
			if (!q) return { type: ORES[0].id, hp: ORES[0].hp, seed: (s.site.seed + i * 7919) >>> 0, met: false };
			return { type: q.type, hp: q.hp, seed: q.seed, met: q.met }; }),
			// ★★ポイントごとの役割・サイコロ・残り時間（★途中のヒビは鉱石の hp に入っています）
			pts: (s.site.pts || []).map(function (pt, i) {
				return { role: pt.role, rng: pt.rng >>> 0, nextIn: o0(s, i) ? 0 : Math.round(pt.nextIn || 0) }; }) } };
}
function o0(s, i) { return s.site.ores[i]; }
function ore(s) { return s.site.ores[s.site.at]; }
function cycle(s) { return HANDLES[s.handle].cycle; }
function canBreak(s, o) { return !!o && B.canBreak(o.type, s.head); }
function damageOf(s, o) { return HEADS[s.head].power; }   // ★発数 = ceil(鉱石の hp / これ)

// ============================================================
// ■ 操作
// ============================================================
function press(s, x, y) {
	if (!s) return false;
	if (s.phase === "craft") { s.tapAt = { x: x, y: y }; s.craftDrag = false; return true; }   // ★決めるのは離したとき（★上下になぞると取り消し）
	// ★★押した瞬間は「沈む」だけ。★開くのは指を離したとき（2026-09-20(10)）
	if (x != null && y != null && inBox(CRAFT_ICON.hit, x, y)) { s.iconDown = true; s.held = false; return true; }
	if (s.show) hurryShow(s);   // ★★予告の最中に押されたら、のこりを縮めてすぐ採掘へ
	s.held = true; s.blocked = false; s.pressX = x; s.swiped = false;
	if (!s.swinging) startSwing(s);
	return true;
}
function release(s) {
	if (!s) return;
	if (s.iconDown) { s.iconDown = false; s.phase = "craft"; s.craftKind = null; s.craftSel = -1; s.menuT = 0; s.craftT = 0; s.held = false; event(s, "open"); return; }
	if (s.phase === "craft") { var t = s.tapAt; s.tapAt = null;
		if (s.craftDrag) { if (Math.abs(s.side || 0) > .5) dragSideEnd(s); else dragEnd(s); }
		else if (t) craftTap(s, t.x, t.y);
		s.craftDrag = false; return; }
	s.held = false; s.pressX = null;
	s.digging = false;   // ★★★指を離した ＝ 目印がふわっと戻ってくる（2026-09-22）
}

// ★左右スワイプ: 壁ごと横へ。★その地点の 3〜5 個の中だけ（★端で止まる）
function swipe(s, dir) {
	if (!s || s.phase !== "mine" || s.slideT < 1) return false;
	var to = s.site.at + (dir > 0 ? 1 : -1);
	if (to < 0 || to >= s.site.ores.length) { s.shake = 90; s.shakeAmp = 1; event(s, "edge"); return false; }
	s.held = false; s.swiped = true; s.slideFrom = s.camX; s.slideT = 0; s.site.at = to; s.blocked = false; s.dirty = true;
	s.digging = false;   // ★★なぞっている間は目印を見せる（★○●○○ が動くのが大事）
	// ★★場所が変わった合図（2026-09-21(8)）。★小さな「コッ」と、目印が一瞬大きくなるだけ
	s.pindPop = PIND.pop;
	event(s, "point", { at: to, role: (s.site.pts[to] || {}).role });
	s.guide = null; swipeLearned = true;
	event(s, "slide", { dir: dir });
	return true;
}
// ★指（マウス）が横へ動き始めた ＝ スワイプを始めた → 案内はすぐ消す
function dragStart(s) { if (s) s.guide = null; }
function startSwing(s) { s.swinging = true; s.swingT = 0; s.cycleMs = cycle(s); s.hitDone = false; }

// ---- クラフト（2026-09-20 島さんの指定で作り直し） ----
//   画面は2段: ① HEAD か HANDLE を選ぶ（★大きな絵2つだけ）→ ② その部位の「いま ＋ 先の2個」
//   ★NEXT 1 = すぐ上の段（安い・早い）／NEXT 2 = 1個飛ばし（重い・大きく強くなる）。★NEXT 3 以降は見せない
//   ★飛び級すると、飛ばした段は作らなくてよい（★そのまま2段上へ）
function tiers(kind) { return kind === "head" ? HEADS : HANDLES; }
// ============================================================
// ★★★★「いま使っている装備」と「どこまで進んだか」は別もの（2026-09-21(5) 島さんの指定）
// ============================================================
//   tierNow … いま装備しているもの（★過去の装備へ戻せる）
//   tierMax … これまでに作った いちばん上（★★戻しても、ここは下がらない）
//   ★★これから作れるもの・NEXT・NEW・??? は **ぜんぶ tierMax が基準**
//   ★★★世界（どの鉱石が出るか）も tierMax。★壊せるかどうかだけが tierNow
function tierNow(s, kind) { return kind === "head" ? s.head : s.handle; }
function tierMax(s, kind) { return kind === "head" ? s.headMax : s.handleMax; }
function headProg(s) { return s.headMax; }   // ★世界の進み具合（★装備を戻しても巻き戻らない）
function tierAt(s, kind, step) { return tiers(kind)[tierMax(s, kind) + step] || null; }
// ★その段を作るのに要る材料（★step 2 ＝ 飛び級は SKIP_MUL 倍）
function costOf(s, kind, step) {
	var t = tierAt(s, kind, step); if (!t || !t.cost) return null;
	if (step === 1) return t.cost;
	var out = {}; Object.keys(t.cost).forEach(function (k) { out[k] = Math.ceil(t.cost[k] * SKIP_MUL); }); return out;
}
function affordable(s, cost) { return !!cost && Object.keys(cost).every(function (k) { return (s.mats[k] || 0) >= cost[k]; }); }
function canMake(s, kind, step) { return affordable(s, costOf(s, kind, step)); }
// ★いまアップグレードできるか（★HEAD / HANDLE × NEXT 1 / NEXT 2 のどれか1つでも作れれば true）
function canUpgradePart(s, kind) { return canMake(s, kind, 1) || canMake(s, kind, 2); }
function canUpgrade(s) { return canUpgradePart(s, "head") || canUpgradePart(s, "handle"); }
// ★作った段の記録（2026-09-20(3)）: ビットで持つ。★0段目（最初の装備）はいつも持っている
//   ★飛び級で飛ばした段はビットが立たない ＝ 履歴では SKIPPED
function madeKey(kind) { return kind === "head" ? "headMade" : "handleMade"; }
function owned(s, kind, i) { return i === 0 || !!(s[madeKey(kind)] & (1 << i)); }
function markMade(s, kind, i) { s[madeKey(kind)] |= (1 << i); }
function nextCost(kind, s) { return costOf(s, kind, 1); }   // ★前からの呼び名（NEXT 1 の材料）
function craft(s, kind, step) {
	step = step || 1;
	var cost = costOf(s, kind, step); if (!affordable(s, cost)) { event(s, "cant"); return false; }
	Object.keys(cost).forEach(function (k) { s.mats[k] -= cost[k]; });
	// ★★「いちばん上」を上げて、そのまま装備する（★装備は別に戻せる）
	if (kind === "head") { s.headMax += step; s.head = s.headMax; } else { s.handleMax += step; s.handle = s.handleMax; }
	// ★★HANDLE を上げた直後は、直前に掘っていたのと同じ鉱石を数個だけ出す（2026-09-20(7) 島さんの指定）
	//   ★いきなり硬い新鉱石だと、速くなったのが分からないため
	if (kind === "handle" && s.lastOre) s.familiar = { type: s.lastOre, n: FAMILIAR_N };
	markMade(s, kind, tierMax(s, kind));
	s.scroll = tierMax(s, kind); s.snap = null; s.scrollV = 0;   // ★作ったら、新しい装備がまん中へ   // ★作った段だけ記録（★飛ばした段は残らない ＝ SKIPPED）
	var name = tiers(kind)[tierMax(s, kind)].name;
	s.dirty = true; s.craftSel = -1; event(s, "upgrade_complete_" + kind, { kind: kind, name: name, step: step });   // ★音: 組み上がった音
	s.upFx = { kind: kind, name: name, ms: UPGRADE_FX_MS, sparks: [], made: 0 };
	// ★★採掘画面へ戻ったとき、一度だけ「予告」を出す（★両方そろえたら、まとめて一度）
	s.pendingShow = s.pendingShow || { head: false, handle: false };
	s.pendingShow[kind] = true;
	for (var i = 0; i < 4; i++) { var a = -Math.PI * (.1 + rng(s) * .8); s.upFx.sparks.push({ x: 10, y: 10, vx: Math.cos(a) * (40 + rng(s) * 50) * (i % 2 ? 1 : .6), vy: Math.sin(a) * (40 + rng(s) * 50) }); }
	return true;
}
// ---- 画面の置き場（★スマホで押しやすい大きさ。★スクロールなしで収まる） ----
var CRAFT = {
	// ★★戻る（左上）: 見た目 17×17・押せる範囲 26×26（★2026-09-20(10) 島さんの指定。★スマホで押しやすく）
	back: { x: 0, y: 0, w: 26, h: 26 }, backBox: { x: 3, y: 3, w: 17, h: 17 },
	pick: [{ kind: "head", x: 12 }, { kind: "handle", x: 124 }], pickY: 44, pickW: 104, pickH: 96,   // ①の大きな2択
	openMs: 160, dive: 120                                    // ①がひらく間・②へ入る間
};
// ★②装備の列（2026-09-20(4) 島さんの指定）: 上 ＝ 過去／★★まん中 ＝ いま使っているもの／下 ＝ これから
//   ★「NEXT 1 / NEXT 2」という言い方はやめた。★装備そのものを縦に並べる
var LIST = {
	top: 32, bottom: 158, rowH: 38, centerY: 95,   // 列の範囲・1段の高さ・まん中（★ここにあるものが装備中）
	side: 200, sideMs: 190, sideGo: 36, sideRubber: 10,   // ★左右になぞって HEAD ←→ HANDLE（★切り替わる距離／端で伸びる量）
	focusDrop: .17,          // まん中から1段離れるごとに、どれだけ暗くするか（★★大きさは変えない）
	rubberPx: 7,             // 端で引っぱったときに伸びる量（ドット）
	flingMs: 90,             // 指を離したあと、どれだけ滑るか（★長く滑らせない）
	snapMs: 190,             // いちばん近い装備へ吸い付く時間（★easeOutCubic）
	popMs: 130,              // 止まった瞬間の小さな手ごたえ（★音とチラつき。★★カードは拡大しない）
	parallax: 1.5            // 絵と文字の動きのわずかな差（ドット）
};
// ★縦の並び（★上から: 過去 → いま → NEXT 1 → NEXT 2 → ???）
//   kindOf: past（作った ＝ OWNED ／ 飛ばした ＝ SKIPPED）／current ／ next（step 1・2 だけ作れる）／mystery（???）
function historyRows(s, kind) {
	// ★★上から: 持っている装備（★EQUIPPED は1つだけ・どこにあってもよい）→ これから2つ → ???
	var top = tierMax(s, kind), eq = tierNow(s, kind), list = tiers(kind), rows = [], i;
	for (i = 0; i <= top; i++) rows.push(i === eq ? { i: i, kind: "current" } : { i: i, kind: "past", made: owned(s, kind, i) });
	for (i = 1; i <= 2; i++) if (list[top + i]) rows.push({ i: top + i, kind: "next", step: i });
	if (list[top + 3]) rows.push({ i: top + 3, kind: "mystery" });   // ★この先があることだけ見せる
	return rows;
}
// ★★その段に付け替えられるか（★OWNED だけ。★SKIPPED と ??? は不可）
function canEquip(s, kind, i) {
	return i >= 0 && i <= tierMax(s, kind) && i !== tierNow(s, kind) && owned(s, kind, i);
}
// ★★過去の装備へ付け替える（★進み具合は1つも下がらない）
function equipTier(s, kind, i) {
	if (!canEquip(s, kind, i)) return false;
	if (kind === "head") s.head = i; else s.handle = i;
	s.dirty = true; s.equipSel = -1; s.craftSel = -1;
	if (kind === "head") rescueAfterEquip(s);          // ★★弱い HEAD へ戻しても、叩ける鉱石が1つは残る
	s.pendingShow = s.pendingShow || { head: false, handle: false };
	s.pendingShow[kind] = true;                        // ★付け替えたあと、一度だけ「予告」（★作った音は鳴らさない）
	event(s, "equip_tool", { kind: kind, tier: i, name: tiers(kind)[i].name });
	return true;
}
// ★★弱い HEAD へ戻したとき、かたまりが全部壊せなくなったら **1個だけ** 岩に差し替える
//   ★★差し替えるのは ROCK だけ（★レア鉱石の厳選には使えない）。★ほかの鉱石はそのまま
//   ★★★かたまり全体は作り直さない（★行ったり来たりしても、引き直しにならない）
function rescueAfterEquip(s) {
	if (!s.site || breakableCount(s, s.site.ores) > 0) return false;
	var at = s.site.at;
	if (!s.site.ores[at]) at = s.site.ores.findIndex(function (o) { return !!o; });
	if (at < 0) return false;
	s.site.ores[at] = newOreAt(s, at, ORES[0].id);
	var rp = pointAt(s, at); if (rp) { rp.reveal = 0; rp.nextIn = 0; rp.next = null; }
	s.reveal = 0; s.dirty = true;
	return true;
}
// ★★装備の列を描いてよい場所（2026-09-20(7) 島さんの指定）。★上のヘッダーとは別の層
//   ★カードも文字も星も素材も ??? も、ここから外へは描かない（★横に切り替えている途中の隣のページも）
var UPGRADE_VIEWPORT = { x: 0, y: 32 - 1, w: W, h: 158 - 32 + 2 };
// ★ここだけを残して、外は描かないようにする（★canvas の切り抜き）
function clipTo(ctx, x, y, w, h) {
	if (!(ctx.save && ctx.beginPath && ctx.rect && ctx.clip)) return false;
	ctx.save(); ctx.beginPath(); ctx.rect(x, y, w, h); ctx.clip(); return true;
}
// ★i 段目の上端（★s.scroll ＝ まん中に来ている段。小数でもよい）
function rowTop(s, i) { return LIST.centerY - LIST.rowH / 2 + (i - s.scroll) * LIST.rowH; }
function rowScale(s, i) { var d = Math.min(1.4, Math.abs(i - s.scroll)); return Math.max(.7, 1 - d * LIST.focusDrop); }
// ★★動かせる範囲は「中身が画面をふさぐ」ところまで（2026-09-20(6) 島さんの指定）
//   ★これで、上にも下にも「何もない空白」が出ない。★中身が画面より短いときは、まん中に置いて動かさない
function scrollRange(s) {
	var n = historyRows(s, s.craftKind).length, vh = LIST.bottom - LIST.top, fill = (vh / 2 - LIST.rowH / 2) / LIST.rowH;
	if (n * LIST.rowH <= vh) { var c = (n - 1) / 2; return { lo: c, hi: c }; }   // ★短いときは、まん中で固定
	return { lo: fill, hi: (n - 1) - fill };
}
function minScroll(s) { return scrollRange(s).lo; }
function maxScroll(s) { return scrollRange(s).hi; }
function craftRows(s) {   // ★いま画面に出ている段（★押せるのは これから の段だけ）
	if (!s || !s.craftKind) return [];
	var V = UPGRADE_VIEWPORT;
	return historyRows(s, s.craftKind).map(function (r, i) {
		var c = cardRect(s, i, 0);
		// ★★どの段も同じ大きさ（2026-09-20(8)）。focus ＝ まん中に近いほど 1 に近い（★明るさにだけ使う）
		return c.y + c.h < V.y || c.y > V.y + V.h ? null : { row: r, i: i, y: c.y, h: c.h, x: c.x, w: c.w, card: c, content: contentRect(c), focus: rowScale(s, i), scale: 1 };
	}).filter(Boolean);
}
// ★端で引っぱったときだけ、少し伸びる（★離すと戻る）
function rubber(over) { var px = LIST.rubberPx * (1 - 1 / (1 + over * 2.2)); return px / LIST.rowH; }
function clampScroll(s, v) {
	var r = scrollRange(s);
	if (v < r.lo) return r.lo - rubber(r.lo - v);
	if (v > r.hi) return r.hi + rubber(v - r.hi);
	return v;
}
// ★指について動く（dy ＝ 指が下へ動いたドット数）
function dragScroll(s, dy) {
	if (!s || s.phase !== "craft" || !s.craftKind) return false;
	var d = -dy / LIST.rowH, dt = Math.max(8, s.clock - (s.dragClock || s.clock));
	s.snap = null; s.scroll = clampScroll(s, s.scroll + d);
	s.scrollV = s.scrollV * .4 + (d / dt) * .6;   // ★rows / ms
	s.dragClock = s.clock; s.craftDrag = true; s.craftSel = -1;
	return true;
}
// ★指を離した: 少しだけ慣性 → いちばん近い装備へ吸い付く
function dragEnd(s) {
	if (!s || s.phase !== "craft" || !s.craftKind) return false;
	var r = scrollRange(s), to = clamp(Math.round(s.scroll + (s.scrollV || 0) * LIST.flingMs), r.lo, r.hi);
	s.snap = { from: s.scroll, to: to, t: 0, ms: s.scroll < r.lo || s.scroll > r.hi ? LIST.snapMs * .8 : LIST.snapMs };
	s.scrollV = 0;
	return true;
}
// ★1段ぶん動かす（★キーボード・テスト用）
function scrollBy(s, dir) {
	if (!s || s.phase !== "craft" || !s.craftKind) return false;
	var rr2 = scrollRange(s);
	s.snap = { from: s.scroll, to: clamp(Math.round(s.scroll) + dir, rr2.lo, rr2.hi), t: 0, ms: LIST.snapMs };
	s.craftSel = -1; return true;
}
// ★進める（★慣性 → スナップ → 小さなバウンド。★1段決まった瞬間だけ、とても小さな音）
function updateScroll(s, ms) {
	if (s.phase !== "craft" || !s.craftKind) return;
	s.snapPop = Math.max(0, (s.snapPop || 0) - ms);
	if (!s.snap) return;
	s.snap.t += ms;
	var k = Math.min(1, s.snap.t / s.snap.ms), e = 1 - Math.pow(1 - k, 3);   // easeOutCubic
	s.scroll = s.snap.from + (s.snap.to - s.snap.from) * e;
	if (k < 1) return;
	var landed = s.snap.to, moved = Math.round(s.snap.from) !== landed;
	s.scroll = landed; s.snap = null; s.snapPop = LIST.popMs;
	if (moved) event(s, "ui_tick", {});
}
function inBox(b, x, y) { return x >= b.x && x < b.x + b.w && y >= b.y && y < b.y + b.h; }
function craftTap(s, x, y) {
	if (x == null || y == null) { craftBack(s); return; }                     // ★キーボードは「戻る」
	if (inBox(CRAFT.back, x, y)) { craftBack(s); return; }
	if (!s.craftKind) {                                                        // ① どちらを強くするか
		var hit = CRAFT.pick.filter(function (p) { return inBox({ x: p.x, y: CRAFT.pickY, w: CRAFT.pickW, h: CRAFT.pickH }, x, y); })[0];
		if (hit) { openPart(s, hit.kind); return; }
		craftBack(s); return;
	}
	var hit = craftRows(s).filter(function (r) { return y >= r.y && y < r.y + r.h && x >= r.x && x < r.x + r.w; })[0];
	if (!hit) { s.craftSel = -1; s.equipSel = -1; return; }
	// ★★持っている過去の装備は、押すと付け替えられる（2026-09-21(5) 島さんの指定）
	//   ★一度目は「選ぶ」・二度目で付け替え（★誤タップで装備が変わらない）
	if (hit.row.kind === "past") {
		s.craftSel = -1;
		if (!canEquip(s, s.craftKind, hit.row.i)) { s.equipSel = -1; return; }   // ★SKIPPED は付け替えられない
		if (s.equipSel === hit.row.i) equipTier(s, s.craftKind, hit.row.i);
		else s.equipSel = hit.row.i;
		return;
	}
	s.equipSel = -1;
	if (hit.row.kind !== "next") { s.craftSel = -1; return; }                  // ★いま使っているもの・??? は押しても何も起きない
	var step = hit.row.step;
	// ★一度目は「選ぶ」・二度目で作る（★押しまちがいで作らない。★問いかけの画面は出さない）
	if (s.craftSel === step && canMake(s, s.craftKind, step)) craft(s, s.craftKind, step);
	else s.craftSel = step;
}
// ★その部位の列をひらく（★いま使っているものがまん中。★はみ出さない範囲に収める）
function openPart(s, kind) {
	s.craftKind = kind; s.craftSel = -1; s.equipSel = -1; s.craftT = 0; s.snap = null; s.scrollV = 0; s.side = 0; s.sideAnim = null;
	s.scroll = clamp(tierNow(s, kind), minScroll(s), maxScroll(s));
	event(s, "open");
}
// ★★左右になぞって HEAD ←→ HANDLE（2026-09-20(6) 島さんの指定）
// ★★HEAD が左のページ・HANDLE が右のページ（2026-09-20(7) 島さんの指定）
//   ★HEAD で「右 → 左」へ払う ＝ HEAD が左へ去り、HANDLE が右から入る
//   ★HANDLE で「左 → 右」へ払う ＝ HANDLE が右へ去り、HEAD が左から入る
//   ★逆向きには行き先が無いので、少しだけ伸びて戻る（★そっちにはページが無いと分かる）
function sideOk(s, v) { return s.craftKind === "head" ? v < 0 : v > 0; }   // ★行ける向きか
function dragSide(s, dx) {
	if (!s || s.phase !== "craft" || !s.craftKind) return false;
	s.sideAnim = null; s.craftDrag = true; s.craftSel = -1;
	var v = (s.side || 0) + dx;
	if (!sideOk(s, v) && v !== 0) {   // ★行き先が無い向き ＝ ラバーバンド（★少しだけ）
		var over = Math.abs(v);
		v = (v > 0 ? 1 : -1) * LIST.sideRubber * (1 - 1 / (1 + over / 30));
	}
	s.side = v; s.sideOther = s.craftKind === "head" ? "handle" : "head";
	return true;
}
function dragSideEnd(s) {
	if (!s || s.phase !== "craft" || !s.craftKind) return false;
	var go = Math.abs(s.side || 0) >= LIST.sideGo && sideOk(s, s.side || 0), dir = (s.side || 0) > 0 ? 1 : -1;   // ★行ける向きに、これだけ動かしたら切り替える
	if (go) { var to = s.craftKind === "head" ? "handle" : "head", keep = s.side;
		openPart(s, to); s.side = keep - dir * W; s.sideAnim = { from: s.side, to: 0, t: 0, ms: LIST.sideMs }; }
	else s.sideAnim = { from: s.side || 0, to: 0, t: 0, ms: LIST.sideMs * .7 };
	return true;
}
function updateSide(s, ms) {
	if (!s.sideAnim) return;
	s.sideAnim.t += ms;
	var k = Math.min(1, s.sideAnim.t / s.sideAnim.ms), e = 1 - Math.pow(1 - k, 3);
	s.side = s.sideAnim.from + (s.sideAnim.to - s.sideAnim.from) * e;
	if (k >= 1) { s.side = s.sideAnim.to; s.sideAnim = null; }
}
function craftBack(s) {
	if (s.craftKind) { s.craftKind = null; s.craftSel = -1; s.menuT = 0; s.side = 0; s.sideAnim = null; event(s, "close"); return; }
	s.phase = "mine"; s.craftSel = -1; event(s, "close");
	startShow(s);   // ★★強化していたら、ここで一度だけ「予告」
}
// ============================================================
// ■ 進める
// ============================================================
function update(s, dt) {
	if (!s || !Number.isFinite(dt) || dt <= 0) return;
	var ms = dt * 1000;
	s.clock += ms; s.pulse = Math.max(0, s.pulse - ms); s.flash = Math.max(0, (s.flash || 0) - ms);
	Object.keys(s.pop).forEach(function (k) { s.pop[k] = Math.max(0, s.pop[k] - ms); });
	s.discover = Math.max(0, s.discover - ms);
	s.pindPop = Math.max(0, (s.pindPop || 0) - ms);   // ★場所の目印の一瞬の反応
	updatePointHud(s, ms);                            // ★★★目印の出し入れ（2026-09-22）
	MAT_IDS.forEach(function (k) { if (s.matFx[k] > 0) s.matFx[k] = Math.max(0, s.matFx[k] - ms); });   // ★見つけた直後の光
	updateSpark(s, ms);   // ★★届いたあとの「キラッ」（★採掘とは別に流れる）
	updateShow(s, ms);    // ★★強化したあとの「予告」
	updateUSpark(s, ms);  // ★★★「いま作れるよ」のキラキラ（★同時に1つだけ）
	// ★「NEW」が出た瞬間だけ、小さくポンと跳ねる（★出っぱなしの間は静かに呼吸）
	if (s.phase === "craft") { s.menuT = Math.min(CRAFT.openMs, s.menuT + ms); s.craftT = Math.min(CRAFT.dive, s.craftT + ms); updateScroll(s, ms); updateSide(s, ms); }
	// ★「作れなかった → 作れる」に変わった瞬間だけ、知らせの音（★出ている間は鳴らし続けない）
	var ch = canUpgradePart(s, "head"), cl = canUpgradePart(s, "handle"), can = ch || cl;
	// ★★「数字が増える → キラッ → NEW」の順にする（2026-09-21(3)）。
	//   ★出せるようになった瞬間だけ、ちょっとだけ後ろへ（★大幅には遅らせない）
	if (can && !s.canUp && s.newHold <= 0 && (s.spark || s.sparkQ.length)) { s.newHold = NEW_AFTER_SPARK; can = ch = cl = false; }
	else if (s.newHold > 0) { s.newHold = Math.max(0, s.newHold - ms); if (s.newHold > 0) { can = ch = cl = false; } }
	if (ch && !s.canUpHead) s.newPopHead = NEW_POP_MS;
	if (cl && !s.canUpHandle) s.newPopHandle = NEW_POP_MS;
	if (can && !s.canUp) { s.newPop = NEW_POP_MS; event(s, "upgrade_available", { head: ch, handle: cl }); }   // ★両方同時でも1回だけ
	s.canUpHead = ch; s.canUpHandle = cl; s.canUp = can;
	s.newPop = Math.max(0, (s.newPop || 0) - ms);
	s.newPopHead = Math.max(0, (s.newPopHead || 0) - ms); s.newPopHandle = Math.max(0, (s.newPopHandle || 0) - ms);
	if (s.guide) { s.guide.t += ms; var cyc = GUIDE.travelMs + GUIDE.pauseMs;
		if (!s.blocked || s.phase !== "mine" || s.slideT < 1 || s.guide.t > cyc * (s.guide.weak ? GUIDE.loopsLearned : GUIDE.loops)) s.guide = null; }
	if (s.upFx) { s.upFx.ms -= ms; s.upFx.made = (s.upFx.made || 0) + ms; s.upFx.sparks.forEach(function (p) { p.x += p.vx * dt; p.y += p.vy * dt; p.vy += 160 * dt; }); if (s.upFx.ms <= 0) s.upFx = null; }
	if (s.slideT < 1) s.slideT = Math.min(1, s.slideT + ms / FEEL.slideMs);
	var target = s.site.at * SPACING, e = 1 - Math.pow(1 - s.slideT, 3);
	s.camX = s.slideT < 1 ? s.slideFrom + (target - s.slideFrom) * e : target;
	// ★ヒットストップ: 振りも破片も、ほんの一瞬だけ止まる
	if (s.stop > 0) { s.stop -= ms; updatePickups(s, ms, true); return; }   // ★素材は採掘の上を流れ続ける
	s.shake = Math.max(0, s.shake - ms);
	if (s.phase === "mine") updateSwing(s, ms);
	// ★★★★★**見ていない場所の時間も進める**（2026-09-21(8)）。
	//   ★これが「空の穴」バグの治療です。★★なぞってもタイマーは止まらないし、
	//   ★★★**壊した場所にしか置かない**（★隣を上書きしない）。
	//   ★★★★なぞって戻ってきても、★**タイマーも次の鉱石も作り直しません**（═ 引き直し禁止）。
	points(s).forEach(function (pt, i) {
		if (pt.nextIn > 0) {
			pt.nextIn -= ms;
			if (pt.nextIn <= 0) {
				pt.nextIn = 0;
				var no = pt.next || guardOre(s, newOreAt(s, i), i);
				pt.next = null;
				s.site.ores[i] = no; pt.reveal = 0; s.dirty = true;
				if (i === s.site.at) event(s, "appear");   // ★音は見ている場所だけ
				if (!s.seenOre[no.type]) { s.seenOre[no.type] = 1;
					if (i === s.site.at) { s.discover = DISCOVER_MS; event(s, "discover", { ore: no.type }); }
					s.dirty = true; }
			}
		}
		if (pt.reveal < 1) pt.reveal = Math.min(1, pt.reveal + ms / FEEL.revealMs);
	});
	// ★いま見ている場所の写し（★古い書き方をしているところがそのまま動くように）
	var cp = curPt(s);
	s.nextIn = cp ? cp.nextIn : 0; s.reveal = cp ? cp.reveal : 1;
	updateBits(s, dt);
}
function updateSwing(s, ms) {
	if (!s.swinging) { if (s.held && !s.blocked && s.slideT >= 1) startSwing(s); return; }
	var c = s.cycleMs, hitAt = c * (FEEL.windup + FEEL.strike);
	// 振り上げの途中で離したら、振らずに戻す（★当たる前）
	if (!s.held && s.swingT < c * FEEL.windup && !s.aborting) { s.aborting = true; s.abortFrom = s.swingT; }
	if (s.aborting) { s.swingT -= ms * 1.5; if (s.swingT <= 0) { s.swingT = 0; s.swinging = false; s.aborting = false; } return; }
	var before = s.swingT; s.swingT += ms;
	if (!s.hitDone && before < hitAt && s.swingT >= hitAt) { s.swingT = hitAt; s.hitDone = true; impact(s); return; }
	if (s.swingT >= c) {
		s.swinging = false; s.swingT = 0;
		if (s.held && !s.blocked && s.slideT >= 1) startSwing(s);
	}
}
// ---- 命中 ----
function impact(s) {
	var o = ore(s);
	// ★★★★★ここが「長押し採掘だ」と確定する場所（2026-09-22）。
	//   ★押した瞬間ではなく、★★**ツルハシが実際に当たったとき**。
	//   ★★★短いタップは当たる前に戻るので、ここを通りません。
	s.digging = true;
	var ip = curPt(s);
	if (!o || (ip && ip.nextIn > 0) || (ip ? ip.reveal : s.reveal) < .6) { s.stop = FEEL.hitStopMs * .5; event(s, "hitWall"); puff(s, HIT.x, HIT.y, 5); return; }
	var d = oreDef(o.type), head = HEADS[s.head].id;
	if (!canBreak(s, o)) {
		// ★砕けない: 大きな金属音・火花・ヒビなし。★自動採掘はここで止まる（★離して押せば、また1発振る）
		s.stop = FEEL.clangStopMs; s.shake = FEEL.shakeMs * .6; s.shakeAmp = FEEL.shakeHit; s.blocked = true; o.met = true; s.dirty = true;
		for (var i = 0; i < 22; i++) { var a = -Math.PI * (.05 + rng(s) * 1.1), sp = 90 + rng(s) * 170; s.sparks.push({ x: HIT.x, y: HIT.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .2 + rng(s) * .3 }); }
		s.flash = 70;   // ★当たった一点が白く光る（★ほんの一瞬）
		var gdir = s.site.at + 1 < s.site.ores.length ? 1 : s.site.at > 0 ? -1 : 0;   // ★行ける鉱石の向き（右を優先。★右が無ければ左）。★案内の矢印は、この逆へ流れる
		s.guide = gdir ? { dir: gdir, t: -GUIDE.delayMs, weak: swipeLearned } : null;
		event(s, "clang", { head: head, ore: d.id });
		// ★★安全弁（2026-09-20(8)）: それでも壊せる鉱石が1つも無いときだけ、いま叩いた1個を差し替える
		//   ★ふだんは生成の決まりで防いでいるので動かない。★文字での説明はしない
		if (breakableCount(s, s.site.ores) === 0) { var bi = s.site.at;
			s.site.ores[bi] = newOreAt(s, bi, pickBreakableAtPoint(s, bi));
			var bp = pointAt(s, bi); if (bp) { bp.reveal = 0; bp.nextIn = 0; bp.next = null; } s.reveal = 0; }
		return;
	}
	var before = stageOf(o);
	o.hp = Math.max(0, o.hp - damageOf(s, o)); o.met = true; s.dirty = true;
	var after = stageOf(o);
	if (o.hp <= 0) { breakOre(s, o, d, head, before === 0); return; }   // ★before === 0 ＝ 無傷から一撃
	s.stop = FEEL.hitStopMs; s.shake = FEEL.shakeMs * .5; s.shakeAmp = FEEL.shakeHit;
	puff(s, HIT.x, HIT.y, 4); chipsAt(s, d, 3);
	hitEvent(s, d, head, after > before);
}
// ★命中の知らせ（★硬い鉱石は別の音。★ヒビの段が進んだら「ピシッ」も）
function hitEvent(s, d, head, grew) { event(s, d.req >= 2 ? "hitHard" : "hit", { head: head, ore: d.id, tone: (d.feel || {}).tone || 1 }); if (grew) event(s, "crack", { head: head, ore: d.id }); }
function breakOre(s, o, d, head, oneShot) {
	// ★鉱石ごとに壊れ方が違う（feel）。★昔の鉱石を一撃で砕いたときは、少しだけ強く（★「雑魚になった」気持ちよさ）
	var f = d.feel || {}, big = oneShot ? 1.5 : 1;
	s.stop = FEEL.breakStopMs * (oneShot ? 1.35 : 1); s.shake = FEEL.shakeMs * (f.shake || 1); s.shakeAmp = FEEL.shakeBreak * (oneShot ? 1.4 : 1) * (f.shake || 1);
	var cx = ORE_X, cy = ORE_Y, i, a, sp;
	for (i = 0; i < Math.round(FEEL.chunks * (f.chunk || 1) * big); i++) { a = rng(s) * Math.PI * 2; sp = 50 + rng(s) * 120 * (oneShot ? 1.3 : 1);
		s.chunks.push({ x: cx + Math.cos(a) * 18, y: cy + Math.sin(a) * 14, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 90, w: 4 + Math.floor(rng(s) * 4), h: 3 + Math.floor(rng(s) * 4), col: d.base[1 + Math.floor(rng(s) * 3)], life: .75 + rng(s) * .3 }); }
	chipsAt(s, d, Math.round(FEEL.bits * (f.bits || 1) * big), true);
	if (f.spark) for (i = 0; i < Math.round(8 * f.spark); i++) { a = -Math.PI * rng(s) * 1.4; sp = 70 + rng(s) * 150;
		s.sparks.push({ x: cx + (rng(s) - .5) * 30, y: cy + (rng(s) - .5) * 24, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, life: .16 + rng(s) * .22 }); }
	for (i = 0; i < Math.round(FEEL.dust * (f.dust || 1) * big); i++) { a = rng(s) * Math.PI * 2; sp = 8 + rng(s) * 30;
		s.dust.push({ x: cx + Math.cos(a) * rng(s) * ORE_RX * .8, y: cy + Math.sin(a) * rng(s) * ORE_RY * .8, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 6, r: 2 + rng(s) * 3, life: .7 + rng(s) * .5, age: 0 }); }
	// ★素材: 1種類ではなく、何種類か。★少し飛んでから、プレイヤーへ吸い込まれる
	var drops = [], rare = false;
	// ★表のとおり（★運が悪すぎるときだけ助ける ＝ pity）
	// ★★★RICH だけ、**レア素材の落ちやすさだけ**が少し上がります（2026-09-21(8)）
	var dp = curPt(s), dm = B.rareDropOf(dp ? dp.role : 1);
	var count = B.rollDrops(function () { return rng(s); }, d.id, s.pity, dm);
	s.broken++; s.lastOre = d.id;
	var sure = starterDrops(s); Object.keys(sure).forEach(function (k) { count[k] = Math.max(count[k] || 0, sure[k]); });
	MAT_IDS.forEach(function (k) { if (count[k] && MATS[k].rare) rare = true; });
	MAT_IDS.forEach(function (k) { for (var j = 0; j < (count[k] || 0); j++) drops.push(k); });
	var seen = {}, pull = {};
	drops.forEach(function (k) { var j = seen[k] = (seen[k] || 0) + 1; spawnPickup(s, k, j - 1, cx, cy, pull); });
	capPickups(s);
	event(s, "break", { head: head, ore: d.id, drops: drops.length, rare: rare, oneShot: !!oneShot, tone: f.tone || 1 });
	event(s, "scatter", { count: drops.length });
	if (rare) event(s, "rare", {});
	// ★★★★★壊した瞬間に、その場所の「次の鉱石」を**ここで決める**（2026-09-21(8)）。
	//   ★★前は `s.site.ores[at] = null` として放置し、★★★画面全体で 1 つしか無い
	//     `s.nextIn` が切れたときに「その瞬間見ている場所」へ置いていました。
	//   ★だから壊した直後になぞると、★★**壊した場所は永久に空**で、
	//     ★★★隣の鉱石が**上書き**されていました（═ なぞるだけで引き直せた）。
	//   ★★★★いまは、**次の鉱石もサイコロもこの行で確定**します（═ なぞっても変わらない）。
	var at = s.site.at, pt = curPt(s);
	s.site.ores[at] = null;
	if (pt) {
		var want = s.broken < STARTER_ROCKS ? "rock" : null;
		if (!want && s.familiar && s.familiar.n > 0 && B.canBreak(s.familiar.type, s.head)) { want = s.familiar.type; s.familiar.n--; }   // ★速さを見くらべる数個
		pt.next = guardOre(s, newOreAt(s, at, want), at);
		pt.nextIn = FEEL.nextOreMs;
	}
	s.nextIn = FEEL.nextOreMs; s.dirty = true;
}
// ★★はじめの体験（2026-09-20(8)）: 最初の「HANDLE」の材料のうち、まだ足りない分を
//   「残りの回数」で割って必ず落とす（★1回目で約半分、2回目でそろう。★飛んでいる途中の素材も手持ちに数える）
//   ＝ 岩2個で必ず HARDWOOD が作れる ＝ いちばん最初の成長は「振る速さ」
function starterDrops(s) {
	var have = {};
	MAT_IDS.forEach(function (k) { have[k] = (s.mats[k] || 0) + s.pickups.filter(function (p) { return p.mat === k; }).length; });
	return B.starterDrops(s.headMax, s.handleMax, have, s.broken);   // ★中身は js/mining-balance.js（★道具と同じ計算）
}
function chipsAt(s, d, n, burst) {
	for (var i = 0; i < n; i++) { var a = burst ? rng(s) * Math.PI * 2 : -Math.PI * (.35 + rng(s) * .9), sp = (burst ? 60 : 40) + rng(s) * (burst ? 150 : 70);
		s.bits.push({ x: burst ? ORE_X + (rng(s) - .5) * 40 : HIT.x, y: burst ? ORE_Y + (rng(s) - .5) * 30 : HIT.y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, col: d.base[2 + Math.floor(rng(s) * 2)], life: .35 + rng(s) * .35, size: rng(s) < .3 ? 2 : 1 }); }
}
function puff(s, x, y, n) { for (var i = 0; i < n; i++) s.dust.push({ x: x + (rng(s) - .5) * 4, y: y + (rng(s) - .5) * 4, vx: (rng(s) - .3) * 22, vy: -8 - rng(s) * 14, r: 1 + rng(s) * 2, life: .35 + rng(s) * .3, age: 0 }); }
function rr(s, a) { return a[0] + rng(s) * (a[1] - a[0]); }
// ★★左はしの縦並び（★★2026-09-20(9) 島さんの指定で「発見した素材だけ」に変えた）
//   ★見つけていない素材は出さない。★いちばん下に「まだ知らない素材」が **1つだけ** 出る
var COUNTER = { x: 3, y: 8, step: 17, box: 16, num: 19 };
// ★★素材アイコンの中心（★通常も未知も、必ずこの同じ中心を使う。2026-09-20(10) 島さんの指定）
var MATERIAL_ICON_CENTER_X = COUNTER.box / 2, MATERIAL_ICON_CENTER_Y = COUNTER.box / 2;
// ★★まだ知らない素材のしるし（★暗いかげ ＋ 大きめの「?」。★枠は付けない）
//   ★★これは **AI の仮の絵** です（島さんが描いたら差し替え）。★どの素材にも似ないよう、ただの塊にしてある
var UNKNOWN_ART = [
	"....####......",
	"..########....",
	".##########o..",
	"############o.",
	"#############o",
	"#############o",
	"############oo",
	".##########oo.",
	"..########oo..",
	"...######ooo..",
	"....####ooo...",
	".....##ooo....",
	"......ooo....."
];
var UNKNOWN_COL = { "#": "#454d6b", o: "#2a3047" };   // ★暗いグレー（★壁より少し明るくして「物がある」と分かるように）
// ★★「?」を大きくした（2026-09-20(10) 島さんの指定）。★5×7（★前は 3×6）
var QMARK = [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."];
var QMARK_S = [".#.", "#.#", "..#", ".#.", "...", ".#."];   // ★カードの中など、小さく出すとき
// ★★cx, cy = まん中（★通常の素材アイコンとまったく同じ中心にそろえる。★未知だけ別の座標を書かない）
function drawUnknown(box, cx, cy, small) {
	var st = small ? 2 : 1, A = UNKNOWN_ART, aw = Math.ceil(A[0].length / st), ah = Math.ceil(A.length / st);
	var ox = Math.round(cx - aw / 2), oy = Math.round(cy - ah / 2), u, v;
	for (v = 0; v < ah; v++) for (u = 0; u < aw; u++) {
		var c = UNKNOWN_COL[A[Math.min(A.length - 1, v * st)][Math.min(A[0].length - 1, u * st)]];
		if (c) box(ox + u, oy + v, 1, 1, c);
	}
	// ★「?」は、かげの上に重ねる（★専用の四角い枠は付けない）。★1ドットだけ上へずらして読みやすく
	var Q = small ? QMARK_S : QMARK, qw = Q[0].length, qh = Q.length;
	var qx = Math.round(cx - qw / 2), qy = Math.round(cy - qh / 2) - 1, b, a2;
	for (b = 0; b < qh; b++) for (a2 = 0; a2 < qw; a2++) if (Q[b][a2] === "#") box(qx + a2 + 1, qy + b + 1, 1, 1, "#151827");   // ★1ドットの影
	for (b = 0; b < qh; b++) for (a2 = 0; a2 < qw; a2++) if (Q[b][a2] === "#") box(qx + a2, qy + b, 1, 1, "#eef2ff");
}
// ★所持数の並び ＝ 発見した順（★プレイヤーの探索の記録そのもの）
//   ★「?」は必ず1つだけ: いちばん上の「まだ届いていない素材」か、その先がまだあるときの1行
function hudRows(s) {
	var rows = [], unknown = -1, i;
	for (i = 0; i < s.matOrder.length; i++) {
		var k = s.matOrder[i];
		if (!s.seenMat[k]) { unknown = i; break; }   // ★飛んでいる最中の新素材 ＝ まだ「?」
		rows.push({ k: k, i: i });
	}
	if (unknown < 0 && s.matOrder.length < MAT_IDS.length) unknown = s.matOrder.length;   // ★まだ先がある
	return { rows: rows, unknown: unknown };
}
// ★新しい素材の置き場所を取る（★飛び出した時点で1行ぶん確保 ＝ 届いたところに必ず出る）
function reserveMat(s, k) { if (s.matOrder.indexOf(k) < 0 && MAT_IDS.indexOf(k) >= 0) s.matOrder.push(k); }
function counterAt(s, k) {
	var order = s && s.matOrder ? s.matOrder : MAT_IDS, i = order.indexOf(k);
	if (i < 0) i = order.length;   // ★まだ知らない素材は、いちばん下の「?」へ飛ぶ
	return { x: COUNTER.x, y: COUNTER.y + i * COUNTER.step, shown: true, unknown: !(s && s.seenMat && s.seenMat[k]) };
}
// ★素材を1つ生む。★ここで軌道を全部決める（★あとは時間から位置を計算するだけ）
// ★多すぎたら古いものから、すぐ所持数へ（★素材は1つも失われない）
function capPickups(s) { while (s.pickups.length > FLY.max) arrive(s, s.pickups.shift(), true); }
// ★★飛んでいる素材を、いま全部所持数にする（★採掘を出るとき。★戻ったせいで失われない）
function collectAll(s) { if (s && s.pickups) while (s.pickups.length) arrive(s, s.pickups.shift(), true); }
function spawnPickup(s, k, j, cx, cy, pull) {
	var rare = !!MATS[k].rare, fl = FLOCK[j % FLOCK.length], r1 = rng(s);
	// ★★飛び方の種類（2026-09-20(10)）: 通常素材にも「反対側まで飛んで戻る」「弱い螺旋」を混ぜる
	var type = rare ? "rare" : r1 < FLY.slingMix ? "slingshot" : r1 < FLY.slingMix + FLY.spiralMix ? "spiral" : fl.s || rng(s) < FLY.sMix * .5 ? "s_curve" : "normal_curve";
	var F = FLIGHTS[type];
	// ★★初めての素材は、ここで置き場所を1行ぶん取る（★飛び出した先が、そのまま出てくる場所になる）
	var isNew = !s.seenMat[k]; reserveMat(s, k);
	var to = counterAt(s, k), tx = to.x + MATERIAL_ICON_CENTER_X, ty = to.y + MATERIAL_ICON_CENTER_Y;
	var x0 = cx + (rng(s) - .5) * 10, y0 = cy + (rng(s) - .5) * 8, toT = Math.atan2(ty - y0, tx - x0);
	// ① 爆散（★アイコンは見ない。★群れごとに左・右・上…、そこから ±60°。★スリングショットはアイコンと反対へ）
	var base = fl.dir === null ? rng(s) * Math.PI * 2 : fl.dir, a = F.sling ? toT + Math.PI + (rng(s) - .5) * 1.2 : base + (rng(s) - .5) * 2.1;
	var sp = rr(s, FLY.burstSpeed) * (F.sling ? 1 : fl.speed);
	var vx = Math.cos(a) * sp, vy = Math.sin(a) * sp - FLY.upBias * sp * (F.sling ? 0 : 1);
	var p = { mat: k, rare: rare, type: type, age: 0, x: x0, y: y0, pulling: false, glint: !!F.glint,
		tA: rr(s, rare ? FLY.rareBurstMs : FLY.burstMs),
		tF: rr(s, rare ? FLY.rareFreeMs : FLY.freeMs) * (fl.free || 1) + (isNew && !j ? MAT_NEW_HANG : 0),   // ★★自由飛行（★初めての素材は少し長い）
		tB: rr(s, rare ? FLY.rareHangMs : FLY.hangMs) + (fl.hang || 0) };
	// ★群れ: 1個目の到着から 20〜40ms ずつ遅れて届く（★到着の時刻から、滞空の長さを逆算）
	if (!pull[k]) pull[k] = { ms: rr(s, rare ? FLY.rarePullMs : FLY.pullMs), wait: 0, arrive: 0 };
	p.tC = pull[k].ms * (rare ? 1 : fl.pull) + (rng(s) - .5) * 4;
	if (!j) pull[k].arrive = p.tA + p.tF + p.tB + p.tC;
	else { pull[k].wait += rr(s, FLY.stagger); p.tB = Math.max(60, pull[k].arrive + pull[k].wait - p.tA - p.tF - p.tC); }
	// ★区間のつなぎ目: ① 爆散の終わり → ② 自由飛行の終わり → ③ 滞空の終わり（＝ 吸引の出発点）
	var TA = p.tA / 1000, TF = p.tF / 1000, TB = p.tB / 1000;
	var dA = TA - (1 - FLY.burstKeep) / 2 * TA, fx0 = x0 + vx * dA, fy0 = y0 + vy * dA;
	var fvx = vx * FLY.burstKeep, fvy = vy * FLY.burstKeep;
	var dF = TF - (1 - FLY.freeKeep) / 2 * TF, ax = fx0 + fvx * dF, ay = fy0 + fvy * dF + .5 * FLY.freeGravity * TF * TF;
	var hx = fvx * FLY.freeKeep, hy = fvy * FLY.freeKeep;
	p.x0 = x0; p.y0 = y0; p.vx = vx; p.vy = vy; p.fx0 = fx0; p.fy0 = fy0; p.fvx = fvx; p.fvy = fvy; p.ax = ax; p.ay = ay; p.hx = hx; p.hy = hy;
	var dB = TB - (1 - FLY.hangKeep) / 2 * TB;
	var bx = ax + hx * dB, by = ay + hy * dB + .5 * FLY.hangGravity * TB * TB;
	bx = Math.max(2, Math.min(W - 2, bx)); by = Math.max(2, Math.min(H - 2, by));   // ★画面の外から吸い込みを始めない
	// ④ 吸引（★ここで初めて磁力が入る）: 3次ベジェ
	//   P1 = 滞空の動きを少しだけ続けたところ ＋ 横へ大きくふくらむ（★ここで向きが変わる）
	//   P2 = アイコンの手前 ＋ 小さなふくらみ（★最後はほぼまっすぐ中心へ）
	var dx = tx - bx, dy = ty - by, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
	var side = fl.bulge ? (ny * fl.bulge > 0 ? 1 : -1) : (rng(s) < .5 ? -1 : 1);   // ★上へ（bulge -1）／下へ（1）ふくらむように、n の向きに合わせる
	var bend = FLY.curve * L * (fl.bend + (rng(s) - .5) * .35), hl = Math.hypot(hx, hy) || 1, go = F.sling ? .4 : .12;
	p.c = [bx, by,
		bx + hx / hl * L * go + nx * side * bend, by + hy / hl * L * go + ny * side * bend,
		tx - dx * .25 + nx * (F.s ? -side : side) * bend * .3, ty - dy * .25 + ny * (F.s ? -side : side) * bend * .3,
		tx, ty];
	if (F.spiral) { p.spin = rr(s, FLY.spiralTurn) * Math.PI * 2 * (rng(s) < .5 ? -1 : 1); p.spin0 = Math.atan2(ny, nx); }
	p.total = p.tA + p.tF + p.tB + p.tC;
	s.pickups.push(p);
}
// ★時間 → 位置（★生まれたときに決めた数だけで計算。★乱数は引かない）
// ★1つの区間の進み（★速さが 1 → keep へ、まっすぐ落ちていく）
function leg(w, T, keep) { return w - (1 - keep) / 2 * w * w / T; }
function flyAt(p, t) {
	var x, y;
	if (t < p.tA) { var TA = p.tA / 1000, u = t / 1000, d = leg(u, TA, FLY.burstKeep);   // ① 爆散
		x = p.x0 + p.vx * d; y = p.y0 + p.vy * d; }
	else if (t < p.tA + p.tF) { var TF = p.tF / 1000, wf = (t - p.tA) / 1000, ef = leg(wf, TF, FLY.freeKeep);   // ★★② 自由飛行（★所持数の場所を気にしない）
		x = p.fx0 + p.fvx * ef; y = p.fy0 + p.fvy * ef + .5 * FLY.freeGravity * wf * wf; }
	else if (t < p.tA + p.tF + p.tB) { var TB = p.tB / 1000, w = (t - p.tA - p.tF) / 1000, e = leg(w, TB, FLY.hangKeep);   // ③ 短い滞空（★ここで止まりかける）
		x = p.ax + p.hx * e; y = p.ay + p.hy * e + .5 * FLY.hangGravity * w * w; }
	else {
		var k = Math.min(1, (t - p.tA - p.tF - p.tB) / p.tC), g = FLY.easeStart * k + (1 - FLY.easeStart) * k * k * k, h = 1 - g, c = p.c;   // ★④ 吸引: 遅い → 中 → 最後だけ速い
		x = h * h * h * c[0] + 3 * h * h * g * c[2] + 3 * h * g * g * c[4] + g * g * g * c[6];
		y = h * h * h * c[1] + 3 * h * h * g * c[3] + 3 * h * g * g * c[5] + g * g * g * c[7];
		if (p.spin && k > .6) { var q = (k - .6) / .4, r = FLY.spiralR * Math.sin(Math.PI * q) * (1 - q * .5), an = p.spin0 + p.spin * q;   // ★最後に弱い螺旋（★始まりと終わりはずれ 0）
			x += Math.cos(an) * r; y += Math.sin(an) * r; }
	}
	p.x = Math.max(2, Math.min(W - 2, x)); p.y = Math.max(2, Math.min(H - 2, y));   // ★画面の外へは出さない
	p.pulling = t >= p.tA + p.tF + p.tB;
}
// ★所持数へ届いた: +1・アイコンが一瞬ふくらむ・数字が光る・小さな粒・音（★続けて届くと少しずつ高く）
function arrive(s, p, quiet) {
	s.mats[p.mat] = (s.mats[p.mat] || 0) + 1; s.pop[p.mat] = FLY.popMs; s.dirty = true; s.pulse = 180;
	// ★★ここで初めて「発見」になる（★? が消えて、その素材のアイコンに変わる）
	var found = !s.seenMat[p.mat];
	if (found) { reserveMat(s, p.mat); s.seenMat[p.mat] = 1; s.matFx[p.mat] = MATFX_MS; if (!quiet) event(s, "new_material_discovered", { mat: p.mat }); }
	if (quiet) return;
	var ch = s.chain[p.mat]; if (!ch || s.clock - ch.at > 250) ch = s.chain[p.mat] = { n: 0, at: 0 };
	ch.n++; ch.at = s.clock;
	event(s, "absorb", { mat: p.mat, seq: ch.n, rare: p.rare });
	// ★★届いたあとの「キラッ」を頑む（★初めて見つけたときは、発見の光がその役）
	if (!found) askSpark(s, p.mat, p.rare);
	var to = counterAt(s, p.mat), n = 1 + Math.floor(rng(s) * 3);
	for (var i = 0; i < n; i++) { var a = -Math.PI * rng(s); s.hudBits.push({ x: to.x + COUNTER.box / 2, y: to.y + COUNTER.box / 2, vx: Math.cos(a) * 40, vy: Math.sin(a) * 40 + 10, life: .16, rare: p.rare }); }
}
// ★素材を進める（★消えたものはその場で配列から外す。★新しい配列を作らない）
function updatePickups(s, ms, frozen) {
	var list = s.pickups, n = 0;
	for (var i = 0; i < list.length; i++) {
		var p = list[i];
		if (!(frozen && p.age < p.tA)) p.age += ms;   // ★ヒットストップ中も、爆散を終えた素材は流れ続ける
		if (p.age >= p.total) { arrive(s, p); continue; }
		flyAt(p, p.age); list[n++] = p;
	}
	list.length = n;
	var hb = s.hudBits, m = 0;
	for (var j = 0; j < hb.length; j++) { var b = hb[j]; b.life -= ms / 1000; if (b.life <= 0) continue; b.x += b.vx * ms / 1000; b.y += b.vy * ms / 1000; hb[m++] = b; }
	hb.length = m;
}
function updateBits(s, dt) {
	var g = 420;
	s.chunks = s.chunks.filter(function (c) { c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += g * dt; if (c.y > 150 && c.vy > 0) { c.y = 150; c.vy *= -.25; c.vx *= .6; } return c.life > 0; });
	s.bits = s.bits.filter(function (c) { c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += g * dt; return c.life > 0; });
	s.sparks = s.sparks.filter(function (c) { c.life -= dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vy += 260 * dt; return c.life > 0; });
	s.dust = s.dust.filter(function (c) { c.age += dt; c.x += c.vx * dt; c.y += c.vy * dt; c.vx *= Math.pow(.2, dt); c.vy *= Math.pow(.2, dt); return c.age < c.life; });
	updatePickups(s, dt * 1000, false);
}
function stageOf(o) { if (!o) return 0; var f = 1 - o.hp / o.max; return f <= 0 ? 0 : Math.min(5, 1 + Math.floor(f * 5)); }

// ============================================================
// ■ 描く
// ============================================================
var PAL = { void: "#0d101a", deep: "#191b29", wall: ["#272d44", "#2c324a", "#2e354e", "#292f46"], lit: "#3c4158", edge: "#4c536b", rim: "#717485",
	lack: "#e8524a",   // ★★足りない所持数の色（2026-09-20(9) 島さんの指定）
	skin: ["#574a53", "#b59c93", "#d9c3b8"], sleeve: ["#1a1420", "#312b3a", "#4a3f4f"], spark: ["#fff1a8", "#ffcc4a", "#ff8a2a"] };   // ★手と袖は島さんの絵の色
var caches = { wall: null, ores: {}, bury: {} };
function canvas(w, h) { if (typeof document === "undefined" || !document.createElement) return null; var c = document.createElement("canvas"); c.width = w; c.height = h; var x = c.getContext && c.getContext("2d"); return x && x.createImageData && x.putImageData ? c : null; }
// ---- 島さんの絵（★js/mining-art.js。★1ドット = 1文字の色番号） ----
var ABC = "0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ-_";
function art() { var A = global.DotMiningArt; return A && A.bg && A.ore ? A : null; }
function artColor(A, ch) { return A.pal[ABC.indexOf(ch)]; }
function artWall() {
	var A = art(); if (!A) return null;
	if (caches.artWall) return caches.artWall;
	var c = canvas(W, H);
	if (c) { var x2 = c.getContext("2d"), img = x2.createImageData(W, H), d = img.data;
		for (var i = 0; i < W * H; i++) { var n = parseInt(artColor(A, A.bg[i]).slice(1), 16); d[i * 4] = n >> 16; d[i * 4 + 1] = (n >> 8) & 255; d[i * 4 + 2] = n & 255; d[i * 4 + 3] = 255; }
		x2.putImageData(img, 0, 0); }
	caches.artWall = { canvas: c }; return caches.artWall;
}
// ★★鉱石の種類ごとに、絵ぜんぶを塗り替える（2026-09-20(5)）: 同じ絵でも「別の鉱物」に見せる
//   ★明るさの順は絵のまま（★陰影は残る）。★その鉱石の base（暗い→明るい）の帯に置きかえる
function lum(hex) { var n = parseInt(hex.slice(1), 16); return ((n >> 16) * .3 + ((n >> 8) & 255) * .59 + (n & 255) * .11) / 255; }
function mixHex(a, b, t) {
	var x = parseInt(a.slice(1), 16), y = parseInt(b.slice(1), 16), f = function (sh) { var v = Math.round(((x >> sh) & 255) * (1 - t) + ((y >> sh) & 255) * t); return ("0" + v.toString(16)).slice(-2); };
	return "#" + f(16) + f(8) + f(0);
}
var rampCache = {};
function oreRamp(d) {   // ★base の4色から、なめらかな8段を作る
	if (rampCache[d.id]) return rampCache[d.id];
	var out = [];
	for (var i = 0; i < 8; i++) { var u = i / 7 * 3, k = Math.min(2, Math.floor(u)); out.push(mixHex(d.base[k], d.base[k + 1], u - k)); }
	rampCache[d.id] = out; return out;
}
function oreColor(d, hex, lo, hi) {   // ★絵の明るさ → その鉱石の色
	var t = (lum(hex) - lo) / Math.max(.001, hi - lo), r = oreRamp(d);
	return r[Math.max(0, Math.min(7, Math.round(t * 7)))];
}
function fleckColor(d, A, O, x, y) {
	var isF = function (xx, yy) { return xx >= 0 && yy >= 0 && xx < O.w && yy < O.h && O.mask[yy * O.w + xx] === "3"; };
	if (!d.fleck) return null;   // ★すじの無い鉱石（★岩）は、まわりと同じ色に溶ける
	return !isF(x, y - 1) ? d.fleck[2] : !isF(x, y + 1) ? d.fleck[0] : d.fleck[1];
}
function buildArtOre(o) {
	var A = art(), O = A.ore, d = oreDef(o.type), px = [], c = canvas(O.w, O.h);
	// ★絵の中の明るさの幅を測ってから、その鉱石の色へ置きかえる
	var lo = 1, hi = 0;
	for (var y0 = 0; y0 < O.h; y0++) for (var x0 = 0; x0 < O.w; x0++) {
		if (O.mask[y0 * O.w + x0] === "0") continue;
		var L = lum(artColor(A, O.px[y0 * O.w + x0])); if (L < lo) lo = L; if (L > hi) hi = L;
	}
	for (var y = 0; y < O.h; y++) for (var x = 0; x < O.w; x++) {
		var m = O.mask[y * O.w + x]; if (m === "0") continue;
		var col = oreColor(d, artColor(A, O.px[y * O.w + x]), lo, hi);
		if (m === "3") col = fleckColor(d, A, O, x, y) || col;
		if (m === "4" && d.fleck) col = d.fleck[0];   // ★すじのまわり
		px.push([x, y, col]);
	}
	if (c) { var x2 = c.getContext("2d"); px.forEach(function (p) { x2.fillStyle = p[2]; x2.fillRect(p[0], p[1], 1, 1); }); }
	// at(dx, dy) = 鉱石の中心から見た場所が、鉱石の中か（★-1 外 ／ .97 ふち ／ .5 中）
	return { w: O.w, h: O.h, offX: O.x - ORE_X, offY: O.y - ORE_Y, px: px, canvas: c,
		at: function (dx, dy) { var x = Math.round(dx + ORE_X - O.x), y = Math.round(dy + ORE_Y - O.y);
			if (x < 0 || y < 0 || x >= O.w || y >= O.h) return -1; var m = O.mask[y * O.w + x]; return m === "0" ? -1 : m === "1" ? .97 : .5; } };   // ★3・4（結晶）は中
}
// ---- 洞窟の壁（★島さんの絵が無いときだけ。★種から作る。★スワイプでそのままつながる） ----
function wallColor(seed, wx, wy) {
	var cell = 20, gx = Math.floor(wx / cell), gy = Math.floor(wy / cell), best = 1e9, second = 1e9, bx = 0, by = 0, bid = 0;
	for (var j = -1; j <= 1; j++) for (var i = -1; i <= 1; i++) {
		var cx = (gx + i) * cell + h2(seed + gx + i, gy + j) * cell, cy = (gy + j) * cell + h2(seed * 7 + gx + i, gy + j + 91) * cell,
			d = Math.hypot((wx - cx) * .9, wy - cy);
		if (d < best) { second = best; best = d; bx = cx; by = cy; bid = (gx + i) * 131 + (gy + j); } else if (d < second) second = d;
	}
	if (second - best < 1.6) return PAL.void;
	if (second - best < 3 && (wy < by - 2 || wx < bx - 3)) return PAL.edge;
	var tone = PAL.wall[Math.floor(hash(bid + seed) * 4)];
	return (wy - by < -best * .45 && (wx + wy) % 2 === 0) ? PAL.lit : tone;
}
function buildWall(s) {
	// ★★場所ごとの色の差も含めて、**1 枚の絵に焼き付けます**（★毎フレームの重さは 0）
	var roleKey = (s.site.pts || []).map(function (q) { return q.role; }).join("");
	var width = (s.site.ores.length - 1) * SPACING + W, key = s.site.seed + ":" + width + ":" + roleKey;
	if (caches.wall && caches.wall.key === key) return caches.wall;
	var c = canvas(width, H), rows = null;
	if (c) {
		var x2 = c.getContext("2d"), img = x2.createImageData(width, H), d = img.data;
		for (var y = 0; y < H; y++) for (var x = 0; x < width; x++) {
			var pi = Math.min(s.site.ores.length - 1, Math.max(0, Math.round(x / SPACING)));
			var pr = (s.site.pts || [])[pi], tint = POINT_TINT[pr ? pr.role : pi] || null;
			var col = tintWall(wallColor(s.site.seed | 0, x, y), tint);
			// 天井のつらら・床の瓦礫
			var st = h2(s.site.seed + Math.floor(x / 7), 5), tip = st > .55 ? 6 + st * 22 : 0;
			if (y < tip && (x % 7) >= 1 && (x % 7) <= 5 - Math.floor(y / tip * 4)) col = y > tip - 3 ? PAL.edge : PAL.lit;
			if (y > 146) col = h2(x, y) < .25 ? PAL.edge : h2(x + 7, y) < .55 ? PAL.deep : PAL.wall[0];
			var n = parseInt(col.slice(1), 16), k = (y * width + x) * 4; d[k] = n >> 16; d[k + 1] = (n >> 8) & 255; d[k + 2] = n & 255; d[k + 3] = 255;
		}
		x2.putImageData(img, 0, 0);
	}
	caches.wall = { key: key, canvas: c };
	return caches.wall;
}
// ---- 鉱石（★一度だけ描いておく。★ヒビ・欠けは毎回その上に） ----
function oreShape(o) { var pts = []; for (var i = 0; i < 24; i++) pts.push(.86 + h2(o.seed, i) * .2); return pts; }
function inOre(o, shape, dx, dy) {
	var a = Math.atan2(dy / ORE_RY, dx / ORE_RX), t = (a / (Math.PI * 2) + 1) % 1 * 24, i = Math.floor(t), f = t - i,
		r = shape[i % 24] * (1 - f) + shape[(i + 1) % 24] * f, n = Math.hypot(dx / ORE_RX, dy / ORE_RY);
	return n <= r ? n / r : -1;
}
function buildOre(o) {
	if (art()) { var ak = "art:" + o.type; return caches.ores[ak] || (caches.ores[ak] = buildArtOre(o)); }   // ★島さんの鉱石（★種類で色だけ変わる）
	var key = o.type + ":" + o.seed; if (caches.ores[key]) return caches.ores[key];
	var d = oreDef(o.type), w = ORE_RX * 2 + 8, h = ORE_RY * 2 + 8, shape = oreShape(o), px = [], c = canvas(w, h);
	for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
		var dx = x - w / 2, dy = y - h / 2, n = inOre(o, shape, dx, dy); if (n < 0) continue;
		// 面の明るさ: 左上から光（★四角い面のかたまり＝ドットの岩）
		var facet = h2(o.seed + Math.floor((x + 3) / 9), Math.floor((y + 2) / 8)), light = (-dx - dy) / (ORE_RX + ORE_RY) * .8 + (facet - .5) * .7;
		var tone = light > .35 ? 3 : light > .02 ? 2 : light > -.35 ? 1 : 0;
		if (n > .9) tone = Math.max(0, tone - 1);                    // ふち（★壁に埋まっている影）
		if (n > .96 || (dy < -ORE_RY * .55 && n > .8)) tone = 0;      // 上のふちは壁の影
		var col = d.base[tone];
		if (tone === 3 && h2(x, y + o.seed) < .5) col = d.base[2];
		px.push([x, y, col]);
	}
	// 結晶・鉄の筋
	if (d.fleck) { var nf = d.id === "crystal" ? 11 : 16;
		for (var f = 0; f < nf; f++) { var fx = w / 2 + (h2(o.seed, f * 3) - .5) * ORE_RX * 1.4, fy = h / 2 + (h2(o.seed, f * 3 + 1) - .5) * ORE_RY * 1.3,
			len = d.id === "crystal" ? 3 + Math.floor(h2(o.seed, f * 3 + 2) * 9) : 1 + Math.floor(h2(o.seed, f * 3 + 2) * 3);
			for (var L = 0; L < len; L++) for (var tw = 0; tw < (d.id === "crystal" ? 2 : 1); tw++) {
				var qx = Math.round(fx + L * .7 + tw), qy = Math.round(fy - L * .7);
				if (inOre(o, shape, qx - w / 2, qy - h / 2) < 0 || inOre(o, shape, qx - w / 2, qy - h / 2) > .88) continue;
				px.push([qx, qy, d.fleck[tw === 0 ? (L === 0 ? 0 : 1) : 2]]);
			} } }
	var entry = { w: w, h: h, offX: -w / 2, offY: -h / 2, px: px, shape: shape, canvas: c, at: function (dx, dy) { return inOre(o, shape, dx, dy); } };
	if (c) { var x2 = c.getContext("2d"); px.forEach(function (p) { x2.fillStyle = p[2]; x2.fillRect(p[0], p[1], 1, 1); }); }
	caches.ores[key] = entry; return entry;
}
// ---- ヒビ（2026-09-19 島さんの指定）: ★当たった中心から外へ、力が伝わって割れる ----
//   ★鉱石ごとの種（o.seed ＝ crackSeed）で形を決める ＝ 鉱石が変わるたびに違う割れ方／同じ鉱石は壊れるまで同じ形
//   ★変わるもの: 最初に伸びる向き・枝分かれの場所・枝の長さ・左右どちらへ広がりやすいか・欠ける場所・最後の細いヒビ
//   ★守ること: 中心から外へ（★進むたびに外向きへ少し引っぱる）／鉱石のふちで止まる（★壁へ出ない）
//   level: 1 小さいヒビ → 2 伸びる → 3 枝分かれ → 4 別の向きへ・表面が欠ける → 5 全体へ・細いヒビ
function crackPaths(o) {
	var key = "c:" + o.type + ":" + o.seed; if (caches.ores[key]) return caches.ores[key];
	var b = buildOre(o), rs = { rng: ((o.seed >>> 0) ^ 0x5bd1e995) >>> 0 || 1 }, r = function () { return rng(rs); };
	var cx = HIT.x - ORE_X, cy = HIT.y - ORE_Y, step = art() ? 3 : 2, paths = [], chips = [];
	function wrap(a) { return ((a + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI; }
	function inside(x, y) { var e = b.at(x, y); return e >= 0 && e <= .93; }
	function walk(x, y, ang, len, level, pull) {
		var pts = [[x, y]];
		for (var i = 0; i < len; i++) {
			ang += (r() - .5) * .8;
			if (Math.hypot(x - cx, y - cy) > 1) ang += wrap(Math.atan2(y - cy, x - cx) - ang) * pull;   // ★外へ
			var nx = x + Math.cos(ang) * step, ny = y + Math.sin(ang) * step;
			if (!inside(nx, ny)) break;
			x = nx; y = ny; pts.push([x, y]);
		}
		if (pts.length > 1) paths.push({ pts: pts, level: level });
		return { pts: pts, ang: ang };
	}
	function dirAt(pts, i) { var a = pts[Math.max(0, i - 1)], c = pts[i]; return Math.atan2(c[1] - a[1], c[0] - a[0]); }
	var side = r() < .5 ? -1 : 1, base = r() * Math.PI * 2, n1 = 2 + (r() < .45 ? 1 : 0), rays = [];
	// 1 小さいヒビ（★中心から 2〜3 本）
	for (var i = 0; i < n1; i++) { var ang = base + i * Math.PI * 2 / n1 + (r() - .5) * .9, w1 = walk(cx, cy, ang, 2 + Math.floor(r() * 2), 1, .1); rays.push({ ang: w1.ang, all: w1.pts }); }
	// 2 伸びる
	rays.forEach(function (ray) { var e = ray.all[ray.all.length - 1], w2 = walk(e[0], e[1], ray.ang, 4 + Math.floor(r() * 4), 2, .25); ray.all = ray.all.concat(w2.pts.slice(1)); ray.ang = w2.ang; });
	// 3 枝分かれ（★左右どちらへ出やすいかは鉱石ごと）
	rays.forEach(function (ray) { var nb = 1 + (r() < .5 ? 1 : 0);
		for (var j = 0; j < nb && ray.all.length > 2; j++) { var k = 1 + Math.floor(r() * (ray.all.length - 1)), q = ray.all[k], sg = r() < .7 ? side : -side;
			walk(q[0], q[1], dirAt(ray.all, k) + sg * (.5 + r() * .6), 3 + Math.floor(r() * 4), 3, .2); } });
	// 4 別の向きへ（★いちばん空いている向き）＋ 表面が欠ける
	var angs = rays.map(function (ray) { return Math.atan2(ray.all[ray.all.length - 1][1] - cy, ray.all[ray.all.length - 1][0] - cx); }).sort(function (p, q) { return p - q; }), gap = 0, gapAt = base;
	angs.forEach(function (a, i2) { var nx = i2 + 1 < angs.length ? angs[i2 + 1] : angs[0] + Math.PI * 2; if (nx - a > gap) { gap = nx - a; gapAt = a + (nx - a) / 2; } });
	var w4 = walk(cx, cy, gapAt + (r() - .5) * .4, 6 + Math.floor(r() * 5), 4, .25); rays.push({ ang: w4.ang, all: w4.pts });
	chips.push({ x: cx, y: cy, r: 3, level: 4 });
	var early = paths.filter(function (p2) { return p2.level <= 3 && p2.pts.length > 2; });
	for (var c = 0; c < 2 + Math.floor(r() * 2) && early.length; c++) { var pp = early[Math.floor(r() * early.length)].pts, q4 = pp[1 + Math.floor(r() * (pp.length - 1))];
		chips.push({ x: q4[0], y: q4[1], r: 1.5 + r(), level: 4 }); }
	// 5 全体へ（★ふちまで伸びる）＋ 細いヒビ
	rays.forEach(function (ray) { var e = ray.all[ray.all.length - 1]; walk(e[0], e[1], ray.ang, 30, 5, .35); });
	var all = paths.slice();
	for (var t = 0; t < 7 + Math.floor(r() * 4); t++) { var pa = all[Math.floor(r() * all.length)].pts, q5 = pa[Math.floor(r() * pa.length)];
		walk(q5[0], q5[1], Math.atan2(q5[1] - cy, q5[0] - cx) + (r() - .5) * 1.6, 1 + Math.floor(r() * 3), 5, .3); }
	chips.push({ x: cx, y: cy, r: 5, level: 5 });
	var res = { paths: paths, chips: chips };
	caches.ores[key] = res; return res;
}
function draw(ctx, s, opt) {
	opt = opt || {};
	var P = global.DotPalette ? global.DotPalette.COLORS : null, quiet = !!opt.reduced;
	function box(x, y, w, h, c) { ctx.fillStyle = c; ctx.fillRect(Math.round(x), Math.round(y), Math.max(1, Math.round(w)), Math.max(1, Math.round(h))); }
	var sx = s.shake > 0 && !quiet && opt.shake !== false ? (Math.floor(s.clock / 30) % 2 ? 1 : -1) * s.shakeAmp : 0,
		sy = s.shake > 0 && !quiet && opt.shake !== false ? (Math.floor(s.clock / 45) % 2 ? 1 : 0) * Math.max(0, s.shakeAmp - 1) : 0;
	ctx.save(); ctx.imageSmoothingEnabled = false;
	box(0, 0, W, H, PAL.void);
	ctx.translate(sx, sy);
	// 壁（★カメラの位置だけずらす）
	var cam = Math.round(s.camX), aw = artWall();
	if (aw) {   // ★島さんの絵を横に並べる（★鉱石1つにつき1枚）
		if (aw.canvas && ctx.drawImage) for (var k = Math.floor(cam / W); k * W - cam < W; k++) ctx.drawImage(aw.canvas, k * W - cam, 0);
		else box(0, 0, W, H, PAL.wall[0]);
	} else {
		var wall = buildWall(s);
		if (wall.canvas && ctx.drawImage) ctx.drawImage(wall.canvas, cam, 0, W, H, 0, 0, W, H);
		else { box(0, 0, W, H, PAL.wall[0]); box(0, 146, W, 14, PAL.deep); }
	}
	// 鉱石（★いまの鉱石と、スライド中に見える隣）
	s.site.ores.forEach(function (o, i) {
		var ox = ORE_X + i * SPACING - cam; if (!o || ox < -ORE_RX - 10 || ox > W + ORE_RX + 10) return;
		var pti = (s.site.pts || [])[i];
		drawOre(ctx, s, o, ox, i === s.site.at, box, quiet, pti ? pti.reveal : 1);
	});
	// 破片・粉塵・火花・素材
	s.dust.forEach(function (c) { var t = c.age / c.life, r = Math.round(c.r * (1 + t)); if ((Math.floor(c.x) + Math.floor(c.y)) % 2 && t > .5) return;
		box(c.x - r / 2, c.y - r / 2, r, r, t < .4 ? "#8a8b9a" : "#5a5d70"); });
	s.chunks.forEach(function (c) { box(c.x, c.y, c.w, c.h, c.col); box(c.x, c.y, c.w, 1, "#a69490"); box(c.x, c.y + c.h - 1, c.w, 1, PAL.void); });
	s.bits.forEach(function (c) { box(c.x, c.y, c.size, c.size, c.col); });
	drawPick(ctx, s, box, quiet);
	// 火花はツルハシの上に（★先端の奥に隠れないように）。★すじを引いて速く見せる
	if (s.flash > 0) { box(HIT.x - 3, HIT.y, 7, 1, PAL.spark[0]); box(HIT.x, HIT.y - 3, 1, 7, PAL.spark[0]); box(HIT.x - 1, HIT.y - 1, 3, 3, "#ffffff"); }
	s.sparks.forEach(function (c) { var c0 = PAL.spark[c.life > .25 ? 0 : c.life > .12 ? 1 : 2];
		box(c.x - c.vx * .02, c.y - c.vy * .02, 1, 1, PAL.spark[2]); box(c.x - c.vx * .01, c.y - c.vy * .01, 1, 1, PAL.spark[1]); box(c.x, c.y, 1, 1, c0); });
	ctx.restore();
	// 左上: クラフトの印（★小さなツルハシ。★素材を拾うと一瞬光る）
	// 右上: クラフトの印（★少し大きく・押しやすく）
	var ic = s.pulse > 0 || s.upFx ? "#fff1e8" : "#c2c8dd", up = s.upFx && s.upFx.ms > UPGRADE_FX_MS / 2 ? 1 : 0;
	drawBtn(box, CRAFT_ICON, !!s.iconDown, function (x, y, w) {
		// ★ツルハシの絵（★頭の横棒と、下への柄）
		var hx = x + 4, hy = y + 6, hw = w - 8;
		box(hx, hy, hw, 1, up ? "#fff1e8" : ic); box(hx, hy + 1, 1, 2, up ? "#fff1e8" : ic); box(hx + hw - 1, hy + 1, 1, 2, up ? "#fff1e8" : ic);
		box(hx + 1, hy - 1, hw - 2, 1, "#8d94ad");
		box(x + Math.floor(w / 2) - 1, hy + 2, 2, w - 12, "#9a5528"); box(x + Math.floor(w / 2) - 1, hy + 2, 1, w - 12, "#c07a3a");
	});
	if (s.upFx) {
		s.upFx.sparks.forEach(function (p, i) { box(CRAFT_ICON.x + p.x - 10, p.y, 1, 1, i % 2 ? PAL.spark[0] : "#ffffff"); });
		if (global.DotFont) global.DotFont.drawTextShadow(ctx, s.upFx.name, 60, 6, "#ffcc4a", PAL.void);   // ★新しい装備の名前（★上の真ん中あたり）
	}
	// ★★NEW（★いま作れるときだけ。★印のすぐ下。★出た瞬間だけ1ドット跳ねて、あとは静かに明るさが呼吸する）
	if (s.canUp && global.DotFont) {
		var jump = s.newPop > 0 ? Math.round(Math.sin(Math.PI * (1 - s.newPop / NEW_POP_MS)) * 2) : 0;
		var br = .5 + .5 * Math.sin(s.clock / NEW_BREATH_MS * Math.PI * 2);
		// ★★NEW はボタンのすぐ下・右ぞろえ（★ボタンを大きくしても隠れない。★2026-09-20(10)）
		global.DotFont.drawTextShadow(ctx, NEW_TEXT, CRAFT_ICON.x + CRAFT_ICON.w - global.DotFont.textWidth(NEW_TEXT.length), CRAFT_ICON.y + CRAFT_ICON.h + 4 - jump, br > .5 ? "#fff1e8" : "#ffcc4a", PAL.void);
	}
	// ★★★★★⛏ボタンのキラッ（2026-09-21(7)）。★**NEW が出ているときだけ**・たまに・小さく。
	//   ★★NEW の文字自体はいままでどおり（★激しく点滅させない）。★光るのは⛏側だけ
	usparkAt(box, s, "icon", CRAFT_ICON, "icon");
	drawGuide(s, box);
	if (DEBUG.on) drawDebug(ctx, s, box);
	if (s.phase === "craft") { drawCraft(ctx, s, box); return; }   // ★アップグレードの画面では、左の縦並びと飛んでいる素材は出さない
	drawPointInd(ctx, s, box);   // ★★★いまどこにいるかの目印（2026-09-21(8)・出し入れは 2026-09-22）
	drawCounters(ctx, s, box);
	// 飛んでいる素材（★所持数と同じアイコンを小さく。★所持数の上を通って吸い込まれる）
	s.pickups.forEach(function (p) { var m = MATS[p.mat];
		if (!drawIcon(box, p.mat, p.x, p.y, 2, true)) { box(p.x - 1, p.y - 1, 3, 3, m.col[1]); box(p.x - 1, p.y - 1, 1, 1, m.col[2]); }
		if (p.glint && !p.pulling && p.age >= p.tA) { var gl = Math.floor(p.age / 60) % 2 ? 5 : 6;   // ★レア: 滞空で光る
			box(p.x - gl, p.y, 2, 1, "#ffffff"); box(p.x + gl - 1, p.y, 2, 1, "#ffffff"); box(p.x, p.y - gl, 1, 2, m.col[2]); box(p.x, p.y + gl - 1, 1, 2, m.col[2]); }
		else if (p.rare && Math.floor(s.clock / 90) % 2) { box(p.x - 6, p.y, 1, 1, m.col[2]); box(p.x + 5, p.y, 1, 1, m.col[2]); } });
	s.hudBits.forEach(function (b) { box(b.x, b.y, 1, 1, b.rare ? "#bff4ff" : b.life > .08 ? "#ffffff" : "#ffcc4a"); });
}
// ---- 開発用の表示（★ふだんは出ない。★DotMining.setDebug(1) で出る） ----
//   いまの HEAD / HANDLE・鉱石の耐久・あと何発・落とす確率・次のアップグレードまでの目安
var DEBUG = { on: 0 };
function etaMs(s, kind) {
	var cost = costOf(s, kind, 1); if (!cost) return null;
	var mix = B.ORE_MIX[Math.min(headProg(s), B.ORE_MIX.length - 1)], tot = 0, rate = {}, per = 0, k;
	for (k in mix) { if (!B.canBreak(k, s.head)) continue; tot += mix[k]; }
	for (k in mix) {
		if (!B.canBreak(k, s.head)) continue;
		var w = mix[k] / tot, d = oreDef(k);
		per += w * B.breakMs(k, s.head, s.handle, FEEL);
		Object.keys(d.drops).forEach(function (m) { var r = d.drops[m]; rate[m] = (rate[m] || 0) + w * (r[2] === undefined ? 1 : r[2]) * (r[0] + r[1]) / 2; });
	}
	var worst = 0;
	Object.keys(cost).forEach(function (m) { var need = Math.max(0, cost[m] - (s.mats[m] || 0)); if (!need) return;
		var r = rate[m] || .0001; worst = Math.max(worst, need / r * per); });
	return worst;
}
function drawDebug(ctx, s, box) {
	var F = global.DotFont; if (!F) return;
	var o = ore(s), d = o ? oreDef(o.type) : null, lines = [
		"H" + s.head + "/" + s.headMax + " " + HEADS[s.head].id + " P" + HEADS[s.head].power + "  W" + s.handle + "/" + s.handleMax + " " + HANDLES[s.handle].cycle + "MS",
		d ? d.id + " HP" + Math.ceil(o.hp) + "/" + d.hp + " REQ" + d.req + " HIT" + B.hitsFor(d.id, s.head) : "-",
		d ? Object.keys(d.drops).map(function (k) { return k.slice(0, 2).toUpperCase() + Math.round((d.drops[k][2] === undefined ? 1 : d.drops[k][2]) * 100); }).join(" ") : "-",
		"NEXT H" + (etaMs(s, "head") === null ? "MAX" : Math.round(etaMs(s, "head") / 1000) + "S") + " W" + (etaMs(s, "handle") === null ? "MAX" : Math.round(etaMs(s, "handle") / 1000) + "S")
	];
	box(0, 96, 150, 4 + lines.length * 9, "#0d101a");
	lines.forEach(function (t, i) { F.drawText(ctx, t.toUpperCase(), 2, 98 + i * 9, "#7fe07f"); });
}
// ---- スワイプの案内: 小さな矢じり（3x5）が、光の尾を引いて流れて消える ----
function drawGuide(s, box) {
	var g = s.guide; if (!g || g.t < 0) return;
	var k = g.t % (GUIDE.travelMs + GUIDE.pauseMs); if (k >= GUIDE.travelMs) return;
	var u = k / GUIDE.travelMs, e = 1 - Math.pow(1 - u, 2), fade = u < .15 ? u / .15 : u > .55 ? (1 - u) / .45 : 1;
	// ★色は火花と同じ暖かい光（★洞窟の青・結晶の水色に埋もれない）。★消えぎわは暗い色へ
	var lvl = (g.weak ? .55 : 1) * fade, cols = lvl > .66 ? ["#fff1e8", "#ffcc4a", "#ab5236"] : lvl > .33 ? ["#ffcc4a", "#ab5236", "#5f574f"] : ["#ab5236", "#5f574f", null];
	// ★指を動かす向き ＝ 鉱石の向きの逆（★右の鉱石へ行くには、右から左へ払う）
	var d = -g.dir, x = Math.round(HIT.x + d * (10 + e * GUIDE.dist) - d * GUIDE.dist), y = HIT.y + GUIDE.dy;
	for (var i = 1; i <= 5; i++) { var c = i <= 2 ? cols[1] : cols[2]; if (c && e * GUIDE.dist >= i * 2) box(x - d * (i * 2 + 1), y + 3, 2, 1, c); }   // 光の尾（★流れてきた跡）
	// 矢じり（4x7。★線は2ドットの太さ。★先の1点がいちばん明るい）
	[[0, 0], [1, 1], [2, 2], [3, 3], [2, 4], [1, 5], [0, 6]].forEach(function (q) { box(x + d * q[0] - (d < 0 ? 1 : 0), y + q[1], 2, 1, q[0] === 3 ? cols[0] : cols[1]); });
}
// ---- 素材アイコン（★島さんの絵 → tools/mine2sprites.py → js/mining-sprites.js） ----
//   ★どの素材がどのアイコンか（絵の升目）は tools/mine2sprites.py の MATERIAL_ICON_MAP の1か所
//   ★所持数は元の絵の1ドット = 画面の1ドット。★飛んでいる素材は同じアイコンを小さく（★ひとつおきに拾う）
function sprites() { var S = global.DotMiningSprites; return S && S.poses && S.icons ? S : null; }
//   step = 元の何ドットで画面の1ドットか（2 = 半分・1 = そのまま・1/1.15 = 115%）
function drawIcon(box, k, x, y, step, center) {
	var S = sprites(), ic = S && S.icons[k]; if (!ic) return false;
	var w = Math.ceil(ic.w / step), h = Math.ceil(ic.h / step);
	if (center) { x = Math.round(x - w / 2); y = Math.round(y - h / 2); }
	for (var v = 0; v < h; v++) for (var u = 0; u < w; u++) {
		var sx = Math.floor(u * step), sy = Math.floor(v * step); if (sx >= ic.w || sy >= ic.h) continue;
		var ch = ic.px[sy * ic.w + sx]; if (ch === " " || ch === undefined) continue;
		box(x + u, y + v, 1, 1, S.iconPal[ABC.indexOf(ch)]);
	}
	return true;
}
// ============================================================
// ■ ★★★素材が届いたあとの「キラッ」（2026-09-21(3) 島さんの指定）
// ============================================================
//   ★流れ: 届く → 数字が +1 → ★少し間 → 素材アイコンがキラッ → NEW
//   ★★**同時に光らせない**。★1つずつ順番に（★待ち行列）
//   ★★★**採掘は止めない**（★次の鉱石・ツルハシ・素材の飛び方は、これと関係なく動く）
var SPARK = {
	on: 1,
	delay: 100,      // ★届いてから光るまで（ms）
	dur: 180,        // ★1回の長さ（ms）
	gap: 90,         // ★ちがう素材どうしの最小の間（ms）
	merge: 300,      // ★同じ素材は、この間にまとめて「1回だけ」
	overlap: .6,     // ★前のキラッがこれだけ進んだら、次を始めてよい（★最大の大きさは重ならない）
	max: 5,          // ★待ち行列の上限（★あふれたら古い要求から捨てる。★素材の数は絶対に減らさない）
	stale: 900,      // ★これより古くなった要求は捨てる（★いまさら光っても分からないため）
	rareDur: 280, rareBig: 1,   // ★レアは少し長く・1ドット大きく ＋ 追い光1つ
	rareTail: 70,    // ★レアの追い光（★キラッのあと、これだけ経って小さく ✦）
	r: 3,            // ★腕の長さ（ドット）
	sound: 0         // ★★いまは音を鳴らさない（★ほしくなったら 1。★小さな高音を1つだけ）
};
// ★光のかたち3種（★同じ素材でも毎回少しちがう）
//   cross 十字 ／ diag 斜め十字 ／ beam 大きい1本＋小さな粒2つ
var SPARK_KIND = ["cross", "diag", "beam"];
// ★素材ごとの色（★必ず白い芯を持たせて、先だけ素材の色を混ぜる）
var SPARK_TIP = {
	iron: "#bcd4ff", carbon: "#c9b9ff", quartz: "#b8f0ff", crystal: "#9fe8ff",
	chromite: "#ffb8e4", tungsten: "#e2c9ff", titanium: "#bfe4ff", core: "#ffd9a0"
};
var SPARK_CORE = "#ffffff", SPARK_MID = "#fff3b0";
// ★アイコンの中心から、どれだけずらすか（★右上・左上・右下・左下）
var SPARK_OFF = [[3, -3], [-3, -3], [3, 3], [-3, 2]];

// ★★キラッを1つ頼む（★届いた瞬間に呼ぶ。★同じ素材が続いたら、まとめて1回）
function askSpark(s, mat, rare) {
	if (!SPARK.on || !s) return;
	var q = s.sparkQ, i;
	for (i = 0; i < q.length; i++) if (q[i].mat === mat) {
		q[i].at = Math.min(s.clock, q[i].first + SPARK.merge);   // ★最後に届いたところで光る（★ただし待ちすぎない）
		q[i].n++; if (rare) q[i].rare = true;
		return;
	}
	if (s.spark && s.spark.mat === mat && s.spark.t < SPARK.merge * .5) return;   // ★いま光っている最中の同じ素材は、足さない
	q.push({ mat: mat, first: s.clock, at: s.clock, n: 1, rare: !!rare, seed: Math.floor(rng(s) * 1e6) });
	while (q.length > SPARK.max) q.shift();                      // ★あふれたら古い要求から捨てる（★素材の数は減らさない）
}
// ★待ち行列を進める（★1つずつ・順番に）
function updateSpark(s, ms) {
	if (!SPARK.on) return;
	var sp = s.spark;
	if (sp) { sp.t += ms; if (sp.t >= sp.dur + (sp.rare ? SPARK.rareTail + 60 : 0)) { s.spark = sp = null; } }
	var q = s.sparkQ;
	while (q.length && s.clock - q[0].at > SPARK.stale) q.shift();   // ★古すぎる要求は捨てる
	if (!q.length) return;
	if (sp && (sp.t < sp.dur * SPARK.overlap || sp.t < SPARK.gap)) return;   // ★最大の大きさが重ならないように
	var head = q[0];
	if (s.clock - head.at < SPARK.delay) return;                     // ★届いてから少し待つ
	q.shift();
	s.spark = { mat: head.mat, t: 0, dur: head.rare ? SPARK.rareDur : SPARK.dur, rare: head.rare,
		kind: SPARK_KIND[head.seed % SPARK_KIND.length], off: SPARK_OFF[(head.seed >> 3) % SPARK_OFF.length], seed: head.seed };
	if (SPARK.sound) event(s, "spark", { mat: head.mat, rare: head.rare });
}
// ★1回ぶんの大きさ（0 → 1 → 0。★出て・広がって・細くなって・消える）
function sparkBell(u) { return u <= 0 || u >= 1 ? 0 : Math.sin(Math.PI * Math.pow(u, .55)); }
// ★★キラッを描く（★素材アイコンの上に重ねる）
function drawSpark(box, s) {
	var sp = s.spark; if (!SPARK.on || !sp) return;
	var at = counterAt(s, sp.mat);
	var cx = at.x + MATERIAL_ICON_CENTER_X + sp.off[0], cy = at.y + MATERIAL_ICON_CENTER_Y + sp.off[1];
	var tip = SPARK_TIP[sp.mat] || SPARK_MID;
	var u = sp.t / sp.dur, r = (SPARK.r + (sp.rare ? SPARK.rareBig : 0)) * sparkBell(u);
	if (r > .2) {
		var n = Math.max(1, Math.round(r)), i;
		box(cx, cy, 1, 1, SPARK_CORE);                                   // ★芯
		if (sp.kind === "cross" || sp.kind === "beam") {
			var up = sp.kind === "beam" ? n + 1 : n;
			for (i = 1; i <= up; i++) box(cx, cy - i, 1, 1, i === up ? tip : SPARK_MID);
			for (i = 1; i <= n; i++) box(cx, cy + i, 1, 1, i === n ? tip : SPARK_MID);
			if (sp.kind === "cross") for (i = 1; i <= n; i++) { box(cx - i, cy, 1, 1, i === n ? tip : SPARK_MID); box(cx + i, cy, 1, 1, i === n ? tip : SPARK_MID); }
			else { box(cx - 2, cy + 1, 1, 1, tip); box(cx + 2, cy - 1, 1, 1, tip); }   // ★大きい1本 ＋ 小さな粒2つ
		} else {
			for (i = 1; i <= n; i++) { box(cx - i, cy - i, 1, 1, i === n ? tip : SPARK_MID); box(cx + i, cy - i, 1, 1, i === n ? tip : SPARK_MID);
				box(cx - i, cy + i, 1, 1, i === n ? tip : SPARK_MID); box(cx + i, cy + i, 1, 1, i === n ? tip : SPARK_MID); }
		}
		// ★斜めに飛ぶ小さな粒（2〜4個）
		if (sp.kind !== "diag") { var m = 2 + (sp.seed % 3);
			for (i = 0; i < m; i++) { var a = (sp.seed + i * 97) % 4, dx = a < 2 ? 1 : -1, dy = a % 2 ? 1 : -1;
				box(cx + dx * (n + 1), cy + dy * (n + 1), 1, 1, SPARK_MID); } }
	}
	// ★レアだけ: キラッのあと、小さな追い光をひとつ
	if (sp.rare && sp.t > sp.dur + SPARK.rareTail && sp.t < sp.dur + SPARK.rareTail + 60) {
		box(cx + 4, cy - 4, 1, 1, SPARK_CORE); box(cx + 3, cy - 4, 1, 1, tip); box(cx + 5, cy - 4, 1, 1, tip);
		box(cx + 4, cy - 5, 1, 1, tip); box(cx + 4, cy - 3, 1, 1, tip);
	}
}

// ============================================================
// ★★★★★「いま作れるよ」のキラキラ（USPARK）2026-09-21(7) 島さんの指定
// ============================================================
//
//   ★★**目的は「気づかせる」こと**。★「見続けさせる」演出ではありません。
//     ★鉱石・素材の飛行・破壊・ツルハシより目立たせない（★小さく・短く）。
//
//   ★★★**同じ瞬間に光るのは 1 つだけ**（`s.uspark` が1つしか無い═仕組みで保証）。
//     ★HEAD と HANDLE が両方作れるときも、★★**必ず時間差**で順番に回ります。
//
//   ★★★★**買った瞬間に止まります**:
//     ★`usparkTargets()` が毎フレーム「いま作れるもの」を数え直すので、
//     ★★作れなくなったものは**その場で一覧から消える** ＝ 光り続けられない。
//     ★★★完成の演出（`s.upFx`）のあいだも、一覧は空 ＝ **重ならない**。
//
//   ★★★★★**音は鳴らしません**（2026-09-21(7) 島さんの指定。
//     ★すでに NEW 音・完成音・素材の吸収音があるため）。
//
//   ★**`Math.random()` は呼びません**。★★`rng(s)` も呼びません
//     （★見た目のために世界のサイコロを進めると、★★**鉱石の並びがずれます**）。
//     ★`h2(時刻, 順番)` ═ 計算するだけのサイコロを使います。
var USPARK = {
	on: 1,
	dur: 150,          // ★キラッ1回の長さ（ms。★島さんの指定 120〜180 のまん中）
	restMin: 1400, restMax: 2200,   // ★★ひと回りしたあとの「静かな間」（★毎回ちがう＝機械的に見えない）
	stepMin: 400, stepMax: 700,     // ★★★HEAD → HANDLE など、対象が複数のときの時間差
	first: 450,        // ★★NEW が出てから最初のキラッまで（★300〜600 のまん中）
	enter: 350,        // ★画面を開いた直後の少しの間
	r: 2,              // ★腕の長さ（★最大でも 9 ドットほど）
	edgeEvery: 3,      // ★カードだけ: 何回に1回、枠を光が1周するか
	sound: 0           // ★★★**音は追加しない**（★欲しくなったときだけ 1）
};
// ★光のかたち3種（★小さい十字 ／ 斜め十字 ／ 1ドットの強い光＋小粒2つ）
var USPARK_KIND = ["cross", "diag", "dot"];
// ★心は必ず白。★先だけ薄い黄色、★★HEAD は金属色、HANDLE は柄の明るい色を少しだけ
var USPARK_CORE = "#ffffff", USPARK_MID = "#fff3b0";
var USPARK_TIP = { head: "#dfe6f2", handle: "#e8c08a", icon: "#dfe6f2", card: "#fff3b0" };
// ★出る場所（★枠の中の割合）: ★左上 → 金属（まん中）→ 右上
var USPARK_SPOT = [[.14, .24], [.5, .5], [.86, .24]];
// ★★カードだけは別の場所（★装備の絵の金属部分 ／ 右上の角）。
//   ★まん中は**装備名や MAKE の文字に重なる**ので使いません
var USPARK_SPOT_CARD = [[.11, .46], [.94, .16], [.13, .26]];

// ★★いま「光らせてよいもの」の一覧（★毎フレーム数え直す ＝ 買った瞬間に消える）
function usparkTargets(s) {
	if (!USPARK.on || !s) return [];
	if (s.upFx) return [];                       // ★★★完成の演出中は出さない（★重ねない）
	var out = [];
	if (s.phase === "craft" && s.craftKind) {    // ★★詳細の列: **いま本当に作れるカードだけ**
		historyRows(s, s.craftKind).forEach(function (r) {
			if (r.kind === "next" && canMake(s, s.craftKind, r.step)) out.push("card:" + r.step);
		});
		return out;                                // ★OWNED / SKIPPED / EQUIPPED / ??? / 足りない は入らない
	}
	if (s.phase === "craft") {                   // ★HEAD / HANDLE の選択画面
		if (s.canUpHead) out.push("part:head");
		if (s.canUpHandle) out.push("part:handle");
		return out;
	}
	if (s.canUp) out.push("icon");               // ★右上の⛏（★NEW が出ているときだけ）
	return out;
}
// ★★一つずつ、順番に回す（★同時に2つ光らない）
function updateUSpark(s, ms) {
	if (!USPARK.on) return;
	var sp = s.uspark;
	if (sp) { sp.t += ms; if (sp.t >= sp.dur) s.uspark = sp = null; }
	var list = usparkTargets(s);
	if (!list.length) {                          // ★★作れるものが無い ＝ **その場で終わり**
		s.uspark = null; s.usparkKey = ""; s.usparkTurn = 0; s.usparkWait = USPARK.first;
		return;
	}
	var key = list.join("|");
	if (key !== s.usparkKey) {                   // ★対象が変わった（★買った・画面が移った）
		s.usparkKey = key; s.usparkTurn = 0;
		if (s.uspark && list.indexOf(s.uspark.who) < 0) s.uspark = null;   // ★★消えた対象はその場で止める
		if (s.usparkWait < USPARK.enter) s.usparkWait = USPARK.enter;
	}
	if (s.uspark) return;                        // ★★★光っている間は次を始めない
	s.usparkWait -= ms;
	if (s.usparkWait > 0) return;
	var turn = s.usparkTurn % list.length, who = list[turn];
	var d = h2(Math.floor(s.clock), turn * 31 + list.length);
	var d2 = h2(Math.floor(s.clock) + 977, turn * 7 + 3);
	s.uspark = { who: who, t: 0, dur: USPARK.dur,
		kind: USPARK_KIND[Math.floor(d * 3) % 3],
		spot: Math.floor(d2 * 3) % 3,
		edge: (s.usparkSeq % USPARK.edgeEvery) === 0, seed: Math.floor(d2 * 4096) };
	s.usparkSeq = (s.usparkSeq + 1) % 1000;
	s.usparkTurn = (turn + 1) % list.length;
	// ★★ひと回りしたら長く休む／★回りの途中なら短い時間差で次へ
	// ★★この待ち時間は**光り終わってから**減ります（★上の `if (s.uspark) return;` が止めている）。
	//   ★★★**だから `USPARK.dur` を足さないこと**（★足すと二重になり、間が伸びすぎる）
	s.usparkWait = s.usparkTurn === 0
		? USPARK.restMin + d * (USPARK.restMax - USPARK.restMin)
		: USPARK.stepMin + d * (USPARK.stepMax - USPARK.stepMin);
	if (USPARK.sound) event(s, "upgrade_spark", { who: who });
}
// ★★その場所にキラッを描く（★`who` が合わなければ何もしない）。
//   ★`rect` は、その目印の枠（⛏ボタン・大きな絵・カード）
function usparkAt(box, s, who, rect, tipKey) {
	var sp = s.uspark;
	if (!USPARK.on || !sp || sp.who !== who || !rect) return false;
	var u = sp.t / sp.dur, g = sparkBell(u);
	if (g <= .05) return false;
	var sq = (tipKey === "card" ? USPARK_SPOT_CARD : USPARK_SPOT)[sp.spot];
	var cx = Math.round(rect.x + rect.w * sq[0]), cy = Math.round(rect.y + rect.h * sq[1]);
	var tip = USPARK_TIP[tipKey || "card"] || USPARK_MID, i;
	var nn = Math.max(1, Math.round(USPARK.r * g));
	box(cx, cy, 1, 1, USPARK_CORE);                                  // ★心は必ず白
	if (sp.kind === "cross") {
		for (i = 1; i <= nn; i++) { box(cx, cy - i, 1, 1, i === nn ? tip : USPARK_MID); box(cx, cy + i, 1, 1, i === nn ? tip : USPARK_MID);
			box(cx - i, cy, 1, 1, i === nn ? tip : USPARK_MID); box(cx + i, cy, 1, 1, i === nn ? tip : USPARK_MID); }
	} else if (sp.kind === "diag") {
		for (i = 1; i <= nn; i++) { box(cx - i, cy - i, 1, 1, i === nn ? tip : USPARK_MID); box(cx + i, cy - i, 1, 1, i === nn ? tip : USPARK_MID);
			box(cx - i, cy + i, 1, 1, i === nn ? tip : USPARK_MID); box(cx + i, cy + i, 1, 1, i === nn ? tip : USPARK_MID); }
	} else {                                                          // ★1ドットの強い光 ＋ 小粒2つ
		box(cx, cy - nn, 1, 1, tip); box(cx, cy + nn, 1, 1, USPARK_MID);
		box(cx - nn - 1, cy + 1, 1, 1, tip); box(cx + nn + 1, cy - 1, 1, 1, tip);
	}
	return true;
}
// ★★カードだけ: たまに、枠を 2 ドットの光が短く走る（★枠全体は点滅させない）
function usparkEdge(box, s, who, c) {
	var sp = s.uspark;
	if (!USPARK.on || !sp || sp.who !== who || !sp.edge || !c) return false;
	var u = sp.t / sp.dur;
	if (u <= 0 || u >= 1) return false;
	var per = 2 * (c.w + c.h), pp = u * per, qx, qy;
	if (pp < c.w) { qx = c.x + pp; qy = c.y; }
	else if (pp < c.w + c.h) { qx = c.x + c.w - 1; qy = c.y + (pp - c.w); }
	else if (pp < 2 * c.w + c.h) { qx = c.x + c.w - (pp - c.w - c.h); qy = c.y + c.h - 1; }
	else { qx = c.x; qy = c.y + c.h - (pp - 2 * c.w - c.h); }
	box(qx, qy, 2, 1, USPARK_MID);
	return true;
}
// ★★★★★目印の濃さを、毎フレーム目標へ近づける（2026-09-22 島さんの指定）
//   ★★消すのは**ツルハシが当たっていて、かつ止まっていない**ときだけ。
//   ★★★壊せない鉱石で止まった（`blocked`）ら、★**戻します**
//     （★なぞってほしい場面なので、目印が見えるほうが良い）。
//   ★★★★**途中で入力が変わっても、1.0 へ戻してからやり直しません**
//     （★いまの濃さから、そのまま反対へ向かう ＝ ちらつかない）。
function updatePointHud(s, ms) {
	// ★★★なぞっている間（`slideT < 1` ＝ 壁が横へ動いている）は、必ず見せる。
	//   ★★飛んでいる途中の振りがもう一発当たることがあるので、★ここで守ります
	// ★★★★★消すのは、★**指がまだ触れていて**、★★**ツルハシが当たっていて**、
	//   ★★★**止まっておらず**、★★★★**なぞっていない**ときだけ。
	//   ★`s.held` を入れないと、★★**なぞったあとに飛んでいた振りが当たって、
	//   ★★★指を離しているのに目印がまた消えます**。
	var hide = !!(s.digging && s.held && !s.blocked && s.phase === "mine" && s.slideT >= 1);
	if (hide !== s.pindHide) {
		s.pindHide = hide;
		s.pindWait = hide ? 0 : PFADE.wait;   // ★戻るときだけ、ほんの少し間を置く
	}
	if (hide) { s.pindA = Math.max(0, s.pindA - ms / PFADE.out); return; }
	if (s.pindA >= 1) { s.pindWait = 0; return; }
	if (s.pindWait > 0) { s.pindWait = Math.max(0, s.pindWait - ms); if (s.pindWait > 0) return; }
	s.pindA = Math.min(1, s.pindA + ms / PFADE.in);
}
// ★★★★★いまどこにいるかの目印（● ○ ○ ○）2026-09-21(8)
//   ★画面下のまん中。★★**文字は出さない**（★見た目だけで分かるように）
function drawPointInd(ctx, s, box) {
	if (!PIND.on || !s.site || s.phase !== "mine") return;
	// ★★★濃さが 0 なら**描かない**（★掘っている間は一筆も出さない）
	var A = Math.max(0, Math.min(1, s.pindA === undefined ? 1 : s.pindA));
	if (A <= 0.01) return;
	var had = ctx.globalAlpha;
	if (A < 1) ctx.globalAlpha = had * A;
	var a = s.site.ores, n2 = a.length, all = (n2 - 1) * PIND.gap, x0 = Math.round((W - all) / 2);
	var pop = (s.pindPop || 0) > 0 ? (s.pindPop / PIND.pop) : 0;
	// ★小さな下敷き（★瓦礫の上でも読めるように）
	var px = x0 - PIND.r - PIND.pad, pw = all + PIND.r * 2 + PIND.pad * 2, py = PIND.y - Math.floor(PIND.padH / 2);
	box(px, py, pw, PIND.padH, PIND.plate);
	box(px, py, pw, 1, PIND.plateTop);
	for (var i = 0; i < n2; i++) {
		var cx = x0 + i * PIND.gap, cy = PIND.y, on = i === s.site.at;
		var r = PIND.r + (on ? Math.round(pop * 2) : 0);
		// ★中の点（★いまいる場所だけ明るくて中が詰まっている）
		box(cx - Math.floor(r / 2), cy - Math.floor(r / 2), r, r, on ? PIND.lit : PIND.dim);
		// ★いない場所は、中を抜いて「○」に見せる
		if (!on && r >= 3) box(cx, cy, 1, 1, PIND.ring);
	}
	ctx.globalAlpha = had;   // ★このあとの描画に濃さを残さない
}
// ★★左はしの縦並び（★発見した素材だけ。★いちばん下に「まだ知らない素材」が1つ）
function drawCounters(ctx, s, box) {
	var F = global.DotFont, N = F && F.NUM ? F.NUM : F, S = sprites(), H = hudRows(s);
	H.rows.forEach(function (r) {
		var k = r.k, at = counterAt(s, k), pop = s.pop[k] || 0, ic = S && S.icons[k];
		var fx = s.matFx[k] || 0, sc = 1 + FLY.popScale * Math.sin(Math.PI * (1 - pop / FLY.popMs)) * (pop > 0 ? 1 : 0);   // ★届くと 100% → 115% → 100%
		var cy = at.y + MATERIAL_ICON_CENTER_Y;
		if (ic) drawIcon(box, k, at.x + MATERIAL_ICON_CENTER_X, cy, 1 / sc, true);
		else box(at.x + 5, at.y + 5, 6, 6, MATS[k].col[1]);
		// ★★初めて見つけた直後だけ、ひとしきり明るく光る（★文字は出さない）
		if (fx > 0) { var on = Math.floor((MATFX_MS - fx) / 70) % 2 === 0;
			[[-1, -5], [5, -5], [-5, 1], [5, 5], [-1, 6]].forEach(function (q, n) { if (on || n % 2) box(at.x + COUNTER.box / 2 + q[0], cy + q[1], 1, 1, n % 2 ? "#fff1e8" : "#ffcc4a"); }); }
		if (N) N.drawTextShadow(ctx, String(Math.min(999, s.mats[k] || 0)), at.x + COUNTER.num, cy - 3, pop || fx ? "#ffcc4a" : "#fff1e8", PAL.void);
	});
	if (H.unknown >= 0) drawUnknown(box, COUNTER.x + MATERIAL_ICON_CENTER_X, COUNTER.y + H.unknown * COUNTER.step + MATERIAL_ICON_CENTER_Y);
	drawSpark(box, s);   // ★★届いたあとの「キラッ」（★アイコンの上に重ねる）
}
// ============================================================
// ■ ★★鉱石は「壁の中に埋まっている」（2026-09-20(10) 島さんの指定）
// ============================================================
//   ★置いてある岩ではなく、掘り出している鉱脈に見せる
//   ★輪郭を均一にしない（1〜3ドット単位で不ぞろい）／壁に接する側には暗い接触影／輪郭の一部を前景の壁で隠す
//   ★埋まり方は鉱石の種類と seed で変える（★同じマスクを使い回さない）
//   ★★ヒビ・火花・破片は「見えている鉱石」の形が基準（★壁へは伸びない）＝ 壁のかぶりは いちばん最後 に描く
var BURY = {
	on: 1,
	depth: 4,            // ★壁がかぶる深さ（ドット）
	ratio: .26,          // ★扇（24分割）のうち、どれくらいが埋まるか ＝ 輪郭のおよそ 10〜20%
	shadeOut: 2,         // ★鉱石の外がわに置く接触影の厚み（ドット）
	shade: ["#141826", "#1c2233"],   // ★接触影（濃い・少し薄い）
	sides: [             // ★埋まり方の型（★左・右・下・上 の強さ）
		{ l: .95, r: .5, b: .8, t: .2 },
		{ l: .5, r: .95, b: .7, t: .15 },
		{ l: .8, r: .8, b: .95, t: .1 },
		{ l: 1, r: .35, b: .6, t: .35 },
		{ l: .4, r: 1, b: .9, t: .1 },
		{ l: .7, r: .6, b: .5, t: .45 }
	]
};
// ★その鉱石の「埋まり」を1回だけ計算して覚える（★壁で隠すドット／外がわの接触影）
function buryOf(o) {
	var A = art(); if (!A || !BURY.on) return null;
	var key = o.type + ":" + ((o.seed >>> 0) % 977);
	if (caches.bury[key]) return caches.bury[key];
	var O = A.ore, w = O.w, h = O.h, i, x, y, d;
	var inside = new Uint8Array(w * h), dep = new Uint8Array(w * h), out = new Uint8Array(w * h);
	var cx = 0, cy = 0, n = 0;
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (O.mask[y * w + x] !== "0") { inside[y * w + x] = 1; cx += x; cy += y; n++; }
	cx /= n || 1; cy /= n || 1;
	function on(x2, y2) { return x2 >= 0 && y2 >= 0 && x2 < w && y2 < h && inside[y2 * w + x2]; }
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (inside[y * w + x] && !(on(x - 1, y) && on(x + 1, y) && on(x, y - 1) && on(x, y + 1))) dep[y * w + x] = 1;
	for (d = 2; d <= BURY.depth; d++) for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
		if (!inside[y * w + x] || dep[y * w + x]) continue;
		if ((on(x - 1, y) && dep[y * w + x - 1] === d - 1) || (on(x + 1, y) && dep[y * w + x + 1] === d - 1) ||
			(on(x, y - 1) && dep[(y - 1) * w + x] === d - 1) || (on(x, y + 1) && dep[(y + 1) * w + x] === d - 1)) dep[y * w + x] = d;
	}
	// ★鉱石の外がわ（1〜shadeOut ドット）
	for (d = 1; d <= BURY.shadeOut; d++) for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
		if (inside[y * w + x] || out[y * w + x]) continue;
		var near = (x > 0 && (inside[y * w + x - 1] || out[y * w + x - 1] === d - 1)) || (x < w - 1 && (inside[y * w + x + 1] || out[y * w + x + 1] === d - 1)) ||
			(y > 0 && (inside[(y - 1) * w + x] || out[(y - 1) * w + x] === d - 1)) || (y < h - 1 && (inside[(y + 1) * w + x] || out[(y + 1) * w + x] === d - 1));
		if (near) out[y * w + x] = d;
	}
	var oi = oreIndex(o.type), sd = BURY.sides[(Math.abs(o.seed | 0) + oi * 5) % BURY.sides.length];
	function sideW(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? sd.l : sd.r) : (dy > 0 ? sd.b : sd.t); }
	// ★24 の扇ごとに「どれだけ埋まっているか」を決める（★点々ではなく、つながった形になる）
	var lobe = [];
	for (i = 0; i < 24; i++) { var an = (i + .5) / 24 * Math.PI * 2 - Math.PI, sw = sideW(Math.cos(an), Math.sin(an));
		lobe.push(h2(o.seed + 11 + oi * 97, i) < sw * BURY.ratio ? 1 + Math.floor(h2(o.seed + 23 + oi * 61, i) * BURY.depth) : 0); }
	var wall = [], shade = [];
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
		var dx = x - cx, dy = y - cy, seg = Math.floor((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2) * 24) % 24;
		var jit = Math.floor(h2(o.seed + 7 + oi * 13, x * 3 + y * 5) * 2.6) - 1;   // ★1〜3ドットの不ぞろい
		var want = lobe[seg] ? lobe[seg] + jit : 0;   // ★埋まる扇だけを、不ぞろいにする
		if (inside[y * w + x]) { if (dep[y * w + x] && dep[y * w + x] <= want) wall.push([x, y]); }
		else if (out[y * w + x]) {
			var swo = sideW(dx, dy);
			if (h2(o.seed + 3, x + y * 3) < swo * (out[y * w + x] === 1 ? .55 : .22)) shade.push([x, y, out[y * w + x] - 1]);
		}
	}
	// ★見えている形の重心（★ヒビと命中は、ここを基準にする）
	var vx = 0, vy = 0, vn = 0, hid = {};
	wall.forEach(function (q) { hid[q[1] * w + q[0]] = 1; });
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (inside[y * w + x] && !hid[y * w + x]) { vx += x; vy += y; vn++; }
	var e = { wall: wall, shade: shade, hid: hid, w: w, h: h,
		cx: O.x + vx / (vn || 1), cy: O.y + vy / (vn || 1), edge: n ? wall.length / n : 0 };
	caches.bury[key] = e; return e;
}
function oreIndex(id) { for (var i = 0; i < ORES.length; i++) if (ORES[i].id === id) return i; return 0; }
// ★壁のかぶりと接触影を描く（★いちばん最後 ＝ ヒビも破片も、壁の下に隠れる）
function drawBury(ctx, s, o, ox, box) {
	var bu = buryOf(o), A = art(); if (!bu || !A) return;
	var O = A.ore, left = Math.round(ox + O.x - ORE_X), top = Math.round(ORE_Y + O.y - ORE_Y);
	bu.shade.forEach(function (q) { box(left + q[0], top + q[1], 1, 1, BURY.shade[q[2] ? 1 : 0]); });
	bu.wall.forEach(function (q) {
		var sx = ((left + q[0]) % W + W) % W, sy = top + q[1];
		if (sy < 0 || sy >= H) return;
		box(left + q[0], sy, 1, 1, artColor(A, A.bg[sy * W + sx]));
	});
}
function drawOre(ctx, s, o, ox, current, box, quiet, ptReveal) {
	// ★★浮かび上がりは**その場所ごと**（2026-09-21(8)）。★見ていない間に出たものも正しく見える
	var b = buildOre(o), left = Math.round(ox + b.offX), top = Math.round(ORE_Y + b.offY), rev = Number.isFinite(ptReveal) ? ptReveal : (current ? s.reveal : 1);
	if (rev < 1) {   // 次の鉱石: 暗がりから浮かび上がる（★ドットの市松で。★4段を一度だけ絵にしておく ＝ 砕くたびに重くならない）
		var lv = Math.min(3, Math.floor(rev * 4));
		b.rev = b.rev || [];
		if (!b.rev[lv]) { var rc = canvas(b.w, b.h); b.rev[lv] = { canvas: rc, px: b.px.filter(function (p) { return ((p[0] + p[1]) & 3) / 4 <= lv / 4 + .001; }) };
			if (rc) { var rx = rc.getContext("2d"); b.rev[lv].px.forEach(function (p) { rx.fillStyle = p[2]; rx.fillRect(p[0], p[1], 1, 1); }); } }
		var R2 = b.rev[lv];
		if (R2.canvas && ctx.drawImage) ctx.drawImage(R2.canvas, left, top); else R2.px.forEach(function (p) { box(left + p[0], top + p[1], 1, 1, p[2]); });
		drawBury(ctx, s, o, ox, box);
		return;
	}
	if (b.canvas && ctx.drawImage) ctx.drawImage(b.canvas, left, top); else b.px.forEach(function (p) { box(left + p[0], top + p[1], 1, 1, p[2]); });
	// ★初めて見る鉱石は、ほんの一瞬だけ光る（★文字では説明しない）
	if (current && s.discover > 0 && Math.floor(s.clock / 70) % 2) {
		var gcol = (oreDef(o.type).fleck || ["#fff1e8"])[2];
		b.px.forEach(function (p) { if ((p[0] + p[1]) % 5) return; box(left + p[0], top + p[1], 1, 1, gcol); });
	}
	var stage = stageOf(o), d = oreDef(o.type);
	if (!stage) { drawBury(ctx, s, o, ox, box); return; }
	// ヒビ: 1 小さな傷 → 2 ヒビ → 3 枝分かれ → 4 欠ける → 5 全面
	var cr = crackPaths(o);
	cr.paths.forEach(function (path) {
		if (path.level > stage) return;
		// ★点を線でつなぐ（★とぎれた点線に見えないように）。★割れ目の下側に明るい縁 ＝ 溝に見える
		var thick = path.level <= 2 && stage >= 3, seen = {};
		path.pts.forEach(function (q, i) { if (!i) return; var p0 = path.pts[i - 1], n = Math.max(1, Math.ceil(Math.max(Math.abs(q[0] - p0[0]), Math.abs(q[1] - p0[1]))));
			for (var j = 1; j <= n; j++) { var x = Math.round(ox + p0[0] + (q[0] - p0[0]) * j / n), y = Math.round(ORE_Y + p0[1] + (q[1] - p0[1]) * j / n);
				if (seen[x + "," + y]) continue; seen[x + "," + y] = 1;
				var e = b.at(x - ox, y - ORE_Y); if (e < 0 || e > .95) continue;
				box(x, y + 1, 1, 1, d.base[3] || d.base[2]); box(x, y, 1, 1, PAL.void); if (thick && i < 7) box(x, y - 1, 1, 1, PAL.void); } });
	});
	// 表面が欠ける（★中心と、ヒビの上のいくつか。★鉱石の外には描かない）
	cr.chips.forEach(function (c, ci) {
		if (c.level > stage) return;
		var rr = Math.ceil(c.r);
		for (var y = -rr; y <= rr; y++) for (var x = -rr; x <= rr; x++) {
			if (Math.abs(x) + Math.abs(y) * 1.3 > c.r + h2(o.seed + ci * 31 + x, y) * 1.5) continue;
			var e = b.at(c.x + x, c.y + y); if (e < 0 || e > .95) continue;
			box(ox + c.x + x, ORE_Y + c.y + y, 1, 1, y < 0 ? PAL.void : PAL.deep);
		}
	});
	// ★★いちばん最後に、壁のかぶりと接触影（★ヒビも破片も壁の下へ隠れる ＝ 壁が手前にある）
	drawBury(ctx, s, o, ox, box);
}
// ---- ツルハシと右手（★島さんの絵: 待機・引く・振り下ろし の3ポーズ） ----
//   ふだん → 手前・後ろへ引く → 勢いよく振り下ろす（★だんだん速く）→ 鉱石の中心へ命中 → 反動 → ふだん
//   ★グローブとツルハシは手首を中心に回る。★腕は回らず、伸び縮みもしない（★絵の腕が手首ごと動くだけ）
//   ★元の絵の1ドット → 画面の PICK_SCALE ドット（★ぼかさない。★回すときも元のドットの升目で拾う）
var PICK_SCALE = 2;
var POSE = {
	rest: { spr: "rest", x: 192, y: 134 },     // 待機（★手首の位置。★島さんの採掘の絵のツルハシとほぼ同じ所）
	back: { spr: "back", x: 204, y: 146 },     // 引く
	strike: { spr: "strike" },                 // 振り下ろし（★手首の位置と向きは、先が鉱石の中心へ届くように下で計算）
	recoil: { spr: "strike" }                  // 反動
};
var STRIKE_FROM = { x: .83, y: .56 };           // 命中したとき、手首は中心から見てどちら側か（★右下）
var RECOIL = { turn: .22, x: 4, y: 5 };         // 反動: 戻る向きへ少しだけ回る・手首が少し下がる
var RECOIL_PART = .22;                          // 当たったあとの時間のうち、反動に使う割合（★残りで元へ戻る）
function sprAngle(name) { var S = sprites(), h = S.poses[name].head; return Math.atan2(h[1], h[0]); }   // その絵の柄の向き
function setupPoses() {
	var S = sprites(); if (!S) return;
	POSE.rest.a = sprAngle("rest"); POSE.back.a = sprAngle("back");
	var t = S.poses.strike.tip, tl = Math.hypot(t[0], t[1]) * PICK_SCALE;
	POSE.strike.x = HIT.x + STRIKE_FROM.x * tl; POSE.strike.y = HIT.y + STRIKE_FROM.y * tl;
	POSE.strike.a = sprAngle("strike") + Math.atan2(HIT.y - POSE.strike.y, HIT.x - POSE.strike.x) - Math.atan2(t[1], t[0]);
	POSE.recoil.a = POSE.strike.a + (POSE.rest.a - POSE.strike.a) * RECOIL.turn; POSE.recoil.x = POSE.strike.x + RECOIL.x; POSE.recoil.y = POSE.strike.y + RECOIL.y;
}
function lerpPose(p, q, k, spr) { return { a: p.a + (q.a - p.a) * k, x: p.x + (q.x - p.x) * k, y: p.y + (q.y - p.y) * k, spr: spr }; }
function swingPose(s) {
	var c = s.cycleMs || cycle(s), t = s.swinging ? s.swingT / c : 0, up = FEEL.windup, hit = FEEL.windup + FEEL.strike, k, pose;
	if (!s.swinging) pose = lerpPose(POSE.rest, POSE.rest, 0, "rest");
	else if (t < up) { k = 1 - Math.pow(1 - t / up, 2); pose = lerpPose(POSE.rest, POSE.back, k, k < .5 ? "rest" : "back"); }                     // 引く
	else if (t < hit) { k = Math.pow((t - up) / (hit - up), 2.2); pose = lerpPose(POSE.back, POSE.strike, k, k < .35 ? "back" : "strike"); }     // 振り下ろし（★だんだん速く）
	else { var u = (t - hit) / (1 - hit);
		if (u < RECOIL_PART) { k = 1 - Math.pow(1 - u / RECOIL_PART, 2); pose = lerpPose(POSE.strike, POSE.recoil, k, "strike"); }             // 反動
		else { k = (u - RECOIL_PART) / (1 - RECOIL_PART); k = k * k * (3 - 2 * k); pose = lerpPose(POSE.recoil, POSE.rest, k, k < .5 ? "strike" : "rest"); } }   // 戻る
	pose.fast = s.swinging && t >= up && t < hit;
	return pose;
}
// ★振り下ろしきった姿で、ツルハシの先がどこに来るか（★テストで「中心に当たる」を確かめる）
function tipOf(pose) { var S = sprites(), P = S.poses[pose.spr], t = P.tip || P.head, r = pose.a - sprAngle(pose.spr), c = Math.cos(r), sn = Math.sin(r);
	return { x: pose.x + (t[0] * c - t[1] * sn) * PICK_SCALE, y: pose.y + (t[0] * sn + t[1] * c) * PICK_SCALE }; }
// HEAD を替えると、頭（金属）の色が変わる（★炭素鋼 = 暗い青みの鋼）
// ★★HEAD / HANDLE の段で、採掘中のツルハシの見た目が変わる（2026-09-20(5) 島さんの指定）
//   ★色は js/mining-balance.js の col（暗い・中・明るい）。★明るさの順は島さんの絵のまま
var steelCache = {};
function tierColor(hex, tier, list) {
	var t = list[tier] || list[0], key = hex + ":" + (t.id || tier); if (steelCache[key]) return steelCache[key];
	var L = lum(hex), c = t.col, out;
	if (c.length < 3) out = L > .55 ? c[1] : c[0];
	else out = L > .74 ? c[2] : L > .5 ? mixHex(c[1], c[2], .45) : L > .3 ? c[1] : c[0];
	steelCache[key] = out; return out;
}
// ============================================================
// ■ ★★★HANDLE（柄）10種の見た目（2026-09-20(11) 島さんの参考画像10枚から）
// ============================================================
//   ★★参考画像は **ゲームに貼っていません**。10枚から「柄のデザイン」だけを読み取り、
//     240×160 で読めるドット（1〜2ドットの特徴）に描き直したものです。→ docs/handle-refs.md
//   ★★変えるのは **柄だけ**。HEAD・グローブ・指・素肌の腕・長さ・握る位置・命中位置は1ドットも変えません
//   ★★模様は「柄にそった座標（t = ヘッド側0 → 握り側1 ／ r = 横）」で描くので、振っても滑りません
//
//   pat    : 表面（none 無地 ／ grain 縦木目 ／ weave 斜め織り ／ mesh 網目 ／ wrap 斜め巻き ／ rib 横リブ）
//   collar : ヘッド直下の補強カラー（★1ドット太くなる）／ bands : 中間のリング（bolt = リベット）
//   grip   : 握り側の滑り止め ／ plate : 鋼板 ／ two : 途中から色が変わる（2色構成）
//   wide   : ふくらむ区間（＋1ドット）／ thin : 細る区間（−1ドット）
//   hole   : 肉抜きの穴 ／ accent : 片側1ドットの差し色 ／ ref : もとにした参考画像の番号
var HANDLE_LOOK = [
	// T0 WOOD ← REF_08: 素朴な木＋革の留め具1本
	{ col: ["#5a3d22", "#8a6a3e", "#b89058"], pat: "none",
		bands: [{ at: .58, w: .07, col: "#4a3018" }], wide: [[.55, .62]], ref: 8 },
	// T1 HARDWOOD ← REF_01: 濃い赤茶・縦の木目・鋼の補強カラー＋リベット
	{ col: ["#3a2216", "#5e3a20", "#82522c"], pat: "grain", patCol: "#2a170d",
		collar: { to: .18, col: "#6b7080", hi: "#9aa0b0", bolt: "#c9cedb" }, wide: [[0, .18]], ref: 1 },
	// T2 FIBERGLASS ← REF_04: クリーム〜黄の均一な面・細かい網目・下に濃いグリップ
	{ col: ["#a8974e", "#ded09a", "#f7efd0"], pat: "mesh", patCol: "#c0ad6e",
		grip: { from: .66, col: "#3c3a20", rib: "#5c5830" }, ref: 4 },
	// T3 CARBON FIBER ← REF_05: 黒〜濃灰・斜めの織り目・細身・シアンの細い差し色
	{ col: ["#1b1f2c", "#333949", "#565d75"], pat: "weave", patCol: "#6a7390",
		thin: [[.3, .72]], accent: "#4fd0e0", ref: 5 },
	// T4 TITANIUM COMPOSITE ← REF_03: 骨色（上）＋黒（下）の2色・金属リング2本
	{ col: ["#1e2536", "#39445c", "#5d6b88"], pat: "none",
		two: { at: .46, col: ["#8a8478", "#cfc7b4", "#efe8d6"] },
		bands: [{ at: .44, w: .05, col: "#cdd6e6", bolt: "#8f9ab0" }, { at: .74, w: .05, col: "#cdd6e6" }],
		wide: [[.42, .48]], ref: 3 },
	// T5 FORGED STEEL ← REF_06: 木の芯に鋼板＋リベット（★補強された道具）
	{ col: ["#4a3020", "#6e4a2a", "#95663a"], pat: "none",
		collar: { to: .14, col: "#5c6270", hi: "#8b93a4", bolt: "#c9cedb" },
		plate: { from: .22, to: .8, col: "#646b7c", hi: "#9aa2b4", bolt: "#d5dae6", every: .2 },
		wide: [[0, .14], [.22, .8]], ref: 6 },
	// T6 DAMPED GRIP ← REF_02: 振動吸収の多層グリップ＋真鍮のカラー
	{ col: ["#2e2620", "#4e4036", "#6f5c4c"], pat: "wrap", patCol: "#8a6f52",
		bands: [{ at: .22, w: .05, col: "#b08a3c", bolt: "#e0bb62" }, { at: .5, w: .05, col: "#b08a3c" }, { at: .78, w: .05, col: "#b08a3c" }],
		grip: { from: .62, col: "#3a2f26", rib: "#5f4d3c" }, wide: [[.2, .27], [.48, .55]], ref: 2 },
	// T7 HOLLOW ALLOY ← REF_07: 中空構造（肉抜き）＋金属リング（★軽い）
	{ col: ["#3d3a44", "#5f5c6c", "#8b8799"], pat: "none",
		bands: [{ at: .16, w: .05, col: "#a8adbc", bolt: "#dfe3ee" }, { at: .86, w: .05, col: "#a8adbc" }],
		hole: [.34, .52, .7], thin: [[.3, .78]], ref: 7 },
	// T8 IMPACT ALLOY ← REF_09: 工業製品の橙＋黒・滑り止めリブ・ストラップ穴
	{ col: ["#20222c", "#34384a", "#4b5165"], pat: "rib", patCol: "#1a1c24",
		two: { at: .3, col: ["#8a4a12", "#d4801e", "#f0a63c"] },
		grip: { from: .6, col: "#191b23", rib: "#2e323f" },
		hole: [.92], wide: [[.26, .34]], ref: 9 },
	// T9 MASTER FITTING ← REF_10: 濃い複合材＋精密な真鍮の金具（★長年改良された道具）
	{ col: ["#241f2a", "#3a3340", "#544b5c"], pat: "weave", patCol: "#6b6076",
		collar: { to: .15, col: "#8e6e2e", hi: "#c39a44", bolt: "#efd07a" },
		bands: [{ at: .4, w: .06, col: "#8e6e2e", bolt: "#efd07a" }, { at: .68, w: .06, col: "#8e6e2e", bolt: "#efd07a" }],
		grip: { from: .8, col: "#1d1a22", rib: "#443c4c" },
		wide: [[0, .15], [.38, .46], [.66, .74]], ref: 10 }
];
// ★★柄の「かたち」を1回だけ測って覚える（★軸にそった t と、横の r。★共通アンカーもここ）
//   ★P.wood があればその中だけ／無ければ絵ぜんぶ（★メニューの柄アイコン用）
function handleGeom(P, metalSet) {
	if (P.hGeom !== undefined) return P.hGeom;
	var w = P.w, h = P.h, m = P.wood, x, y;
	function isW(x2, y2) { return x2 >= 0 && y2 >= 0 && x2 < w && y2 < h && (m ? m[y2 * w + x2] === "1" : P.px[y2 * w + x2] !== " "); }
	var cx = 0, cy = 0, n = 0;
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (isW(x, y)) { cx += x; cy += y; n++; }
	if (!n) { P.hGeom = null; return null; }
	cx /= n; cy /= n;
	var sxx = 0, syy = 0, sxy = 0;
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (isW(x, y)) { var dx = x - cx, dy = y - cy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy; }
	var th = .5 * Math.atan2(2 * sxy, sxx - syy), ax = Math.cos(th), ay = Math.sin(th);   // ★いちばん長い向き
	if (ay < 0) { ax = -ax; ay = -ay; }   // ★★上（ヘッド側）を t = 0 にそろえる
	var mx = 0, my = 0, mn = 0;
	if (metalSet) for (y = 0; y < h; y++) for (x = 0; x < w; x++) { var ch = P.px[y * w + x]; if (ch !== " " && metalSet[ABC.indexOf(ch)]) { mx += x; my += y; mn++; } }
	if (mn && (mx / mn - cx) * ax + (my / mn - cy) * ay > 0) { ax = -ax; ay = -ay; }   // ★ヘッド側を t = 0 に
	var p0 = 1e9, p1 = -1e9, q1 = 0;
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) if (isW(x, y)) {
		var pa = (x - cx) * ax + (y - cy) * ay, pb = -(x - cx) * ay + (y - cy) * ax;
		if (pa < p0) p0 = pa; if (pa > p1) p1 = pa; if (Math.abs(pb) > q1) q1 = Math.abs(pb);
	}
	var span = Math.max(1, p1 - p0), half = Math.max(1, q1);
	var edge = new Uint8Array(w * h), grow = [];
	for (y = 0; y < h; y++) for (x = 0; x < w; x++) {
		if (isW(x, y)) { edge[y * w + x] = (isW(x - 1, y) ? 0 : 1) | (isW(x + 1, y) ? 0 : 2); continue; }
		if (P.px[y * w + x] !== " ") continue;                                   // ★空いている所だけ（★グローブ・頭には食い込まない）
		if (isW(x - 1, y) || isW(x + 1, y)) grow.push([x, y]);                   // ★横どなりが柄 ＝ 太らせる候補
	}
	P.hGeom = { cx: cx, cy: cy, ax: ax, ay: ay, span: span, half: half, edge: edge, grow: grow, w: w, h: h,
		tOf: function (x2, y2) { return ((x2 - cx) * ax + (y2 - cy) * ay - p0) / span; },
		rOf: function (x2, y2) { return (-(x2 - cx) * ay + (y2 - cy) * ax) / half; },
		HEAD_ATTACH: [cx + ax * p0, cy + ay * p0], HANDLE_END: [cx + ax * p1, cy + ay * p1], HAND_GRIP: null };
	return P.hGeom;
}
// ★★太らせた分も入った「描くための絵」を1枚だけ作る（★全部の段で使い回す ＝ 重くならない）
var GROW_CH = null;
function handlePart(P, S) {
	if (P.hPart) return P.hPart;
	var G = handleGeom(P, null);
	if (!G || !G.grow.length) { P.hPart = P; return P; }
	if (GROW_CH === null) GROW_CH = ABC[S.pickPal.length];
	var px = P.px.split(""), wood = P.wood ? P.wood.split("") : null;
	G.grow.forEach(function (q) { px[q[1] * P.w + q[0]] = GROW_CH; if (wood) wood[q[1] * P.w + q[0]] = "2"; });
	var out = { w: P.w, h: P.h, ox: P.ox, oy: P.oy, px: px.join(""), wood: wood ? wood.join("") : null, base: P };
	P.hPart = out; return out;
}
// ★柄1ドットの色（★null を返すと、そのドットは描かない ＝ 細い柄）
function handleColor(col, tier, sx, sy, P, inGrow) {
	var L = HANDLE_LOOK[tier] || HANDLE_LOOK[0], G = handleGeom(P.base || P, null); if (!G) return col;
	var t = Math.max(0, Math.min(1, G.tOf(sx, sy))), r = G.rOf(sx, sy), e = G.edge[sy * G.w + sx] || 0;
	var along = Math.round(t * G.span), across = Math.round(Math.abs(r) * G.half), i;
	// ── かたち: 太る／細る ──
	var fat = 0;
	if (L.collar && t <= L.collar.to) fat = 1;
	if (L.wide) for (i = 0; i < L.wide.length; i++) if (t >= L.wide[i][0] && t <= L.wide[i][1]) fat = 1;
	if (!fat && L.thin) for (i = 0; i < L.thin.length; i++) if (t >= L.thin[i][0] && t <= L.thin[i][1]) fat = -1;
	if (inGrow) { if (fat <= 0) return null; }
	else if (fat < 0 && (e & 3)) return null;
	// ── 地の色（★2色構成は途中から変わる） ──
	var pal = L.two && t >= L.two.at ? L.two.col : L.col, lum0 = lum(col);
	var c = inGrow ? pal[1] : lum0 > .62 ? pal[2] : lum0 > .38 ? pal[1] : pal[0];
	// ── 表面の模様（★柄にそった座標なので、振っても滑らない） ──
	if (L.pat === "grain" && !(e & 3) && along % 3 === 0) c = L.patCol;
	else if (L.pat === "weave" && (along + across) % 3 === 0) c = L.patCol;
	else if (L.pat === "mesh" && (along % 2) === (across % 2)) c = L.patCol;
	else if (L.pat === "wrap" && (along * 2 + across) % 5 < 2) c = L.patCol;
	else if (L.pat === "rib" && along % 2 === 0 && !(e & 3)) c = L.patCol;
	if (L.grip && t >= L.grip.from) c = along % 2 ? L.grip.rib : L.grip.col;                       // ★滑り止め
	if (L.plate && t >= L.plate.from && t <= L.plate.to) {                                          // ★鋼板＋リベット
		c = (e & 3) || inGrow ? L.plate.hi : L.plate.col;
		if (t % L.plate.every < .045 && across === 0) c = L.plate.bolt;
	}
	if (L.bands) for (i = 0; i < L.bands.length; i++) { var b = L.bands[i];                         // ★中間のリング
		if (Math.abs(t - b.at) <= b.w) { c = b.col; if (b.bolt && across === 0 && Math.abs(t - b.at) < b.w * .6) c = b.bolt; } }
	if (L.collar && t <= L.collar.to) {                                                             // ★ヘッド直下の補強カラー
		c = (e & 3) || inGrow ? L.collar.hi : L.collar.col;
		if (L.collar.bolt && across === 0 && t > L.collar.to * .3 && t < L.collar.to * .8) c = L.collar.bolt;
	}
	if (L.hole) for (i = 0; i < L.hole.length; i++) if (Math.abs(t - L.hole[i]) < .04 && across === 0) c = "#12141c";   // ★肉抜き
	if (L.accent && (e & 2) && along % 5 === 0) c = L.accent;                                       // ★片側1ドットの差し色
	return c;
}
function steelColor(hex, tier) { return tierColor(hex, tier || 0, HEADS); }
function woodColor(hex, tier) { return tierColor(hex, tier || 0, HANDLES); }

// 絵を回して描く（★元のドットの升目で拾う ＝ ぼかさない・中間色を作らない）
// ★いまの柄の向きに一番近いポーズの絵を使う（★回す角度を小さくして、ドットが崩れないように）
function nearestPose(a) { var best = "rest", bd = 1e9; ["rest", "back", "strike"].forEach(function (k) { var d = Math.abs(a - sprAngle(k)); if (d < bd) { bd = d; best = k; } }); return best; }
// ★回すための「なめらかに拡大した絵」（Scale2x を3回 ＝ 8倍。★色は元の絵の色だけ。★細い指や縁が回しても切れない）
function smooth8(part) {
	if (part.s8) return part.s8;
	var w = part.w, h = part.h, px = part.px;
	for (var n = 0; n < 3; n++) {
		var W2 = w * 2, H2 = h * 2, out = new Array(W2 * H2);
		for (var y = 0; y < h; y++) for (var x = 0; x < w; x++) {
			var P = px[y * w + x], A = y > 0 ? px[(y - 1) * w + x] : " ", B = x < w - 1 ? px[y * w + x + 1] : " ", C = x > 0 ? px[y * w + x - 1] : " ", D = y < h - 1 ? px[(y + 1) * w + x] : " ";
			out[(y * 2) * W2 + x * 2] = C === A && C !== D && A !== B ? A : P;
			out[(y * 2) * W2 + x * 2 + 1] = A === B && A !== C && B !== D ? B : P;
			out[(y * 2 + 1) * W2 + x * 2] = D === C && D !== B && C !== A ? C : P;
			out[(y * 2 + 1) * W2 + x * 2 + 1] = B === D && B !== A && D !== C ? D : P;
		}
		px = out; w = W2; h = H2;
	}
	part.s8 = px; return px;
}
function drawSprite(box, part, pal, x, y, rot, scale, colorOf, smooth, edgeOf) {
	var s8 = smooth && rot ? smooth8(part) : null;
	var c = Math.cos(rot), sn = Math.sin(rot), cs = [[-part.ox, -part.oy], [part.w - part.ox, -part.oy], [-part.ox, part.h - part.oy], [part.w - part.ox, part.h - part.oy]];
	var u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
	cs.forEach(function (q) { var u = q[0] * c - q[1] * sn, v = q[0] * sn + q[1] * c; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); });
	for (var v = Math.floor(v0); v < Math.ceil(v1); v++) for (var u = Math.floor(u0); u < Math.ceil(u1); u++) {
		var cu = u + .5, cv = v + .5, fx = cu * c + cv * sn + part.ox, fy = -cu * sn + cv * c + part.oy, sx = Math.floor(fx), sy = Math.floor(fy);
		if (sx < 0 || sy < 0 || sx >= part.w || sy >= part.h) continue;
		var ch = s8 ? s8[Math.floor(fy * 8) * part.w * 8 + Math.floor(fx * 8)] : part.px[sy * part.w + sx]; if (ch === " " || ch === undefined) continue;
		var i = ABC.indexOf(ch), col = colorOf ? colorOf(i, pal[i], u, v, sx, sy) : pal[i]; if (!col) continue;
		box(Math.round(x) + u * scale, Math.round(y) + v * scale, scale, scale, col);
		// ★上位の HEAD だけ、ふちが1ドット光る（★色だけでなく、かたちの格も変える）
		if (edgeOf) { var ec = edgeOf(i); if (ec && (sy === 0 || part.px[(sy - 1) * part.w + sx] === " ")) box(Math.round(x) + u * scale, Math.round(y) + (v - 1) * scale, scale, scale, ec); }
	}
}
// ============================================================
// ■ ★★★強化したあとの「予告」（2026-09-21(4) 島さんの指定）
// ============================================================
//   ★HEAD を強くした直後 → **次の一撃が強そう**（★刃に光が走り、先がキラッ、鉱石の中心が一瞬反応）
//   ★HANDLE を強くした直後 → **次から明らかに速そう**（★新しい速さで短く素振り ＋ 柄に光）
//   ★★**1アップグレードにつき1回だけ**。★採掘画面へ戻ってから、最初に叩く前に出る
//   ★★★**新しい絵は作りません**。★既存の3ポーズ（待機・引く・命中）と、平行移動・既存の回し方・ドットの光だけ
//   ★★★★**ダメージは与えません**（★鉱石には当てない・ヒビも入れない）
var SHOW = {
	head: { wait: 90, scan: 170, glint: 70, mark: 90 },   // ★合計 420ms（待つ → 刃を光が走る → 先がキラッ → 鉱石の中心）
	handleWait: 60,          // ★素振りの前に待つ
	handleSwing: .42,        // ★素振りの長さ ＝ いまの HANDLE の1振り × これ（★速い柄ほど、素振りも速い）
	handleBack: .55,         // ★そのうち「引く」に使う割合（★のこりで待機へ戻る）
	handleScan: .45,         // ★柄の光は、素振りの後ろ側これだけに重ねる
	bothMax: 500,            // ★★HEAD と HANDLE を両方そろえた時は、合わせてこの長さに収める
	skipTo: .35,             // ★長押しされたら、のこりをこれだけに縮める
	band: .16,               // ★走る光の帯の太さ（0〜1）
	core: "#ffffff", mid: "#fff3b0"   // ★白い芯 ＋ 薄い黄色（★魔法の武器にはしない）
};
// ★★HEAD（金属）の「根元 → 刃先」の向きを1回だけ測る
function headGeom(P, metal, tip) {
	if (P.hdGeom !== undefined) return P.hdGeom;
	var t = tip || P.tip || P.head; if (!t) { P.hdGeom = null; return null; }
	var L = Math.hypot(t[0], t[1]) || 1, ax = t[0] / L, ay = t[1] / L, p0 = 1e9, p1 = -1e9, x, y, n = 0;
	for (y = 0; y < P.h; y++) for (x = 0; x < P.w; x++) {
		var ch = P.px[y * P.w + x]; if (ch === " ") continue;
		if (!metal[ABC.indexOf(ch)]) continue;
		var pr = (x - P.ox) * ax + (y - P.oy) * ay; if (pr < p0) p0 = pr; if (pr > p1) p1 = pr; n++;
	}
	P.hdGeom = n ? { ax: ax, ay: ay, p0: p0, span: Math.max(1, p1 - p0) } : null;
	return P.hdGeom;
}
// ★予告をひとつ始める（★craft したときに立てておいて、採掘画面へ戻ったら流す）
function startShow(s) {
	var p = s.pendingShow; if (!p || (!p.head && !p.handle)) return;
	s.pendingShow = null;
	var cyc = cycle(s), sw = p.handle ? Math.round(cyc * SHOW.handleSwing) : 0;
	var d = { wait: p.handle ? SHOW.handleWait : SHOW.head.wait, swing: sw,
		scan: p.head ? SHOW.head.scan : 0, glint: p.head ? SHOW.head.glint : 0, mark: p.head ? SHOW.head.mark : 0 };
	var total = d.wait + d.swing + d.scan + d.glint + d.mark;
	// ★★両方そろえた時は、まとめて 500ms に収める（★2つを長くつなげない）
	if (p.head && p.handle && total > SHOW.bothMax) {
		var f = SHOW.bothMax / total;
		["wait", "swing", "scan", "glint", "mark"].forEach(function (k) { d[k] = Math.round(d[k] * f); });
		total = d.wait + d.swing + d.scan + d.glint + d.mark;
	}
	s.show = { head: !!p.head, handle: !!p.handle, t: 0, total: total, d: d, said: false };
}
// ★時間を進める（★終わったら消す。★遊びには何も触らない）
function updateShow(s, ms) {
	var sh = s.show; if (!sh) return;
	sh.t += ms;
	if (!sh.said && sh.t >= sh.d.wait) { sh.said = true; event(s, sh.handle ? "handle_ready" : "head_ready", { head: sh.head, handle: sh.handle }); }
	if (sh.t >= sh.total) s.show = null;
}
// ★★長押しされたら、のこりを縮める（★0.5秒以上も操作を止めない）
function hurryShow(s) {
	var sh = s.show; if (!sh) return false;
	sh.total = sh.t + (sh.total - sh.t) * SHOW.skipTo;
	return true;
}
// ★いま「素振り」の最中か（★0〜1。★素振りが無ければ null）
function showSwing(s) {
	var sh = s.show; if (!sh || !sh.swing && !sh.d.swing) return null;
	var a = sh.d.wait, b = a + sh.d.swing;
	if (sh.t < a || sh.t >= b || sh.d.swing <= 0) return null;
	return (sh.t - a) / sh.d.swing;
}
// ★★素振りの姿（★待機 → 引く → 待機。★命中まで行かない ＝ 鉱石には当たらない）
function showPose(s) {
	var u = showSwing(s); if (u === null) return null;
	var back = SHOW.handleBack, k;
	if (u < back) { k = 1 - Math.pow(1 - u / back, 2); return lerpPose(POSE.rest, POSE.back, k, k < .5 ? "rest" : "back"); }
	k = (u - back) / (1 - back); k = k * k * (3 - 2 * k);
	return lerpPose(POSE.back, POSE.rest, k, k < .5 ? "back" : "rest");
}
// ★★走る光の位置（0 = 根元 / 1 = 先）。★出ていないときは null
function showScan(s, which) {
	var sh = s.show; if (!sh) return null;
	var d = sh.d;
	if (which === "handle") {
		if (!sh.handle || d.swing <= 0) return null;
		var from = d.wait + d.swing * (1 - SHOW.handleScan), len = d.swing * SHOW.handleScan;
		if (sh.t < from || sh.t >= from + len) return null;
		return (sh.t - from) / len;
	}
	if (!sh.head || d.scan <= 0) return null;
	var a = d.wait + d.swing;
	if (sh.t < a || sh.t >= a + d.scan) return null;
	return (sh.t - a) / d.scan;
}
// ★刃先のキラッ（0〜1）／★鉱石の中心のしるし（0〜1）
function showGlint(s) { var sh = s.show; if (!sh || !sh.head || !sh.d.glint) return null;
	var a = sh.d.wait + sh.d.swing + sh.d.scan; return sh.t >= a && sh.t < a + sh.d.glint ? (sh.t - a) / sh.d.glint : null; }
function showMark(s) { var sh = s.show; if (!sh || !sh.head || !sh.d.mark) return null;
	var a = sh.d.wait + sh.d.swing + sh.d.scan + sh.d.glint; return sh.t >= a && sh.t < a + sh.d.mark ? (sh.t - a) / sh.d.mark : null; }
function drawPick(ctx, s, box, quiet) {
	var S = sprites(); if (!S) return;
	if (POSE.strike.a === undefined) setupPoses();
	var pose = (!s.swinging && showPose(s)) || swingPose(s), level = s.head, metal = {};
	S.metal.forEach(function (i) { metal[i] = 1; });
	function stamp(pa, ghost) {
		var spr = nearestPose(pa.a), P = S.poses[spr], rot = pa.a - sprAngle(spr);
		if (Math.abs(rot) < .05) rot = 0;   // ★ほぼ元の向きなら回さない（★島さんの絵そのまま）
		if (ghost) { drawSprite(box, P.hand, S.pickPal, pa.x, pa.y, rot, PICK_SCALE, function (i, col, u, v) { return metal[i] && (u + v) % 2 ? "#5a5d70" : null; }); return; }
		drawSprite(box, P.arm, S.pickPal, pa.x, pa.y, 0, PICK_SCALE);   // 腕（★回らない）
		var hTier = s.handle, HP = handlePart(P.hand, S), pal2 = S.pickPal.concat(["#000000"]), gi = S.pickPal.length;
		// ★★強化したあとの「予告」: 帯が 根元 → 先 へ走る（★輪郭の外へは出ない ＝ 絵のドットの中だけ）
		var hScan = showScan(s, "head"), wScan = showScan(s, "handle");
		var hG = hScan !== null ? headGeom(P.hand, metal, P.tip || P.head) : null, wG = wScan !== null ? handleGeom(HP.base || HP, null) : null;
		function bandCol(tp, at, tint) {
			var d = Math.abs(tp - at); if (d > SHOW.band) return null;
			return d < SHOW.band * .45 ? SHOW.core : d < SHOW.band * .78 ? SHOW.mid : tint;
		}
		drawSprite(box, HP, pal2, pa.x, pa.y, rot, PICK_SCALE, function (i, col, u, v, sx, sy) {
			if (metal[i]) { var mc = steelColor(col, level);                                // ★頭 ＝ HEAD の段の色
				if (hG) { var tp = (((sx - P.hand.ox) * hG.ax + (sy - P.hand.oy) * hG.ay) - hG.p0) / hG.span;
					var bc = bandCol(tp, hScan, HEADS[level].col[2]); if (bc) return bc; }   // ★★頭だけ光る（★柄・手・腕は変えない）
				return mc; }
			var wch = HP.wood ? HP.wood[sy * HP.w + sx] : "0";
			// ★★柄だけ ＝ HANDLE の段の見た目（★手・グローブ・指・腕・頭は1ドットも変わらない）
			if (wch === "1") { var hc = handleColor(col, hTier, sx, sy, HP, false);
				// ★★柄だけ光る（★下 → 上。★頭・手・腕は変えない）
				if (wG && hc) { var wt = 1 - Math.max(0, Math.min(1, wG.tOf(sx, sy)));
					var wb = bandCol(wt, wScan, HANDLE_LOOK[hTier] ? HANDLE_LOOK[hTier].col[2] : SHOW.mid); if (wb) return wb; }
				return hc; }
			if (i === gi) return handleColor(P.hand.px[sy * HP.w + sx] !== " " ? col : "#808080", hTier, sx, sy, HP, true);   // ★太らせた分
			return col;
		}, true, (HEADS[level].edge || 0) >= 1 ? function (i) { return metal[i] ? HEADS[level].col[2] : null; } : null);
	}
	// ★残像は描かない（2026-09-19(2) 島さんの指摘「別のポーズが残像のように残る」）
	stamp(pose, false);
	// ★★刃先のキラッ（★予告のときだけ。★絵そのものは触らない）
	var gl = showGlint(s);
	if (gl !== null) {
		var tp2 = tipOf(pose), n = Math.round(1 + Math.sin(Math.PI * gl) * 2.4);
		box(tp2.x, tp2.y, 1, 1, SHOW.core);
		for (var g = 1; g <= n; g++) { var c2 = g === n ? HEADS[level].col[2] : SHOW.mid;
			box(tp2.x, tp2.y - g, 1, 1, c2); box(tp2.x, tp2.y + g, 1, 1, c2);
			box(tp2.x - g, tp2.y, 1, 1, c2); box(tp2.x + g, tp2.y, 1, 1, c2); }
	}
	// ★★鉱石の中心が一瞬だけ反応する（★次の一撃はここへ入る、というだけ。★ヒビもダメージも無し）
	var mk = showMark(s);
	if (mk !== null) {
		var r2 = 2 + Math.round(Math.sin(Math.PI * mk) * 2), c3 = mk < .5 ? SHOW.core : SHOW.mid;
		box(HIT.x, HIT.y, 1, 1, SHOW.core);
		box(HIT.x - r2, HIT.y, 1, 1, c3); box(HIT.x + r2, HIT.y, 1, 1, c3);
		box(HIT.x, HIT.y - r2, 1, 1, c3); box(HIT.x, HIT.y + r2, 1, 1, c3);
	}
}
// ★鉱石の中心（★島さんの鉱石の絵の形の重心）→ ORE_CENTER（＝ HIT）。★ツルハシの向きもここから決まる
(function () {
	var A = art();
	if (A) { var O = A.ore, sx = 0, sy = 0, n = 0;
		for (var y = 0; y < O.h; y++) for (var x = 0; x < O.w; x++) if (O.mask[y * O.w + x] !== "0") { sx += x; sy += y; n++; }
		ORE_CENTER.x = Math.round(O.x + sx / n); ORE_CENTER.y = Math.round(O.y + sy / n); }
	setupPoses();
})();
// ---- クラフト ----
// ---- ツルハシの部品の絵（★島さんの絵から切り出した「頭だけ」「柄だけ」） ----
//   flat = その色で塗りつぶす（★??? のかげ）／mirror = 左右を返す（★「なんか違う形」に見せる）
function drawPart(box, name, x, y, scale, level, flat, mirror) {
	var S = sprites(), P0 = S && S.parts && S.parts[name]; if (!P0) return false;
	// ★★柄のアイコンも、採掘中とまったく同じ定義から作る（★別の簡易アイコンは描かない）
	var P = !flat && name === "handle" ? handlePart(P0, S) : P0, gi = S.pickPal.length;
	var metal = {}; S.metal.forEach(function (i) { metal[i] = 1; });
	for (var v = 0; v < P.h; v++) for (var u = 0; u < P.w; u++) {
		var su = mirror ? P.w - 1 - u : u, ch = P.px[v * P.w + su]; if (ch === " ") continue;
		var i = ABC.indexOf(ch), col = flat || (i === gi ? "#808080" : S.pickPal[i]);
		if (!flat && name === "head" && metal[i]) col = steelColor(col, level || 0);     // ★HEAD の段に合わせて色が変わる
		if (!flat && name === "handle") col = handleColor(col, level || 0, su, v, P, i === gi);
		if (!col) continue;
		box(x + u * scale, y + v * scale, scale, scale, col);
	}
	return true;
}
function partSize(name, scale) { var S = sprites(), P = S && S.parts && S.parts[name]; return P ? { w: P.w * scale, h: P.h * scale } : { w: 0, h: 0 }; }
// ---- 星（★BREAK / SPEED の強さ） ----
var STAR = [[2, 0], [1, 1], [2, 1], [3, 1], [0, 2], [1, 2], [2, 2], [3, 2], [4, 2], [1, 3], [3, 3], [0, 4], [4, 4]];
function drawStars(box, x, y, n) {
	for (var i = 0; i < 5; i++) { var c = i < n ? "#ffcc4a" : "#3e4359";
		STAR.forEach(function (q) { box(x + i * 7 + q[0], y + q[1], 1, 1, c); }); }
}
// ---- 「所持数 / 必要数」（★足りていれば明るく） ----
function drawNeed(ctx, s, box, k, need, x, y) {
	// ★所持数は 999 まで（★「所持 / 必要」1つ分が CARD.needMax ドットに収まるよう、間を詰めてある）
	var N = global.DotFont && global.DotFont.NUM, real = s.mats[k] || 0, have = Math.min(999, real), ok = real >= need;
	// ★★まだ見つけていない素材は、正体を出さない（2026-09-20(9) 島さんの指定）＝ 暗いかげと「?」だけ
	if (s.seenMat[k]) drawIcon(box, k, x + 4, y + 4, 2, true);
	else drawUnknown(box, x + 4, y + 4, true);   // ★通常のアイコンと同じ中心
	// ★★足りない「所持数」だけ赤（★必要数はふつうの色。★足りているものは赤くしない）
	var col = ok ? "#fff1e8" : PAL.lack, tx = x + 8;
	if (N) { N.drawText(ctx, String(have), tx, y + 1, col); tx += N.textWidth(String(have).length) + 1; }
	box(tx, y + 6, 1, 1, col); box(tx + 1, y + 4, 1, 2, col); box(tx + 2, y + 2, 1, 2, col); tx += 4;   // ★「/」（★数字の面には無い）
	if (N) N.drawText(ctx, String(need), tx, y + 1, ok ? "#fff1e8" : "#9a9dab");
}
// ★★ドット絵のボタン（2026-09-20(10) 島さんの指定）
//   ★上と左に明るい1ドット／右と下に濃い1〜2ドット／いちばん下に影
//   ★押した瞬間だけ 1ドット沈み、下の影が消え、上のハイライトが弱くなる（★丸い今どきのボタンにはしない）
function drawBtn(box, r, pressed, face) {
	var dy = pressed ? 1 : 0, x = r.x, y = r.y + dy, w = r.w, h = r.h;
	if (!pressed) box(x + 1, y + h, w - 1, 2, "#0a0c14");                        // ★下の影（★沈むと消える）
	box(x, y, w, h, pressed ? "#1a2032" : "#232a42");                            // ★本体
	box(x, y, w - 1, 1, pressed ? "#454d6b" : "#7d86ab");                        // ★上のハイライト
	box(x, y, 1, h - 1, pressed ? "#3d4463" : "#6b7396");                        // ★左のハイライト
	box(x + w - 1, y, 1, h, "#12151f"); box(x + w - 2, y + 1, 1, h - 1, "#191f30");           // ★右の濃い面
	box(x + 1, y + h - 1, w - 1, 1, "#12151f"); box(x + 2, y + h - 2, w - 3, 1, "#191f30");   // ★下の濃い面
	if (face) face(x, y, w, h);
}
// ★左上の「戻る」（★見た目 17×17・押せる範囲 26×26）
function drawBack(box, pressed) {
	drawBtn(box, CRAFT.backBox, pressed, function (x, y, w) {
		var cx = x + Math.floor(w / 2) + 1, cy = y + Math.floor(w / 2);
		for (var i = 0; i <= 4; i++) { box(cx - 3 + i, cy - i, 2, 1, "#e6e9f5"); box(cx - 3 + i, cy + i, 2, 1, "#e6e9f5"); }   // ★左を向いた「<」
	});
}
function drawCraft(ctx, s, box) {
	var F = global.DotFont; if (!F) return;
	function text(t, x, y, c) { F.drawText(ctx, t, Math.round(x), Math.round(y), c); }
	function mid(t, cx, y, c) { text(t, cx - F.textWidth(t.length) / 2, y, c); }
	box(0, 0, W, H, PAL.void);
	// 左上: ひとつ前へ戻る（★「<」。★2026-09-20(10) 大きく・立体に）
	drawBack(box, !!(s.tapAt && inBox(CRAFT.back, s.tapAt.x, s.tapAt.y)));
	if (!s.craftKind) {
		// ① どちらを強くするか（★大きな絵2つだけ。★中央から左右へ開く）
		var e = 1 - Math.pow(1 - s.menuT / CRAFT.openMs, 2), slide = (1 - e) * 46;
		mid("PICKAXE UPGRADE", W / 2, 24, "#fff1e8"); box(28, 34, 184, 1, "#4c536b");
		CRAFT.pick.forEach(function (p, i) {
			var x = Math.round(p.x + (i ? -slide : slide)), sel = p.kind === "head", sz = partSize(p.kind, 2);
			box(x, CRAFT.pickY, CRAFT.pickW, CRAFT.pickH, "#0d101a"); box(x + 1, CRAFT.pickY + 1, CRAFT.pickW - 2, CRAFT.pickH - 2, "#232a42");
			box(x + 1, CRAFT.pickY + 1, CRAFT.pickW - 2, 1, "#4c536b");
			// ★この画面は「どちらを強くするか」だけ（★装備名・材料・NEXT はここでは出さない）
			drawPart(box, p.kind, x + (CRAFT.pickW - sz.w) / 2, CRAFT.pickY + 34 - sz.h / 2, 2, p.kind === "head" ? s.head : s.handle);
			mid(p.kind === "head" ? "HEAD" : "HANDLE", x + CRAFT.pickW / 2, CRAFT.pickY + 62, "#fff1e8");
			mid(p.kind === "head" ? "BREAK" : "SPEED", x + CRAFT.pickW / 2, CRAFT.pickY + 76, "#ffcc4a");
			// ★部位ごとの NEW（★大きな絵の右上。★出た瞬間だけ少し上から降りてくる）
			var pop = p.kind === "head" ? s.newPopHead : s.newPopHandle, up = pop > 0 ? Math.round(Math.sin(Math.PI * (1 - pop / NEW_POP_MS)) * 3) : 0;
			if (p.kind === "head" ? s.canUpHead : s.canUpHandle) F.drawTextShadow(ctx, NEW_TEXT, x + CRAFT.pickW - 26, CRAFT.pickY + 5 - up, "#ffcc4a", PAL.void);
			// ★★★作れる側だけキラッ（★HEAD と HANDLE が同時に光ることはありません。★必ず時間差）
			usparkAt(box, s, "part:" + p.kind, { x: x, y: CRAFT.pickY, w: CRAFT.pickW, h: CRAFT.pickH }, p.kind);
		});
		// ★下に一列で「いま持っている素材ぜんぶ」（★この画面でも数が分かる）
		var N2 = F.NUM || F;
		// ★★ここも「見つけた素材だけ」＋ まだ先があるなら「?」を1つ（2026-09-20(9)）
		var HH = hudRows(s);
		HH.rows.forEach(function (r, i) { var cx2 = 3 + i * 29;
			drawIcon(box, r.k, cx2 + 5, 150, 2, true);   // ★小さく（★一覧なので）
			N2.drawTextShadow(ctx, String(Math.min(999, s.mats[r.k] || 0)), cx2 + 10, 147, "#fff1e8", PAL.void);
		});
		if (HH.unknown >= 0) drawUnknown(box, 3 + HH.rows.length * 29 + 5, 150, true);   // ★通常のアイコンと同じ中心
		return;
	}
	// ② 装備の列（★左右になぞると HEAD ←→ HANDLE）
	//   ★★ページごとに切り抜く（★2枚が重なって見えない／どちらも表示できる場所の外へ出ない）
	var V = UPGRADE_VIEWPORT, dx = Math.round(s.side || 0), other = s.craftKind === "head" ? "handle" : "head";
	function page(kind, px) {
		var x0 = Math.max(V.x, V.x + px), x1 = Math.min(V.x + V.w, V.x + px + W);
		if (x1 - x0 <= 0) return;                                   // ★完全に外 ＝ 描かない
		var on = clipTo(ctx, x0, V.y, x1 - x0, V.h);
		drawList(ctx, s, kind, px, box, text);
		if (on) ctx.restore();
	}
	page(s.craftKind, dx);
	if (dx) page(other, dx + (dx > 0 ? -W : W));
	var kind = s.craftKind, cur = tierNow(s, kind), curT = tiers(kind)[cur];
	// 【帯】★いつでも「いま何を使っているか」が分かる（★列をどれだけ動かしても、ここは動かない）
	box(0, 0, W, LIST.top - 2, PAL.void);
	text(kind === "head" ? "HEAD" : "HANDLE", 20, 21, "#9a9dab");
	text(curT.name, 66, 21, "#fff1e8");
	var cw = 66 + F.textWidth(curT.name.length) + 4;
	[[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]].forEach(function (q) { box(cw + q[0], 21 + q[1], 1, 2, "#7fe07f"); });   // ★チェック
	box(6, LIST.top - 2, 228, 1, "#4c536b");
	drawBack(box, !!(s.tapAt && inBox(CRAFT.back, s.tapAt.x, s.tapAt.y)));   // ★戻る（★帯の上に出す）
}

// ============================================================
// ■ 装備カードの形（★2026-09-20(8) 島さんの指定: 寸法は固定。★カード全体を拡大しない）
// ============================================================
//   cardRect    = カードそのもの（★どの段も同じ大きさ）
//   contentRect = その内側に安全余白（上下左右 4〜5ドット）をとった場所
//   ★名前・状態（OWNED / SKIPPED / EQUIPPED / MAKE）・星・素材数・絵は、必ず contentRect の中
//   ★★星は「名前の高さから押し出す」のをやめ、カード内の固定の行に置く（★長い名前でも動かない）
var CARD = {
	w: 220, h: 34,                    // ★固定（★いま使っているものも同じ大きさ）
	padX: 5, padTop: 4, padBot: 4,
	nameY: 0, midY: 9, starY: 19,     // ★contentRect の中の3つの行（上段 名前／中段 状態／下段 ★★★★★）
	iconW: 52,                        // ★絵の場所（contentRect の左はし）
	textX: 56,                        // ★名前・状態・星の左はし（contentRect から）
	needX: 114, needCol: 48, needY: 8, needRow: 9,    // ★必要素材（★右がわ 2列 × 2行。★名前の行とは重ならない）
	needMax: 47                                       // ★「所持 / 必要」1つ分の最大の幅（★これを超えないように所持数は 99 まで）
};
function cardRect(s, i, dx) { return { x: Math.round(120 - CARD.w / 2) + dx, y: Math.round(rowTop(s, i)), w: CARD.w, h: CARD.h }; }
function contentRect(c) { return { x: c.x + CARD.padX, y: c.y + CARD.padTop, w: c.w - CARD.padX * 2, h: c.h - CARD.padTop - CARD.padBot }; }
// ★絵は「内側に収まる一番大きい倍率」まで（★はみ出すくらいなら大きくしない）
function fitScale(kind, want, maxW, maxH) {
	for (var k = want; k > 1; k--) { var z = partSize(kind, k); if (z.w <= maxW && z.h <= maxH) return k; }
	return 1;
}
// ★★装備の列を1枚描く（★dx ＝ 左右にずらす量。★HEAD ←→ HANDLE の切り替えで使う）
//   ★上 = 過去／まん中 = いま使っているもの／下 = これから ／ いちばん下に ???
function drawList(ctx, s, kind, dx, box, text) {
	var F = global.DotFont; if (!F) return;
	var cur = tierNow(s, kind), rows = historyRows(s, kind), V = UPGRADE_VIEWPORT;
	// ★続きがあるしるし（★上と下の小さな三角）
	if (s.scroll > .1) [[0, 0], [-1, 1], [1, 1], [-2, 2], [2, 2]].forEach(function (q) { box(dx + 232 + q[0], LIST.top + 2 + q[1], 1, 1, "#9a9dab"); });
	if (s.scroll < maxScroll(s) - .1) [[0, 2], [-1, 1], [1, 1], [-2, 0], [2, 0]].forEach(function (q) { box(dx + 232 + q[0], 153 + q[1], 1, 1, "#9a9dab"); });
	rows.forEach(function (r, i) {
		var c = cardRect(s, i, dx);
		if (c.y + c.h < V.y || c.y > V.y + V.h) return;                     // ★上下で外 ＝ 描かない
		if (c.x + c.w < V.x || c.x > V.x + V.w) return;                     // ★左右で外 ＝ 描かない
		var isCur = r.kind === "current", mystery = r.kind === "mystery", t = tiers(kind)[r.i];
		var ok = r.kind === "next" && canMake(s, kind, r.step), sel = (r.kind === "next" && s.craftSel === r.step) || (r.kind === "past" && r.made && s.equipSel === r.i);
		var far = Math.min(1, Math.abs(i - s.scroll));
		var fx = s.upFx && isCur ? s.upFx : null, sink = fx && fx.made < MAKE_FX.sinkMs ? Math.round(MAKE_FX.sink * (1 - fx.made / MAKE_FX.sinkMs)) : 0;
		c.y += sink;
		// ★★カードごとにも切り抜く（★VIEWPORT → cardRect → 中身 の二重）。★星1個でも枠の外へ出さない
		//   ★切り抜く場所は、必ず「表示できる場所」と重なっている部分だけ（★外へはみ出さない）
		var cy0 = Math.max(c.y, V.y), cy1 = Math.min(c.y + c.h, V.y + V.h), cx0 = Math.max(c.x, V.x), cx1 = Math.min(c.x + c.w, V.x + V.w);
		var cl = clipTo(ctx, cx0, cy0, cx1 - cx0, cy1 - cy0);
		var ct = contentRect(c);
		// 地の色（★いま使っているものは、ひときわ明るい ＝ 大きさではなく明るさで目立たせる）
		box(c.x, c.y, c.w, c.h, sel ? "#3a4466" : isCur ? "#2b3552" : ok ? "#29304a" : mystery ? "#141827" : r.kind === "past" ? (far > .6 ? "#161a28" : "#191d2c") : "#1d2233");
		if (isCur) {
			var br = .6 + .4 * Math.sin(s.clock / 900 * Math.PI * 2), edge = br > .8 ? "#fff1e8" : "#ffcc4a";
			box(c.x, c.y, c.w, 1, edge); box(c.x, c.y + c.h - 1, c.w, 1, "#8a6a24");
			box(c.x, c.y, 1, c.h, edge); box(c.x + c.w - 1, c.y, 1, c.h, edge);
			box(c.x + 1, c.y + c.h / 2 - 2, 1, 4, "#ffcc4a"); box(c.x + c.w - 2, c.y + c.h / 2 - 2, 1, 4, "#ffcc4a");   // ★小さな光（★枠の内側）
		} else if (sel || ok) box(c.x, c.y, c.w, 1, sel ? "#ffcc4a" : "#4c536b");
		var px2 = Math.round((i - s.scroll) * LIST.parallax);               // ★絵だけ少しだけ遅れて動く
		if (mystery) {
			var zm = partSize(kind, 1);
			drawPart(box, kind, ct.x + (CARD.iconW - zm.w) / 2, ct.y + (ct.h - zm.h) / 2 + px2, 1, 0, "#232a42", true);
			text("?????", ct.x + CARD.textX, ct.y + CARD.nameY, "#4c536b");
			text("???", ct.x + CARD.textX, ct.y + CARD.midY, "#3e4359");
			if (cl) ctx.restore();
			return;
		}
		// 絵（★いま使っているものだけ少し大きい。★内側に収まる範囲まで）
		var isc = isCur ? fitScale(kind, 2, CARD.iconW, ct.h) : 1, sz = partSize(kind, isc);
		if (isCur) box(ct.x + CARD.iconW / 2 - 1, ct.y + ct.h / 2 - 1, 2, 2, "#3f4d72");   // ★絵の後ろのほのかな光
		drawPart(box, kind, ct.x + (CARD.iconW - sz.w) / 2, ct.y + (ct.h - sz.h) / 2 + px2, isc, r.i);
		var nx = ct.x + CARD.textX, dim = r.kind === "past" ? (r.made ? "#9a9dab" : "#717485") : far > .7 ? "#9a9dab" : "#c2c3c7";
		// ── 上段: 装備名 ──
		if (isCur) F.drawTextShadow(ctx, t.short || t.name, nx, ct.y + CARD.nameY, "#fff1e8", PAL.void);
		else text(t.short || t.name, nx, ct.y + CARD.nameY, ok ? "#fff1e8" : dim);
		// ── 中段: いまの状態 ──
		if (isCur) {
			text("EQUIPPED", nx, ct.y + CARD.midY, "#ffcc4a");
			var ex = nx + F.textWidth(8) + 3;
			[[0, 2], [1, 3], [2, 4], [3, 3], [4, 2], [5, 1], [6, 0]].forEach(function (q) { box(ex + q[0], ct.y + CARD.midY + q[1], 1, 2, "#7fe07f"); });
		} else if (r.kind === "past") {
			// ★★持っている装備を選ぶと「EQUIP」に変わる（★もう一度押すと付け替え）
			var picked = r.made && s.equipSel === r.i, tag = picked ? "EQUIP" : r.made ? "OWNED" : "SKIPPED";
			box(nx - 2, ct.y + CARD.midY - 1, F.textWidth(tag.length) + 4, 9, picked ? "#4a3f18" : r.made ? "#3e4359" : "#2b2438");
			text(tag, nx, ct.y + CARD.midY, picked ? (Math.floor(s.clock / 260) % 2 ? "#fff1e8" : "#ffcc4a") : r.made ? "#c2c3c7" : "#9a9dab");
			// ★選んでいる間だけ、その装備の強さを小さく出す（★むずかしい比べ表は出さない）
			if (picked) text(kind === "head" ? "BREAK" : "SPEED", ct.x + CARD.needX, ct.y + CARD.midY, "#9a9dab");
		} else if (ok) text("MAKE", nx, ct.y + CARD.midY, sel && Math.floor(s.clock / 260) % 2 ? "#fff1e8" : "#ffcc4a");
		// ── 下段: 星（★固定の行。★名前が長くても下へ押し出されない） ──
		drawStars(box, nx, ct.y + CARD.starY, t.stars || 1);
		// ── 右: 必要な素材（★これから作れる段だけ） ──
		if (r.kind === "next") {
			var cost = costOf(s, kind, r.step), keys = Object.keys(cost || {});
			keys.slice(0, 4).forEach(function (k, n2) {
				drawNeed(ctx, s, box, k, cost[k], ct.x + CARD.needX + (n2 % 2) * CARD.needCol, ct.y + CARD.needY + Math.floor(n2 / 2) * CARD.needRow);
			});
		}
		// ★作り上げた瞬間: 火花 → ふちを光が1周（★どちらもカードの中だけ）
		if (fx) {
			if (fx.made > MAKE_FX.sparkAt) fx.sparks.forEach(function (q, n3) { box(c.x + c.w / 2 + q.vx * .06, c.y + c.h / 2 + q.vy * .06 - (fx.made - MAKE_FX.sparkAt) * .02, 1, 1, n3 % 2 ? "#fff1e8" : "#ffcc4a"); });
			var sw = (fx.made - MAKE_FX.sweepFrom) / MAKE_FX.sweepMs;
			if (sw > 0 && sw < 1) { var per = 2 * (c.w + c.h), pp = sw * per, qx, qy;
				if (pp < c.w) { qx = c.x + pp; qy = c.y; } else if (pp < c.w + c.h) { qx = c.x + c.w - 1; qy = c.y + (pp - c.w); }
				else if (pp < 2 * c.w + c.h) { qx = c.x + c.w - (pp - c.w - c.h); qy = c.y + c.h - 1; } else { qx = c.x; qy = c.y + c.h - (pp - 2 * c.w - c.h); }
				box(qx, qy, 2, 1, "#fff1e8"); }
		}
		// ★★★★★「いま作れる」カードだけキラッ（2026-09-21(7)）。
		//   ★OWNED / SKIPPED / EQUIPPED / ??? / 素材が足りない は**光りません**。
		//   ★★飛び級で 2 枚作れるときも、★★★**順番に1枚ずつ**（★同時に光らない）
		if (ok) { usparkEdge(box, s, "card:" + r.step, c); usparkAt(box, s, "card:" + r.step, c, "card"); }
		if (cl) ctx.restore();
	});
}


global.DotMining = {
	create: create, update: update, draw: draw, press: press, release: release, swipe: swipe, dragSide: dragSide, dragSideEnd: dragSideEnd, openPart: openPart, scrollRange: scrollRange, minScroll: minScroll, craft: craft, saveData: saveData,
	// ★★★★★ 4 つの採掘ポイント（2026-09-21(8)）
	POINTS: B.POINTS, POINT_N: POINT_N, PIND: PIND, PFADE: PFADE, POINT_TINT: POINT_TINT, drawPointInd: drawPointInd, updatePointHud: updatePointHud, tintWall: tintWall, newOreAt: newOreAt, pickOreAtPoint: pickOreAtPoint, pickBreakableAtPoint: pickBreakableAtPoint,
	points: points, pointAt: pointAt, curPt: curPt, ensureSafePoints: ensureSafePoints, SAFE_POINTS: SAFE_POINTS,
	stageOf: stageOf, canBreak: canBreak, breakableCount: breakableCount, lockedCount: lockedCount, fixGroup: fixGroup, guardOre: guardOre, pickBreakableOre: pickBreakableOre, canUpgradePart: canUpgradePart, craftRows: craftRows, dragScroll: dragScroll, dragEnd: dragEnd, LIST: LIST, rowTop: rowTop, maxScroll: maxScroll, historyRows: historyRows, scrollBy: scrollBy, owned: owned, canMake: canMake, costOf: costOf, tierAt: tierAt, CRAFT: CRAFT, SKIP_MUL: SKIP_MUL, damageOf: damageOf, swingPose: swingPose, counterAt: counterAt, POSE: POSE, HIT: HIT,
	setDebug: function (v) { DEBUG.on = v ? 1 : 0; }, DEBUG: DEBUG, balance: B, etaMs: etaMs,
	oreCenter: ORE_CENTER, GUIDE: GUIDE, capPickups: capPickups, collectAll: collectAll, tierMax: tierMax, tierNow: tierNow, canEquip: canEquip, equipTier: equipTier, rescueAfterEquip: rescueAfterEquip, newOre: newOre, owned: owned, SHOW: SHOW, startShow: startShow, showPose: showPose, showScan: showScan, showGlint: showGlint, showMark: showMark, hurryShow: hurryShow, headGeom: headGeom, SPARK: SPARK, SPARK_KIND: SPARK_KIND, SPARK_TIP: SPARK_TIP, askSpark: askSpark, drawSpark: drawSpark,
	// ★★★★★「いま作れるよ」のキラキラ（2026-09-21(7)）
	USPARK: USPARK, USPARK_KIND: USPARK_KIND, USPARK_SPOT: USPARK_SPOT, USPARK_SPOT_CARD: USPARK_SPOT_CARD, usparkTargets: usparkTargets, updateUSpark: updateUSpark, usparkAt: usparkAt, usparkEdge: usparkEdge, NEW_AFTER_SPARK: NEW_AFTER_SPARK, drawUnknown: drawUnknown, MATERIAL_ICON_CENTER_X: MATERIAL_ICON_CENTER_X, CRAFT: CRAFT, BURY: BURY, buryOf: buryOf, HANDLE_LOOK: HANDLE_LOOK, handleColor: handleColor, drawPart: drawPart, partSize: partSize, handleGeom: handleGeom, handlePart: handlePart, drawBtn: drawBtn, hudRows: hudRows, reserveMat: reserveMat, spawnPickup: spawnPickup, PAL: PAL, drawUnknown: drawUnknown, MATFX_MS: MATFX_MS, UPGRADE_VIEWPORT: UPGRADE_VIEWPORT, sideOk: sideOk, CARD: CARD, cardRect: cardRect, contentRect: contentRect, drawStars: drawStars, canUpgrade: canUpgrade, dragStart: dragStart, FLOCK: FLOCK, FLY: FLY, FLIGHTS: FLIGHTS, flyAt: flyAt, tipOf: tipOf, crackPaths: crackPaths, buildOre: buildOre, ORE_X: ORE_X, ORE_Y: ORE_Y, PICK_SCALE: PICK_SCALE, COUNTER: COUNTER,
	STARTER_BREAKS: STARTER_BREAKS, STARTER_ROCKS: STARTER_ROCKS,
	FEEL: FEEL, HEADS: HEADS, HANDLES: HANDLES, ORES: ORES, MATS: MATS, MAT_IDS: MAT_IDS, CRAFT_ICON: CRAFT_ICON, SPACING: SPACING,
	TEXTS: ["HEAD", "HANDLE", "MAX", "BREAK", "SPEED", "EQUIPPED", "MAKE", "OWNED", "SKIPPED", "?????", "???", "PICKAXE UPGRADE", "0123456789", NEW_TEXT]
		.concat(HEADS.map(function (t) { return t.name; })).concat(HANDLES.map(function (t) { return t.name; }))
		.concat(HEADS.map(function (t) { return t.short || t.name; })).concat(HANDLES.map(function (t) { return t.short || t.name; }))
};
})(typeof window !== "undefined" ? window : globalThis);
