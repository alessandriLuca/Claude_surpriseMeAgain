// Valdombra — utility: seeded RNG, noise, math helpers
(function () {
  const U = {};
  U.mulberry32 = function (seed) {
    let a = seed >>> 0;
    return function () {
      a |= 0; a = (a + 0x6D2B79F5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  };
  // 2D value noise with smooth interpolation
  const perm = new Uint8Array(512);
  (function () {
    const r = U.mulberry32(1337);
    const p = Array.from({ length: 256 }, (_, i) => i);
    for (let i = 255; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [p[i], p[j]] = [p[j], p[i]]; }
    for (let i = 0; i < 512; i++) perm[i] = p[i & 255];
  })();
  const grad = (h, x, y) => { const g = h & 7; const u = g < 4 ? x : y, v = g < 4 ? y : x; return ((g & 1) ? -u : u) + ((g & 2) ? -2 * v : 2 * v); };
  const fade = t => t * t * t * (t * (t * 6 - 15) + 10);
  U.noise = function (x, y) { // perlin-ish, ~[-1,1]
    const X = Math.floor(x) & 255, Y = Math.floor(y) & 255;
    x -= Math.floor(x); y -= Math.floor(y);
    const u = fade(x), v = fade(y);
    const a = perm[X] + Y, b = perm[X + 1] + Y;
    const l = (t, p, q) => p + t * (q - p);
    return l(v, l(u, grad(perm[a], x, y), grad(perm[b], x - 1, y)), l(u, grad(perm[a + 1], x, y - 1), grad(perm[b + 1], x - 1, y - 1))) * 0.25;
  };
  U.fbm = function (x, y, oct = 4) {
    let s = 0, a = 1, f = 1, n = 0;
    for (let i = 0; i < oct; i++) { s += U.noise(x * f, y * f) * a; n += a; a *= 0.5; f *= 2; }
    return s / n;
  };
  U.clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  U.lerp = (a, b, t) => a + (b - a) * t;
  U.smooth = (a, b, v) => { const t = U.clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  U.dist2 = (ax, az, bx, bz) => Math.hypot(ax - bx, az - bz);
  U.angleLerp = (a, b, t) => { let d = b - a; while (d > Math.PI) d -= Math.PI * 2; while (d < -Math.PI) d += Math.PI * 2; return a + d * t; };
  U.segDist = function (px, pz, ax, az, bx, bz) {
    const dx = bx - ax, dz = bz - az; const l = dx * dx + dz * dz || 1;
    let t = ((px - ax) * dx + (pz - az) * dz) / l; t = U.clamp(t, 0, 1);
    return Math.hypot(ax + t * dx - px, az + t * dz - pz);
  };
  U.pick = (arr, r = Math.random) => arr[Math.floor(r() * arr.length)];
  U.store = {
    get(k, d) { try { const v = localStorage.getItem(k); return v == null ? d : JSON.parse(v); } catch (e) { return d; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* storage unavailable */ } },
    del(k) { try { localStorage.removeItem(k); } catch (e) { /* noop */ } },
  };
  window.U = U;
})();
