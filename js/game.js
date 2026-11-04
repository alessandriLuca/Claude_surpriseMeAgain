// Valdombra — core game: player, camera, combat, enemies, NPCs, dialogue, UI, save.
(function () {
  const $ = id => document.getElementById(id);
  const G = {};
  window.Game = G;

  const SAVE_KEY = 'valdombra-save-v1';
  const keys = {};
  let renderer, scene, camera, clock, moonLight, hemi, playerLight;
  let player, rig;
  const enemies = [], npcs = [], pickups = [], projectiles = [], particles = [];
  let cam = { yaw: Math.PI, pitch: 0.32, dist: 7.5 };
  let mouseDown = false, pointerLocked = false;
  let paused = true, started = false, inDialogue = false, uiOpen = null;
  let lastZone = null, saveTimer = 0, time = 0;
  let dawnT = 0;

  function freshState() {
    return {
      level: 1, xp: 0, hp: 100, maxHp: 100, mana: 50, maxMana: 50, gold: 10,
      dmg: 14, armor: 0, speed: 1, inv: { potion: 2 }, quests: {}, flags: {},
      pos: { x: 0, z: 6 }, kills: 0, deaths: 0, history: {}, bossDead: {}, chests: {}, herbs: {}, playTime: 0,
    };
  }
  G.S = freshState();
  const S = () => G.S;

  // ------------------------------------------------------------ init
  G.init = function () {
    renderer = new THREE.WebGLRenderer({ canvas: $('view'), antialias: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x141a2e, 0.018);
    camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 1200);
    clock = new THREE.Clock();

    hemi = new THREE.HemisphereLight(0x4a5a98, 0x14140c, 0.62); scene.add(hemi);
    moonLight = new THREE.DirectionalLight(0x9ab0ff, 0.5);
    moonLight.position.set(-30, 60, -40);
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    const sc = moonLight.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
    moonLight.shadow.bias = -0.0008;
    scene.add(moonLight); scene.add(moonLight.target);

    World.build(scene);
    buildMinimapBase();

    rig = Models.hero();
    scene.add(rig.root);
    playerLight = new THREE.PointLight(0xffb060, 1.1, 14, 2);
    scene.add(playerLight);
    player = { x: 0, z: 6, y: World.height(0, 6), vy: 0, yaw: Math.PI, onGround: true, state: 'idle', atk: null, combo: 0, comboT: 0, roll: null, inv: 0, hurtT: 0, castT: 0, stepT: 0, potionCd: 0, fishing: null };

    spawnNPCs();
    spawnEnemies();
    spawnPickups();

    window.addEventListener('resize', onResize);
    bindInput();
    AIVoice.onStatus(updateAIBadge);
    AIVoice.init();
    const sv = U.store.get(SAVE_KEY, null);
    $('btn-continue').hidden = !sv;
    G.loop();
  };

  function onResize() {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight; camera.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ start / save
  G.newGame = function () { G.S = freshState(); applyState(); startPlaying(); toast('La Notte Lunga', 'Parla con gli abitanti di Valdombra. Fra\' Tobia ti aspetta vicino alla cappella.'); };
  G.continueGame = function () {
    const sv = U.store.get(SAVE_KEY, null);
    if (!sv) return G.newGame();
    G.S = Object.assign(freshState(), sv);
    applyState(); startPlaying(); toast('Bentornato', 'Partita caricata.');
  };
  function startPlaying() {
    AudioFX.init();
    $('menu').hidden = true; $('hud').hidden = false; $('labels').hidden = false;
    started = true; paused = false;
    requestLock();
  }
  function applyState() {
    const s = S();
    player.x = s.pos.x; player.z = s.pos.z; player.y = World.height(player.x, player.z);
    // bosses
    for (const e of enemies) {
      if (e.def.boss && s.bossDead[e.type]) { e.dead = true; e.gone = true; e.mesh.root.visible = false; }
      else if (e.dead || e.gone) reviveEnemy(e);
    }
    for (const p of pickups) {
      if (p.kind === 'herb') p.taken = !!s.herbs[p.key];
      if (p.kind === 'chest') p.taken = !!s.chests[p.key];
      if (p.kind === 'pendant') p.taken = !!s.flags.pendantFound;
      p.mesh.visible = !p.taken; if (p.kind === 'chest' && p.taken) { p.mesh.visible = true; p.lid.rotation.x = -1.9; }
    }
    lightLantern(!!(s.quests.main && (s.quests.main.stage === 'faro' || s.quests.main.state === 'done')), true);
    setDawn(!!s.flags.dawn, true);
    updateHUD();
  }
  function save() {
    const s = S(); s.pos = { x: player.x, z: player.z };
    U.store.set(SAVE_KEY, s);
  }
  G.save = save;

  // ------------------------------------------------------------ input
  function requestLock() {
    const c = $('view');
    if (c.requestPointerLock) { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed */ } }
  }
  function bindInput() {
    const c = $('view');
    document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === c; });
    c.addEventListener('mousedown', e => {
      if (!started || paused || inDialogue || uiOpen) return;
      AudioFX.init();
      if (!pointerLocked) requestLock();
      if (e.button === 0) attack();
      if (e.button === 2) { mouseDown = true; }
    });
    window.addEventListener('mouseup', e => { if (e.button === 2) mouseDown = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (!started || paused || inDialogue || uiOpen) return;
      if (pointerLocked || mouseDown) { cam.yaw -= e.movementX * 0.0032; cam.pitch = U.clamp(cam.pitch + e.movementY * 0.0026, -0.25, 1.15); }
    });
    window.addEventListener('wheel', e => { if (!started || inDialogue) return; cam.dist = U.clamp(cam.dist + Math.sign(e.deltaY) * 0.8, 3.5, 14); }, { passive: true });
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) {
        if (e.key === 'Escape') closeDialogue();
        return;
      }
      keys[e.code] = true;
      if (!started) return;
      if (e.code === 'Escape') { if (inDialogue) closeDialogue(); else if (uiOpen) closePanel(); else togglePause(); }
      if (paused) return;
      if (inDialogue) {
        if (/^Digit[1-9]$/.test(e.code)) { const b = document.querySelectorAll('#dlg-options button')[+e.code.slice(5) - 1]; if (b) b.click(); }
        return;
      }
      if (e.code === 'KeyE') interact();
      if (e.code === 'KeyQ') castFireball();
      if (e.code === 'Space') jump();
      if (e.code === 'ControlLeft' || e.code === 'KeyC') dodge();
      if (e.code === 'Digit1') drinkPotion();
      if (e.code === 'KeyJ') togglePanel('journal');
      if (e.code === 'KeyI' || e.code === 'Tab') { e.preventDefault(); togglePanel('inventory'); }
      if (e.code === 'KeyM') togglePanel('map');
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; });

    $('btn-new').onclick = () => { if (U.store.get(SAVE_KEY, null) && !$('btn-new').dataset.confirm) { $('btn-new').dataset.confirm = '1'; $('btn-new').textContent = 'Sovrascrivo il salvataggio?'; return; } G.newGame(); };
    $('btn-continue').onclick = () => G.continueGame();
    $('btn-resume').onclick = () => togglePause(false);
    $('btn-save').onclick = () => { save(); toast('Salvato', 'Partita salvata.'); };
    $('btn-quit').onclick = () => { save(); location.reload(); };
    $('ai-toggle').onchange = e => { AIVoice.disabledByUser = !e.target.checked; updateAIBadge(AIVoice.status); };
    $('vol').oninput = e => AudioFX.setVolume(+e.target.value);
    $('dlg-form').onsubmit = e => { e.preventDefault(); const v = $('dlg-input').value.trim(); if (v) sendFree(v); };
    $('dlg-close').onclick = () => closeDialogue();
    document.querySelectorAll('[data-close]').forEach(b => b.onclick = () => closePanel());
    $('btn-end-continue').onclick = () => { $('ending').hidden = true; paused = false; requestLock(); };
    // touch-ish fallback: drag to look
    let lastTouch = null;
    c.addEventListener('touchstart', e => { lastTouch = e.touches[0]; }, { passive: true });
    c.addEventListener('touchmove', e => { const t = e.touches[0]; if (lastTouch) { cam.yaw -= (t.clientX - lastTouch.clientX) * 0.006; cam.pitch = U.clamp(cam.pitch + (t.clientY - lastTouch.clientY) * 0.004, -0.25, 1.15); } lastTouch = t; }, { passive: true });
  }

  function togglePause(force) {
    paused = force === undefined ? !paused : force;
    $('pause').hidden = !paused;
    if (paused) { if (document.exitPointerLock) document.exitPointerLock(); save(); }
    else requestLock();
  }

  // ------------------------------------------------------------ entities
  function spawnNPCs() {
    for (const d of Data.npcs) {
      const m = d.cat ? Models.cat() : Models.humanoid(d.look);
      let y = World.height(d.x, d.z);
      if (d.cat) y = World.wellTop.y;
      m.root.position.set(d.x, y, d.z);
      scene.add(m.root);
      const n = { d, m, x: d.x, z: d.z, y, yaw: Math.atan2(-d.x, -d.z), talking: false, barkT: 3 + Math.random() * 5 };
      if (d.cat) { n.x = World.wellTop.x + 0.9; n.z = World.wellTop.z; m.root.position.set(n.x, y, n.z); }
      else World.addCircle(d.x, d.z, 0.45);
      m.root.rotation.y = n.yaw;
      // name label
      n.label = makeLabel(d.name, d.title);
      $('labels').appendChild(n.label);
      // quest marker
      n.marker = document.createElement('div'); n.marker.className = 'qmark'; $('labels').appendChild(n.marker);
      npcs.push(n);
    }
  }
  function makeLabel(name, sub) {
    const el = document.createElement('div'); el.className = 'nlabel';
    el.innerHTML = `<b></b><span></span>`; el.querySelector('b').textContent = name; el.querySelector('span').textContent = sub || '';
    return el;
  }

  function spawnEnemies() {
    for (const sp of Data.spawns) {
      const def = Data.enemies[sp.type];
      let m;
      if (sp.type === 'wolf') m = Models.wolf();
      else if (sp.type === 'alpha') m = Models.wolf({ scale: 1.9, color: 0x8a8a90, eyes: 0xff4020 });
      else if (sp.type === 'skeleton') m = Models.skeleton({});
      else if (sp.type === 'knight') m = Models.skeleton({ scale: 1.5, armor: 0x3a3a48, helmet: 0x5a5a68, big: true, shield: true, eyes: 0xff5040, cape: 0x4a1a1a });
      else if (sp.type === 'wisp') m = Models.wisp({ color: Math.random() < 0.5 ? 0x80d0ff : 0xb080ff });
      else if (sp.type === 'golem') m = Models.golem();
      scene.add(m.root);
      const e = { type: sp.type, def, m, mesh: m, sx: sp.x, sz: sp.z, x: sp.x, z: sp.z, y: 0, yaw: Math.random() * 6, hp: def.hp, state: 'idle', t: 0, cd: 1, wander: null, dead: false, deadT: 0, gone: false, respawnT: 0, flash: 0, aggro: false, slowT: 0 };
      e.m.root.traverse(o => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); o.material.userData.baseEm = o.material.emissive.getHex(); } });
      e.hpBar = document.createElement('div'); e.hpBar.className = 'ehp' + (def.boss ? ' boss' : ''); e.hpBar.innerHTML = '<i></i>'; $('labels').appendChild(e.hpBar);
      enemies.push(e);
    }
  }
  function reviveEnemy(e) {
    e.hp = e.def.hp; e.dead = false; e.gone = false; e.state = 'idle'; e.x = e.sx; e.z = e.sz; e.aggro = false;
    e.m.root.visible = true; e.m.root.scale.setScalar(e.type === 'alpha' ? 1.9 : 1);
    if (e.type === 'knight') e.m.root.scale.setScalar(1.5);
  }

  function spawnPickups() {
    const herbMat = new THREE.MeshBasicMaterial({ color: 0x80e0ff });
    Data.herbSpots.forEach(([x, z], i) => {
      const g = new THREE.Group();
      for (let k = 0; k < 5; k++) { const leaf = new THREE.Mesh(new THREE.ConeGeometry(0.08, 0.6, 4), herbMat); leaf.position.set(Math.cos(k * 1.3) * 0.15, 0.3, Math.sin(k * 1.3) * 0.15); leaf.rotation.z = Math.cos(k * 1.3) * 0.4; leaf.rotation.x = Math.sin(k * 1.3) * 0.4; g.add(leaf); }
      const glow = new THREE.PointLight(0x60c0ff, 0.6, 5, 2); glow.position.y = 0.5; g.add(glow);
      g.position.set(x, Math.max(World.height(x, z), 0.2), z); scene.add(g);
      pickups.push({ kind: 'herb', key: 'h' + i, x, z, mesh: g, taken: false });
    });
    // pendant
    {
      const [x, z] = Data.pendantSpot;
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xe0e8ff })); p.position.y = 0.35; g.add(p);
      const l = new THREE.PointLight(0xc0d0ff, 0.5, 4, 2); l.position.y = 0.5; g.add(l);
      g.position.set(x, World.height(x, z), z); scene.add(g);
      // fallen tree nearby
      const log = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.7, 9, 8), new THREE.MeshLambertMaterial({ color: 0x3d2c22 }));
      log.rotation.z = Math.PI / 2; log.rotation.y = 0.6; log.position.set(x + 2, World.height(x + 2, z + 1) + 0.6, z + 1); log.castShadow = true; scene.add(log);
      World.addCircle(x + 2, z + 1, 1.0); World.addCircle(x + 5.5, z + 3.3, 0.8); World.addCircle(x - 1.5, z - 1.2, 0.8);
      pickups.push({ kind: 'pendant', key: 'pendant', x, z, mesh: g, taken: false, spin: p });
    }
    Data.chests.forEach((c, i) => {
      const g = new THREE.Group();
      const wood = new THREE.MeshLambertMaterial({ color: 0x6a4a2a }), gold = new THREE.MeshLambertMaterial({ color: 0xc8a040 });
      const base = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.6, 0.8), wood); base.position.y = 0.3; base.castShadow = true; g.add(base);
      const lid = new THREE.Group(); lid.position.set(0, 0.6, -0.4); g.add(lid);
      const lm = new THREE.Mesh(new THREE.BoxGeometry(1.22, 0.3, 0.82), wood); lm.position.set(0, 0.15, 0.4); lid.add(lm);
      const band = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.32, 0.84), gold); band.position.set(0, 0.15, 0.4); lid.add(band);
      g.position.set(c.x, World.height(c.x, c.z), c.z); g.rotation.y = Math.atan2(-c.x, -c.z); scene.add(g);
      World.addCircle(c.x, c.z, 0.7);
      pickups.push({ kind: 'chest', key: 'c' + i, x: c.x, z: c.z, mesh: g, lid, taken: false, data: c });
    });
  }

  // ------------------------------------------------------------ player actions
  function attack() {
    if (player.roll || player.fishing || player.hp <= 0) return;
    if (player.atk) { if (player.atk.t > 0.55 * player.atk.dur) player.queued = true; return; }
    const combo = player.comboT > 0 ? (player.combo + 1) % 3 : 0;
    player.combo = combo; player.comboT = 0.9;
    const dur = combo === 2 ? 0.62 : 0.42;
    player.atk = { t: 0, dur, hit: false, combo };
    AudioFX.sfx.swing();
    // face camera direction while attacking
    player.yaw = cam.yaw + Math.PI;
  }
  function doHitCheck(combo) {
    const reach = combo === 2 ? 3.0 : 2.6, arc = combo === 2 ? 1.0 : 1.3;
    const dmg = S().dmg * (combo === 2 ? 1.6 : 1) * (0.9 + Math.random() * 0.2);
    let any = false;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
      if (d > reach + e.def.radius) continue;
      const dot = (dx * fx + dz * fz) / (d || 1);
      if (dot < Math.cos(arc)) continue;
      let dd = dmg;
      if (e.type === 'knight') { // blocks frontal sword hits
        const ef = { x: Math.sin(e.yaw), z: Math.cos(e.yaw) };
        if ((-dx * ef.x - dz * ef.z) / (d || 1) > 0.5 && e.state !== 'attack') { dd *= 0.25; floatText(e, 'PARATA', '#9ab'); }
      }
      damageEnemy(e, dd, fx, fz);
      any = true;
    }
    if (any) { AudioFX.sfx.hit(); shake(0.15); }
  }
  function castFireball() {
    if (player.roll || player.fishing || player.hp <= 0) return;
    const s = S();
    if (s.mana < 15 || player.castT > 0) { if (s.mana < 15) { AudioFX.sfx.deny(); floatTextAt(player.x, player.y + 2.4, player.z, 'Mana insufficiente', '#8af'); } return; }
    s.mana -= 15; player.castT = 0.45;
    player.yaw = cam.yaw + Math.PI;
    const dir = new THREE.Vector3(Math.sin(player.yaw), -Math.sin(cam.pitch - 0.3) * 0.3, Math.cos(player.yaw)).normalize();
    // auto-aim soft lock: nearest enemy in front cone
    let best = null, bd = 30;
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
      if (d < bd && (dx * dir.x + dz * dir.z) / d > 0.9) { bd = d; best = e; }
    }
    if (best) { const ty = best.y + (best.def.fly ? 1.6 : 1.1); dir.set(best.x - player.x, ty - (player.y + 1.5), best.z - player.z).normalize(); }
    spawnProjectile(player.x + dir.x * 0.8, player.y + 1.5, player.z + dir.z * 0.8, dir, 26, 'player', s.dmg * 1.8 + 10, 0xff7a20);
    AudioFX.sfx.fireball();
  }
  function jump() { if (player.onGround && !player.roll && !player.fishing) { player.vy = 7.5; player.onGround = false; AudioFX.sfx.jump(); } }
  function dodge() {
    if (player.roll || player.fishing || !player.onGround || player.hp <= 0) return;
    // dodge in input direction, or backwards
    const mv = inputVector();
    const ang = (mv.x || mv.z) ? Math.atan2(mv.x, mv.z) : player.yaw + Math.PI;
    player.roll = { t: 0, dur: 0.5, ang };
    player.inv = 0.45; player.atk = null;
    AudioFX.sfx.roll();
  }
  function drinkPotion() {
    const s = S();
    if (!(s.inv.potion > 0)) { AudioFX.sfx.deny(); toast('Nessuna pozione', 'Elda le vende al villaggio.'); return; }
    if (s.hp >= s.maxHp || player.potionCd > 0) return;
    s.inv.potion--; s.hp = Math.min(s.maxHp, s.hp + 60); player.potionCd = 1;
    AudioFX.sfx.potion(); floatTextAt(player.x, player.y + 2.2, player.z, '+60', '#7f7');
    burst(player.x, player.y + 1, player.z, 0x60ff80, 16);
  }

  function inputVector() {
    let x = 0, z = 0;
    if (keys.KeyW || keys.ArrowUp) z += 1;
    if (keys.KeyS || keys.ArrowDown) z -= 1;
    if (keys.KeyA || keys.ArrowLeft) x += 1;
    if (keys.KeyD || keys.ArrowRight) x -= 1;
    if (!x && !z) return { x: 0, z: 0 };
    const l = Math.hypot(x, z); x /= l; z /= l;
    // rotate by camera yaw (camera looks toward yaw+PI)
    const fy = cam.yaw + Math.PI;
    const fx = Math.sin(fy), fz = Math.cos(fy);
    const rx = Math.sin(fy + Math.PI / 2), rz = Math.cos(fy + Math.PI / 2);
    return { x: fx * z + rx * x, z: fz * z + rz * x };
  }

  // ------------------------------------------------------------ interaction
  function nearestInteractable() {
    let best = null, bd = 3.2;
    for (const n of npcs) { const d = Math.hypot(n.x - player.x, n.z - player.z); if (d < bd) { bd = d; best = { type: 'npc', n }; } }
    for (const p of pickups) { if (p.taken) continue; const d = Math.hypot(p.x - player.x, p.z - player.z); if (d < Math.min(bd, 2.4)) { bd = d; best = { type: 'pickup', p }; } }
    if (Math.hypot(World.dock.x - player.x, World.dock.z - player.z) < 4 && !S().inv.fish) best = best || { type: 'fish' };
    if (Math.hypot(World.faroDoor.x - player.x, World.faroDoor.z - player.z) < 4.5) best = best || { type: 'faro' };
    if (Math.hypot(player.x, player.z) < 4.2) best = best || { type: 'lantern' };
    return best;
  }
  function interactLabel(it) {
    if (!it) return '';
    if (it.type === 'npc') return `Parla con ${it.n.d.name}`;
    if (it.type === 'pickup') return { herb: 'Raccogli Erba Lunare', pendant: 'Raccogli il ciondolo', chest: 'Apri lo scrigno' }[it.p.kind];
    if (it.type === 'fish') return player.fishing ? 'Stai pescando...' : 'Pesca dal pontile';
    if (it.type === 'faro') return 'Accendi il Faro';
    if (it.type === 'lantern') return 'Esamina la Lanterna Antica';
    return '';
  }
  function interact() {
    const it = nearestInteractable();
    if (!it) return;
    if (it.type === 'npc') openDialogue(it.n);
    else if (it.type === 'pickup') takePickup(it.p);
    else if (it.type === 'fish') startFishing();
    else if (it.type === 'faro') useFaro();
    else if (it.type === 'lantern') {
      const q = S().quests.main;
      if (q && (q.stage === 'faro' || q.state === 'done')) toast('La Lanterna Antica', 'Arde di una luce calda e dorata.');
      else toast('La Lanterna Antica', `Fredda e spenta. Tre incavi attendono le Braci (${S().inv.ember || 0}/3). Parla con Fra' Tobia.`);
    }
  }
  function takePickup(p) {
    const s = S();
    p.taken = true;
    if (p.kind === 'herb') { s.inv.herb = (s.inv.herb || 0) + 1; s.herbs[p.key] = 1; p.mesh.visible = false; toast('Erba Lunare', `Raccolta (${s.inv.herb}).`); }
    if (p.kind === 'pendant') { s.inv.pendant = 1; s.flags.pendantFound = 1; p.mesh.visible = false; toast('Ciondolo d\'argento', 'A forma di luna. Dev\'essere di Mira.'); }
    if (p.kind === 'chest') {
      s.chests[p.key] = 1; p.lid.rotation.x = -1.9;
      s.gold += p.data.gold; s.inv.potion = (s.inv.potion || 0) + p.data.potion;
      toast('Scrigno', `${p.data.gold} monete d'oro e ${p.data.potion} pozion${p.data.potion > 1 ? 'i' : 'e'}.`); AudioFX.sfx.coin();
    }
    AudioFX.sfx.pickup(); burst(p.x, World.height(p.x, p.z) + 0.5, p.z, 0x9ad8ff, 14);
    updateHUD(); save();
  }
  function startFishing() {
    if (player.fishing) return;
    if (!G.S.quests.fish) { toast('Il pontile', 'L\'acqua è nera e immobile. Niente da fare qui... per ora.'); return; }
    player.fishing = { t: 0, dur: 2.2 + Math.random() * 1.5 };
    toast('Pesca', 'Lanci la lenza nell\'acqua scura...');
  }
  function useFaro() {
    const q = S().quests.main;
    if (!q || q.stage !== 'faro') {
      if (q && q.state === 'done') toast('Il Faro', 'Brilla alto sulla valle.');
      else toast('Il Faro', 'La porta è chiusa e la cima è fredda. Serve la fiamma della Lanterna Antica.');
      return;
    }
    q.stage = null; q.state = 'done';
    S().flags.dawn = 1;
    World.faroFlame.material.color.set(0xffd070);
    World.faroLight.intensity = 3;
    AudioFX.sfx.quest(); shake(0.4);
    gainXP(300);
    setDawn(true);
    save();
    setTimeout(showEnding, 4200);
  }

  // ------------------------------------------------------------ quests / actions
  const ACTIONS = {
    main_accept: { desc: 'il giocatore accetta di cercare le tre Braci Primordiali', run() { startQuest('main'); } },
    main_deliver: { desc: 'il giocatore consegna le tre Braci: la Lanterna Antica si riaccende', run() { const s = S(); s.inv.ember -= 3; s.quests.main.stage = 'faro'; lightLantern(true); gainXP(150); toast('La Lanterna Antica arde!', 'Porta la fiamma al Faro sul Colle, a nord-est.'); AudioFX.sfx.quest(); } },
    bless: { desc: 'Tobia benedice il giocatore e gli ripristina tutta la vita', run() { const s = S(); s.hp = s.maxHp; s.mana = s.maxMana; burst(player.x, player.y + 1, player.z, 0xffe0a0, 20); AudioFX.sfx.potion(); } },
    herbs_accept: { desc: 'il giocatore accetta di raccogliere 5 Erbe Lunari', run() { startQuest('herbs'); } },
    herbs_complete: { desc: 'il giocatore consegna 5 Erbe Lunari e riceve 3 pozioni', run() { const s = S(); s.inv.herb -= 5; s.inv.potion = (s.inv.potion || 0) + 3; finishQuest('herbs', 80, 25); } },
    buy_potion: { desc: 'il giocatore compra una pozione per 15 monete d\'oro', run() { const s = S(); s.gold -= 15; s.inv.potion = (s.inv.potion || 0) + 1; AudioFX.sfx.coin(); toast('Acquisto', 'Pozione di Elda (+1).'); } },
    iron_accept: { desc: 'il giocatore accetta di portare 3 Ferro Antico', run() { startQuest('iron'); } },
    iron_complete: { desc: 'il giocatore consegna 3 Ferro Antico e Bruno potenzia la spada (+8 danno)', run() { const s = S(); s.inv.iron -= 3; s.dmg += 8; rig.blade.material.emissive.set(0x3060a0); finishQuest('iron', 100, 0); toast('Lama riforgiata', 'Danno della spada +8.'); } },
    pendant_accept: { desc: 'il giocatore promette di ritrovare il ciondolo di Mira', run() { startQuest('pendant'); } },
    pendant_complete: { desc: 'il giocatore restituisce il ciondolo a Mira e riceve il suo sassolino portafortuna (+20 vita massima) e 25 monete', run() { const s = S(); s.inv.pendant = 0; s.maxHp += 20; s.hp += 20; finishQuest('pendant', 70, 25); } },
    wolves_accept: { desc: 'il giocatore accetta di abbattere 6 lupi', run() { startQuest('wolves'); S().quests.wolves.progress = 0; } },
    wolves_complete: { desc: 'il giocatore riceve 60 monete e uno spallaccio (+armatura)', run() { S().armor += 0.15; finishQuest('wolves', 90, 60); } },
    fish_accept: { desc: 'il giocatore accetta di pescare un Pesce d\'Argento per Ottone', run() { startQuest('fish'); } },
    fish_complete: { desc: 'il giocatore consegna il pesce e impara il Passo Felpato (+15% velocità)', run() { const s = S(); s.inv.fish = 0; s.speed += 0.15; finishQuest('fish', 60, 0); toast('Passo Felpato', 'Velocità di movimento +15%.'); } },
    reveal: { desc: 'il Viandante ammette di essere Anselmo, il vecchio guardiano del Faro', run() { S().flags.anselmo = 1; gainXP(40); toast('Rivelazione', 'Il Viandante è Anselmo, il guardiano del Faro.'); } },
  };
  function startQuest(id) {
    const s = S(); if (s.quests[id]) return;
    s.quests[id] = { state: 'active', progress: 0 };
    toast('Nuova missione: ' + Data.quests[id].title, Data.questText(id, G));
    AudioFX.sfx.open(); updateHUD(); save();
  }
  function finishQuest(id, xp, gold) {
    const s = S(); s.quests[id].state = 'done';
    s.gold += gold; gainXP(xp);
    toast('Missione completata: ' + Data.quests[id].title, `+${xp} esperienza${gold ? `, +${gold} oro` : ''}`);
    AudioFX.sfx.quest(); updateHUD(); save();
  }
  function runAction(id) { if (ACTIONS[id]) { ACTIONS[id].run(); updateHUD(); save(); } }

  function gainXP(n) {
    const s = S(); s.xp += n;
    let need = xpNeed(s.level);
    while (s.xp >= need) {
      s.xp -= need; s.level++; s.maxHp += 15; s.hp = s.maxHp; s.maxMana += 8; s.mana = s.maxMana; s.dmg += 3;
      toast('Livello ' + s.level + '!', 'Vita +15, Mana +8, Danno +3');
      AudioFX.sfx.level(); burst(player.x, player.y + 1, player.z, 0xffe070, 30);
      need = xpNeed(s.level);
    }
    updateHUD();
  }
  const xpNeed = l => 60 + l * 50;

  function lightLantern(on, instant) {
    World.lanternLight.intensity = on ? 2.4 : 0;
    World.lanternCrystal.material.color.set(on ? 0xffd070 : 0x3a3a48);
    World.lanternCrystal.material.emissive.set(on ? 0xffa030 : 0x000000);
    World.lanternEmbers.forEach(e => e.material.color.set(on ? 0xff7020 : 0x302820));
    if (on && !instant) { shake(0.3); burst(0, World.height(0, 0) + 5, 0, 0xffc050, 40); }
  }

  function setDawn(on, instant) {
    if (on) { dawnT = instant ? 1 : 0.0001; AudioFX.setDawn && AudioFX.ctx && AudioFX.setDawn(true); World.faroFlame.material.color.set(0xffd070); World.faroLight.intensity = 3; }
    else dawnT = 0;
    if (instant) applyDawn(on ? 1 : 0);
  }
  function applyDawn(k) {
    const c = (a, b) => new THREE.Color(a).lerp(new THREE.Color(b), k);
    World.skyUniforms.top.value.copy(c(0x060a1c, 0x3a78c8));
    World.skyUniforms.mid.value.copy(c(0x1a1f3c, 0xf0a868));
    World.skyUniforms.bottom.value.copy(c(0x2a2236, 0x8a7a88));
    World.skyUniforms.sunCol.value.copy(c(0x000000, 0xffc070));
    World.skyUniforms.sunDir.value.set(0.6, U.lerp(-0.3, 0.12, k), -0.75).normalize();
    scene.fog.color.copy(c(0x141a2e, 0xc8a890)); scene.fog.density = U.lerp(0.018, 0.0075, k);
    hemi.color.copy(c(0x4a5a98, 0xffe0c0)); hemi.groundColor.copy(c(0x14140c, 0x4a4030)); hemi.intensity = U.lerp(0.62, 0.95, k);
    moonLight.color.copy(c(0x9ab0ff, 0xffd0a0)); moonLight.intensity = U.lerp(0.5, 1.25, k);
    W_stars(1 - k);
  }
  function W_stars(o) { World.stars.material.opacity = o; World.moon.material.opacity = o; }

  // ------------------------------------------------------------ dialogue
  let dlg = null;
  function openDialogue(n) {
    inDialogue = true; n.talking = true;
    if (document.exitPointerLock) document.exitPointerLock();
    const h = S().history[n.d.id] || (S().history[n.d.id] = []);
    dlg = { n, busy: false, ctl: null };
    $('dlg-name').textContent = n.d.name;
    $('dlg-title').textContent = n.d.title;
    $('dlg-log').innerHTML = '';
    // show last few lines of past conversation
    h.slice(-4).forEach(m => addLine(m.role, m.text, true));
    const greet = n.d.greet(G);
    addLine('npc', greet);
    pushHistory(n, 'npc', greet);
    $('dialogue').hidden = false;
    renderOptions();
    const ai = AIVoice.available();
    $('dlg-form').hidden = !ai;
    $('dlg-mode').textContent = ai ? 'Voce AI: scrivi quello che vuoi, oppure scegli un\'opzione' : 'Dialogo scritto: scegli un\'opzione';
    if (ai) setTimeout(() => $('dlg-input').focus(), 50);
    AudioFX.sfx.open();
  }
  function closeDialogue() {
    if (!dlg) return;
    if (dlg.ctl) dlg.ctl.abort();
    dlg.n.talking = false; dlg = null; inDialogue = false;
    $('dialogue').hidden = true;
    $('dlg-input').value = '';
    save();
    if (started && !paused) requestLock();
  }
  function pushHistory(n, role, text) {
    const h = S().history[n.d.id] || (S().history[n.d.id] = []);
    h.push({ role, text }); if (h.length > 24) h.splice(0, h.length - 24);
  }
  function addLine(role, text, old) {
    const el = document.createElement('div'); el.className = 'line ' + role + (old ? ' old' : '');
    const who = document.createElement('b'); who.textContent = role === 'player' ? 'Tu' : dlg.n.d.name;
    const t = document.createElement('span'); t.textContent = text;
    el.appendChild(who); el.appendChild(t);
    $('dlg-log').appendChild(el); $('dlg-log').scrollTop = 1e6;
    return t;
  }
  function availableTopics(n) { return n.d.topics.filter(t => !t.cond || t.cond(G)); }
  function renderOptions() {
    const box = $('dlg-options'); box.innerHTML = '';
    const list = availableTopics(dlg.n);
    list.forEach((t, i) => {
      const b = document.createElement('button'); b.type = 'button';
      b.innerHTML = `<kbd>${i + 1}</kbd> `; b.appendChild(document.createTextNode(t.label));
      if (t.action) b.classList.add('quest');
      b.onclick = () => chooseTopic(t);
      box.appendChild(b);
    });
    const bye = document.createElement('button'); bye.type = 'button'; bye.className = 'bye';
    bye.innerHTML = `<kbd>${list.length + 1}</kbd> Addio`; bye.onclick = closeDialogue; box.appendChild(bye);
  }
  function chooseTopic(t) {
    if (!dlg || dlg.busy) return;
    const n = dlg.n;
    addLine('player', t.label); pushHistory(n, 'player', t.label);
    // when the AI voice is on, scripted options with no game action are routed to the AI too, for variety
    if (AIVoice.available() && !t.action) { askAI(t.label, t); return; }
    const r = typeof t.reply === 'function' ? t.reply(G) : Array.isArray(t.reply) ? U.pick(t.reply) : t.reply;
    typeLine(r);
    pushHistory(n, 'npc', r);
    if (t.action) runAction(t.action);
    renderOptions();
  }
  function typeLine(text) {
    const span = addLine('npc', '');
    let i = 0;
    const iv = setInterval(() => {
      if (!document.body.contains(span)) return clearInterval(iv);
      i += 2; span.textContent = text.slice(0, i);
      if (i % 6 === 0) AudioFX.sfx.blip();
      $('dlg-log').scrollTop = 1e6;
      if (i >= text.length) clearInterval(iv);
    }, 18);
  }
  function sendFree(text) {
    if (!dlg || dlg.busy) return;
    $('dlg-input').value = '';
    addLine('player', text); pushHistory(dlg.n, 'player', text);
    askAI(text, null);
  }
  async function askAI(text, fallbackTopic) {
    const n = dlg.n;
    dlg.busy = true; $('dlg-send').disabled = true;
    const wait = addLine('npc', '…'); wait.parentElement.classList.add('thinking');
    const allowed = availableTopics(n).filter(t => t.action).map(t => ({ id: t.action, desc: ACTIONS[t.action].desc }));
    const ctl = new AbortController(); dlg.ctl = ctl;
    try {
      const hist = (S().history[n.d.id] || []).slice(0, -1);
      const res = await AIVoice.ask(n.d, G, hist, text, allowed, ctl.signal);
      if (!dlg || dlg.n !== n) return;
      wait.parentElement.remove();
      typeLine(res.reply);
      pushHistory(n, 'npc', res.reply);
      if (res.action) runAction(res.action);
      setMood(res.mood);
    } catch (e) {
      if (!dlg || dlg.n !== n) return;
      wait.parentElement.remove();
      const kind = AIVoice.handleError(e);
      if (kind === 'cancel') return;
      // fall back to the script so the conversation never stalls
      const r = fallbackTopic ? (typeof fallbackTopic.reply === 'function' ? fallbackTopic.reply(G) : Array.isArray(fallbackTopic.reply) ? U.pick(fallbackTopic.reply) : fallbackTopic.reply) : U.pick(scriptedShrug(n));
      typeLine(r); pushHistory(n, 'npc', r);
      if (kind === 'off') { $('dlg-form').hidden = true; $('dlg-mode').textContent = 'Voce AI non disponibile: dialogo scritto'; }
      if (kind === 'rate') $('dlg-mode').textContent = 'Troppe richieste all\'AI: riprova tra poco, intanto usa le opzioni';
    } finally {
      if (dlg && dlg.n === n) { dlg.busy = false; $('dlg-send').disabled = false; dlg.ctl = null; renderOptions(); if (AIVoice.available()) $('dlg-input').focus(); }
    }
  }
  function scriptedShrug(n) {
    const map = {
      tobia: ['Le tue parole sono un enigma per questo vecchio, figliolo. Chiedimi della Lanterna.'],
      elda: ['Non ho capito una parola, e non è colpa mia.'],
      bruno: ['Mh.'],
      mira: ['Eh? Non ho capito! Però sembra interessante!'],
      sera: ['Sii più chiaro, forestiero. Ho poco tempo.'],
      ottone: ['I gatti non rispondono alle domande sciocche. Né a quelle intelligenti, a dire il vero.'],
      viandante: ['Alcune domande hanno bisogno di tempo. Altre, di un fuoco più caldo.'],
    };
    return map[n.d.id] || ['...'];
  }
  function setMood(m) { const el = $('dlg-mood'); el.textContent = { happy: '☺', amused: '☺', sad: '☹', angry: '!', afraid: '…', grateful: '♥' }[m] || ''; }

  function updateAIBadge(st) {
    const b = $('ai-badge');
    if (!b) return;
    const on = st === 'ready' && !AIVoice.disabledByUser;
    b.textContent = st === 'checking' ? 'Voci: verifica…' : on ? 'Voci: AI attiva' : 'Voci: dialoghi scritti';
    b.className = 'badge ' + (on ? 'on' : 'off');
    const m = $('menu-ai'); if (m) m.textContent = st === 'checking' ? 'Controllo se l\'AI è disponibile…' : st === 'ready' ? 'AI disponibile: gli abitanti risponderanno a quello che scrivi.' : 'AI non disponibile qui: gli abitanti useranno i dialoghi scritti.';
    $('ai-toggle').disabled = st !== 'ready';
  }

  // ------------------------------------------------------------ panels
  function togglePanel(name) { if (uiOpen === name) closePanel(); else openPanel(name); }
  function openPanel(name) {
    uiOpen = name;
    if (document.exitPointerLock) document.exitPointerLock();
    ['journal', 'inventory', 'map'].forEach(p => $('panel-' + p).hidden = p !== name);
    if (name === 'journal') renderJournal();
    if (name === 'inventory') renderInventory();
    if (name === 'map') renderBigMap();
  }
  function closePanel() { uiOpen = null; ['journal', 'inventory', 'map'].forEach(p => $('panel-' + p).hidden = true); if (started && !paused) requestLock(); }
  function renderJournal() {
    const box = $('journal-list'); box.innerHTML = '';
    const ids = Object.keys(S().quests);
    if (!ids.length) { box.innerHTML = '<p class="empty">Nessuna missione. Parla con gli abitanti del villaggio (tasto E).</p>'; return; }
    ids.sort((a, b) => (S().quests[a].state === 'done') - (S().quests[b].state === 'done'));
    for (const id of ids) {
      const q = S().quests[id];
      const el = document.createElement('div'); el.className = 'quest' + (q.state === 'done' ? ' done' : '') + (id === 'main' ? ' main' : '');
      const h = document.createElement('h4'); h.textContent = Data.quests[id].title;
      const p = document.createElement('p'); p.textContent = Data.questText(id, G);
      const giver = document.createElement('small'); giver.textContent = 'Da: ' + Data.npcs.find(n => n.id === Data.quests[id].giver).name + (q.state === 'done' ? ' · completata' : '');
      el.append(h, p, giver); box.appendChild(el);
    }
  }
  function renderInventory() {
    const s = S(); const box = $('inv-list'); box.innerHTML = '';
    const stats = $('inv-stats');
    stats.innerHTML = '';
    [['Livello', s.level], ['Vita', `${Math.round(s.hp)}/${s.maxHp}`], ['Mana', `${Math.round(s.mana)}/${s.maxMana}`], ['Danno spada', s.dmg], ['Armatura', Math.round(s.armor * 100) + '%'], ['Velocità', Math.round(s.speed * 100) + '%'], ['Oro', s.gold], ['Nemici sconfitti', s.kills]].forEach(([k, v]) => {
      const d = document.createElement('div'); d.innerHTML = '<span></span><b></b>'; d.querySelector('span').textContent = k; d.querySelector('b').textContent = v; stats.appendChild(d);
    });
    const items = Object.entries(s.inv).filter(([, n]) => n > 0);
    if (!items.length) box.innerHTML = '<p class="empty">Borsa vuota.</p>';
    for (const [k, n] of items) {
      const it = Data.items[k]; if (!it) continue;
      const el = document.createElement('div'); el.className = 'item';
      el.innerHTML = '<i></i><div><b></b><small></small></div><em></em>';
      el.querySelector('i').textContent = it.icon; el.querySelector('b').textContent = it.name; el.querySelector('small').textContent = it.desc; el.querySelector('em').textContent = '×' + n;
      box.appendChild(el);
    }
  }

  // ------------------------------------------------------------ minimap
  let mapBase = null;
  function buildMinimapBase() {
    const N = 256; const cv = document.createElement('canvas'); cv.width = cv.height = N;
    const g = cv.getContext('2d'); const img = g.createImageData(N, N);
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      const x = (i / N) * World.SIZE - World.HALF, z = (j / N) * World.SIZE - World.HALF;
      const h = World.height(x, z);
      let r, gg, b;
      if (h < World.WATER + 0.2 && Math.hypot(x + 100, z - 95) < 64) { r = 30; gg = 60; b = 90; }
      else if (World.pathDist(x, z) < 2.5) { r = 120; gg = 98; b = 70; }
      else { const k = U.clamp(h / 40, 0, 1); r = 40 + k * 80; gg = 62 + k * 60; b = 44 + k * 70; }
      if (Math.hypot(x, z) < 40) { r += 18; gg += 14; b += 8; }
      const o = (j * N + i) * 4; img.data[o] = r; img.data[o + 1] = gg; img.data[o + 2] = b; img.data[o + 3] = 255;
    }
    g.putImageData(img, 0, 0);
    mapBase = cv;
  }
  function worldToMap(x, z, N) { return [(x + World.HALF) / World.SIZE * N, (z + World.HALF) / World.SIZE * N]; }
  function questTargets() {
    const s = S(), t = [];
    const q = s.quests;
    if (q.main && q.main.state === 'active') {
      if (q.main.stage === 'faro') t.push([World.faroDoor.x, World.faroDoor.z]);
      else if ((s.inv.ember || 0) >= 3) t.push([-10, -10]);
      else { for (const b of ['alpha', 'knight', 'golem']) if (!s.bossDead[b]) { const sp = Data.spawns.find(x => x.type === b); t.push([sp.x, sp.z]); } }
    }
    if (q.pendant && q.pendant.state === 'active' && !s.inv.pendant) t.push(Data.pendantSpot);
    if (q.fish && q.fish.state === 'active' && !s.inv.fish) t.push([World.dock.x, World.dock.z]);
    return t;
  }
  function drawMinimap() {
    const cv = $('minimap'); const g = cv.getContext('2d'); const N = cv.width;
    const scale = 3; // zoom
    g.save(); g.clearRect(0, 0, N, N);
    g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 2, 0, 7); g.clip();
    const [px, pz] = worldToMap(player.x, player.z, 256);
    g.translate(N / 2, N / 2); g.rotate(cam.yaw - Math.PI); g.scale(scale * N / 256, scale * N / 256); g.translate(-px, -pz);
    g.drawImage(mapBase, 0, 0);
    const dot = (x, z, col, r) => { const [mx, mz] = worldToMap(x, z, 256); g.fillStyle = col; g.beginPath(); g.arc(mx, mz, r, 0, 7); g.fill(); };
    for (const n of npcs) dot(n.x, n.z, '#f0d080', 1.2);
    for (const e of enemies) if (!e.dead && !e.gone && Math.hypot(e.x - player.x, e.z - player.z) < 40) dot(e.x, e.z, e.def.boss ? '#ff4040' : '#d06060', e.def.boss ? 1.6 : 0.8);
    for (const [x, z] of questTargets()) { const [mx, mz] = worldToMap(x, z, 256); g.strokeStyle = '#ffe070'; g.lineWidth = 0.6; g.beginPath(); g.arc(mx, mz, 2.2, 0, 7); g.stroke(); }
    g.restore();
    // player arrow (always up)
    g.save(); g.translate(N / 2, N / 2); g.rotate(-(player.yaw - cam.yaw - Math.PI));
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    // north marker
    g.save(); g.translate(N / 2, N / 2); g.rotate(cam.yaw - Math.PI);
    g.fillStyle = '#e8c070'; g.font = '600 11px var(--f-ui, sans-serif)'; g.textAlign = 'center'; g.fillText('N', 0, -N / 2 + 14);
    g.restore();
  }
  function renderBigMap() {
    const cv = $('bigmap'); const g = cv.getContext('2d'); const N = cv.width;
    g.imageSmoothingEnabled = true;
    g.drawImage(mapBase, 0, 0, N, N);
    g.font = '600 13px Alegreya, Georgia, serif'; g.textAlign = 'center';
    for (const k in World.places) {
      const p = World.places[k]; const [x, z] = worldToMap(p.x, p.z, N);
      g.fillStyle = 'rgba(10,10,20,0.55)'; const w = g.measureText(p.name).width + 10; g.fillRect(x - w / 2, z - 22, w, 18);
      g.fillStyle = '#f0e0c0'; g.fillText(p.name, x, z - 9);
    }
    for (const n of npcs) { const [x, z] = worldToMap(n.x, n.z, N); g.fillStyle = '#f0d080'; g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill(); }
    for (const [tx, tz] of questTargets()) { const [x, z] = worldToMap(tx, tz, N); g.strokeStyle = '#ffe070'; g.lineWidth = 2; g.beginPath(); g.arc(x, z, 8, 0, 7); g.stroke(); }
    const [x, z] = worldToMap(player.x, player.z, N);
    g.save(); g.translate(x, z); g.rotate(-player.yaw + Math.PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore();
  }

  // ------------------------------------------------------------ combat helpers
  function damageEnemy(e, dmg, kx, kz) {
    e.hp -= dmg; e.flash = 0.15; e.aggro = true;
    if (!e.def.boss) { e.x += kx * 0.6; e.z += kz * 0.6; }
    floatText(e, Math.round(dmg), '#ffd070');
    burst(e.x, e.y + 1.2, e.z, e.type === 'wisp' ? 0x90d0ff : e.type === 'golem' ? 0x8a8a90 : e.type.includes('skel') || e.type === 'knight' ? 0xe0d8c0 : 0x601010, 8);
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    const s = S();
    e.dead = true; e.deadT = 0; e.state = 'dead';
    s.kills++;
    AudioFX.sfx.die();
    gainXP(e.def.xp);
    const gold = Math.floor(e.def.gold[0] + Math.random() * (e.def.gold[1] - e.def.gold[0] + 1));
    s.gold += gold; floatTextAt(e.x, e.y + 2.4, e.z, `+${gold} oro`, '#ffd040');
    if ((e.type === 'wolf' || e.type === 'alpha') && s.quests.wolves && s.quests.wolves.state === 'active') {
      s.quests.wolves.progress = (s.quests.wolves.progress || 0) + 1;
      if (s.quests.wolves.progress === 6) toast('Sentieri sicuri', 'Hai abbattuto sei lupi. Torna dalla Capitana Sera.');
    }
    if (e.def.drop === 'iron' && Math.random() < 0.55 && (s.inv.iron || 0) < 3 && s.quests.iron && s.quests.iron.state === 'active') { s.inv.iron = (s.inv.iron || 0) + 1; toast('Ferro Antico', `Trovato (${s.inv.iron}/3).`); AudioFX.sfx.pickup(); }
    if (e.def.boss) {
      s.bossDead[e.type] = 1;
      s.inv.ember = (s.inv.ember || 0) + 1;
      toast(e.def.name + ' è caduto!', `Hai ottenuto una Brace Primordiale (${s.inv.ember}/3).`);
      AudioFX.sfx.quest(); shake(0.5);
      burst(e.x, e.y + 2, e.z, 0xff8030, 50);
      if (!s.quests.main) startQuest('main');
      save();
    }
    updateHUD();
  }
  function hurtPlayer(dmg, fromX, fromZ) {
    if (player.inv > 0 || player.hp <= 0) return;
    const s = S();
    const d = Math.round(dmg * (1 - s.armor) * (0.9 + Math.random() * 0.2));
    s.hp -= d; player.inv = 0.5; player.hurtT = 0.25;
    AudioFX.sfx.hurt(); shake(0.25);
    $('vignette').classList.remove('hit'); void $('vignette').offsetWidth; $('vignette').classList.add('hit');
    floatTextAt(player.x, player.y + 2.2, player.z, '-' + d, '#ff6060');
    if (fromX !== undefined) { const dx = player.x - fromX, dz = player.z - fromZ, l = Math.hypot(dx, dz) || 1; player.kx = dx / l * 6; player.kz = dz / l * 6; }
    if (s.hp <= 0) playerDie();
    updateHUD();
  }
  G.hurtPlayer = hurtPlayer;
  function playerDie() {
    const s = S(); s.hp = 0; s.deaths++;
    player.atk = null; player.roll = null;
    $('death').hidden = false;
    setTimeout(() => {
      $('death').hidden = true;
      s.hp = s.maxHp; s.mana = s.maxMana; s.gold = Math.floor(s.gold * 0.85);
      player.x = 0; player.z = 6; player.y = World.height(0, 6); player.vy = 0;
      for (const e of enemies) if (!e.dead && e.aggro) { e.aggro = false; e.x = e.sx; e.z = e.sz; if (e.def.boss) e.hp = e.def.hp; }
      toast('Ti risvegli a Valdombra', 'Fra\' Tobia ti ha trovato e curato. Hai perso un po\' d\'oro.');
      updateHUD(); save();
    }, 2600);
  }

  function spawnProjectile(x, y, z, dir, speed, owner, dmg, color) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(owner === 'player' ? 0.28 : 0.22, 1), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z); scene.add(m);
    const l = new THREE.PointLight(color, 1.2, 8, 2); m.add(l);
    projectiles.push({ m, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, owner, dmg, life: 2.4, color });
  }

  const partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  function burst(x, y, z, color, n) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(partGeo, mat); m.position.set(x, y, z); scene.add(m);
      particles.push({ m, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5 + 1, vz: (Math.random() - 0.5) * 6, life: 0.6 + Math.random() * 0.5, mat });
    }
  }

  const tmpV = new THREE.Vector3();
  function floatText(e, txt, col) { floatTextAt(e.x, e.y + (e.def.boss ? 4 : 2.2), e.z, txt, col); }
  const floaters = [];
  function floatTextAt(x, y, z, txt, col) {
    const el = document.createElement('div'); el.className = 'float'; el.textContent = txt; el.style.color = col;
    $('labels').appendChild(el); floaters.push({ el, x, y, z, t: 0 });
  }
  let shakeAmt = 0;
  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

  // ------------------------------------------------------------ toasts / HUD
  let toastTimer = null;
  function toast(title, body) {
    const t = $('toast');
    t.querySelector('b').textContent = title; t.querySelector('span').textContent = body || '';
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4800);
  }
  G.toast = toast;
  function updateHUD() {
    const s = S();
    $('hp-fill').style.width = (s.hp / s.maxHp * 100) + '%';
    $('hp-txt').textContent = `${Math.max(0, Math.round(s.hp))} / ${s.maxHp}`;
    $('mp-fill').style.width = (s.mana / s.maxMana * 100) + '%';
    $('mp-txt').textContent = `${Math.round(s.mana)} / ${s.maxMana}`;
    $('xp-fill').style.width = (s.xp / xpNeed(s.level) * 100) + '%';
    $('lvl').textContent = s.level;
    $('gold').textContent = s.gold;
    $('potions').textContent = s.inv.potion || 0;
    $('embers').textContent = `${s.inv.ember || 0}/3`;
    // tracked quest
    const q = s.quests.main && s.quests.main.state !== 'done' ? 'main' : Object.keys(s.quests).find(id => s.quests[id].state === 'active');
    $('track').hidden = !q;
    if (q) { $('track-title').textContent = Data.quests[q].title; $('track-text').textContent = Data.questText(q, G); }
  }

  function showEnding() {
    const s = S();
    paused = true; if (document.exitPointerLock) document.exitPointerLock();
    $('end-stats').textContent = `Livello ${s.level} · ${s.kills} nemici sconfitti · ${Object.values(s.quests).filter(q => q.state === 'done').length} missioni completate · ${Math.round(s.playTime / 60)} minuti`;
    $('ending').hidden = false;
  }

  // ------------------------------------------------------------ update loop
  G.loop = function () {
    requestAnimationFrame(G.loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    time += dt;
    if (dawnT > 0 && dawnT < 1) { dawnT = Math.min(1, dawnT + dt / 7); applyDawn(dawnT); }
    if (started && !paused) update(dt);
    else if (!started) { // menu: slow orbit over the village
      const a = time * 0.05;
      camera.position.set(Math.cos(a) * 60, 32, Math.sin(a) * 60);
      camera.lookAt(0, 4, 0);
      World.update(dt, time);
      animateNPCs(dt);
    }
    renderer.render(scene, camera);
    if (started) positionLabels();
  };

  function update(dt) {
    const s = S();
    s.playTime += dt;
    World.update(dt, time);
    updatePlayer(dt);
    updateCamera(dt);
    updateEnemies(dt);
    animateNPCs(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updatePickups(dt);
    // regen
    s.mana = Math.min(s.maxMana, s.mana + dt * 3.2);
    if (!enemies.some(e => e.aggro && !e.dead)) s.hp = Math.min(s.maxHp, s.hp + dt * 1.2);
    AudioFX.combat = enemies.some(e => e.aggro && !e.dead);
    // interact prompt
    const it = (inDialogue || uiOpen) ? null : nearestInteractable();
    const lbl = interactLabel(it);
    $('prompt').hidden = !lbl; if (lbl) $('prompt-txt').textContent = lbl;
    // zone toast
    const z = World.zoneAt(player.x, player.z);
    if (z !== lastZone) { lastZone = z; if (z) { const el = $('zone'); el.textContent = World.places[z].name; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); } }
    // boss bar
    const boss = enemies.find(e => e.def.boss && e.aggro && !e.dead && Math.hypot(e.x - player.x, e.z - player.z) < 40);
    $('bossbar').hidden = !boss;
    if (boss) { $('boss-name').textContent = boss.def.name; $('boss-fill').style.width = Math.max(0, boss.hp / boss.def.hp * 100) + '%'; }
    updateHUDFast();
    drawMinimap();
    saveTimer += dt; if (saveTimer > 20) { saveTimer = 0; save(); }
    if (uiOpen === 'map') renderBigMap();
  }
  function updateHUDFast() {
    const s = S();
    $('hp-fill').style.width = (Math.max(0, s.hp) / s.maxHp * 100) + '%';
    $('mp-fill').style.width = (s.mana / s.maxMana * 100) + '%';
    $('hp-txt').textContent = `${Math.max(0, Math.round(s.hp))} / ${s.maxHp}`;
    $('mp-txt').textContent = `${Math.round(s.mana)} / ${s.maxMana}`;
    $('lowhp').classList.toggle('on', s.hp > 0 && s.hp < s.maxHp * 0.3);
  }

  function updatePlayer(dt) {
    const s = S();
    if (s.hp <= 0) { Models.animHumanoid(rig, 'dead', time, { k: 1 }); placeRig(); return; }
    player.inv = Math.max(0, player.inv - dt); player.hurtT = Math.max(0, player.hurtT - dt);
    player.comboT = Math.max(0, player.comboT - dt); player.castT = Math.max(0, player.castT - dt); player.potionCd = Math.max(0, player.potionCd - dt);
    const frozen = inDialogue || uiOpen;
    let mv = frozen ? { x: 0, z: 0 } : inputVector();
    const running = keys.ShiftLeft || keys.ShiftRight;
    let speed = (running ? 8.2 : 4.6) * s.speed;
    let state = 'idle';
    if (player.fishing) {
      mv = { x: 0, z: 0 };
      player.fishing.t += dt;
      if (player.fishing.t > player.fishing.dur) {
        player.fishing = null;
        if (Math.random() < 0.6) { s.inv.fish = 1; toast('Pesce d\'Argento!', 'Guizza e luccica. Ottone sarà... soddisfatto?'); AudioFX.sfx.pickup(); burst(World.dock.x, 0.5, World.dock.z, 0xd0e0ff, 16); save(); }
        else toast('Niente...', 'Il pesce è scappato. Riprova (E).');
      }
    }
    if (player.roll) {
      player.roll.t += dt;
      const k = player.roll.t / player.roll.dur;
      mv = { x: Math.sin(player.roll.ang), z: Math.cos(player.roll.ang) }; speed = 11 * (1 - k * 0.5);
      player.yaw = player.roll.ang;
      if (k >= 1) player.roll = null;
      state = 'roll';
    } else if (player.atk) {
      player.atk.t += dt;
      const k = player.atk.t / player.atk.dur;
      if (!player.atk.hit && k > (player.atk.combo === 2 ? 0.5 : 0.4)) { player.atk.hit = true; doHitCheck(player.atk.combo); }
      speed *= 0.25;
      state = 'attack';
      if (k >= 1) { player.atk = null; if (player.queued) { player.queued = false; attack(); } }
    }
    let mx = mv.x * speed, mz = mv.z * speed;
    if (player.kx) { mx += player.kx; mz += player.kz; player.kx *= 0.85; player.kz *= 0.85; if (Math.abs(player.kx) < 0.05) player.kx = player.kz = 0; }
    let nx = player.x + mx * dt, nz = player.z + mz * dt;
    // water: can't go deep
    if (World.height(nx, nz) < -1.2) { nx = player.x; nz = player.z; }
    const r = World.resolve(nx, nz, 0.45);
    // npc soft collision
    for (const n of npcs) { const dx = r.x - n.x, dz = r.z - n.z, d = Math.hypot(dx, dz); if (d < 0.9 && d > 0.01 && !n.d.cat) { r.x = n.x + dx / d * 0.9; r.z = n.z + dz / d * 0.9; } }
    player.x = r.x; player.z = r.z;
    const moving = Math.hypot(mv.x, mv.z) > 0.1;
    if (moving && !player.roll && !player.atk) { player.yaw = U.angleLerp(player.yaw, Math.atan2(mv.x, mv.z), Math.min(1, dt * 12)); state = running ? 'run' : 'walk'; }
    // vertical
    const gh = Math.max(World.height(player.x, player.z), World.WATER - 0.6);
    player.vy -= 22 * dt; player.y += player.vy * dt;
    if (player.y <= gh) { player.y = gh; player.vy = 0; player.onGround = true; } else if (player.y > gh + 0.05) player.onGround = false;
    if (!player.onGround && !player.roll) state = 'jump';
    if (player.castT > 0 && !player.atk && !player.roll) state = 'cast';
    if (player.hurtT > 0 && state === 'idle') state = 'hurt';
    if (player.fishing) state = 'idle';
    // footsteps
    if ((state === 'walk' || state === 'run') && player.onGround) { player.stepT -= dt * (state === 'run' ? 1.6 : 1); if (player.stepT <= 0) { player.stepT = 0.33; AudioFX.sfx.step(); } }
    const k = player.atk ? player.atk.t / player.atk.dur : player.roll ? player.roll.t / player.roll.dur : 0;
    Models.animHumanoid(rig, state, time, { k, combo: player.atk ? player.atk.combo : 0 });
    if (player.fishing) { rig.armR.rotation.x = -1.2; rig.armL.rotation.x = -1.0; }
    // flicker when invulnerable after hit
    rig.root.visible = !(player.inv > 0 && !player.roll && Math.floor(time * 20) % 2 === 0);
    placeRig();
    // sword trail glow during attack
    rig.blade.material.emissiveIntensity = player.atk ? 2 : 1;
  }
  function placeRig() {
    rig.root.position.set(player.x, player.y, player.z);
    rig.root.rotation.y = player.yaw;
    playerLight.position.set(player.x, player.y + 2.2, player.z);
    playerLight.intensity = S().flags.dawn ? 0.2 : 1.1;
    moonLight.position.set(player.x - 30, player.y + 60, player.z - 40);
    moonLight.target.position.set(player.x, player.y, player.z);
  }

  const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    let dist = cam.dist;
    if (inDialogue && dlg) {
      // frame the NPC
      const n = dlg.n;
      const mx = (player.x + n.x) / 2, mz = (player.z + n.z) / 2;
      const ang = Math.atan2(n.x - player.x, n.z - player.z) + Math.PI / 2;
      const tx = mx + Math.sin(ang) * 4.5, tz = mz + Math.cos(ang) * 4.5;
      camPos.lerp(tmpV.set(tx, World.height(tx, tz) + 2.6, tz), Math.min(1, dt * 3));
      camTarget.lerp(tmpV.set(mx, n.y + (n.d.cat ? 0.6 : 1.5), mz), Math.min(1, dt * 4));
      camera.position.copy(camPos); camera.lookAt(camTarget);
      // face each other
      player.yaw = U.angleLerp(player.yaw, Math.atan2(n.x - player.x, n.z - player.z), dt * 6);
      n.yaw = U.angleLerp(n.yaw, Math.atan2(player.x - n.x, player.z - n.z), dt * 6);
      return;
    }
    const tx = player.x, ty = player.y + 1.7, tz = player.z;
    let cx = tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
    let cz = tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
    let cy = ty + Math.sin(cam.pitch) * dist;
    const gh = Math.max(World.height(cx, cz), World.WATER) + 0.6;
    if (cy < gh) cy = gh;
    camPos.lerp(tmpV.set(cx, cy, cz), Math.min(1, dt * 14));
    camera.position.copy(camPos);
    if (shakeAmt > 0) { camera.position.x += (Math.random() - 0.5) * shakeAmt; camera.position.y += (Math.random() - 0.5) * shakeAmt; shakeAmt = Math.max(0, shakeAmt - dt * 1.5); }
    camTarget.set(tx, ty, tz);
    camera.lookAt(camTarget);
  }

  function animateNPCs(dt) {
    for (const n of npcs) {
      const dp = started ? Math.hypot(player.x - n.x, player.z - n.z) : 99;
      if (!n.talking && dp < 6) n.yaw = U.angleLerp(n.yaw, Math.atan2(player.x - n.x, player.z - n.z), dt * 3);
      n.m.root.rotation.y = n.yaw;
      if (n.d.cat) Models.animCat(n.m, n.talking ? 'talk' : 'idle', time);
      else Models.animHumanoid(n.m, n.talking ? 'talk' : 'idle', time);
      // barks
      if (started && !inDialogue) {
        n.barkT -= dt;
        if (n.barkT <= 0 && dp < 9) { n.barkT = 14 + Math.random() * 10; floatTextAt(n.x, n.y + (n.d.cat ? 1.2 : 2.6), n.z, U.pick(Data.barks[n.d.id]), '#e8dcc0'); }
      }
    }
  }

  function updateEnemies(dt) {
    const s = S();
    for (const e of enemies) {
      const def = e.def;
      if (e.gone) {
        if (!def.boss) { e.respawnT -= dt; if (e.respawnT <= 0 && Math.hypot(player.x - e.sx, player.z - e.sz) > 45 && !s.flags.dawn) reviveEnemy(e); }
        continue;
      }
      if (e.dead) {
        e.deadT += dt; e.flash = Math.max(0, e.flash - dt);
        animEnemy(e, 'dead', Math.min(1, e.deadT * 2));
        if (e.deadT > 2.2) { e.gone = true; e.m.root.visible = false; e.respawnT = 90; }
        placeEnemy(e);
        continue;
      }
      const dx = player.x - e.x, dz = player.z - e.z, d = Math.hypot(dx, dz);
      const leash = Math.hypot(e.x - e.sx, e.z - e.sz);
      const alive = s.hp > 0;
      if (!e.aggro && alive && d < def.aggro && !inDialogue) { e.aggro = true; if (def.boss) { AudioFX.sfx.roar(); toast(def.name, 'Un guardiano corrotto ti sbarra la strada!'); } }
      if (e.aggro && (leash > (def.boss ? 30 : 40) || !alive || d > def.aggro * 2.6)) { e.aggro = false; e.state = 'return'; }
      if (s.flags.dawn && !def.boss) { e.aggro = false; } // creatures of the night are calm at dawn
      e.cd -= dt; e.flash = Math.max(0, e.flash - dt);
      let moveX = 0, moveZ = 0, anim = 'idle', k = 0;
      if (e.state === 'windup') {
        e.t += dt; anim = 'windup'; e.yaw = U.angleLerp(e.yaw, Math.atan2(dx, dz), dt * (def.boss ? 2 : 4));
        if (e.t >= def.windup) { e.state = 'attack'; e.t = 0; e.hitDone = false; if (def.ranged) enemyShoot(e); }
      } else if (e.state === 'attack') {
        e.t += dt; anim = 'attack'; k = Math.min(1, e.t / 0.4);
        if (e.type === 'wolf' || e.type === 'alpha') { moveX = Math.sin(e.yaw) * 9; moveZ = Math.cos(e.yaw) * 9; } // lunge
        if (!e.hitDone && e.t > 0.15 && !def.ranged) {
          e.hitDone = true;
          const reach = def.range + 0.5;
          if (def.slam) { // area slam
            if (d < 5.5) hurtPlayer(def.dmg, e.x, e.z);
            shake(0.6); AudioFX.sfx.boom(); burst(e.x + Math.sin(e.yaw) * 2.5, e.y + 0.3, e.z + Math.cos(e.yaw) * 2.5, 0x8a7a6a, 30);
          } else if (d < reach) {
            const dot = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / (d || 1);
            if (dot > 0.3) hurtPlayer(def.dmg, e.x, e.z);
          }
        }
        if (e.t > 0.5) { e.state = 'chase'; e.cd = def.cooldown * (0.8 + Math.random() * 0.4) * (def.boss && e.hp < def.hp * 0.4 ? 0.7 : 1); }
      } else if (e.aggro) {
        e.yaw = U.angleLerp(e.yaw, Math.atan2(dx, dz), dt * 6);
        const want = def.ranged ? 8 : def.range * 0.8;
        if (d > want) { const sp = def.speed * (def.boss && e.hp < def.hp * 0.4 ? 1.25 : 1); moveX = dx / d * sp; moveZ = dz / d * sp; anim = sp > 4 ? 'run' : 'walk'; }
        else if (def.ranged && d < 5) { moveX = -dx / d * def.speed; moveZ = -dz / d * def.speed; anim = 'walk'; }
        if (e.cd <= 0 && d < (def.ranged ? def.range : def.range + 0.4)) { e.state = 'windup'; e.t = 0; if (def.boss) AudioFX.sfx.swing(); }
      } else {
        // return home / wander
        const hx = e.sx - e.x, hz = e.sz - e.z, hd = Math.hypot(hx, hz);
        if (e.state === 'return' && hd > 1.5) { moveX = hx / hd * def.speed; moveZ = hz / hd * def.speed; e.yaw = Math.atan2(hx, hz); anim = 'walk'; if (def.boss) e.hp = Math.min(def.hp, e.hp + dt * 40); }
        else {
          if (e.state === 'return') e.state = 'idle';
          if (!e.wander || e.wander.t <= 0) { const a = Math.random() * 6.28, r = Math.random() * 6; e.wander = { x: e.sx + Math.cos(a) * r, z: e.sz + Math.sin(a) * r, t: 3 + Math.random() * 4 }; }
          e.wander.t -= dt;
          const wx = e.wander.x - e.x, wz = e.wander.z - e.z, wd = Math.hypot(wx, wz);
          if (wd > 0.5 && !def.boss) { moveX = wx / wd * def.speed * 0.3; moveZ = wz / wd * def.speed * 0.3; e.yaw = U.angleLerp(e.yaw, Math.atan2(wx, wz), dt * 3); anim = 'walk'; }
        }
      }
      let nx = e.x + moveX * dt, nz = e.z + moveZ * dt;
      if (World.height(nx, nz) < -0.8 && !def.fly) { nx = e.x; nz = e.z; }
      const r = World.resolve(nx, nz, def.radius * 0.7);
      e.x = r.x; e.z = r.z;
      // separation from player
      const pd = Math.hypot(player.x - e.x, player.z - e.z), minD = def.radius + 0.5;
      if (pd < minD && pd > 0.01) { e.x = player.x - (player.x - e.x) / pd * minD; e.z = player.z - (player.z - e.z) / pd * minD; }
      animEnemy(e, anim, k);
      placeEnemy(e);
    }
    // enemy-enemy separation
    for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j]; if (a.dead || b.dead || a.gone || b.gone) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = (a.def.radius + b.def.radius) * 0.8;
      if (d < m && d > 0.01) { const p = (m - d) / 2; a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p; }
    }
  }
  function animEnemy(e, anim, k) {
    if (e.m.kind === 'wolf') Models.animWolf(e.m, anim, time, { k });
    else if (e.m.kind === 'wisp') Models.animWisp(e.m, anim, time, { k });
    else if (e.m.kind === 'golem') Models.animGolem(e.m, anim, time, { k });
    else {
      const a = anim === 'windup' ? 'attack' : anim;
      Models.animHumanoid(e.m, a, time, { k: anim === 'windup' ? 0.2 : anim === 'attack' ? 0.35 + k * 0.65 : k, combo: e.type === 'knight' ? 2 : 0 });
    }
    // hit flash
    const want = e.flash > 0 ? 0xffffff : e.state === 'windup' ? 0x801000 : -1;
    if (want !== e._flashOn) {
      e._flashOn = want;
      e.m.root.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(want >= 0 ? want : (o.material.userData.baseEm || 0)); });
    }
  }
  function placeEnemy(e) {
    e.y = World.height(e.x, e.z);
    if (e.def.fly) e.y = Math.max(e.y, World.WATER);
    e.m.root.position.set(e.x, e.y, e.z);
    e.m.root.rotation.y = e.yaw;
  }
  function enemyShoot(e) {
    const dir = new THREE.Vector3(player.x - e.x, (player.y + 1.2) - (e.y + 1.6), player.z - e.z).normalize();
    spawnProjectile(e.x + dir.x * 0.6, e.y + 1.6, e.z + dir.z * 0.6, dir, 12, 'enemy', e.def.dmg, 0xa070ff);
  }

  function updateProjectiles(dt) {
    for (let i = projectiles.length - 1; i >= 0; i--) {
      const p = projectiles[i];
      p.life -= dt;
      p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.rotation.x += dt * 8; p.m.rotation.y += dt * 6;
      const { x, y, z } = p.m.position;
      let hit = p.life <= 0 || y < World.height(x, z);
      if (!hit && p.owner === 'player') {
        for (const e of enemies) {
          if (e.dead || e.gone) continue;
          const ey = e.y + (e.def.fly ? 1.6 : e.def.boss ? 2 : 1);
          if (Math.hypot(e.x - x, e.z - z) < e.def.radius + 0.5 && Math.abs(ey - y) < (e.def.boss ? 3 : 1.4)) { damageEnemy(e, p.dmg, p.vx / 26, p.vz / 26); hit = true; break; }
        }
      } else if (!hit && p.owner === 'enemy') {
        if (Math.hypot(player.x - x, player.z - z) < 0.7 && y > player.y && y < player.y + 2.2) { hurtPlayer(p.dmg, x - p.vx, z - p.vz); hit = true; }
      }
      if (hit) {
        burst(x, y, z, p.color, 10);
        if (p.owner === 'player') AudioFX.sfx.boom();
        scene.remove(p.m); p.m.geometry.dispose(); p.m.material.dispose();
        projectiles.splice(i, 1);
      }
    }
  }
  function updateParticles(dt) {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i]; p.life -= dt;
      p.vy -= 12 * dt; p.m.position.x += p.vx * dt; p.m.position.y += p.vy * dt; p.m.position.z += p.vz * dt;
      p.m.scale.setScalar(Math.max(0.01, p.life * 1.5));
      if (p.life <= 0) { scene.remove(p.m); particles.splice(i, 1); }
    }
  }
  function updatePickups(dt) {
    for (const p of pickups) {
      if (p.taken) continue;
      if (p.kind === 'herb') p.mesh.rotation.y += dt * 0.6;
      if (p.spin) { p.spin.rotation.y += dt * 2; p.spin.position.y = 0.35 + Math.sin(time * 2) * 0.08; }
    }
  }

  // ------------------------------------------------------------ screen-space labels
  function project(x, y, z) {
    tmpV.set(x, y, z).project(camera);
    if (tmpV.z > 1) return null;
    return [(tmpV.x * 0.5 + 0.5) * window.innerWidth, (-tmpV.y * 0.5 + 0.5) * window.innerHeight];
  }
  function positionLabels() {
    for (const n of npcs) {
      const d = Math.hypot(player.x - n.x, player.z - n.z);
      const pr = d < 22 && !inDialogue ? project(n.x, n.y + (n.d.cat ? 1.0 : 2.4) * (n.d.look && n.d.look.scale || 1), n.z) : null;
      n.label.hidden = !pr;
      if (pr) { n.label.style.transform = `translate(${pr[0]}px, ${pr[1]}px) translate(-50%, -100%)`; n.label.style.opacity = U.clamp(1.4 - d / 16, 0.15, 1); }
      // quest marker: "!" if NPC has a quest action available
      const act = n.d.topics.some(t => t.action && t.action !== 'bless' && t.action !== 'buy_potion' && t.action !== 'reveal' && (!t.cond || t.cond(G)));
      const done = n.d.topics.some(t => t.action && /complete|deliver/.test(t.action) && (!t.cond || t.cond(G)));
      const mp = act && d < 60 && !inDialogue ? project(n.x, n.y + (n.d.cat ? 1.6 : 3.1) * (n.d.look && n.d.look.scale || 1), n.z) : null;
      n.marker.hidden = !mp;
      if (mp) { n.marker.textContent = done ? '?' : '!'; n.marker.className = 'qmark' + (done ? ' done' : ''); n.marker.style.transform = `translate(${mp[0]}px, ${mp[1]}px) translate(-50%, -100%)`; }
    }
    for (const e of enemies) {
      const show = !e.dead && !e.gone && !e.def.boss && (e.aggro || e.hp < e.def.hp) && Math.hypot(player.x - e.x, player.z - e.z) < 25;
      const pr = show ? project(e.x, e.y + (e.def.fly ? 2.5 : e.type === 'wolf' ? 1.8 : 2.3), e.z) : null;
      e.hpBar.hidden = !pr;
      if (pr) { e.hpBar.style.transform = `translate(${pr[0]}px, ${pr[1]}px) translate(-50%, -100%)`; e.hpBar.firstChild.style.width = Math.max(0, e.hp / e.def.hp * 100) + '%'; }
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.t += 1 / 60;
      const pr = project(f.x, f.y + f.t * 1.2, f.z);
      if (!pr || f.t > 1.4) { f.el.remove(); floaters.splice(i, 1); continue; }
      f.el.style.transform = `translate(${pr[0]}px, ${pr[1]}px) translate(-50%, -50%)`; f.el.style.opacity = Math.min(1, (1.4 - f.t) * 2);
    }
  }

  // debug hooks for automated checks
  G._debug = { player: () => player, enemies, npcs, openDialogue: id => openDialogue(npcs.find(n => n.d.id === id)), keys, runAction, interact, cam };
})();
