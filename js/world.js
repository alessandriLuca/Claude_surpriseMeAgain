// Valdombra — world: terrain, sky, vegetation, village, ruins, lake, lighthouse, colliders.
(function () {
  const W = {};
  const SIZE = 440, HALF = SIZE / 2, SEG = 220;
  W.SIZE = SIZE; W.HALF = HALF;
  W.WATER = 0.0;

  W.places = {
    village: { x: 0, z: 0, r: 46, name: 'Valdombra' },
    forest: { x: -110, z: -100, r: 75, name: 'Bosco Sussurrante' },
    ruins: { x: 120, z: 35, r: 40, name: 'Rovine di Aurelia' },
    lake: { x: -100, z: 95, r: 55, name: 'Lago delle Nebbie' },
    lair: { x: -158, z: 112, r: 18, name: 'Tana del Golem' },
    faro: { x: 110, z: -130, r: 30, name: 'Colle del Faro' },
    cross: { x: 42, z: -42, r: 10, name: 'Il Crocevia' },
  };

  W.paths = [
    [[0, 0], [-40, -30], [-80, -70], [-112, -98]],
    [[0, 0], [50, 12], [92, 26], [120, 35]],
    [[0, 0], [-38, 40], [-72, 70]],
    [[0, 0], [42, -42], [80, -96], [104, -124]],
  ];

  function pathDist(x, z) {
    let d = 1e9;
    for (const p of W.paths) for (let i = 0; i < p.length - 1; i++) d = Math.min(d, U.segDist(x, z, p[i][0], p[i][1], p[i + 1][0], p[i + 1][1]));
    return d;
  }
  W.pathDist = pathDist;

  W.height = function (x, z) {
    let h = U.fbm(x * 0.011 + 3.1, z * 0.011 - 1.7, 4) * 12 + U.fbm(x * 0.06, z * 0.06, 2) * 1.2 + 3;
    const r = Math.hypot(x, z);
    h += U.smooth(165, 215, r) * (34 + U.fbm(x * 0.03, z * 0.03, 3) * 20);
    const df = Math.hypot(x - 110, z + 130);
    h += 26 * Math.exp(-(df / 36) * (df / 36));
    const dl = Math.hypot(x + 100, z - 95);
    h = U.lerp(h, -7, 1 - U.smooth(28, 58, dl));
    h = U.lerp(h, 2.2, 1 - U.smooth(30, 48, r));
    const dr = Math.hypot(x - 120, z - 35);
    h = U.lerp(h, 4 + U.fbm(x * 0.05, z * 0.05) * 0.6, 1 - U.smooth(22, 36, dr));
    const dlair = Math.hypot(x + 158, z - 112);
    h = U.lerp(h, 1.6, 1 - U.smooth(12, 20, dlair));
    // gently carve paths
    const pd = pathDist(x, z);
    if (pd < 5) h -= (1 - pd / 5) * 0.35;
    return h;
  };

  W.zoneAt = function (x, z) {
    let best = null, bd = 1e9;
    for (const k in W.places) {
      const p = W.places[k]; const d = Math.hypot(x - p.x, z - p.z);
      if (d < p.r && d / p.r < bd) { bd = d / p.r; best = k; }
    }
    return best;
  };

  // ------------------------------------------------------------ colliders (spatial hash)
  const CELL = 8;
  const grid = new Map();
  W.colliders = [];
  function key(cx, cz) { return cx * 10007 + cz; }
  function addCol(c) {
    W.colliders.push(c);
    const r = c.type === 'circle' ? c.r : Math.hypot(c.hw, c.hd);
    for (let cx = Math.floor((c.x - r) / CELL); cx <= Math.floor((c.x + r) / CELL); cx++)
      for (let cz = Math.floor((c.z - r) / CELL); cz <= Math.floor((c.z + r) / CELL); cz++) {
        const k = key(cx, cz); if (!grid.has(k)) grid.set(k, []); grid.get(k).push(c);
      }
  }
  W.addCircle = (x, z, r) => addCol({ type: 'circle', x, z, r });
  W.addBox = (x, z, hw, hd, rot) => addCol({ type: 'box', x, z, hw, hd, rot: rot || 0, c: Math.cos(rot || 0), s: Math.sin(rot || 0) });

  // push a circle (x,z,r) out of static colliders; returns {x,z}
  W.resolve = function (x, z, r) {
    const cx = Math.floor(x / CELL), cz = Math.floor(z / CELL);
    const seen = new Set();
    for (let ix = cx - 1; ix <= cx + 1; ix++) for (let iz = cz - 1; iz <= cz + 1; iz++) {
      const list = grid.get(key(ix, iz)); if (!list) continue;
      for (const c of list) {
        if (seen.has(c)) continue; seen.add(c);
        if (c.type === 'circle') {
          const dx = x - c.x, dz = z - c.z, d = Math.hypot(dx, dz), m = r + c.r;
          if (d < m && d > 1e-4) { x = c.x + dx / d * m; z = c.z + dz / d * m; }
        } else {
          // to local
          const dx = x - c.x, dz = z - c.z;
          const lx = dx * c.c + dz * c.s, lz = -dx * c.s + dz * c.c;
          const qx = U.clamp(lx, -c.hw, c.hw), qz = U.clamp(lz, -c.hd, c.hd);
          let ex = lx - qx, ez = lz - qz, d = Math.hypot(ex, ez);
          if (d < r) {
            let nlx, nlz;
            if (d > 1e-4) { nlx = qx + ex / d * r; nlz = qz + ez / d * r; }
            else { // inside: push along smallest axis
              const px = c.hw - Math.abs(lx), pz = c.hd - Math.abs(lz);
              if (px < pz) { nlx = Math.sign(lx || 1) * (c.hw + r); nlz = lz; } else { nlx = lx; nlz = Math.sign(lz || 1) * (c.hd + r); }
            }
            x = c.x + nlx * c.c - nlz * c.s; z = c.z + nlx * c.s + nlz * c.c;
          }
        }
      }
    }
    // world bounds
    const rr = Math.hypot(x, z);
    if (rr > 200) { x *= 200 / rr; z *= 200 / rr; }
    return { x, z };
  };

  // ------------------------------------------------------------ build
  W.build = function (scene) {
    W.scene = scene;
    W.animated = [];
    buildSky(scene);
    buildTerrain(scene);
    buildWater(scene);
    buildVegetation(scene);
    buildVillage(scene);
    buildRuins(scene);
    buildLair(scene);
    buildFaro(scene);
    buildCrossroads(scene);
    buildFireflies(scene);
  };

  // ------------------------------------------------------------ sky
  function buildSky(scene) {
    const geo = new THREE.SphereGeometry(900, 32, 16);
    W.skyUniforms = {
      top: { value: new THREE.Color(0x060a1c) },
      mid: { value: new THREE.Color(0x1a1f3c) },
      bottom: { value: new THREE.Color(0x2a2236) },
      sunDir: { value: new THREE.Vector3(0, -0.3, -1).normalize() },
      sunCol: { value: new THREE.Color(0x000000) },
    };
    const mat = new THREE.ShaderMaterial({
      uniforms: W.skyUniforms, side: THREE.BackSide, depthWrite: false, fog: false,
      vertexShader: 'varying vec3 vP; void main(){ vP = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0);} ',
      fragmentShader: [
        'uniform vec3 top; uniform vec3 mid; uniform vec3 bottom; uniform vec3 sunDir; uniform vec3 sunCol; varying vec3 vP;',
        'void main(){ float h = vP.y; vec3 c = h>0.0 ? mix(mid, top, pow(h,0.6)) : mix(mid, bottom, pow(-h,0.5));',
        ' float s = max(dot(vP, sunDir),0.0); c += sunCol*pow(s,8.0)*0.8 + sunCol*pow(s,200.0)*2.0;',
        ' gl_FragColor = vec4(c,1.0);}',
      ].join('\n'),
    });
    W.sky = new THREE.Mesh(geo, mat);
    scene.add(W.sky);
    // stars
    const n = 1800, pos = new Float32Array(n * 3);
    const r = U.mulberry32(7);
    for (let i = 0; i < n; i++) {
      const th = r() * Math.PI * 2, ph = Math.acos(r() * 0.95);
      pos[i * 3] = Math.sin(ph) * Math.cos(th) * 850; pos[i * 3 + 1] = Math.cos(ph) * 850; pos[i * 3 + 2] = Math.sin(ph) * Math.sin(th) * 850;
    }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    W.stars = new THREE.Points(sg, new THREE.PointsMaterial({ color: 0xdfe6ff, size: 2.2, sizeAttenuation: false, fog: false, transparent: true }));
    scene.add(W.stars);
    // moon
    const cv = document.createElement('canvas'); cv.width = cv.height = 128;
    const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 10, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,250,230,1)'); gr.addColorStop(0.35, 'rgba(240,235,210,1)'); gr.addColorStop(0.42, 'rgba(180,190,255,0.35)'); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    g.fillStyle = 'rgba(160,160,150,0.35)';
    [[50, 52, 8], [74, 70, 6], [60, 80, 4]].forEach(([x, y, rr]) => { g.beginPath(); g.arc(x, y, rr, 0, 7); g.fill(); });
    const tex = new THREE.CanvasTexture(cv);
    W.moon = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, fog: false, depthWrite: false, transparent: true }));
    W.moon.scale.set(140, 140, 1); W.moon.position.set(-300, 420, -500);
    scene.add(W.moon);
  }

  // ------------------------------------------------------------ terrain
  function buildTerrain(scene) {
    const geo = new THREE.PlaneGeometry(SIZE, SIZE, SEG, SEG);
    geo.rotateX(-Math.PI / 2);
    const pos = geo.attributes.position;
    const col = new Float32Array(pos.count * 3);
    const c = new THREE.Color();
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i), z = pos.getZ(i);
      const h = W.height(x, z);
      pos.setY(i, h);
      const e = 1.2;
      const slope = Math.hypot(W.height(x + e, z) - W.height(x - e, z), W.height(x, z + e) - W.height(x, z - e)) / (2 * e);
      const n = U.fbm(x * 0.08, z * 0.08, 2);
      const forest = 1 - U.smooth(40, 80, Math.hypot(x - W.places.forest.x, z - W.places.forest.z));
      c.setRGB(0.15 + n * 0.05, 0.27 + n * 0.08 - forest * 0.06, 0.15 + forest * 0.03);
      const pd = pathDist(x, z);
      if (pd < 3.2) c.lerp(new THREE.Color(0.38, 0.3, 0.21), 1 - U.smooth(1.6, 3.2, pd));
      if (Math.hypot(x, z) < 14) c.lerp(new THREE.Color(0.36, 0.34, 0.32), 1 - U.smooth(9, 14, Math.hypot(x, z))); // piazza
      if (h < 1.4) c.lerp(new THREE.Color(0.48, 0.44, 0.34), U.smooth(1.4, 0.2, h));
      if (h < -1) c.lerp(new THREE.Color(0.2, 0.24, 0.26), U.smooth(-1, -4, h));
      if (slope > 0.7 || h > 22) c.lerp(new THREE.Color(0.36, 0.36, 0.38), U.smooth(0.7, 1.1, slope) * 0.9 + U.smooth(22, 30, h) * 0.6);
      const ruin = 1 - U.smooth(18, 30, Math.hypot(x - 120, z - 35));
      if (ruin > 0) c.lerp(new THREE.Color(0.32, 0.31, 0.27), ruin * 0.5);
      col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    geo.computeVertexNormals();
    const mat = new THREE.MeshLambertMaterial({ vertexColors: true });
    W.terrain = new THREE.Mesh(geo, mat);
    W.terrain.receiveShadow = true;
    scene.add(W.terrain);
    W.terrainColors = col;
  }

  function buildWater(scene) {
    const geo = new THREE.CircleGeometry(64, 64);
    geo.rotateX(-Math.PI / 2);
    const mat = new THREE.MeshPhongMaterial({ color: 0x1b3a52, emissive: 0x06121c, specular: 0x8899cc, shininess: 90, transparent: true, opacity: 0.82 });
    W.water = new THREE.Mesh(geo, mat);
    W.water.position.set(-100, W.WATER, 95);
    scene.add(W.water);
    // dock
    const wood = new THREE.MeshLambertMaterial({ color: 0x5a4030 });
    const dock = new THREE.Group();
    const plank = new THREE.Mesh(new THREE.BoxGeometry(3, 0.3, 14), wood);
    plank.position.set(0, 0.6, 0); dock.add(plank);
    for (let i = -1; i <= 1; i += 2) for (let j = 0; j < 3; j++) {
      const post = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 3), wood);
      post.position.set(i * 1.3, -0.6, -6 + j * 6); dock.add(post);
    }
    dock.position.set(-66, 0, 66); dock.rotation.y = -Math.PI / 4;
    scene.add(dock);
    W.dock = { x: -71, z: 71 };
  }

  // ------------------------------------------------------------ vegetation
  function buildVegetation(scene) {
    const r = U.mulberry32(42);
    const pines = [], oaks = [], rocks = [], bushes = [];
    for (let i = 0; i < 5200; i++) {
      const x = (r() * 2 - 1) * 205, z = (r() * 2 - 1) * 205;
      const rr = Math.hypot(x, z); if (rr > 205) continue;
      const h = W.height(x, z);
      if (h < 1.2) continue;
      const dForest = Math.hypot(x - W.places.forest.x, z - W.places.forest.z);
      let dens = 0.06 + (1 - U.smooth(30, 85, dForest)) * 0.6 + U.smooth(150, 190, rr) * 0.25;
      if (rr < 52) dens = rr < 46 ? 0 : 0.03;
      if (pathDist(x, z) < 5) dens = 0;
      if (Math.hypot(x - 120, z - 35) < 34) dens = 0.01;
      if (Math.hypot(x - 110, z + 130) < 20) dens = 0;
      if (Math.hypot(x - 42, z + 42) < 10) dens = 0;
      if (Math.hypot(x + 158, z - 112) < 22) dens = 0;
      if (h > 30) dens *= 0.3;
      if (U.fbm(x * 0.04 + 9, z * 0.04, 2) < -0.1) dens *= 0.4;
      if (r() < dens) {
        const s = 0.8 + r() * 0.8;
        (r() < 0.65 ? pines : oaks).push({ x, z, y: h, s, rot: r() * 6.28 });
      } else if (r() < 0.012 && rr < 200) rocks.push({ x, z, y: h, s: 0.6 + r() * 1.8, rot: r() * 6.28 });
      else if (r() < 0.03 && rr > 46) bushes.push({ x, z, y: h, s: 0.5 + r() * 0.6, rot: r() * 6.28 });
    }
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), sc = new THREE.Vector3(), p = new THREE.Vector3(), up = new THREE.Vector3(0, 1, 0);
    function inst(geo, mat, list, f, shadow) {
      const mesh = new THREE.InstancedMesh(geo, mat, list.length);
      list.forEach((t, i) => {
        const o = f(t);
        q.setFromAxisAngle(up, t.rot); sc.set(o.sx, o.sy, o.sz); p.set(t.x, t.y + o.dy, t.z);
        m4.compose(p, q, sc); mesh.setMatrixAt(i, m4);
        if (o.color) mesh.setColorAt(i, o.color);
      });
      mesh.castShadow = !!shadow; mesh.receiveShadow = true;
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
      scene.add(mesh); return mesh;
    }
    const trunkMat = new THREE.MeshLambertMaterial({ color: 0x3d2c22 });
    const pineMat = new THREE.MeshLambertMaterial({ color: 0xffffff });
    const tc = new THREE.Color();
    inst(new THREE.CylinderGeometry(0.25, 0.4, 3, 6), trunkMat, pines, t => ({ sx: t.s, sy: t.s, sz: t.s, dy: 1.5 * t.s }), true);
    inst(new THREE.ConeGeometry(2.2, 4.5, 7), pineMat, pines, t => ({ sx: t.s, sy: t.s, sz: t.s, dy: 4.2 * t.s, color: tc.setHSL(0.36 + r() * 0.06, 0.45, 0.13 + r() * 0.06).clone() }), true);
    inst(new THREE.ConeGeometry(1.6, 3.4, 7), pineMat, pines, t => ({ sx: t.s, sy: t.s, sz: t.s, dy: 6.4 * t.s, color: tc.setHSL(0.35 + r() * 0.06, 0.45, 0.15 + r() * 0.06).clone() }), true);
    inst(new THREE.CylinderGeometry(0.35, 0.55, 3.4, 6), trunkMat, oaks, t => ({ sx: t.s, sy: t.s, sz: t.s, dy: 1.7 * t.s }), true);
    inst(new THREE.IcosahedronGeometry(2.6, 0), pineMat, oaks, t => ({ sx: t.s * 1.1, sy: t.s * 0.9, sz: t.s * 1.1, dy: 4.6 * t.s, color: tc.setHSL(0.24 + r() * 0.08, 0.4, 0.14 + r() * 0.06).clone() }), true);
    inst(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshLambertMaterial({ color: 0x5a5a60 }), rocks, t => ({ sx: t.s * 1.3, sy: t.s * 0.8, sz: t.s, dy: t.s * 0.25 }), true);
    inst(new THREE.IcosahedronGeometry(1, 0), pineMat, bushes, t => ({ sx: t.s * 1.4, sy: t.s, sz: t.s * 1.4, dy: t.s * 0.4, color: tc.setHSL(0.3, 0.4, 0.12 + r() * 0.05).clone() }), false);
    pines.forEach(t => W.addCircle(t.x, t.z, 0.5 * t.s));
    oaks.forEach(t => W.addCircle(t.x, t.z, 0.6 * t.s));
    rocks.forEach(t => { if (t.s > 1) W.addCircle(t.x, t.z, t.s * 1.1); });
    W.treeCount = pines.length + oaks.length;
  }

  // ------------------------------------------------------------ helpers for structures
  const mats = {};
  function mat(name, opts) { if (!mats[name]) mats[name] = new THREE.MeshLambertMaterial(opts); return mats[name]; }
  function box(w, h, d, m, x, y, z, parent) {
    const b = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m); b.position.set(x, y, z);
    b.castShadow = true; b.receiveShadow = true; (parent || W.scene).add(b); return b;
  }
  W.box = box; W.mat = mat;

  function lanternPost(x, z, color, intensity) {
    const y = W.height(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z);
    box(0.2, 3.4, 0.2, mat('darkwood', { color: 0x2a2018 }), 0, 1.7, 0, g);
    box(0.9, 0.12, 0.12, mat('darkwood'), 0.35, 3.3, 0, g);
    const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.5, 0.4), new THREE.MeshBasicMaterial({ color: color || 0xffb050 }));
    lamp.position.set(0.7, 2.95, 0); g.add(lamp);
    W.scene.add(g);
    W.addCircle(x, z, 0.3);
    if (intensity !== 0) {
      const l = new THREE.PointLight(color || 0xffa040, intensity || 1.3, 18, 2);
      l.position.set(x + 0.7, y + 2.9, z); W.scene.add(l);
      W.animated.push({ type: 'flicker', light: l, base: l.intensity, seed: Math.random() * 100 });
    }
    return g;
  }

  function house(x, z, rot, w, d, opts = {}) {
    const y = W.height(x, z) - 0.2;
    const g = new THREE.Group(); g.position.set(x, y, z); g.rotation.y = rot;
    const wallM = mat('wall' + (opts.wall || 0), { color: opts.wall || 0x8a7a66 });
    const roofM = mat('roof' + (opts.roof || 0), { color: opts.roof || 0x5a2a22 });
    const h = opts.h || 4.2;
    box(w, h, d, wallM, 0, h / 2, 0, g);
    // beams
    const beam = mat('beam', { color: 0x3a2a1e });
    box(w + 0.1, 0.3, d + 0.1, beam, 0, 0.15, 0, g);
    box(w + 0.1, 0.3, d + 0.1, beam, 0, h, 0, g);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.35, h, 0.35, beam, sx * w / 2, h / 2, sz * d / 2, g);
    // roof (4-sided pyramid stretched)
    const roof = new THREE.Mesh(new THREE.ConeGeometry(1, 1, 4), roofM);
    roof.rotation.y = Math.PI / 4; roof.scale.set(w * 0.78, opts.roofH || 3.2, d * 0.78);
    roof.position.y = h + (opts.roofH || 3.2) / 2; roof.castShadow = true; g.add(roof);
    // door facing +z local
    box(1.3, 2.3, 0.15, mat('door', { color: 0x2e1e14 }), 0, 1.15, d / 2 + 0.05, g);
    // windows (glowing)
    const win = new THREE.MeshBasicMaterial({ color: opts.dark ? 0x1a1a22 : 0xffc070 });
    for (const sx of [-1, 1]) { const wm = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), win); wm.position.set(sx * w * 0.3, 2.6, d / 2 + 0.06); g.add(wm); }
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.9), win); sw.position.set(w / 2 + 0.06, 2.6, 0); sw.rotation.y = Math.PI / 2; g.add(sw);
    // chimney
    if (opts.chimney) box(0.8, 2.5, 0.8, mat('stone', { color: 0x6a6460 }), w * 0.25, h + 2.2, -d * 0.2, g);
    W.scene.add(g);
    W.addBox(x, z, w / 2 + 0.2, d / 2 + 0.2, -rot);
    return g;
  }
  W.house = house;

  // ------------------------------------------------------------ village
  function buildVillage(scene) {
    const stone = mat('stone', { color: 0x6a6460 });
    // central plaza: the Great Lantern
    const y0 = W.height(0, 0);
    const ped = new THREE.Group(); ped.position.set(0, y0, 0);
    box(4, 0.6, 4, stone, 0, 0.3, 0, ped);
    box(2.8, 0.6, 2.8, stone, 0, 0.9, 0, ped);
    box(1.2, 2.6, 1.2, mat('stone2', { color: 0x585350 }), 0, 2.5, 0, ped);
    const cage = new THREE.Mesh(new THREE.OctahedronGeometry(1.1, 0), new THREE.MeshLambertMaterial({ color: 0x2c2c34, wireframe: true }));
    cage.position.y = 4.8; ped.add(cage);
    W.lanternCrystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.7, 0), new THREE.MeshLambertMaterial({ color: 0x3a3a48, emissive: 0x000000 }));
    W.lanternCrystal.position.y = 4.8; ped.add(W.lanternCrystal);
    W.lanternEmbers = [];
    for (let i = 0; i < 3; i++) {
      const a = i / 3 * Math.PI * 2;
      const em = new THREE.Mesh(new THREE.SphereGeometry(0.22, 8, 6), new THREE.MeshBasicMaterial({ color: 0x302820 }));
      em.position.set(Math.cos(a) * 1.7, 1.35, Math.sin(a) * 1.7); ped.add(em); W.lanternEmbers.push(em);
    }
    scene.add(ped);
    W.addBox(0, 0, 2.2, 2.2, 0);
    W.lanternLight = new THREE.PointLight(0xffd080, 0, 40, 1.6); W.lanternLight.position.set(0, y0 + 5, 0); scene.add(W.lanternLight);
    W.animated.push({ type: 'spin', obj: cage, speed: 0.3 });

    // houses in a ring facing center
    const houses = [
      { a: 0.3, r: 24, w: 7, d: 6, opts: { chimney: true } },
      { a: 1.25, r: 26, w: 6, d: 6, opts: { roof: 0x3e3a2a } },
      { a: 2.2, r: 25, w: 8, d: 6, opts: { chimney: true, wall: 0x7a6e60 } },
      { a: 3.3, r: 26, w: 6, d: 7, opts: { roof: 0x4a2a30, dark: true } },
      { a: 4.1, r: 24, w: 7, d: 6, opts: { chimney: true } },
      { a: 5.3, r: 27, w: 6, d: 5, opts: { roof: 0x2e3a3a } },
    ];
    W.houseSpots = [];
    for (const h of houses) {
      const x = Math.cos(h.a) * h.r, z = Math.sin(h.a) * h.r;
      const rot = Math.atan2(-x, -z); // door faces center
      house(x, z, rot, h.w, h.d, h.opts);
      W.houseSpots.push({ x, z, rot });
    }
    // chapel for Fra' Tobia (north-west of plaza)
    const cx = -14, cz = -16;
    const chapel = house(cx, cz, Math.atan2(-cx, -cz), 6, 9, { h: 6, roofH: 5, wall: 0x9a9286, roof: 0x3a3a46 });
    const bell = box(1.2, 4, 1.2, mat('stone'), 0, 9, -3, chapel); void bell;

    // forge (Bruno) with glowing fire
    const fx = 18, fz = 12;
    const fy = W.height(fx, fz);
    const forge = new THREE.Group(); forge.position.set(fx, fy, fz); forge.rotation.y = Math.atan2(-fx, -fz);
    box(5, 0.3, 4, stone, 0, 0.15, 0, forge);
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) box(0.3, 3.4, 0.3, mat('beam'), sx * 2.3, 1.7, sz * 1.8, forge);
    const roof = box(5.6, 0.25, 4.6, mat('roof0', { color: 0x5a2a22 }), 0, 3.5, 0, forge); roof.rotation.x = 0.12;
    box(1.6, 1.1, 1.4, stone, -1.2, 0.85, -0.8, forge);
    const fire = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.3, 1.0), new THREE.MeshBasicMaterial({ color: 0xff6a20 }));
    fire.position.set(-1.2, 1.45, -0.8); forge.add(fire);
    const anvil = box(1, 0.5, 0.5, mat('iron', { color: 0x30343a }), 1.0, 0.9, 0.4, forge); void anvil;
    box(0.5, 0.6, 0.4, mat('iron'), 1.0, 0.4, 0.4, forge);
    scene.add(forge);
    W.addBox(fx, fz, 2.6, 2.1, -forge.rotation.y);
    const fl = new THREE.PointLight(0xff6a20, 1.8, 16, 2); fl.position.set(fx, fy + 2, fz); scene.add(fl);
    W.animated.push({ type: 'flicker', light: fl, base: 1.8, seed: 3 });

    // herbalist hut (Elda) - round hut with plants
    const ex = -20, ez = 14;
    const ey = W.height(ex, ez);
    const hut = new THREE.Group(); hut.position.set(ex, ey, ez);
    const walls = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.4, 3.4, 10), mat('mud', { color: 0x7a6a50 })); walls.position.y = 1.7; walls.castShadow = true; hut.add(walls);
    const thatch = new THREE.Mesh(new THREE.ConeGeometry(4.2, 3.4, 10), mat('thatch', { color: 0x8a7a40 })); thatch.position.y = 5.0; thatch.castShadow = true; hut.add(thatch);
    const hw = new THREE.Mesh(new THREE.PlaneGeometry(0.8, 0.8), new THREE.MeshBasicMaterial({ color: 0x9aff9a })); hw.position.set(0, 2.2, 3.35); hut.add(hw);
    hut.rotation.y = Math.atan2(-ex, -ez);
    scene.add(hut);
    W.addCircle(ex, ez, 3.5);
    for (let i = 0; i < 9; i++) { // planters
      const a = i * 0.7 + 0.5, px = ex + Math.cos(a) * 5, pz = ez + Math.sin(a) * 5;
      const pl = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), mat('herb', { color: 0x3a6a3a })); pl.position.set(px, W.height(px, pz) + 0.3, pz); scene.add(pl);
    }

    // well with Ottone
    const wx = 8, wz = -8;
    const wy = W.height(wx, wz);
    const well = new THREE.Group(); well.position.set(wx, wy, wz);
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.4, 1.1, 12, 1, true), stone); ring.position.y = 0.55; ring.material.side = THREE.DoubleSide; well.add(ring);
    const water = new THREE.Mesh(new THREE.CircleGeometry(1.2, 12), new THREE.MeshBasicMaterial({ color: 0x0a1a2a })); water.rotation.x = -Math.PI / 2; water.position.y = 0.3; well.add(water);
    for (const s of [-1, 1]) box(0.15, 2.4, 0.15, mat('beam'), s * 1.2, 1.2, 0, well);
    box(2.6, 0.15, 0.2, mat('beam'), 0, 2.4, 0, well);
    const wroof = new THREE.Mesh(new THREE.ConeGeometry(1.8, 1, 4), mat('roof0')); wroof.position.y = 2.9; wroof.rotation.y = Math.PI / 4; well.add(wroof);
    scene.add(well);
    W.addCircle(wx, wz, 1.5);
    W.wellTop = { x: wx, y: wy + 1.15, z: wz };

    // market stall + barrels + fences
    const sx = -6, sz = 20;
    const stall = new THREE.Group(); stall.position.set(sx, W.height(sx, sz), sz);
    box(3.5, 1, 1.5, mat('beam'), 0, 0.5, 0, stall);
    for (const a of [-1, 1]) box(0.15, 2.8, 0.15, mat('beam'), a * 1.6, 1.4, -0.6, stall);
    const cloth = box(3.8, 0.1, 2, mat('cloth', { color: 0x7a2a3a }), 0, 2.8, -0.2, stall); cloth.rotation.x = 0.2;
    for (let i = 0; i < 4; i++) { const f = new THREE.Mesh(new THREE.SphereGeometry(0.2, 6, 4), mat('fruit' + i, { color: [0xc84a2a, 0xd8b03a, 0x6a9a3a, 0x8a3a6a][i] })); f.position.set(-1.2 + i * 0.8, 1.15, 0); stall.add(f); }
    stall.rotation.y = Math.atan2(-sx, -sz);
    scene.add(stall); W.addBox(sx, sz, 1.9, 0.9, -stall.rotation.y);
    for (let i = 0; i < 5; i++) {
      const bx = 12 + i * 0.9, bz = 20 + (i % 2);
      const b = new THREE.Mesh(new THREE.CylinderGeometry(0.45, 0.4, 1, 10), mat('barrel', { color: 0x5a3e28 }));
      b.position.set(bx, W.height(bx, bz) + 0.5, bz); b.castShadow = true; scene.add(b); W.addCircle(bx, bz, 0.45);
    }
    // palisade arc around village with gaps for paths
    const postM = mat('post', { color: 0x4a3828 });
    for (let a = 0; a < Math.PI * 2; a += 0.045) {
      const x = Math.cos(a) * 40, z = Math.sin(a) * 40;
      if (pathDist(x, z) < 6) continue;
      const p = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 3 + Math.sin(a * 13) * 0.4, 5), postM);
      p.position.set(x, W.height(x, z) + 1.4, z); p.castShadow = true; scene.add(p); W.addCircle(x, z, 0.5);
    }
    // gate arches on path exits
    for (const pth of W.paths) {
      const [ax, az] = pth[0], [bx, bz] = pth[1];
      const dx = bx - ax, dz = bz - az, l = Math.hypot(dx, dz);
      // find where path crosses r=40
      let t = 40 / l; if (t > 1) t = 1;
      const gx = ax + dx * t, gz = az + dz * t, gy = W.height(gx, gz);
      const ang = Math.atan2(dx, dz);
      const gate = new THREE.Group(); gate.position.set(gx, gy, gz); gate.rotation.y = ang;
      for (const s of [-1, 1]) box(0.5, 5, 0.5, postM, s * 3, 2.5, 0, gate);
      box(7, 0.5, 0.6, postM, 0, 5, 0, gate);
      scene.add(gate);
      W.addCircle(gx + Math.cos(ang) * 3, gz - Math.sin(ang) * 3, 0.4);
      W.addCircle(gx - Math.cos(ang) * 3, gz + Math.sin(ang) * 3, 0.4);
    }
    // lantern posts
    lanternPost(10, 3, 0xffa040, 1.4);
    lanternPost(-9, -4, 0xffa040, 1.4);
    lanternPost(-4, 34, 0xffa040, 1.2);
    lanternPost(24, -26, 0xffa040, 0);
    lanternPost(-30, -8, 0xffa040, 0);
  }

  // ------------------------------------------------------------ ruins
  function buildRuins(scene) {
    const r = U.mulberry32(99);
    const m = mat('marble', { color: 0x8e8a80 });
    const m2 = mat('marble2', { color: 0x6e6a62 });
    const cx = 120, cz = 35;
    // colonnade rectangle
    for (let i = 0; i < 8; i++) for (const side of [-1, 1]) {
      const x = cx - 14 + i * 4, z = cz + side * 9;
      const broken = r() < 0.4;
      const h = broken ? 1.5 + r() * 3 : 7;
      const y = W.height(x, z);
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.8, h, 10), r() < 0.5 ? m : m2);
      col.position.set(x, y + h / 2, z); col.castShadow = true; col.receiveShadow = true; scene.add(col);
      box(1.8, 0.4, 1.8, m2, x, y + 0.2, z);
      if (!broken) box(1.8, 0.5, 1.8, m2, x, y + h, z);
      W.addCircle(x, z, 0.9);
    }
    // fallen columns
    for (let i = 0; i < 4; i++) {
      const x = cx - 10 + r() * 22, z = cz - 5 + r() * 10;
      const col = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.7, 5, 10), m2);
      col.rotation.z = Math.PI / 2; col.rotation.y = r() * 3; col.position.set(x, W.height(x, z) + 0.6, z); col.castShadow = true; scene.add(col);
      W.addCircle(x, z, 1.3);
    }
    // altar at far end
    const ax = cx + 18, az = cz;
    const ay = W.height(ax, az);
    box(4, 1, 6, m2, ax, ay + 0.5, az);
    box(2, 1.6, 3, m, ax, ay + 1.6, az);
    W.addBox(ax, az, 2.1, 3.1, 0);
    // arch
    const arch = new THREE.Group(); arch.position.set(cx - 22, W.height(cx - 22, cz), cz); arch.rotation.y = Math.PI / 2;
    for (const s of [-1, 1]) box(1.2, 8, 1.2, m, s * 3.5, 4, 0, arch);
    box(8.4, 1.2, 1.4, m, 0, 8.4, 0, arch);
    scene.add(arch);
    W.addCircle(cx - 22, cz - 3.5, 0.9); W.addCircle(cx - 22, cz + 3.5, 0.9);
    // eerie blue light
    const l = new THREE.PointLight(0x6080ff, 1.2, 30, 2); l.position.set(cx + 4, W.height(cx, cz) + 3, cz); scene.add(l);
    W.animated.push({ type: 'flicker', light: l, base: 1.2, seed: 9, slow: true });
  }

  // ------------------------------------------------------------ golem lair by the lake
  function buildLair(scene) {
    const r = U.mulberry32(5);
    const rm = mat('rock', { color: 0x4a4a52 });
    const cx = -158, cz = 112;
    for (let i = 0; i < 16; i++) {
      const a = i / 16 * Math.PI * 2;
      if (Math.abs(a - 0.2) < 0.45) continue; // opening towards lake / east
      const rr = 17 + r() * 3, x = cx + Math.cos(a) * rr, z = cz + Math.sin(a) * rr;
      const s = 2.5 + r() * 2.5;
      const rock = new THREE.Mesh(new THREE.DodecahedronGeometry(s, 0), rm);
      rock.position.set(x, W.height(x, z) + s * 0.4, z); rock.scale.y = 1.4 + r(); rock.rotation.set(r(), r() * 3, r());
      rock.castShadow = true; rock.receiveShadow = true; scene.add(rock); W.addCircle(x, z, s * 0.9);
    }
    // glowing runes stones
    for (let i = 0; i < 4; i++) {
      const a = i / 4 * Math.PI * 2 + 0.8, x = cx + Math.cos(a) * 8, z = cz + Math.sin(a) * 8;
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.4, 0.4), new THREE.MeshLambertMaterial({ color: 0x3a3a44, emissive: 0x203a50 }));
      st.position.set(x, W.height(x, z) + 1.2, z); st.rotation.y = a; scene.add(st); W.addCircle(x, z, 0.6);
    }
  }

  // ------------------------------------------------------------ lighthouse
  function buildFaro(scene) {
    const x = 110, z = -130, y = W.height(x, z);
    const g = new THREE.Group(); g.position.set(x, y, z);
    const st = mat('faro', { color: 0x8a8278 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(4.2, 5, 3, 12), mat('stone')); base.position.y = 1.5; base.castShadow = true; g.add(base);
    const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.4, 3.6, 18, 12), st); tower.position.y = 12; tower.castShadow = true; g.add(tower);
    for (let i = 0; i < 4; i++) { const band = new THREE.Mesh(new THREE.CylinderGeometry(3.6 - i * 0.3 + 0.1, 3.6 - i * 0.3 + 0.15, 0.6, 12), mat('band', { color: 0x5a3a30 })); band.position.y = 5 + i * 4.2; g.add(band); }
    const plat = new THREE.Mesh(new THREE.CylinderGeometry(3.4, 3.0, 0.8, 12), mat('stone')); plat.position.y = 21.4; g.add(plat);
    for (let i = 0; i < 6; i++) { const a = i / 6 * Math.PI * 2; const p = box(0.3, 3, 0.3, mat('iron', { color: 0x30343a }), Math.cos(a) * 2.6, 23.3, Math.sin(a) * 2.6, g); void p; }
    const cap = new THREE.Mesh(new THREE.ConeGeometry(3.4, 2.5, 12), mat('roof0')); cap.position.y = 26; g.add(cap);
    W.faroFlame = new THREE.Mesh(new THREE.IcosahedronGeometry(1.4, 1), new THREE.MeshBasicMaterial({ color: 0x2a2018 }));
    W.faroFlame.position.y = 23; g.add(W.faroFlame);
    box(1.6, 2.6, 0.3, mat('door'), 0, 1.3, 4.6, g);
    g.rotation.y = Math.atan2(-x, -z) ;
    scene.add(g);
    W.addCircle(x, z, 5.1);
    W.faroLight = new THREE.PointLight(0xffc060, 0, 220, 1.2); W.faroLight.position.set(x, y + 23, z); scene.add(W.faroLight);
    W.faroDoor = { x: x + Math.sin(g.rotation.y) * 6, z: z + Math.cos(g.rotation.y) * 6 };
  }

  function buildCrossroads(scene) {
    const x = 46, z = -38, y = W.height(x, z);
    // campfire + signpost
    const logs = new THREE.Group(); logs.position.set(x, y, z);
    for (let i = 0; i < 5; i++) { const l = box(0.25, 0.25, 1.4, mat('beam'), 0, 0.15, 0, logs); l.rotation.y = i / 5 * Math.PI; }
    const flame = new THREE.Mesh(new THREE.ConeGeometry(0.45, 1.1, 6), new THREE.MeshBasicMaterial({ color: 0xff8a30 })); flame.position.y = 0.7; logs.add(flame);
    scene.add(logs); W.addCircle(x, z, 0.7);
    W.animated.push({ type: 'flame', obj: flame });
    const fl = new THREE.PointLight(0xff8a30, 1.6, 16, 2); fl.position.set(x, y + 1.2, z); scene.add(fl);
    W.animated.push({ type: 'flicker', light: fl, base: 1.6, seed: 17 });
    const sx = 39, sz = -45, sy = W.height(sx, sz);
    const sign = new THREE.Group(); sign.position.set(sx, sy, sz);
    box(0.2, 3, 0.2, mat('beam'), 0, 1.5, 0, sign);
    const b1 = box(1.8, 0.4, 0.08, mat('plank', { color: 0x6a5038 }), 0.7, 2.6, 0, sign); b1.rotation.y = 0.3;
    const b2 = box(1.8, 0.4, 0.08, mat('plank'), -0.7, 2.1, 0, sign); b2.rotation.y = -0.6;
    scene.add(sign); W.addCircle(sx, sz, 0.3);
    W.campfire = { x, z };
  }

  function buildFireflies(scene) {
    const n = 260, pos = new Float32Array(n * 3);
    W.ffData = [];
    const r = U.mulberry32(77);
    for (let i = 0; i < n; i++) {
      let x, z;
      if (i < 160) { const a = r() * 6.28, d = r() * 70; x = W.places.forest.x + Math.cos(a) * d; z = W.places.forest.z + Math.sin(a) * d; }
      else { const a = r() * 6.28, d = 30 + r() * 40; x = W.places.lake.x + Math.cos(a) * d; z = W.places.lake.z + Math.sin(a) * d; }
      const y = Math.max(W.height(x, z), W.WATER) + 0.8 + r() * 3;
      W.ffData.push({ x, y, z, p: r() * 6.28, s: 0.3 + r() * 0.7 });
      pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;
    }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    W.fireflies = new THREE.Points(g, new THREE.PointsMaterial({ color: 0xd8ff70, size: 0.35, transparent: true, opacity: 0.9, depthWrite: false }));
    scene.add(W.fireflies);
  }

  W.update = function (dt, t) {
    for (const a of W.animated) {
      if (a.type === 'flicker') a.light.intensity = a.base * (a.slow ? (0.8 + Math.sin(t * 0.8 + a.seed) * 0.2) : (0.85 + Math.sin(t * 13 + a.seed) * 0.07 + Math.sin(t * 7.3 + a.seed * 2) * 0.08));
      else if (a.type === 'spin') a.obj.rotation.y += dt * a.speed;
      else if (a.type === 'flame') { a.obj.scale.y = 1 + Math.sin(t * 12) * 0.15; a.obj.rotation.y += dt * 2; }
    }
    if (W.fireflies) {
      const p = W.fireflies.geometry.attributes.position;
      for (let i = 0; i < W.ffData.length; i++) {
        const f = W.ffData[i];
        p.setXYZ(i, f.x + Math.sin(t * f.s + f.p) * 1.5, f.y + Math.sin(t * f.s * 1.7 + f.p) * 0.6, f.z + Math.cos(t * f.s * 0.8 + f.p) * 1.5);
      }
      p.needsUpdate = true;
      W.fireflies.material.opacity = 0.6 + Math.sin(t * 3) * 0.3;
    }
    if (W.water) W.water.material.emissive.setRGB(0.02 + Math.sin(t * 0.5) * 0.01, 0.06, 0.1);
  };

  window.World = W;
})();
