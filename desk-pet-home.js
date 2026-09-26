/* Desk Pet — HOME + RANDOM EVENTS
 *
 * They were living outside. Not anymore.
 *
 * This file gives the crew a real, drawn HOME: a little dark-wood den with a
 * neon rim, a cushion bed, food and water bowls, a rug, and a string of warm
 * bulbs over the door. Pets walk back to it when they run out of energy,
 * curl up on the cushion, and sleep there with Zzz drifting up. You can drag
 * the whole house anywhere along the floor and it remembers where you put it.
 *
 * It also runs the WORLD EVENT scheduler — every 30-70s something happens for
 * no reason at all: snack rain, a butterfly nobody can catch, zoomies hour,
 * a mouse sprinting along the floor, a thunderclap that sends everyone home,
 * a rainbow, a shooting star, confetti party. Each event announces itself
 * with a neon banner and drives every pet on screen.
 *
 * window.__deskPetHome = { rect, bedX, drive, fire, list, __kill }
 */
(function () {
  "use strict";

  var alive = true;
  var shown = false;          // the house only exists while a pet does
  var W = 360, H = 210;
  var FEET = 34;                 // matches desk-pet.js floor offset
  var STORE = "deskPetHomeX";

  /* reap a previous injection of this file */
  (function reap() {
    var old = document.querySelectorAll("[data-desk-pet-home]");
    for (var i = 0; i < old.length; i++) old[i].remove();
    var prev = window.__deskPetHome;
    if (prev && typeof prev.__kill === "function") { try { prev.__kill(); } catch (e) {} }
  })();

  function pick(a) { return a[(Math.random() * a.length) | 0]; }
  function rnd(a, b) { return a + Math.random() * (b - a); }
  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function pets() {
    var b = window.__deskPetBrain;
    return (b && b.all) ? b.all() : [];
  }
  function world() { return window.__deskPetWorld || null; }

  /* show/hide — called by desk-pet.js whenever the pet count changes.
     No pets on screen means no house, no events, no critters, nothing left
     painted over the page. */
  function setShown(v) {
    v = !!v;
    if (v === shown) return;
    shown = v;
    var vis = v ? "" : "none";
    if (cv) cv.style.display = vis;
    if (fx) fx.style.display = vis;
    if (banner) banner.style.display = vis;
    if (!v) {
      killCritter();
      confetti.length = 0; stars.length = 0;
      flash = 0; rainbowT = 0; bannerT = 0;
      ev = { id: null, t: 0, dur: 0 };
      nextIn = rnd(18, 34);
      if (fc) fc.clearRect(0, 0, fx.width, fx.height);
    }
  }

  /* ------------------------------------------------------------------ *
   *  the house itself
   * ------------------------------------------------------------------ */
  var home = { x: 0, t: 0, warm: 0 };
  (function restore() {
    var v = parseFloat(localStorage.getItem(STORE));
    home.x = isFinite(v) ? v : Math.max(40, window.innerWidth - W - 40);
  })();

  /* house removed — no canvas, no drawn den, bed or bowls */
  var cv = null, g = null;

  function floorY() { return window.innerHeight - FEET; }
  function baseY() { return floorY() + 16; }      // where the house sits
  function bedX() { return home.x + 246; }        // cushion centre
  function doorX() { return home.x + 104; }

  function place() {
    home.x = clamp(home.x, 0, Math.max(0, window.innerWidth - W));
  }

  /* ---- drawing ---- */
  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  function drawHouse(dt) {
    if (!g) return;                 // house removed
    var t = home.t;
    g.clearRect(0, 0, W, H);

    var floor = H - 16;
    var sleepers = 0;
    var ps = pets();
    for (var i = 0; i < ps.length; i++) if (ps[i].p.__homeSleep) sleepers++;
    home.warm += ((sleepers ? 1 : 0.28) - home.warm) * Math.min(1, dt * 2.2);

    /* --- rug --- */
    g.save();
    g.translate(0, 0);
    var rug = g.createLinearGradient(150, 0, 330, 0);
    rug.addColorStop(0, "rgba(24,34,44,.95)");
    rug.addColorStop(0.5, "rgba(18,26,34,.95)");
    rug.addColorStop(1, "rgba(24,34,44,.95)");
    g.fillStyle = rug;
    g.beginPath(); g.ellipse(250, floor + 2, 92, 17, 0, 0, 6.2832); g.fill();
    g.strokeStyle = "rgba(0,229,255,.22)"; g.lineWidth = 1.6;
    g.beginPath(); g.ellipse(250, floor + 2, 84, 13, 0, 0, 6.2832); g.stroke();

    /* --- cushion bed --- */
    var bedGlow = 0.22 + home.warm * 0.5 + Math.sin(t * 1.7) * 0.03;
    g.shadowColor = "rgba(0,229,255," + bedGlow.toFixed(3) + ")";
    g.shadowBlur = 22;
    var bed = g.createLinearGradient(0, floor - 26, 0, floor + 6);
    bed.addColorStop(0, "#22323f");
    bed.addColorStop(1, "#111a22");
    g.fillStyle = bed;
    roundRect(g, 200, floor - 24, 100, 28, 13); g.fill();
    g.shadowBlur = 0;
    // inner pad
    var pad = g.createLinearGradient(0, floor - 20, 0, floor);
    pad.addColorStop(0, "rgba(0,229,255,.16)");
    pad.addColorStop(1, "rgba(0,229,255,.04)");
    g.fillStyle = pad;
    roundRect(g, 208, floor - 19, 84, 19, 9); g.fill();
    g.strokeStyle = "rgba(0,229,255,.38)"; g.lineWidth = 1.4;
    roundRect(g, 200.5, floor - 23.5, 99, 27, 13); g.stroke();

    /* --- bowls --- */
    function bowl(bx, fill, rim) {
      g.fillStyle = "rgba(0,0,0,.35)";
      g.beginPath(); g.ellipse(bx, floor + 5, 15, 4.5, 0, 0, 6.2832); g.fill();
      g.fillStyle = "#1b2530";
      roundRect(g, bx - 14, floor - 10, 28, 14, 6); g.fill();
      g.fillStyle = fill;
      g.beginPath(); g.ellipse(bx, floor - 9, 11, 3.6, 0, 0, 6.2832); g.fill();
      g.strokeStyle = rim; g.lineWidth = 1.3;
      roundRect(g, bx - 13.5, floor - 9.5, 27, 13, 6); g.stroke();
    }
    bowl(324, "rgba(255,170,60,.85)", "rgba(255,170,60,.5)");
    bowl(176, "rgba(90,200,255,.8)", "rgba(90,200,255,.5)");
    // water shimmer
    g.globalAlpha = 0.35 + Math.sin(t * 3) * 0.15;
    g.strokeStyle = "rgba(200,245,255,.7)"; g.lineWidth = 1;
    g.beginPath(); g.moveTo(170, floor - 9); g.lineTo(182, floor - 9); g.stroke();
    g.globalAlpha = 1;

    /* --- the den / doghouse --- */
    var hx = 30, hy = floor - 118, hw = 148, hh = 118;
    // body
    var body = g.createLinearGradient(hx, hy, hx, hy + hh);
    body.addColorStop(0, "#26313d");
    body.addColorStop(1, "#131b23");
    g.fillStyle = body;
    roundRect(g, hx, hy + 34, hw, hh - 34, 8); g.fill();
    // plank lines
    g.strokeStyle = "rgba(255,255,255,.045)"; g.lineWidth = 1;
    for (var pl = 1; pl < 5; pl++) {
      g.beginPath(); g.moveTo(hx + 3, hy + 34 + pl * 17); g.lineTo(hx + hw - 3, hy + 34 + pl * 17); g.stroke();
    }
    // roof
    g.beginPath();
    g.moveTo(hx - 12, hy + 40);
    g.lineTo(hx + hw / 2, hy - 4);
    g.lineTo(hx + hw + 12, hy + 40);
    g.closePath();
    var roof = g.createLinearGradient(0, hy - 4, 0, hy + 40);
    roof.addColorStop(0, "#37485a");
    roof.addColorStop(1, "#1d2733");
    g.fillStyle = roof; g.fill();
    g.strokeStyle = "rgba(0,229,255,.45)"; g.lineWidth = 2;
    g.stroke();

    // doorway with warm light spilling out
    var dx = hx + hw / 2, dtop = hy + 56, dw = 54, dh = 62;
    g.save();
    g.beginPath();
    g.moveTo(dx - dw / 2, dtop + dh);
    g.lineTo(dx - dw / 2, dtop + 20);
    g.quadraticCurveTo(dx, dtop - 16, dx + dw / 2, dtop + 20);
    g.lineTo(dx + dw / 2, dtop + dh);
    g.closePath();
    g.fillStyle = "#070b0f"; g.fill();
    g.clip();
    var spill = g.createRadialGradient(dx, dtop + dh, 2, dx, dtop + dh, 70);
    var warm = 0.18 + home.warm * 0.42 + Math.sin(t * 2.3) * 0.03;
    spill.addColorStop(0, "rgba(255,186,96," + warm.toFixed(3) + ")");
    spill.addColorStop(1, "rgba(255,150,60,0)");
    g.fillStyle = spill;
    g.fillRect(dx - dw, dtop - 30, dw * 2, dh + 40);
    g.restore();
    g.strokeStyle = "rgba(255,186,96,.45)"; g.lineWidth = 1.6;
    g.beginPath();
    g.moveTo(dx - dw / 2, dtop + dh);
    g.lineTo(dx - dw / 2, dtop + 20);
    g.quadraticCurveTo(dx, dtop - 16, dx + dw / 2, dtop + 20);
    g.lineTo(dx + dw / 2, dtop + dh);
    g.stroke();

    // nameplate
    g.fillStyle = "rgba(10,16,22,.9)";
    roundRect(g, dx - 44, hy + 30, 88, 18, 6); g.fill();
    g.strokeStyle = "rgba(0,229,255,.5)"; g.lineWidth = 1.2;
    roundRect(g, dx - 44, hy + 30, 88, 18, 6); g.stroke();
    g.font = "700 11px ui-sans-serif,system-ui,sans-serif";
    g.textAlign = "center"; g.textBaseline = "middle";
    g.fillStyle = "rgba(0,229,255,.9)";
    g.fillText("THE CREW", dx, hy + 39.5);

    // string lights over the roof
    g.strokeStyle = "rgba(255,255,255,.14)"; g.lineWidth = 1.2;
    g.beginPath();
    g.moveTo(hx - 24, hy + 18);
    g.quadraticCurveTo(hx + hw / 2, hy - 26, hx + hw + 30, hy + 12);
    g.stroke();
    for (var b = 0; b <= 6; b++) {
      var u = b / 6;
      var bxp = (1 - u) * (1 - u) * (hx - 24) + 2 * (1 - u) * u * (hx + hw / 2) + u * u * (hx + hw + 30);
      var byp = (1 - u) * (1 - u) * (hy + 18) + 2 * (1 - u) * u * (hy - 26) + u * u * (hy + 12);
      var fl = 0.55 + Math.sin(t * 2.4 + b * 1.7) * 0.35;
      g.fillStyle = b % 2 ? "rgba(255,186,96," + fl.toFixed(2) + ")" : "rgba(0,229,255," + fl.toFixed(2) + ")";
      g.shadowColor = g.fillStyle; g.shadowBlur = 9;
      g.beginPath(); g.arc(bxp, byp + 5, 2.6, 0, 6.2832); g.fill();
      g.shadowBlur = 0;
    }

    // Zzz drifting from the bed when someone is asleep in it
    if (sleepers) {
      for (var z = 0; z < 3; z++) {
        var zt = (t * 0.55 + z * 0.33) % 1;
        g.globalAlpha = (1 - zt) * 0.8;
        g.font = (10 + zt * 9).toFixed(1) + "px ui-sans-serif,system-ui,sans-serif";
        g.fillStyle = "rgba(0,229,255,.9)";
        g.fillText("z", 268 + Math.sin(zt * 5 + z) * 10, floor - 30 - zt * 52);
      }
      g.globalAlpha = 1;
    }
    g.restore();
  }

  /* ------------------------------------------------------------------ *
   *  event banner
   * ------------------------------------------------------------------ */
  var banner = document.createElement("div");
  banner.setAttribute("data-desk-pet-home", "banner");
  banner.style.cssText =
    "position:fixed;left:50%;top:18px;transform:translate(-50%,-24px);z-index:2147483010;" +
    "padding:9px 18px;border-radius:999px;pointer-events:none;opacity:0;" +
    "background:rgba(8,12,17,.92);border:1px solid rgba(0,229,255,.45);" +
    "box-shadow:0 0 28px rgba(0,229,255,.22),inset 0 0 18px rgba(0,229,255,.06);" +
    "color:#dff8ff;font:600 13px ui-sans-serif,system-ui,sans-serif;letter-spacing:.4px;" +
    "transition:opacity .35s ease,transform .35s cubic-bezier(.2,1.4,.4,1);white-space:nowrap;display:none;";
  document.body.appendChild(banner);
  var bannerT = 0;
  function announce(text, color) {
    banner.textContent = text;
    banner.style.borderColor = color || "rgba(0,229,255,.45)";
    banner.style.boxShadow = "0 0 28px " + (color || "rgba(0,229,255,.3)");
    banner.style.opacity = "1";
    banner.style.transform = "translate(-50%,0)";
    bannerT = 3.4;
  }

  /* ------------------------------------------------------------------ *
   *  critters — things that run across the floor and get chased
   * ------------------------------------------------------------------ */
  var critter = null;
  function spawnCritter(glyph, opts) {
    killCritter();
    var el = document.createElement("div");
    el.setAttribute("data-desk-pet-home", "critter");
    el.style.cssText =
      "position:fixed;left:0;top:0;width:36px;height:36px;line-height:36px;text-align:center;" +
      "font-size:26px;z-index:2147483005;pointer-events:none;will-change:transform;" +
      "filter:drop-shadow(0 3px 6px rgba(0,0,0,.5));";
    el.textContent = glyph;
    document.body.appendChild(el);
    var fromLeft = Math.random() < 0.5;
    critter = {
      el: el,
      x: fromLeft ? -40 : window.innerWidth + 40,
      y: opts.fly ? rnd(120, window.innerHeight * 0.55) : floorY() - 10,
      vx: (fromLeft ? 1 : -1) * opts.speed,
      fly: !!opts.fly, t: 0, life: opts.life || 16, caught: false,
    };
  }
  function killCritter() {
    if (critter && critter.el) critter.el.remove();
    critter = null;
  }
  function stepCritter(dt) {
    if (!critter) return;
    var c = critter;
    c.t += dt; c.life -= dt;
    c.x += c.vx * dt;
    if (c.fly) {
      c.y += Math.sin(c.t * 4.2) * 42 * dt;
      c.y = clamp(c.y, 90, window.innerHeight * 0.72);
      // flutter away from the nearest pet
      var ps = pets();
      for (var i = 0; i < ps.length; i++) {
        var d = Math.abs(ps[i].p.x - c.x);
        if (d < 120) { c.y -= 90 * dt; c.vx += (c.x > ps[i].p.x ? 1 : -1) * 120 * dt; }
      }
      c.vx = clamp(c.vx, -300, 300);
    } else {
      c.y = floorY() - 10 + Math.abs(Math.sin(c.t * 16)) * -5;
    }
    if (c.life <= 0 || c.x < -90 || c.x > window.innerWidth + 90) { killCritter(); return; }
    c.el.style.transform =
      "translate3d(" + (c.x - 18).toFixed(1) + "px," + (c.y - 18).toFixed(1) + "px,0) scaleX(" + (c.vx >= 0 ? 1 : -1) + ")";
  }

  /* ------------------------------------------------------------------ *
   *  sky FX canvas — rainbow, stars, confetti, lightning
   * ------------------------------------------------------------------ */
  var fx = document.createElement("canvas");
  fx.setAttribute("data-desk-pet-home", "fx");
  fx.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147482995;display:none;";
  document.body.appendChild(fx);
  var fc = fx.getContext("2d");
  function sizeFx() {
    fx.width = window.innerWidth; fx.height = window.innerHeight;
  }
  sizeFx();
  window.addEventListener("resize", function () { sizeFx(); place(); });

  var confetti = [], stars = [], flash = 0, rainbowT = 0;

  function burstConfetti(n) {
    for (var i = 0; i < n; i++) {
      confetti.push({
        x: Math.random() * window.innerWidth, y: -20 - Math.random() * 200,
        vx: rnd(-60, 60), vy: rnd(90, 230), rot: Math.random() * 6.28,
        av: rnd(-7, 7), w: rnd(4, 9), h: rnd(6, 13), life: rnd(3.5, 6.5),
        c: pick(["#00e5ff", "#ff4fd8", "#ffd166", "#7cff6b", "#ff6b6b", "#b59bff"]),
      });
    }
  }
  function shootStar() {
    stars.push({
      x: rnd(window.innerWidth * 0.15, window.innerWidth * 0.85), y: rnd(40, 160),
      vx: rnd(-420, -260), vy: rnd(150, 240), life: 1.5, max: 1.5,
    });
  }

  function stepFx(dt) {
    fc.clearRect(0, 0, fx.width, fx.height);

    if (flash > 0) {
      flash -= dt * 2.4;
      fc.fillStyle = "rgba(190,225,255," + Math.max(0, flash * 0.32).toFixed(3) + ")";
      fc.fillRect(0, 0, fx.width, fx.height);
    }

    if (rainbowT > 0) {
      rainbowT -= dt;
      var a = Math.min(1, rainbowT / 2) * 0.5;
      var cx = fx.width / 2, cy = fx.height + 60, R = Math.max(fx.width, fx.height) * 0.62;
      var cols = ["#ff6b6b", "#ffb36b", "#ffe66b", "#7cff6b", "#6bd5ff", "#8f6bff"];
      fc.save(); fc.globalAlpha = a; fc.lineWidth = 16; fc.globalCompositeOperation = "lighter";
      for (var r = 0; r < cols.length; r++) {
        fc.strokeStyle = cols[r];
        fc.beginPath(); fc.arc(cx, cy, R - r * 17, Math.PI, 0); fc.stroke();
      }
      fc.restore();
    }

    for (var s = stars.length - 1; s >= 0; s--) {
      var st = stars[s];
      st.life -= dt; st.x += st.vx * dt; st.y += st.vy * dt;
      if (st.life <= 0) { stars.splice(s, 1); continue; }
      var al = st.life / st.max;
      var grd = fc.createLinearGradient(st.x, st.y, st.x - st.vx * 0.16, st.y - st.vy * 0.16);
      grd.addColorStop(0, "rgba(255,255,255," + al.toFixed(2) + ")");
      grd.addColorStop(1, "rgba(0,229,255,0)");
      fc.strokeStyle = grd; fc.lineWidth = 2.4; fc.lineCap = "round";
      fc.beginPath(); fc.moveTo(st.x, st.y); fc.lineTo(st.x - st.vx * 0.16, st.y - st.vy * 0.16); fc.stroke();
      fc.fillStyle = "rgba(255,255,255," + al.toFixed(2) + ")";
      fc.beginPath(); fc.arc(st.x, st.y, 2.2, 0, 6.2832); fc.fill();
    }

    for (var i = confetti.length - 1; i >= 0; i--) {
      var p = confetti[i];
      p.life -= dt;
      p.vy += 220 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.rot += p.av * dt;
      if (p.life <= 0 || p.y > fx.height + 40) { confetti.splice(i, 1); continue; }
      fc.save();
      fc.translate(p.x, p.y); fc.rotate(p.rot);
      fc.globalAlpha = Math.min(1, p.life);
      fc.fillStyle = p.c;
      fc.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
      fc.restore();
    }
  }

  /* ------------------------------------------------------------------ *
   *  EVENTS
   * ------------------------------------------------------------------ */
  var ev = { id: null, t: 0, dur: 0 };
  var nextIn = rnd(18, 34);

  var FOODS = [{ glyph: "\uD83C\uDF57" }, { glyph: "\uD83D\uDC1F" }, { glyph: "\uD83E\uDDC0" }, { glyph: "\uD83C\uDF56" }, { glyph: "\uD83C\uDF6A" }];
  var TOYS = [{ glyph: "\uD83E\uDDF6" }, { glyph: "\u26BD" }, { glyph: "\uD83E\uDDF8" }, { glyph: "\uD83C\uDFBE" }, { glyph: "\uD83E\uDDB4" }];

  var EVENTS = [
    {
      id: "snackRain", dur: 9, color: "rgba(255,186,96,.55)",
      label: "\uD83C\uDF57  SNACK RAIN  \uD83C\uDF57",
      start: function () {
        var w = world(); if (!w) return;
        for (var i = 0; i < 4; i++) {
          (function (k) {
            setTimeout(function () {
              if (!alive) return;
              var ww = world(); if (!ww) return;
              ww.spawn(pick(FOODS), "food", rnd(80, window.innerWidth - 80), -20);
            }, k * 700);
          })(i);
        }
        eachPet(function (c) { c.say(pick(["FOOD!", "it's raining dinner", "MINE", "best day ever"])); c.p.emote = "love"; c.p.emoteT = 1.4; });
      },
    },
    {
      id: "toyStorm", dur: 9, color: "rgba(0,229,255,.55)",
      label: "\uD83E\uDDF8  TOY STORM  \uD83E\uDDF8",
      start: function () {
        for (var i = 0; i < 4; i++) {
          (function (k) {
            setTimeout(function () {
              if (!alive) return;
              var ww = world(); if (!ww) return;
              ww.spawn(pick(TOYS), "toy", rnd(80, window.innerWidth - 80), -20);
            }, k * 620);
          })(i);
        }
        eachPet(function (c) { c.say(pick(["TOYS", "grab one!", "mine mine mine"])); });
      },
    },
    {
      id: "zoomies", dur: 7, color: "rgba(124,255,107,.55)",
      label: "\u26A1  ZOOMIES HOUR  \u26A1",
      start: function () {
        eachPet(function (c) {
          c.p.act = null; c.p.__homing = false; c.p.__homeSleep = false;
          c.p.zoomLeft = 6 + (Math.random() * 4 | 0);
          c.p.targetX = rnd(60, window.innerWidth - 60);
          c.p.thinkT = 0.4; c.p.emote = "zoom"; c.p.emoteT = 0.8;
          if (c.p.needs) c.p.needs.energy = Math.max(0.35, c.p.needs.energy);
          c.say(pick(["AAAAAA", "CAN'T STOP", "WHEEEE", "full speed"]));
        });
      },
    },
    {
      id: "butterfly", dur: 15, color: "rgba(181,155,255,.55)",
      label: "\uD83E\uDD8B  a butterfly got in",
      start: function () {
        spawnCritter("\uD83E\uDD8B", { fly: true, speed: rnd(55, 90), life: 15 });
        eachPet(function (c) { c.say(pick(["what IS that", "\uD83D\uDC40", "must catch"])); c.p.eye = "scared"; });
      },
    },
    {
      id: "mouse", dur: 11, color: "rgba(255,79,216,.55)",
      label: "\uD83D\uDC01  MOUSE ON THE FLOOR",
      start: function () {
        spawnCritter("\uD83D\uDC01", { fly: false, speed: rnd(190, 260), life: 11 });
        eachPet(function (c) { c.say(pick(["GET IT", "intruder!", "after it!"])); c.p.ears = 1; });
      },
    },
    {
      id: "storm", dur: 8, color: "rgba(150,190,255,.55)",
      label: "\u26C8\uFE0F  THUNDER  \u2014  everyone home",
      start: function () {
        flash = 1.4;
        setTimeout(function () { if (alive) flash = 1.1; }, 900);
        eachPet(function (c) {
          c.p.act = null; c.p.zoomLeft = 0;
          c.p.__homing = true; c.p.__homeSleep = false; c.p.__homeT = 0;
          c.p.eye = "scared"; c.p.emote = "bang"; c.p.emoteT = 0.8;
          c.say(pick(["NOPE", "scary!", "inside inside inside", "hide!"]));
        });
      },
      step: function (dt, u) { if (u > 0.42 && u < 0.45) flash = 1.0; },
    },
    {
      id: "naptime", dur: 14, color: "rgba(0,229,255,.45)",
      label: "\uD83C\uDF19  NAP TIME  \u2014  off to bed",
      start: function () {
        eachPet(function (c) {
          c.p.act = null; c.p.zoomLeft = 0;
          c.p.__homing = true; c.p.__homeSleep = false; c.p.__homeT = 0;
          c.say(pick(["\uD83D\uDE34", "bedtime", "so tired", "carry me"]));
        });
      },
    },
    {
      id: "party", dur: 10, color: "rgba(255,209,102,.55)",
      label: "\uD83C\uDF89  PARTY  \uD83C\uDF89",
      start: function () {
        burstConfetti(70);
        eachPet(function (c) {
          c.p.act = null; c.p.__homing = false;
          c.p.eye = "happy"; c.p.mouth = "happy";
          if (c.p.needs) c.p.needs.fun = 1;
          c.say(pick(["\u266a \u266b", "DANCE", "hehehe", "best night"]));
        });
      },
      step: function (dt, u, self) {
        self.acc = (self.acc || 0) + dt;
        if (self.acc > 0.7) { self.acc = 0; burstConfetti(14); }
        eachPet(function (c) {
          if (c.p.mode !== "ground" || c.p.trick) return;
          c.p.action = "idle"; c.p.speedMul = 0;
          c.p.rotHold = Math.sin(performance.now() / 90 + c.p.x) * 0.3;
          c.p.dir = Math.sin(performance.now() / 420 + c.p.x) >= 0 ? 1 : -1;
          c.p.eye = "happy"; c.p.mouth = "happy";
        });
      },
      lock: true,
    },
    {
      id: "star", dur: 7, color: "rgba(220,235,255,.5)",
      label: "\u2728  shooting star  \u2014  make a wish",
      start: function () {
        shootStar();
        eachPet(function (c) { c.say(pick(["oooooh", "pretty", "i wish for snacks", "\u2728"])); c.p.eye = "happy"; });
      },
      step: function (dt, u, self) {
        self.acc = (self.acc || 0) + dt;
        if (self.acc > 1.6) { self.acc = 0; shootStar(); }
        eachPet(function (c) {
          if (c.p.mode !== "ground" || c.p.trick) return;
          c.p.action = "sit"; c.p.speedMul = 0; c.p.rotHold = -c.p.dir * 0.22;
        });
      },
      lock: true,
    },
    {
      id: "rainbow", dur: 9, color: "rgba(124,255,107,.5)",
      label: "\uD83C\uDF08  RAINBOW",
      start: function () {
        rainbowT = 9;
        eachPet(function (c) { c.p.emote = "love"; c.p.emoteT = 2; c.say(pick(["woooow", "colors!", "\u2665"])); });
      },
    },
    {
      id: "inspection", dur: 9, color: "rgba(0,229,255,.5)",
      label: "\uD83D\uDD0D  HOME INSPECTION",
      start: function () {
        eachPet(function (c) {
          c.p.act = null;
          c.p.__homing = true; c.p.__homeSleep = false; c.p.__homeT = 0;
          c.say(pick(["checking the house", "is my bed ok", "who moved the bowl", "inspecting"]));
        });
      },
    },
  ];

  function eachPet(fn) {
    var ps = pets();
    for (var i = 0; i < ps.length; i++) { try { fn(ps[i]); } catch (e) {} }
  }

  function fire(id) {
    var def = null;
    for (var i = 0; i < EVENTS.length; i++) if (EVENTS[i].id === id) def = EVENTS[i];
    if (!def) def = pick(EVENTS);
    if (def.id === ev.id) def = pick(EVENTS);          // never twice in a row
    if (!shown || !pets().length) return null;         // nobody home, no show
    ev = { id: def.id, def: def, t: 0, dur: def.dur, acc: 0 };
    announce(def.label, def.color);
    if (def.start) def.start();
    return def.id;
  }

  function stepEvents(dt) {
    if (bannerT > 0) {
      bannerT -= dt;
      if (bannerT <= 0) { banner.style.opacity = "0"; banner.style.transform = "translate(-50%,-24px)"; }
    }
    if (ev.id) {
      ev.t += dt;
      var u = Math.min(1, ev.t / ev.dur);
      if (ev.def.step) ev.def.step(dt, u, ev);
      if (ev.t >= ev.dur) { ev.id = null; ev.def = null; }
      return;
    }
    nextIn -= dt;
    if (nextIn <= 0) {
      nextIn = rnd(30, 70);
      fire(null);
    }
  }

  /* ------------------------------------------------------------------ *
   *  per-pet drive — home-going, sleeping, critter chasing, event locks
   *  returns true when this file owns the pet's frame
   * ------------------------------------------------------------------ */
  function drive(ctx, dt) {
    if (!alive || !shown || !ctx || !ctx.p) return false;
    var p = ctx.p;
    if (p.mode !== "ground") return false;
    if (p.trick) return false;

    /* an event that fully owns the pet (party, stargazing) */
    if (ev.id && ev.def && ev.def.lock) return true;

    /* chase whatever critter is loose */
    if (critter && !critter.caught) {
      var cdx = critter.x - p.x, cdy = critter.y - p.y;
      var cd = Math.hypot(cdx, cdy);
      p.act = null; p.__homing = false; p.__homeSleep = false;
      p.restT = 0; p.ears = 1; p.eye = "scared"; p.mouth = "happy";
      p.action = "follow";
      p.targetX = critter.x;
      p.speedMul = critter.fly ? 2.2 : 2.9;
      p.dir = cdx >= 0 ? 1 : -1;
      if (cd < 54) {
        if (p.pounceT <= 0) {
          p.pounceT = 0.8;
          p.emote = "fight"; p.emoteT = 0.4;
          p.sx = 1.3; p.sy = 0.72;
          if (!critter.fly && Math.random() < 0.5) {
            critter.caught = true;
            ctx.say(pick(["GOT IT!", "caught it!", "i am the hunter"]));
            p.emote = "love"; p.emoteT = 1.6;
            if (p.needs) p.needs.fun = 1;
            killCritter();
          } else if (Math.random() < 0.4) {
            ctx.say(pick(["missed", "so fast", "come back", "RAAA"]));
          }
        }
        p.action = "idle";
      } else if (cdy < -70 && Math.abs(cdx) < 120 && p.pounceT <= 0) {
        ctx.startHop(critter.x); p.pounceT = 0.7;
      }
      return true;
    }

    /* out of energy -> go home to bed (the whole point of having one) */
    if (!p.__homing && !p.__homeSleep && p.needs && p.needs.energy < 0.26 && !p.emote) {
      p.__homing = true; p.__homeT = 0; p.act = null;
      ctx.say(pick(["im going to bed", "need my cushion", "home time", "so sleepy..."]));
    }

    if (p.__homeSleep) {
      p.action = "sit"; p.speedMul = 0;
      p.x += (bedX() - p.x) * Math.min(1, dt * 3);
      p.eye = "happy"; p.mouth = "neutral"; p.ears = 0.35;
      p.emote = "sleep"; p.emoteT = 2;
      p.rotHold = Math.sin(performance.now() / 700) * 0.05;
      p.sy = 0.94 + Math.sin(performance.now() / 700) * 0.03;
      if (p.needs) {
        p.needs.energy = Math.min(1, p.needs.energy + dt * 0.07);
        p.needs.tidy = Math.min(1, p.needs.tidy + dt * 0.02);
      }
      p.__homeT += dt;
      var woken = (ev.id === "zoomies" || ev.id === "party" || ev.id === "snackRain" || ev.id === "toyStorm");
      if ((p.needs && p.needs.energy > 0.94 && p.__homeT > 4) || (!p.needs && p.__homeT > 9) || woken) {
        p.__homeSleep = false; p.__homing = false; p.emote = null;
        p.restT = 0; p.thinkT = 0.3; p.ears = 1;
        ctx.say(pick(["morning!", "what a nap", "refreshed", "ok. day."]));
      }
      return true;
    }

    if (p.__homing) {
      p.__homeT += dt;
      var target = bedX();
      var gap = target - p.x;
      p.act = null;
      if (Math.abs(gap) > 26) {
        p.action = "wander";
        p.targetX = target;
        p.speedMul = ev.id === "storm" ? 2.6 : 1.35;
        p.dir = gap >= 0 ? 1 : -1;
        p.eye = ev.id === "storm" ? "scared" : "open";
        if (p.__homeT > 14) { p.__homing = false; p.thinkT = 0.2; } // gave up, door's too far
      } else {
        if (ev.id === "inspection") {
          p.action = "sit"; p.speedMul = 0;
          p.rotHold = Math.sin(p.__homeT * 8) * 0.14;
          if (p.__homeT > 5.5) { p.__homing = false; p.thinkT = 0.4; ctx.say(pick(["all good", "passes", "spotless"])); }
        } else {
          p.__homing = false; p.__homeSleep = true; p.__homeT = 0;
          p.action = "sit"; p.speedMul = 0;
          ctx.say(pick(["\uD83D\uDE34", "home.", "my bed", "goodnight"]));
        }
      }
      return true;
    }

    return false;
  }

  /* ------------------------------------------------------------------ *
   *  loop
   * ------------------------------------------------------------------ */
  var last = performance.now();
  function tick(now) {
    if (!alive) return;
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    if (shown) {
      home.t += dt;
      place();
      drawHouse(dt);
      stepCritter(dt);
      stepEvents(dt);
      stepFx(dt);
    }
    requestAnimationFrame(tick);
  }
  place();
  requestAnimationFrame(tick);

  window.__deskPetHome = {
    show: function () { setShown(true); },
    hide: function () { setShown(false); },
    shown: function () { return shown; },
    drive: drive,
    fire: fire,
    bedX: bedX,
    doorX: doorX,
    rect: function () { return { x: home.x, y: baseY() - H, w: W, h: H }; },
    list: function () { return EVENTS.map(function (e) { return e.id; }); },
    current: function () { return ev.id; },
    sendHome: function () {
      eachPet(function (c) { c.p.act = null; c.p.__homing = true; c.p.__homeSleep = false; c.p.__homeT = 0; });
      announce("\uD83C\uDFE0  everyone home", "rgba(0,229,255,.5)");
    },
    __kill: function () {
      alive = false;
      killCritter();
      if (cv) cv.remove();
      fx.remove(); banner.remove();
      eachPet(function (c) { c.p.__homing = false; c.p.__homeSleep = false; });
    },
  };
})();
