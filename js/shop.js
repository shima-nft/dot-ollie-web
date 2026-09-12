// The shop uses the game's original pixel lettering and sprite sheets.
// Only visible shop canvases animate, at 24fps; no timer survives closing.
(function (global) {
  "use strict";
  var game, dialog, grid, wallet, tabs, cards = [], group = "upg", raf = 0, last = 0, ask = null;
  var previousFocus, cache = new Map(), reduced = matchMedia("(prefers-reduced-motion: reduce)");
  var F = global.DotFont, P = global.DotPalette.COLORS;
  var help = {
    speed: "走る速さが上がる", stamina: "最大HPが増える", coin: "障害物・拾うコイン・レールの報酬が大きくなる", rail: "レール報酬が増え、飛び出しが少し高くなる",
    magnet: "近くのコインを引き寄せる範囲が広がる", recover: "無傷で走るとHPが回復。強化で必要な距離が短くなる",
    kickflip: "レールを滑って習得。コインの小さな吸着補助も得る", pop: "手すりを半分ほど滑り、タップで跳び降りると習得", maxdrink: "HPが尽きたとき自動で全回復。購入は1ランに1回"
  };
  function textCanvas(text, color) {
    var c = document.createElement("canvas");
    c.width = Math.max(1, F.textWidth(text.length)); c.height = F.GLYPH_H;
    F.drawText(c.getContext("2d"), text, 0, 0, color || P[16]);
    c.style.width = c.width * 2 + "px"; c.setAttribute("aria-hidden", "true");
    return c;
  }
  function button(label, action, className) {
    var b = document.createElement("button"); b.type = "button"; b.className = className || "shop-control";
    b.setAttribute("aria-label", label); b.appendChild(textCanvas(label));
    var armed = false, cancelled = false;
    b.addEventListener("pointerdown", function (e) {
      if (!e.isPrimary || e.button !== 0) return;
      armed = true; cancelled = false; b.classList.add("pressed"); b.setPointerCapture(e.pointerId);
    });
    b.addEventListener("pointermove", function (e) {
      if (!armed) return;
      var r = b.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX >= r.right || e.clientY < r.top || e.clientY >= r.bottom) {
        cancelled = true; b.classList.remove("pressed");
      }
    });
    b.addEventListener("pointercancel", function () { armed = false; cancelled = true; b.classList.remove("pressed"); });
    b.addEventListener("pointerup", function () { b.classList.remove("pressed"); });
    b.addEventListener("click", function (e) {
      var valid = e.detail === 0 || (armed && !cancelled);
      armed = false; if (valid) action();
    });
    return b;
  }
  function init() {
    if (dialog) return;
    dialog = document.createElement("dialog"); dialog.id = "pixel-shop";
    dialog.setAttribute("aria-label", "ショップ");
    var head = document.createElement("header"); head.className = "shop-header";
    var title = document.createElement("div"); title.className = "shop-title";
    title.appendChild(textCanvas("SHOP", P[19]));
    wallet = document.createElement("div"); wallet.className = "shop-wallet";
    var close = button("CLOSE", function () { game.toggleShop(); });
    close.setAttribute("aria-label", "ショップを閉じる");
    head.append(title, wallet, close);
    tabs = document.createElement("nav"); tabs.className = "shop-tabs"; tabs.setAttribute("aria-label", "商品カテゴリ");
    ["UPGRADES", "GEAR"].forEach(function (name, i) {
      var b = button(name, function () { group = i === 0 ? "upg" : "gear"; build(); });
      b.dataset.group = i === 0 ? "upg" : "gear"; tabs.appendChild(b);
    });
    grid = document.createElement("div"); grid.className = "shop-grid";
    dialog.append(head, tabs, grid); document.body.appendChild(dialog);
    dialog.addEventListener("cancel", function (e) { e.preventDefault(); game.toggleShop(); });
    // Native dialog supplies inert background and Tab focus containment.
    ["keydown", "keyup"].forEach(function (type) {
      document.addEventListener(type, function (e) {
        if (!dialog.open) return;
        e.stopImmediatePropagation();
        if (e.key === "Escape") { e.preventDefault(); if (type === "keydown") game.toggleShop(); }
      }, true);
    });
    document.addEventListener("visibilitychange", schedule);
    reduced.addEventListener("change", schedule);
  }
  function sprite(art, index) {
    if (!art || !art.FRAMES || !art.FRAMES.length) return null;
    var frame = art.FRAMES[index % art.FRAMES.length];
    if (!cache.has(frame)) {
      var c = document.createElement("canvas"); c.width = frame.rows[0].length; c.height = frame.rows.length;
      var ctx = c.getContext("2d");
      frame.rows.forEach(function (row, y) {
        for (var x = 0; x < row.length; x++) if (row[x] !== ".") {
          ctx.fillStyle = P[global.DotPalette.indexOfChar(row[x])]; ctx.fillRect(x, y, 1, 1);
        }
      });
      cache.set(frame, c);
    }
    return cache.get(frame);
  }
  function paint(card, seconds) {
    var c = card.ctx, id = card.row.id, lv = card.row.lv || 0;
    var w = 128, h = 52, p = (seconds % 3.6) / 3.6;
    c.clearRect(0, 0, w, h); c.imageSmoothingEnabled = false;
    c.fillStyle = P[10]; c.fillRect(0, 0, w, h);
    c.fillStyle = P[22]; c.fillRect(0, 42, w, 1);
    var pace = id === "speed" ? 1.4 + Math.min(lv, 15) * 0.08 : 1;
    c.fillStyle = P[5];
    for (var x = 0; x < 5; x++) c.fillRect(Math.floor((x * 31 - seconds * 22 * pace % 31 + 128) % 128), 47, 9, 1);
    var art = global.DotPushArt, frame = Math.floor(seconds * 5 * pace), riderY = 42;
    if (id === "kickflip" || id === "pop") {
      art = id === "kickflip" ? global.DotKickflipArt : global.DotPopArt;
      frame = Math.floor(p * art.FRAMES.length);
      riderY -= Math.round(Math.sin(p * Math.PI) * 10);
    }
    var rider = sprite(art, frame) || sprite(global.DotStandbyArt, 0);
    if (rider) c.drawImage(rider, 32, riderY - rider.height);
    var coin = sprite(global.DotPartsArt.coin, 0);
    function drawCoin(x, y) {
      if (coin) c.drawImage(coin, Math.round(x), Math.round(y));
      else { c.fillStyle = P[19]; c.fillRect(Math.round(x), Math.round(y), 3, 5); }
    }
    if (id === "rail") {
      c.fillStyle = P[15]; c.fillRect(15,30,100,2); c.fillRect(20,32,2,10); c.fillRect(110,32,2,10);
      drawCoin(86,20);
    } else if (id === "magnet") {
      var radius = global.DotUpgrades.magnetRadius(Math.max(1, lv));
      var reach = 28 + radius * 0.35;
      var pull = Math.max(0, Math.min(1, (p - 0.25) / 0.55)); pull = pull * pull;
      c.fillStyle = P[4];
      for (var a = -3; a <= 3; a++) {
        var angle = a * 0.35;
        c.fillRect(Math.round(43 + Math.cos(angle) * reach), Math.round(30 + Math.sin(angle) * reach * 0.6), 1, 1);
      }
      if (pull < 1) for (var k = 0; k < 3; k++) {
        var sx = 65 + reach * 0.5 + k * 7, sy = 9 + k * 9;
        drawCoin(sx + (43 - sx) * pull, sy + (34 - sy) * pull);
      }
      else { c.fillStyle = P[19]; c.fillRect(42, 19, 1, 5); c.fillRect(40, 21, 5, 1); }
    } else if (id === "recover" || id === "stamina" || id === "maxdrink") {
      var completion = id === "recover" ? 0.3 + global.DotUpgrades.recoverDistance(Math.max(1, lv)) / 360 : 0.65;
      var full = p > completion, amount = id === "stamina" ? Math.min(6, 4 + Math.min(2, lv)) : (full ? (id === "maxdrink" ? 6 : 3) : 2);
      c.fillStyle = P[5]; c.fillRect(67, 13, 48, 6);
      c.fillStyle = P[full ? 20 : 18]; c.fillRect(68, 14, amount * 7, 4);
      if (id === "recover") {
        c.fillStyle = P[5]; c.fillRect(68, 23, 46, 2);
        c.fillStyle = P[full ? 16 : 4]; c.fillRect(68, 23, full ? 46 : Math.floor(46 * p / completion), 2);
        if (full) { c.fillRect(87, 30, 7, 1); c.fillRect(90, 27, 1, 7); }
      } else if (id === "maxdrink") {
        var drink = sprite(global.DotPartsArt.MAXdrink, 0);
        if (drink && !full) c.drawImage(drink, 86, 26);
      } else {
        for (var b = 0; b < 6; b++) { c.fillStyle = P[10]; c.fillRect(68 + b * 7, 14, 1, 4); }
        F.drawText(c, "+", 85, 27, P[20]);
      }
    } else if (id === "coin") {
      var cone = sprite(global.DotConeArt, 0);
      if (cone) c.drawImage(cone, 88, 42 - cone.height);
      drawCoin(83, 9);
      F.drawText(c, "+" + game._shortNum(Math.round(game._curCoinPer())), 88, 10, P[19]);
    } else if (id === "speed") {
      c.fillStyle = P[8];
      for (var line = 0; line < 3; line++) c.fillRect(13 + line * 3, 20 + line * 6, 9, 1);
      F.drawText(c, "→", 87, 24, P[8]);
    }
  }
  function updateCard(card) {
    var r = card.row;
    // ★★★★★行が自分で文字を持っていれば、それをそのまま出す（2026-09-12）
    //   ★転生の行がこれを使います。★★こうしておかないと、
    //   ★★★新しい種類の行を足すたびに**ここを直す**ことになります。
    var state = r.state !== undefined ? r.state : r.kind === "unlock" && !r.got ? r.hint : r.kind === "item" && r.usedUp && !r.have ? "USED" : r.kind === "upg" && r.max !== null && r.lv >= r.max ? "MAX" : r.got ? "OWNED" : (r.kind === "item" && r.have >= r.maxHave ? "FULL" : game._shortNum(r.cost));
    card.price.replaceChildren(textCanvas(state, r.enabled ? P[19] : P[7]));
    card.level.replaceChildren(textCanvas(r.kind === "upg" ? "LV" + r.lv : "", P[7]));
    card.button.setAttribute("aria-disabled", String(!r.enabled));
    card.button.setAttribute("aria-label", r.name + "。" + (help[r.id] || "") + "。" + (r.kind === "upg" ? "レベル" + r.lv + "。" : "") + state + (r.enabled ? "コインで購入" : "。購入不可"));
  }
  function refresh() {
    var view = game.shopView();
    wallet.replaceChildren(textCanvas("COIN " + game._shortNum(view.coins), P[19]));
    wallet.setAttribute("aria-label", "所持コイン " + view.coins);
    cards.forEach(function (card) {
      card.row = view.rows.find(function (r) { return (r.id || r.kind) === card.id; }); updateCard(card);
    });
  }
  // ★★★★★転生（REBORN）は**1 ページ目**に出す（2026-09-12 島さんの指定）。
  //   ★前は `kind !== "upg"` だったので、★★**2 ページ目（GEAR）に落ちていました**
  function inGroup(r) {
    return group === "upg" ? (r.kind === "upg" || r.kind === "prestige")
                           : (r.kind !== "upg" && r.kind !== "prestige");
  }
  // ★★いま並んでいるパネルの面々（★**行そのものが増えたか**を見るため）
  function rowKeys() {
    return game.shopView().rows.filter(inGroup).map(function (r) { return r.id || r.kind; }).join(",");
  }
  // ============================================================
  // ★★★★★一段はさむ問いかけ（2026-09-12 島さんの指定）
  // ============================================================
  //   > 島さん「重要な選択なので押し間違いを防ぐためにも一段選択肢をはさみましょう。」
  //   ★★**決めるのはゲーム本体（`prestigeAnswer`）だけ**。
  //     ★ここは**聞くだけ**なので、★★★液晶のお店と答えがずれません
  function closeAsk() { if (ask) { ask.remove(); ask = null; } }
  function askReborn() {
    closeAsk();
    ask = document.createElement("div"); ask.className = "shop-ask";
    ask.setAttribute("role", "alertdialog");
    var box = document.createElement("div"); box.className = "shop-ask-box";
    var word = game._consts().PRESTIGE_ASK_TEXT;
    ask.setAttribute("aria-label", word);
    box.appendChild(textCanvas(word, P[29]));
    var row = document.createElement("div"); row.className = "shop-ask-btns";
    row.append(
      button("YES", function () { closeAsk(); game.prestigeAnswer(0); }),
      button("NO", function () { closeAsk(); game.prestigeAnswer(1); refresh(); schedule(); })
    );
    box.appendChild(row); ask.appendChild(box); dialog.appendChild(ask);
    var yes = row.firstChild; if (yes && yes.focus) yes.focus({ preventScroll: true });
  }
  function build() {
    closeAsk();
    cards = []; grid.replaceChildren(); grid.classList.toggle("gear", group === "gear");
    Array.from(tabs.children).forEach(function (b) { b.setAttribute("aria-pressed", String(b.dataset.group === group)); });
    var keys = rowKeys();
    grid.classList.toggle("reborn", keys.indexOf("prestige") >= 0);
    game.shopView().rows.filter(inGroup).forEach(function (r) {
      var card = { id: r.id || r.kind, row: r };
      var b = button(r.name, function () {
        if (!card.row.enabled) return;
        if (!game.buyShop(card.id)) return;
        // ★★★★★転生はここでは進みません（★一段はさむ問いかけへ）
        if (game.prestigeAsking()) { askReborn(); return; }
        card.flashUntil = performance.now() + 300; b.classList.add("bought");
        // ★★買った結果**行そのものが増えた**ときは、並べ直します。
        //   ★★★REBORN のパネルは **MAX に届いた瞬間に生まれる**ので、
        //   ★`refresh()` だけだと**お店を開き直すまで出てこない**
        if (rowKeys() !== keys) { build(); return; }
        refresh(); schedule();
      }, "shop-product");
      b.dataset.item = card.id;
      // ★★★★★生まれたてのパネルは、グリッチしながら現れる（★島さんの指定）。
      //   ★長さを決めているのは `js/ollie.js` の `PRESTIGE_GLITCH_MS` **1 か所**だけです
      var glitchMs = (card.id === "prestige") ? game.prestigeGlitchMs() : 0;
      if (glitchMs > 0) {
        b.classList.add("glitch-in");
        b.style.setProperty("--glitch-ms", Math.round(glitchMs) + "ms");
      }
      var name = document.createElement("div"); name.className = "shop-product-name";
      name.appendChild(b.firstChild); b.appendChild(name);
      var demo = document.createElement("canvas"); demo.width = 128; demo.height = 52;
      demo.className = "shop-demo"; demo.setAttribute("aria-hidden", "true"); b.appendChild(demo);
      var meta = document.createElement("div"); meta.className = "shop-product-meta";
      card.level = document.createElement("span"); card.price = document.createElement("span");
      meta.append(card.level, card.price); b.appendChild(meta);
      card.button = b; card.ctx = demo.getContext("2d", { alpha: false });
      cards.push(card); grid.appendChild(b);
    });
    refresh(); render(performance.now());
  }
  function render(time) {
    cards.forEach(function (card) {
      paint(card, reduced.matches ? 2.7 : time / 1000);
      if (card.flashUntil && time >= card.flashUntil) { card.button.classList.remove("bought"); card.flashUntil = 0; }
    });
  }
  function loop(time) {
    raf = 0;
    if (!dialog.open || document.hidden) return;
    if (time - last >= 1000 / 24) { last = time; render(time); }
    if (!reduced.matches || cards.some(function (c) { return c.flashUntil; })) raf = requestAnimationFrame(loop);
  }
  function schedule() {
    cancelAnimationFrame(raf); raf = 0;
    if (dialog && dialog.open && !document.hidden) { render(performance.now()); raf = requestAnimationFrame(loop); }
  }
  global.DotShop = {
    isOpen: function () { return !!(dialog && dialog.open); },
    open: function (g) {
      init(); game = g; group = "upg"; previousFocus = document.activeElement;
      build(); dialog.showModal(); schedule();
    },
    close: function () {
      closeAsk();
      cancelAnimationFrame(raf); raf = 0;
      if (dialog && dialog.open) { dialog.close(); if (previousFocus && previousFocus.isConnected) previousFocus.focus({ preventScroll: true }); }
      cards = [];
    }
  };
})(window);
