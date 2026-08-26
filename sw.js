// オフライン用サービスワーカー: 一度開けば、通信が無くても遊べるようにする
//
// ■ ファイルを増やしたときは下の FILES に追記し、CACHE の番号(v1→v2)を上げる
//   (番号を上げないとスマホが古い版を持ち続けることがある)
//
// ■ ★★音のファイルはここで扱わない(2026-08-06。iPhone のカクつき対策)
//   音は `<audio>` が**細切れ(Range リクエスト)で少しずつ取りに行く**。
//   ところが:
//     ・ここは「まず通信、駄目なら保存分」なので、**遊んでいる最中に通信が走り続ける**
//     ・細切れの返事(206)は `cache.put()` が**必ず失敗する**決まりになっている
//       → 9.7MB ぶんのコピーを作っては捨てる、を延々くり返していた
//   → **音は素通しにして、Safari に任せる。**
//     音がオフラインで鳴らなくても `AUDIO_GUIDE` 決まり1
//     「音が出せない環境でも遊べる」を満たしているので、遊びには影響しない
var CACHE = "dot-ollie-v58";

// このパスを含むものは、サービスワーカーが一切触らない
function isPassThrough(url) {
	return url.indexOf("/audio/") >= 0;
}

var FILES = [
	"./",
	"./index.html",
	"./manifest.json",
	"./css/style.css",
	"./js/font.js",
	"./js/palette.js",
	"./js/ollie-art.js",
	"./js/kickflip-art.js",
	"./js/pop-art.js",
	"./js/standby-art.js",
	"./js/push-art.js",
	"./js/cone-art.js",
	"./js/enemy-art.js",
	"./js/bird-art.js",
	"./js/bar-art.js",
	"./js/edge-art.js",
	"./js/soil-art.js",
	"./js/gate-art.js",
	"./js/camp-art.js",
	"./js/ending-art.js",
	"./js/upgrades.js",
	"./js/frames.js",
	"./js/sprites.js",
	"./js/world.js",
	"./js/shape-art.js",
	"./js/skyline.js",
	"./js/sky.js",
	"./js/tint.js",
	"./js/parts-art.js",
	"./js/parts-temp.js",
	"./js/parts.js",
	"./js/parts-draw.js",
	"./js/ollie.js",
	"./js/shell.js",
	// ★音のファイルはここに入れない(上の説明のとおり素通しにする)
	"./icons/icon-180.png",
	"./icons/icon-192.png",
	"./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
	self.skipWaiting();
	e.waitUntil(
		caches.open(CACHE).then(function (c) { return c.addAll(FILES); })
	);
});

self.addEventListener("activate", function (e) {
	e.waitUntil(
		caches.keys().then(function (keys) {
			return Promise.all(keys.map(function (k) {
				return k === CACHE ? null : caches.delete(k);
			}));
		}).then(function () { return self.clients.claim(); })
	);
});

// 通信できるときは新しい版を取りに行き、取れなければ保存分で動かす
self.addEventListener("fetch", function (e) {
	var req = e.request;
	if (req.method !== "GET") return;
	// ★音のファイルと、細切れの取りに行き方(Range)は素通し。上の説明を読むこと
	if (isPassThrough(req.url) || req.headers.get("range")) return;
	e.respondWith(
		fetch(req).then(function (res) {
			// ★保存に失敗しても遊びは止めない(失敗を放っておくと警告が積もる)
			if (res && res.ok) {
				var copy = res.clone();
				caches.open(CACHE).then(function (c) { return c.put(req, copy); })
					.catch(function () { /* 保存できなくても、この返事はそのまま使える */ });
			}
			return res;
		}).catch(function () {
			return caches.match(req).then(function (hit) {
				return hit || caches.match("./index.html");
			});
		})
	);
});
