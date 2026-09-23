/* Desk Pet — WORLD
 *
 * One shared physical world for every pet on screen. Toys and food live HERE,
 * not inside a single pet, so anything you drop is fair game for the whole
 * crew: they race each other for it, take turns batting it, and food gets
 * eaten bite by bite by whoever reaches the bowl first.
 *
 * Also owns the laser pointer — a real one. A hot white core inside a red
 * bloom, chromatic fringe, speckle, and a soft floor ellipse, that snaps to
 * your cursor and darts on its own when you sit still. It has no mass and
 * cannot be caught, which is exactly why cats lose their minds over it.
 *
 * window.__deskPetWorld = { spawn, nearest, swat, bite, clearAll, count,
 *                           laserOn, laserOff, laserActive, laserPos, dragging }
 */
(function () {
  "use strict";

  var MAX_ITEMS = 6;
  var items = [];
  var drag = { item: null, ox: 0, oy: 0, samples: [] };

  /* ------------------------------------------------------------------ *
   *  items (toys + food)
   * ------------------------------------------------------------------ */
  function makeEl(glyph) {
    var el = document.createElement("div");
    el.style.cssText =
      "position:fixed;left:0;top:0;width:40px;height:40px;line-height:40px;text-align:center;" +
      "font-size:30px;z-index:2147483001;cursor:grab;user-select:none;touch-action:none;" +
      "filter:drop-shadow(0 3px 5px rgba(0,0,0,.5));will-change:transform;";
    el.textContent = glyph;
    document.body.appendChild(el);
    return el;
  }

  function spawn(def, kind, atX, atY) {
    if (kind === "laser") { laserOn(); return null; }
    var it = {
      def: def, kind: kind, glyph: def.glyph,
      x: atX, y: atY,
      vx: (Math.random() - 0.5) * 200, vy: -260,
      rot: 0, angVel: (Math.random() - 0.5) * 10,
      life: kind === "food" ? 34 : 46,
      bites: 3,
      cool: 0,           // per-item swat cooldown so pets take turns
      el: makeEl(def.glyph),
    };
    it.el.addEventListener("pointerdown", function (e) { onDown(e, it); });
    items.push(it);
    while (items.length > MAX_ITEMS) remove(items[0]);
    return it;
  }

  function remove(it) {
    var i = items.indexOf(it);
    if (i >= 0) items.splice(i, 1);
    if (it.el) it.el.remove();
    if (drag.item === it) drag.item = null;
  }

  function clearAll() {
    items.slice().forEach(remove);
    laserOff();
  }

  /** closest item to a point, ignoring one being dragged */
  function nearest(x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it === drag.item) continue;
      var d = Math.hypot(it.x - x, it.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /** closest FOOD item only — hunger overrides the laser */
  function nearestFood(x, y) {
    var best = null, bd = 1e9;
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (it === drag.item || it.kind !== "food") continue;
      var d = Math.hypot(it.x - x, it.y - y);
      if (d < bd) { bd = d; best = it; }
    }
    return best;
  }

  /** a pet whacks a toy. returns false if another pet just hit it */
  function swat(it, dir) {
    if (!it || it.cool > 0) return false;
    it.cool = 0.45;
    it.vx = dir * (420 + Math.random() * 420);
    it.vy = -(320 + Math.random() * 340);
    it.angVel = dir * 16;
    it.life = Math.max(it.life, 14);
    return true;
  }

  /** a pet takes a bite. returns "bite" | "last" | false */
  function bite(it) {
    if (!it || it.cool > 0) return false;
    it.cool = 0.5;
    it.bites--;
    if (it.bites <= 0) { remove(it); return "last"; }
    return "bite";
  }

  /* ---- dragging any item with the mouse ---- */
  function onDown(e, it) {
    drag.item = it;
    drag.ox = e.clientX - it.x; drag.oy = e.clientY - it.y;
    drag.samples = [{ t: performance.now(), x: it.x, y: it.y }];
    it.el.style.cursor = "grabbing";
    it.vx = it.vy = 0;
    e.preventDefault(); e.stopPropagation();
  }
  window.addEventListener("pointermove", function (e) {
    if (!drag.item) return;
    var it = drag.item;
    it.x = e.clientX - drag.ox; it.y = e.clientY - drag.oy;
    drag.samples.push({ t: performance.now(), x: it.x, y: it.y });
    while (drag.samples.length > 6) drag.samples.shift();
  }, { passive: true });
  window.addEventListener("pointerup", function () {
    var it = drag.item;
    if (!it) return;
    drag.item = null;
    it.el.style.cursor = "grab";
    var s = drag.samples;
    if (s.length >= 2) {
      var a = s[0], b = s[s.length - 1], dt = (b.t - a.t) / 1000;
      if (dt > 0) {
        it.vx = Math.max(-2200, Math.min(2200, (b.x - a.x) / dt));
        it.vy = Math.max(-2200, Math.min(2200, (b.y - a.y) / dt));
      }
    }
    it.angVel = it.vx / 60;
    it.life = Math.max(it.life, 12);
  });

  /* ------------------------------------------------------------------ *
   *  the laser — cursor-tracked, jittery, impossible to catch
   * ------------------------------------------------------------------ */
  var laser = {
    on: false, x: 0, y: 0, tx: 0, ty: 0,
    jx: 0, jy: 0, phase: 0, idle: 0, dartT: 0, pulse: 0,
  };
  var mouse = { x: -9999, y: -9999, moved: 0, has: false };
  window.addEventListener("pointermove", function (e) {
    mouse.x = e.clientX; mouse.y = e.clientY; mouse.moved = performance.now(); mouse.has = true;
  }, { passive: true });

  var lcv = null, lctx = null;
  function laserCanvas() {
    if (lcv) return lcv;
    lcv = document.createElement("canvas");
    lcv.width = 180; lcv.height = 180;
    lcv.style.cssText =
      "position:fixed;left:0;top:0;width:180px;height:180px;pointer-events:none;" +
      "z-index:2147483002;will-change:transform;mix-blend-mode:screen;";
    document.body.appendChild(lcv);
    lctx = lcv.getContext("2d");
    return lcv;
  }

  // armed = the pointer is in your hand. left click toggles the beam,
  // exactly like the button on a real laser pointer.
  var armed = false;
  window.addEventListener("pointerdown", function (e) {
    if (!armed) return;
    if (e.button === 2) {           // right button stows it, before any menu opens
      armed = false; laserOff(true);
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      return;
    }
    if (e.button !== 0) return;
    var t = e.target;
    if (t && t.closest && t.closest("input,textarea,button,a,select,[contenteditable],[data-desk-pet-menu]")) return;
    if (laser.on) laserOff(true); else laserOn(true);
  }, true);
  // right click while the pointer is in your hand = put it away
  window.addEventListener("contextmenu", function (e) {
    if (!armed) return;
    armed = false;
    laserOff(true);
    e.preventDefault(); e.stopPropagation();
  }, true);
  window.addEventListener("keydown", function (e) {
    if (e.key === "Escape" && armed) { armed = false; laserOff(true); }
  }, true);

  function laserOn(keepArmed) {
    laserCanvas();
    if (!keepArmed) armed = true;
    laser.on = true;
    lcv.style.display = "block";
    laser.x = laser.tx = mouse.has ? mouse.x : window.innerWidth / 2;
    laser.y = laser.ty = mouse.has ? mouse.y : window.innerHeight / 2;
    laser.idle = 0; laser.dartT = 0;
  }
  function laserOff(keepArmed) {
    if (!keepArmed) armed = false;
    laser.on = false;
    if (lcv) lcv.style.display = "none";
  }

  function stepLaser(dt) {
    if (!laser.on) return;
    var now = performance.now();
    var live = mouse.has && (now - mouse.moved) < 900;

    if (live) {
      laser.tx = mouse.x; laser.ty = mouse.y;
      laser.idle = 0;
    } else {
      // no cursor movement — the dot goes hunting on its own in short darts
      laser.idle += dt;
      laser.dartT -= dt;
      if (laser.dartT <= 0) {
        laser.dartT = 0.35 + Math.random() * 0.8;
        var m = 70;
        laser.tx = m + Math.random() * (window.innerWidth - m * 2);
        laser.ty = window.innerHeight - 40 - Math.random() * Math.min(300, window.innerHeight * 0.45);
      }
    }

    // snappy chase with overshoot, then high-frequency hand tremor on top
    var k = live ? 26 : 13;
    laser.x += (laser.tx - laser.x) * Math.min(1, dt * k);
    laser.y += (laser.ty - laser.y) * Math.min(1, dt * k);
    laser.phase += dt;
    var t = laser.phase;
    laser.jx = Math.sin(t * 37.1) * 1.9 + Math.sin(t * 13.3) * 1.1;
    laser.jy = Math.cos(t * 41.7) * 1.9 + Math.cos(t * 11.9) * 1.1;
    laser.pulse = 0.82 + Math.sin(t * 24) * 0.18;
  }

  function drawLaser() {
    if (!laser.on || !lctx) return;
    var c = lctx, W = 180, H = 180, cx = W / 2, cy = H / 2;
    c.clearRect(0, 0, W, H);

    var px = laser.x + laser.jx, py = laser.y + laser.jy;
    var amp = laser.pulse;

    // soft floor scatter — the dot sits on a surface, so it smears sideways
    c.save();
    c.globalCompositeOperation = "lighter";
    var floor = c.createRadialGradient(cx, cy, 0, cx, cy, 34);
    floor.addColorStop(0, "rgba(255,40,50," + (0.30 * amp).toFixed(3) + ")");
    floor.addColorStop(0.45, "rgba(220,20,40," + (0.12 * amp).toFixed(3) + ")");
    floor.addColorStop(1, "rgba(180,0,30,0)");
    c.fillStyle = floor;
    c.save(); c.translate(cx, cy); c.scale(1.7, 0.62); c.translate(-cx, -cy);
    c.beginPath(); c.arc(cx, cy, 34, 0, 6.2832); c.fill();
    c.restore();

    // main bloom
    var bloom = c.createRadialGradient(cx, cy, 0, cx, cy, 20);
    bloom.addColorStop(0, "rgba(255,190,190," + (0.95 * amp).toFixed(3) + ")");
    bloom.addColorStop(0.18, "rgba(255,60,60," + (0.75 * amp).toFixed(3) + ")");
    bloom.addColorStop(0.55, "rgba(230,10,40," + (0.22 * amp).toFixed(3) + ")");
    bloom.addColorStop(1, "rgba(200,0,30,0)");
    c.fillStyle = bloom;
    c.beginPath(); c.arc(cx, cy, 20, 0, 6.2832); c.fill();

    // chromatic fringe — cheap trick, reads as real optics
    c.globalAlpha = 0.5 * amp;
    c.fillStyle = "rgba(255,120,40,0.5)";
    c.beginPath(); c.arc(cx - 1.2, cy, 4.4, 0, 6.2832); c.fill();
    c.fillStyle = "rgba(255,40,140,0.45)";
    c.beginPath(); c.arc(cx + 1.2, cy, 4.4, 0, 6.2832); c.fill();
    c.globalAlpha = 1;

    // hot core
    c.fillStyle = "rgba(255,245,245," + (0.98 * amp).toFixed(3) + ")";
    c.beginPath(); c.arc(cx, cy, 2.5, 0, 6.2832); c.fill();

    // laser speckle — the grainy shimmer a real dot has
    for (var i = 0; i < 12; i++) {
      var a = laser.phase * 9 + i * 2.1;
      var r = 3 + ((i * 3.7 + laser.phase * 5) % 9);
      c.globalAlpha = 0.13 + ((i * 13 + (laser.phase * 60 | 0)) % 7) * 0.035;
      c.fillStyle = "#ff6a6a";
      c.fillRect(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 1.4, 1.4);
    }
    c.globalAlpha = 1;
    c.restore();

    lcv.style.transform = "translate3d(" + (px - cx).toFixed(1) + "px," + (py - cy).toFixed(1) + "px,0)";
  }

  /* ------------------------------------------------------------------ *
   *  physics + render loop (one for the whole world)
   * ------------------------------------------------------------------ */
  var last = performance.now();
  function tick(now) {
    var dt = Math.min(0.033, (now - last) / 1000); last = now;
    var fY = window.innerHeight - 34 + 18;

    for (var i = items.length - 1; i >= 0; i--) {
      var it = items[i];
      if (it.cool > 0) it.cool -= dt;
      if (it === drag.item) { it.rot += dt * 6; }
      else {
        it.life -= dt;
        if (it.life <= 0) { remove(it); continue; }
        it.vy += 2400 * dt;
        it.x += it.vx * dt; it.y += it.vy * dt;
        it.rot += it.angVel * dt;
        if (it.x < 18) { it.x = 18; it.vx = Math.abs(it.vx) * 0.6; it.angVel *= -0.6; }
        if (it.x > window.innerWidth - 18) { it.x = window.innerWidth - 18; it.vx = -Math.abs(it.vx) * 0.6; it.angVel *= -0.6; }
        if (it.y >= fY) {
          it.y = fY;
          if (it.vy > 120) { it.vy = -it.vy * 0.42; it.vx *= 0.82; }
          else { it.vy = 0; it.vx *= 0.92; it.angVel = it.vx / 40; }
        }
      }
      var fade = it.life < 3 ? (it.life / 3) : 1;
      it.el.style.opacity = fade.toFixed(2);
      it.el.style.transform =
        "translate3d(" + (it.x - 20).toFixed(1) + "px," + (it.y - 20).toFixed(1) + "px,0) rotate(" + it.rot.toFixed(2) + "rad)";
    }

    stepLaser(dt);
    drawLaser();
    requestAnimationFrame(tick);
  }
  requestAnimationFrame(tick);

  window.__deskPetWorld = {
    spawn: spawn,
    remove: remove,
    clearAll: clearAll,
    nearest: nearest,
    nearestFood: nearestFood,
    swat: swat,
    bite: bite,
    count: function () { return items.length; },
    dragging: function (it) { return drag.item === it; },
    laserOn: laserOn,
    laserOff: laserOff,
    laserActive: function () { return laser.on; },
    laserPos: function () { return { x: laser.x + laser.jx, y: laser.y + laser.jy }; },
  };
})();
