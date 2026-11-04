// Valdombra — core game: player, camera, combat (parry/block/bash), movement (double jump, glide, grapple),
// gathering, building, loot, skills, enemies, NPCs, dialogue, UI, save.
(function () {
  const $ = id => document.getElementById(id);
  const G = {};
  window.Game = G;

  const SAVE_KEY = 'valdombra-save-v2';
  const keys = {};
  let renderer, scene, camera, clock, moonLight, hemi, playerLight, rope;
  let player, rig;
  const enemies = [], npcs = [], pickups = [], projectiles = [], particles = [], drops = [];
  const cam = { yaw: Math.PI, pitch: 0.3, dist: 6.5 };
  let pointerLocked = false, lmbHeld = false, rmbHeld = false;
  let paused = true, started = false, inDialogue = false, uiOpen = null;
  let lastZone = null, saveTimer = 0, time = 0, dawnT = 0;
  let hitStop = 0, slowMo = 0;
  let buildMode = false, buildSel = 0, buildRot = 0, buildPlan = null, digCd = 0;
  let D = null; // derived player stats

  // ------------------------------------------------------------ skills
  const SKILLS = [
    { id: 'double', name: 'Doppio salto', desc: 'Salta una seconda volta a mezz\'aria.', cost: 0, free: true },
    { id: 'grapple', name: 'Rampino', desc: 'G o tasto centrale: aggancia muri, alberi, rocce e nemici. I nemici piccoli vengono tirati verso di te.', cost: 0, free: true },
    { id: 'glide', name: 'Planata', desc: 'Tieni premuto Spazio mentre cadi per planare col mantello.', cost: 1 },
    { id: 'triple', name: 'Triplo salto', desc: 'Un terzo salto in aria.', cost: 2, req: 'double' },
    { id: 'grapple2', name: 'Rampino esperto', desc: 'Portata del rampino 60 m, ricarica dimezzata.', cost: 1, req: 'grapple' },
    { id: 'parry', name: 'Maestro della parata', desc: 'Finestra di parata +60%, stordimento +50%.', cost: 1 },
    { id: 'bash', name: 'Colpo di scudo pesante', desc: 'Il colpo di scudo fa il doppio dei danni e stordisce più a lungo.', cost: 1 },
    { id: 'whirl', name: 'Vortice', desc: 'R: attacco rotante che colpisce tutti intorno a te.', cost: 2 },
    { id: 'fire2', name: 'Palla di fuoco esplosiva', desc: 'La palla di fuoco esplode e colpisce un\'area.', cost: 2 },
    { id: 'vigor', name: 'Vigore', desc: '+30 vita massima.', cost: 1 },
    { id: 'endure', name: 'Resistenza', desc: '+40 stamina massima.', cost: 1 },
    { id: 'reaper', name: 'Mietitore', desc: 'Raccogli il doppio delle risorse.', cost: 1 },
  ];
  const has = id => !!S().skills[id];

  function freshState() {
    const sword = Loot.make('weapon', 'traveler', 0, {}, 'Spada del viandante');
    const shield = Loot.make('shield', 'plank', 0, {}, 'Scudo di assi');
    return {
      v: 2, level: 1, xp: 0, hp: 100, maxHp: 100, mana: 50, maxMana: 50, st: 100, gold: 10,
      dmg: 2, armor: 0, speed: 1, inv: { potion: 2 }, res: { wood: 0, stone: 0, iron: 0, crystal: 0, dirt: 0 },
      gear: [sword, shield], equip: { weapon: sword.id, shield: shield.id }, skills: { double: 1, grapple: 1 }, sp: 0,
      quests: {}, flags: {}, pos: { x: 0, z: 6 }, kills: 0, deaths: 0, history: {}, bossDead: {}, chests: {}, herbs: {}, playTime: 0,
      world: { nodes: [], structs: [], terrain: [] }, spawn: null,
    };
  }
  G.S = freshState();
  const S = () => G.S;

  function equipped(slot) { const id = S().equip[slot]; return S().gear.find(g => g.id === id) || null; }
  function refreshDerived() {
    const s = S(), w = equipped('weapon'), sh = equipped('shield');
    const ws = Loot.stats(w) || { dmg: 5, speed: 1.1, reach: 2.2 }, ss = Loot.stats(sh);
    const aff = {};
    for (const it of [w, sh]) if (it) for (const k in it.affixes) aff[k] = (aff[k] || 0) + it.affixes[k];
    D = {
      dmg: ws.dmg + s.dmg, speed: ws.speed, reach: ws.reach,
      leech: (aff.leech || 0) / 100, fire: aff.fire || 0, crit: (5 + (aff.crit || 0)) / 100,
      maxHp: s.maxHp + (aff.hp || 0) + (has('vigor') ? 30 : 0),
      maxSt: 100 + (aff.stam || 0) + (has('endure') ? 40 : 0),
      hasShield: !!sh, block: ss ? ss.block : 0, stab: ss ? ss.stab : 0, bash: ss ? ss.bash : 0, thorns: aff.thorns || 0,
      parryWin: 0.24 * (1 + (aff.parry || 0) / 100) * (has('parry') ? 1.6 : 1),
      stunMul: (1 + (aff.stun || 0) / 100) * (has('parry') ? 1.5 : 1),
      jumps: has('triple') ? 3 : has('double') ? 2 : 1,
      grappleRange: has('grapple2') ? 60 : 40, grappleCd: has('grapple2') ? 0.6 : 1.2,
    };
    s.hp = Math.min(s.hp, D.maxHp); s.st = Math.min(s.st, D.maxSt);
    if (rig) refreshGearMeshes();
  }
  G.derived = () => D;
  function refreshGearMeshes() {
    while (rig.weaponMount.children.length) rig.weaponMount.remove(rig.weaponMount.children[0]);
    while (rig.shieldMount.children.length) rig.shieldMount.remove(rig.shieldMount.children[0]);
    const w = equipped('weapon'), sh = equipped('shield');
    if (w) { const m = Loot.weaponMesh(w); rig.weaponMount.add(m); rig.blade = m.userData.blade; }
    if (sh) rig.shieldMount.add(Loot.shieldMesh(sh));
  }

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
    moonLight.castShadow = true;
    moonLight.shadow.mapSize.set(2048, 2048);
    const sc = moonLight.shadow.camera; sc.left = -45; sc.right = 45; sc.top = 45; sc.bottom = -45; sc.near = 1; sc.far = 200;
    moonLight.shadow.bias = -0.0008;
    scene.add(moonLight); scene.add(moonLight.target);

    World.build(scene);
    Build.init(scene);
    buildMinimapBase();

    spawnNPCs();
    spawnEnemies();
    spawnPickups();
    World.collectSolids(scene);
    // enemy & npc meshes must not be grappled as "solids"
    const skip = new Set();
    for (const e of enemies) e.m.root.traverse(o => skip.add(o));
    for (const n of npcs) n.m.root.traverse(o => skip.add(o));
    World.solids = World.solids.filter(o => !skip.has(o));

    rig = Models.hero();
    scene.add(rig.root);
    playerLight = new THREE.PointLight(0xffb060, 0.9, 14, 2);
    scene.add(playerLight);
    rope = new THREE.Line(new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]), new THREE.LineBasicMaterial({ color: 0xd8c8a0 }));
    rope.visible = false; rope.frustumCulled = false; scene.add(rope);
    player = { x: 0, z: 6, y: World.height(0, 6), vy: 0, vx: 0, vz: 0, yaw: Math.PI, onGround: true, jumps: 0, atk: null, combo: 0, comboT: 0, roll: null, inv: 0, hurtT: 0, castT: 0, stepT: 0, potionCd: 0, fishing: null, blocking: false, blockT: -9, bash: null, whirl: null, stagger: 0, stUse: 0, grapple: null, cds: { fire: 0, bash: 0, grapple: 0, whirl: 0 }, flip: 0 };
    refreshDerived();

    window.addEventListener('resize', onResize);
    bindInput();
    AIVoice.onStatus(updateAIBadge);
    AIVoice.init();
    $('btn-continue').hidden = !U.store.get(SAVE_KEY, null);
    buildHotbar();
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
    const base = freshState();
    G.S = Object.assign(base, sv, { res: Object.assign(base.res, sv.res || {}), world: Object.assign(base.world, sv.world || {}), skills: Object.assign(base.skills, sv.skills || {}) });
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
    player.x = s.pos.x; player.z = s.pos.z; player.y = World.height(player.x, player.z) + 0.5; player.vy = 0;
    for (const e of enemies) {
      if (e.def.boss && s.bossDead[e.type]) { e.dead = true; e.gone = true; e.m.root.visible = false; }
      else if (e.dead || e.gone) reviveEnemy(e);
    }
    for (const p of pickups) {
      if (p.kind === 'herb') p.taken = !!s.herbs[p.key];
      if (p.kind === 'chest') p.taken = !!s.chests[p.key];
      if (p.kind === 'pendant') p.taken = !!s.flags.pendantFound;
      p.mesh.visible = !p.taken; if (p.kind === 'chest') { p.mesh.visible = true; p.lid.rotation.x = p.taken ? -1.9 : 0; }
    }
    for (const id of s.world.nodes) { const n = World.nodes[id]; if (n && n.alive) World.removeNode(n); }
    if (s.world.terrain.length) World.applyDeltas(s.world.terrain);
    Build.load(s.world.structs);
    lightLantern(!!(s.quests.main && (s.quests.main.stage === 'faro' || s.quests.main.state === 'done')), true);
    setDawn(!!s.flags.dawn, true);
    refreshDerived();
    updateHUD();
  }
  function save() {
    const s = S(); s.pos = { x: player.x, z: player.z };
    s.world.structs = Build.serialize();
    s.world.terrain = World.deltaPairs();
    U.store.set(SAVE_KEY, s);
  }
  G.save = save;

  // ------------------------------------------------------------ input
  function requestLock() {
    const c = $('view');
    if (c.requestPointerLock) { try { const p = c.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* not allowed here */ } }
  }
  const canAct = () => started && !paused && !inDialogue && !uiOpen;
  function bindInput() {
    const c = $('view');
    document.addEventListener('pointerlockchange', () => { pointerLocked = document.pointerLockElement === c; });
    c.addEventListener('mousedown', e => {
      if (!canAct()) return;
      AudioFX.init();
      if (!pointerLocked) requestLock();
      if (e.button === 0) { lmbHeld = true; if (buildMode) buildAction(false); else if (rmbHeld && D.hasShield) shieldBash(); else attack(); }
      if (e.button === 2) { rmbHeld = true; if (buildMode) buildAction(true); else player.blockT = time; }
      if (e.button === 1) { e.preventDefault(); fireGrapple(); }
    });
    window.addEventListener('mouseup', e => { if (e.button === 0) lmbHeld = false; if (e.button === 2) rmbHeld = false; });
    c.addEventListener('contextmenu', e => e.preventDefault());
    c.addEventListener('auxclick', e => e.preventDefault());
    window.addEventListener('mousemove', e => {
      if (!canAct()) return;
      if (pointerLocked) { cam.yaw -= e.movementX * 0.0032; cam.pitch = U.clamp(cam.pitch + e.movementY * 0.0026, -0.6, 1.2); }
    });
    window.addEventListener('wheel', e => { if (!started || inDialogue) return; if (buildMode) { buildSel = (buildSel + Math.sign(e.deltaY) + Build.PIECES.length) % Build.PIECES.length; buildHotbar(); return; } cam.dist = U.clamp(cam.dist + Math.sign(e.deltaY) * 0.8, 3, 14); }, { passive: true });
    window.addEventListener('keydown', e => {
      if (e.target && (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA')) { if (e.key === 'Escape') closeDialogue(); return; }
      if (e.repeat && keys[e.code]) return;
      keys[e.code] = true;
      if (!started) return;
      if (e.code === 'Escape') { if (inDialogue) closeDialogue(); else if (uiOpen) closePanel(); else togglePause(); }
      if (e.code === 'Tab') e.preventDefault();
      if (paused) return;
      if (inDialogue) { if (/^Digit[1-9]$/.test(e.code)) { const b = document.querySelectorAll('#dlg-options button')[+e.code.slice(5) - 1]; if (b) b.click(); } return; }
      if (e.code === 'KeyJ') togglePanel('journal');
      if (e.code === 'KeyI' || e.code === 'Tab') togglePanel('inventory');
      if (e.code === 'KeyM') togglePanel('map');
      if (e.code === 'KeyK') togglePanel('skills');
      if (uiOpen) return;
      if (e.code === 'KeyB') toggleBuild();
      if (e.code === 'KeyE') interact();
      if (e.code === 'Space') jump();
      if (e.code === 'ControlLeft' || e.code === 'KeyC') dodge();
      if (e.code === 'KeyG') fireGrapple();
      if (buildMode) {
        if (/^Digit[1-8]$/.test(e.code)) { buildSel = +e.code.slice(5) - 1; buildHotbar(); }
        if (e.code === 'KeyR') { buildRot = (buildRot + 1) % 4; }
        return;
      }
      if (e.code === 'KeyQ') castFireball();
      if (e.code === 'KeyF') shieldBash();
      if (e.code === 'KeyR') whirl();
      if (e.code === 'Digit1') drinkPotion();
    });
    window.addEventListener('keyup', e => { keys[e.code] = false; });
    window.addEventListener('blur', () => { for (const k in keys) keys[k] = false; lmbHeld = rmbHeld = false; });

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
      scene.add(m.root);
      const n = { d, m, x: d.x, z: d.z, y, yaw: Math.atan2(-d.x, -d.z), talking: false, barkT: 3 + Math.random() * 5 };
      if (d.cat) { n.x = World.wellTop.x + 0.9; n.z = World.wellTop.z; } else World.addCircle(d.x, d.z, 0.45);
      m.root.position.set(n.x, y, n.z); m.root.rotation.y = n.yaw;
      n.label = makeLabel(d.name, d.title); $('labels').appendChild(n.label);
      n.marker = document.createElement('div'); n.marker.className = 'qmark'; $('labels').appendChild(n.marker);
      npcs.push(n);
    }
  }
  function makeLabel(name, sub) {
    const el = document.createElement('div'); el.className = 'nlabel';
    el.innerHTML = '<b></b><span></span>'; el.querySelector('b').textContent = name; el.querySelector('span').textContent = sub || '';
    return el;
  }

  // telegraph sprite: a 4-point star flash shown while an enemy winds up an attack
  function makeFlashTex(col) {
    const cv = document.createElement('canvas'); cv.width = cv.height = 128; const g = cv.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 2, 64, 64, 60); gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.25, col); gr.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = gr; g.beginPath();
    for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2, r = i % 2 ? 12 : 62; g.lineTo(64 + Math.cos(a) * r, 64 + Math.sin(a) * r); }
    g.closePath(); g.fill();
    return new THREE.CanvasTexture(cv);
  }
  let flashTexY, flashTexR, starTex;
  function makeStarsTex() {
    const cv = document.createElement('canvas'); cv.width = cv.height = 64; const g = cv.getContext('2d');
    g.fillStyle = '#ffe680'; g.font = 'bold 40px serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('✦', 32, 34);
    return new THREE.CanvasTexture(cv);
  }

  function spawnEnemies() {
    flashTexY = makeFlashTex('rgba(255,220,80,0.9)'); flashTexR = makeFlashTex('rgba(255,50,40,0.95)'); starTex = makeStarsTex();
    for (const sp of Data.spawns) {
      const def = Data.enemies[sp.type];
      let m;
      if (sp.type === 'wolf') m = Models.wolf();
      else if (sp.type === 'alpha') m = Models.wolf({ scale: 1.9, color: 0x8a8a90, eyes: 0xff4020 });
      else if (sp.type === 'skeleton') m = Models.skeleton({ shield: Math.random() < 0.3 });
      else if (sp.type === 'knight') m = Models.skeleton({ scale: 1.5, armor: 0x3a3a48, helmet: 0x5a5a68, big: true, shield: true, eyes: 0xff5040, cape: 0x4a1a1a });
      else if (sp.type === 'wisp') m = Models.wisp({ color: Math.random() < 0.5 ? 0x80d0ff : 0xb080ff });
      else if (sp.type === 'golem') m = Models.golem();
      scene.add(m.root);
      const e = { baseScale: m.root.scale.x, type: sp.type, def, m, sx: sp.x, sz: sp.z, x: sp.x, z: sp.z, y: World.height(sp.x, sp.z), yaw: Math.random() * 6, hp: def.hp, state: 'idle', t: 0, cd: 1, wander: null, dead: false, deadT: 0, gone: false, respawnT: 0, flash: 0, aggro: false, stun: 0, atkCount: 0, unblockable: false };
      e.m.root.traverse(o => { if (o.isMesh && o.material && o.material.emissive) { o.material = o.material.clone(); o.material.userData.baseEm = o.material.emissive.getHex(); } });
      const h = def.boss ? (sp.type === 'golem' ? 6.2 : sp.type === 'knight' ? 3.6 : 3.0) : def.fly ? 2.6 : sp.type === 'wolf' ? 1.7 : 2.4;
      e.tele = new THREE.Sprite(new THREE.SpriteMaterial({ map: flashTexY, transparent: true, depthTest: false, depthWrite: false }));
      e.tele.position.y = h / (sp.type === 'alpha' ? 1.9 : sp.type === 'knight' ? 1.5 : 1); e.tele.visible = false; e.m.root.add(e.tele);
      e.stars = new THREE.Group();
      for (let i = 0; i < 3; i++) { const st = new THREE.Sprite(new THREE.SpriteMaterial({ map: starTex, transparent: true, depthWrite: false })); st.scale.setScalar(0.45); e.stars.add(st); }
      e.stars.position.y = e.tele.position.y + 0.1; e.stars.visible = false; e.m.root.add(e.stars);
      e.hpBar = document.createElement('div'); e.hpBar.className = 'ehp' + (def.boss ? ' boss' : ''); e.hpBar.innerHTML = '<i></i>'; $('labels').appendChild(e.hpBar);
      enemies.push(e);
    }
  }
  function reviveEnemy(e) {
    e.hp = e.def.hp; e.dead = false; e.gone = false; e.state = 'idle'; e.x = e.sx; e.z = e.sz; e.aggro = false; e.stun = 0;
    e.m.root.visible = true; e.m.root.scale.setScalar(e.baseScale);
    e.m.body.rotation.set(0, 0, 0); e.m.body.position.y = 0;
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
    {
      const [x, z] = Data.pendantSpot;
      const g = new THREE.Group();
      const p = new THREE.Mesh(new THREE.TorusGeometry(0.18, 0.05, 6, 12, Math.PI * 1.4), new THREE.MeshBasicMaterial({ color: 0xe0e8ff })); p.position.y = 0.35; g.add(p);
      const l = new THREE.PointLight(0xc0d0ff, 0.5, 4, 2); l.position.y = 0.5; g.add(l);
      g.position.set(x, World.height(x, z), z); scene.add(g);
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

  // ------------------------------------------------------------ stamina
  function useSt(n) {
    const s = S();
    if (s.st < n * 0.5) { floatTextAt(player.x, player.y + 2.3, player.z, 'Stamina esaurita', '#e8d070'); AudioFX.sfx.deny(); return false; }
    s.st = Math.max(0, s.st - n); player.stUse = 0.8; return true;
  }

  // ------------------------------------------------------------ aim helpers
  const tmpV = new THREE.Vector3(), tmpV2 = new THREE.Vector3();
  function camForward() { return camera.getWorldDirection(new THREE.Vector3()); }
  function faceTarget(range) {
    // soft lock-on: face the enemy closest to where the camera looks
    const f = camForward(); let best = null, bs = -1;
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
      if (d > range) continue;
      const dot = (dx * f.x + dz * f.z) / (d * Math.hypot(f.x, f.z) || 1);
      const score = dot - d / range * 0.5;
      if (dot > 0.25 && score > bs) { bs = score; best = e; }
    }
    player.yaw = best ? Math.atan2(best.x - player.x, best.z - player.z) : cam.yaw + Math.PI;
    return best;
  }

  // ------------------------------------------------------------ player actions
  const busy = () => player.roll || player.fishing || S().hp <= 0 || player.stagger > 0 || player.bash || player.whirl || player.grapple;
  function attack() {
    if (busy()) return;
    if (player.atk) { if (player.atk.t > 0.5 * player.atk.dur) player.queued = true; return; }
    const combo = player.comboT > 0 ? (player.combo + 1) % 3 : 0;
    if (!useSt(combo === 2 ? 16 : 10)) return;
    player.combo = combo; player.comboT = 0.9;
    const dur = (combo === 2 ? 0.62 : 0.42) / D.speed;
    player.atk = { t: 0, dur, hit: false, combo };
    AudioFX.sfx.swing();
    faceTarget(D.reach + 3);
  }
  function rollDamage(mult, e) {
    let dmg = D.dmg * mult * (0.9 + Math.random() * 0.2);
    let crit = Math.random() < D.crit;
    if (e && e.stun > 0) crit = true;
    if (crit) dmg *= e && e.stun > 0 ? 2 : 1.7;
    return { dmg: dmg + D.fire, crit };
  }
  function doHitCheck(combo) {
    const reach = D.reach + (combo === 2 ? 0.4 : 0), arc = combo === 2 ? 1.0 : 1.3;
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    let any = false;
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
      if (d > reach + e.def.radius) continue;
      if ((dx * fx + dz * fz) / (d || 1) < Math.cos(arc)) continue;
      const r = rollDamage(combo === 2 ? 1.6 : 1, e);
      if (e.type === 'knight' && e.stun <= 0 && e.state !== 'attack') { // frontal guard
        const ef = { x: Math.sin(e.yaw), z: Math.cos(e.yaw) };
        if ((-dx * ef.x - dz * ef.z) / (d || 1) > 0.5) { r.dmg *= 0.2; r.crit = false; floatText(e, 'GUARDIA', '#9ab'); AudioFX.sfx.clang(); }
      }
      damageEnemy(e, r.dmg, fx, fz, r.crit);
      if (combo === 2 && !e.def.boss && e.state === 'windup') stunEnemy(e, 0.6);
      any = true;
    }
    if (any) { AudioFX.sfx.hit(); shake(0.15); hitStop = 0.06; return; }
    gatherHit(reach);
  }
  function gatherHit(reach) {
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    const near = World.nodesNear(player.x + fx * 1.2, player.z + fz * 1.2, reach);
    let best = null, bd = 1e9;
    for (const n of near) {
      const dx = n.x - player.x, dz = n.z - player.z, d = Math.hypot(dx, dz) - n.s * (n.kind === 'tree' ? 0.5 : 1);
      if (d < bd && (dx * fx + dz * fz) / (Math.hypot(dx, dz) || 1) > 0.2) { bd = d; best = n; }
    }
    if (!best || bd > reach) return;
    const w = equipped('weapon');
    const power = best.kind === 'tree' && w && Loot.WEAPONS[w.base].axe ? 2 : 1;
    best.hp -= power; best.shakeT = 0.25;
    const ny = World.height(best.x, best.z) + (best.kind === 'tree' ? 1.2 : 0.6);
    burst(best.x - fx * best.s * 0.5, ny, best.z - fz * best.s * 0.5, best.kind === 'tree' ? 0x8a6440 : best.kind === 'crystal' ? 0x9ae8ff : best.kind === 'ore' ? 0xb07040 : 0x8a8a90, 8);
    (best.kind === 'tree' ? AudioFX.sfx.chop : AudioFX.sfx.mine)();
    if (best.hp <= 0) {
      const m = has('reaper') ? 2 : 1, s = S(), gained = {};
      const add = (k, n) => { n *= m; s.res[k] = (s.res[k] || 0) + n; gained[k] = n; };
      if (best.kind === 'tree') add('wood', 3 + Math.floor(Math.random() * 3 * best.s));
      if (best.kind === 'rock') add('stone', 3 + Math.floor(Math.random() * 2));
      if (best.kind === 'ore') { add('stone', 1); add('iron', 2 + Math.floor(Math.random() * 2)); }
      if (best.kind === 'crystal') add('crystal', 2 + Math.floor(Math.random() * 2));
      World.removeNode(best);
      s.world.nodes.push(best.id);
      burst(best.x, ny + 0.5, best.z, best.kind === 'tree' ? 0x3a6a3a : 0x8a8a90, 24);
      floatTextAt(best.x, ny + 1.5, best.z, Object.entries(gained).map(([k, n]) => `+${n} ${Build.RES[k].short}`).join('  '), '#d8f0a0');
      AudioFX.sfx.pickup();
      updateHUD();
    }
  }
  function shieldBash() {
    if (!D.hasShield || busy() || player.atk || player.cds.bash > 0) return;
    if (!useSt(20)) return;
    player.bash = { t: 0, dur: 0.38, hit: false };
    player.cds.bash = 0.7;
    faceTarget(4);
    AudioFX.sfx.swing();
  }
  function doBashHit() {
    const fx = Math.sin(player.yaw), fz = Math.cos(player.yaw);
    let any = false;
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
      if (d > 2.4 + e.def.radius || (dx * fx + dz * fz) / (d || 1) < 0.5) continue;
      const dmg = D.bash * (has('bash') ? 2 : 1);
      damageEnemy(e, dmg, fx * 2.5, fz * 2.5, false);
      const st = (e.def.boss ? (e.type === 'knight' ? 1.4 : 0.35) : 1.2) * D.stunMul + (has('bash') ? 0.6 : 0);
      if (!e.dead) stunEnemy(e, st);
      any = true;
    }
    if (any) { AudioFX.sfx.clang(); shake(0.25); hitStop = 0.08; }
  }
  function whirl() {
    if (!has('whirl') || busy() || player.atk || player.cds.whirl > 0) return;
    if (!useSt(30)) return;
    player.whirl = { t: 0, dur: 0.7, hits: 0 };
    player.cds.whirl = 5;
    AudioFX.sfx.swing();
  }
  function doWhirlHit() {
    let any = false;
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz);
      if (d > D.reach + 0.6 + e.def.radius) continue;
      const r = rollDamage(1.1, e);
      damageEnemy(e, r.dmg, dx / (d || 1), dz / (d || 1), r.crit); any = true;
    }
    if (any) { AudioFX.sfx.hit(); hitStop = 0.04; }
  }
  function castFireball() {
    if (busy() || player.castT > 0 || player.cds.fire > 0) return;
    const s = S();
    if (s.mana < 15) { AudioFX.sfx.deny(); floatTextAt(player.x, player.y + 2.4, player.z, 'Mana insufficiente', '#8af'); return; }
    s.mana -= 15; player.castT = 0.45; player.cds.fire = 0.5;
    const dir = camForward();
    const best = faceTarget(30);
    const angDiff = best ? Math.abs(Math.atan2(Math.sin(Math.atan2(best.x - player.x, best.z - player.z) - Math.atan2(dir.x, dir.z)), Math.cos(Math.atan2(best.x - player.x, best.z - player.z) - Math.atan2(dir.x, dir.z)))) : 9;
    if (best && angDiff < 0.35) {
      dir.set(best.x - player.x, best.y + (best.def.fly ? 1.6 : 1.1) - (player.y + 1.5), best.z - player.z).normalize();
    } else player.yaw = Math.atan2(dir.x, dir.z);
    spawnProjectile(player.x + dir.x * 0.8, player.y + 1.5, player.z + dir.z * 0.8, dir, 26, 'player', D.dmg * 1.4 + 12, 0xff7a20, has('fire2'));
    AudioFX.sfx.fireball();
  }
  function jump() {
    if (busy() && !player.grapple) return;
    if (player.grapple) { endGrapple(true); return; }
    if (player.onGround) { player.vy = 8; player.onGround = false; player.jumps = 1; AudioFX.sfx.jump(); }
    else if (player.jumps < D.jumps) { player.vy = 7.6; player.jumps++; player.flip = 0.45; AudioFX.sfx.jump(); burst(player.x, player.y + 0.2, player.z, 0xdfe6ff, 8); }
  }
  function dodge() {
    if (player.roll || player.fishing || S().hp <= 0 || player.stagger > 0 || player.grapple) return;
    if (!useSt(20)) return;
    const mv = inputVector();
    const ang = (mv.x || mv.z) ? Math.atan2(mv.x, mv.z) : player.yaw + Math.PI;
    player.roll = { t: 0, dur: 0.5, ang };
    player.inv = 0.42; player.atk = null; player.bash = null;
    AudioFX.sfx.roll();
  }
  function drinkPotion() {
    const s = S();
    if (!(s.inv.potion > 0)) { AudioFX.sfx.deny(); toast('Nessuna pozione', 'Elda le vende al villaggio.'); return; }
    if (s.hp >= D.maxHp || player.potionCd > 0) return;
    s.inv.potion--; s.hp = Math.min(D.maxHp, s.hp + 60); player.potionCd = 1;
    AudioFX.sfx.potion(); floatTextAt(player.x, player.y + 2.2, player.z, '+60', '#7f7');
    burst(player.x, player.y + 1, player.z, 0x60ff80, 16);
  }

  // ------------------------------------------------------------ grappling hook
  const raycaster = new THREE.Raycaster();
  function fireGrapple() {
    if (!has('grapple') || player.cds.grapple > 0 || S().hp <= 0 || player.roll || player.fishing) return;
    const o = camera.position.clone(), d = camForward();
    const range = D.grappleRange + cam.dist;
    let best = { t: Infinity };
    // enemies (ray vs sphere)
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const c = tmpV.set(e.x, e.y + (e.def.fly ? 1.6 : e.def.boss ? 2 : 0.9), e.z);
      const oc = tmpV2.copy(c).sub(o); const tc = oc.dot(d); if (tc < 0) continue;
      const r = e.def.radius + 0.6, dd = oc.lengthSq() - tc * tc;
      if (dd < r * r && tc < best.t) best = { t: tc, enemy: e };
    }
    const tt = World.rayTerrain(o, d, range); if (tt > 0 && tt < best.t) best = { t: tt };
    const tb = Build.rayHit(o, d, Math.min(range, best.t)); if (tb > 0 && tb < best.t) best = { t: tb };
    raycaster.set(o, d); raycaster.far = Math.min(range, best.t);
    const hits = raycaster.intersectObjects(World.solids, false);
    if (hits.length && hits[0].distance < best.t) best = { t: hits[0].distance };
    if (!isFinite(best.t)) { AudioFX.sfx.deny(); floatTextAt(player.x, player.y + 2.3, player.z, 'Troppo lontano', '#ccc'); return; }
    const p = o.clone().addScaledVector(d, best.t);
    if (p.distanceTo(tmpV.set(player.x, player.y + 1, player.z)) > D.grappleRange) { AudioFX.sfx.deny(); floatTextAt(player.x, player.y + 2.3, player.z, 'Troppo lontano', '#ccc'); return; }
    player.cds.grapple = D.grappleCd;
    AudioFX.sfx.grapple();
    const e = best.enemy;
    if (e && !e.def.boss) { // yank the enemy to us
      e.yank = { t: 0, fx: e.x, fz: e.z };
      player.grappleFx = { x: e.x, y: e.y + 1, z: e.z, t: 0.25, follow: e };
      stunEnemy(e, 0.9 * D.stunMul);
      return;
    }
    player.grapple = { x: p.x, y: p.y, z: p.z, t: 0, enemy: e || null };
    player.atk = null; player.onGround = false; player.jumps = 1;
  }
  function endGrapple(jumpOut) {
    const g = player.grapple; if (!g) return;
    player.grapple = null;
    if (jumpOut) { player.vy = 9; player.jumps = 1; AudioFX.sfx.jump(); }
    else { player.vx *= 0.5; player.vz *= 0.5; player.vy = Math.max(player.vy * 0.3, 5); }
  }

  function inputVector() {
    let x = 0, z = 0;
    if (keys.KeyW || keys.ArrowUp) z += 1;
    if (keys.KeyS || keys.ArrowDown) z -= 1;
    if (keys.KeyA || keys.ArrowLeft) x += 1;
    if (keys.KeyD || keys.ArrowRight) x -= 1;
    if (!x && !z) return { x: 0, z: 0 };
    const l = Math.hypot(x, z); x /= l; z /= l;
    const fy = cam.yaw + Math.PI;
    const fx = Math.sin(fy), fz = Math.cos(fy);
    const rx = Math.sin(fy + Math.PI / 2), rz = Math.cos(fy + Math.PI / 2);
    return { x: fx * z + rx * x, z: fz * z + rz * x };
  }

  // ------------------------------------------------------------ building
  function toggleBuild() {
    buildMode = !buildMode;
    $('hotbar').hidden = !buildMode; $('skillbar').hidden = buildMode;
    if (!buildMode) Build.hideGhost();
    toast(buildMode ? 'Modalità costruzione' : 'Modalità combattimento', buildMode ? '1-8 o rotella: scegli · clic: piazza · tasto destro: rimuovi · R: ruota · B: esci' : '');
  }
  function costOk(cost) { const r = S().res; return Object.entries(cost).every(([k, n]) => (r[k] || 0) >= n); }
  function costStr(cost) { return Object.entries(cost).map(([k, n]) => `${n} ${Build.RES[k].short}`).join(' + ') || 'gratis'; }
  function buildHotbar() {
    const box = $('hotbar'); if (!box) return;
    box.innerHTML = '';
    Build.PIECES.forEach((p, i) => {
      const b = document.createElement('div'); b.className = 'slot' + (i === buildSel ? ' sel' : '') + (costOk(p.cost) ? '' : ' poor');
      b.innerHTML = '<kbd></kbd><b></b><small></small>';
      b.querySelector('kbd').textContent = i + 1; b.querySelector('b').textContent = p.short || p.name; b.querySelector('small').textContent = Object.entries(p.cost).map(([k, n]) => `${n}${Build.RES[k].icon}`).join(' ') || 'gratis';
      b.title = `${p.name}: ${costStr(p.cost)}`;
      box.appendChild(b);
    });
  }
  function buildAction(removing) {
    const piece = Build.PIECES[buildSel];
    const plan = Build.aim(camera.position, camForward(), player, piece.id, buildRot, removing);
    if (!plan) return;
    const s = S();
    if (plan.remove) {
      const p = Build.PIECES.find(x => x.id === plan.remove.type);
      for (const k in p.cost) s.res[k] = (s.res[k] || 0) + Math.ceil(p.cost[k] / 2);
      burst(plan.remove.x, plan.remove.y0 + 1, plan.remove.z, 0x8a6440, 12);
      Build.remove(plan.remove); AudioFX.sfx.chop(); updateHUD(); buildHotbar(); return;
    }
    if (plan.tool) return terrainTool(plan);
    if (!plan.ok) { AudioFX.sfx.deny(); floatTextAt(plan.cx, plan.y0 + 1.5, plan.cz, plan.reason || 'Impossibile', '#f88'); return; }
    if (!costOk(piece.cost)) { AudioFX.sfx.deny(); floatTextAt(plan.cx, plan.y0 + 1.5, plan.cz, 'Servono ' + costStr(piece.cost), '#f88'); return; }
    for (const k in piece.cost) s.res[k] -= piece.cost[k];
    Build.add(piece.id, plan.cx, plan.cz, plan.y0, plan.r);
    if (piece.id === 'campfire') { s.spawn = { x: plan.cx + 1.5, z: plan.cz }; toast('Fuoco da campo', 'Se cadi, ti risvegli qui. Stare vicino al fuoco ti cura.'); }
    AudioFX.sfx.build(); burst(plan.cx, plan.y0 + 0.5, plan.cz, 0xd8c090, 10);
    updateHUD(); buildHotbar();
  }
  function terrainTool(plan) {
    if (digCd > 0) return; digCd = 0.22;
    const s = S();
    if (plan.tool === 'dig') {
      const moved = World.editTerrain(plan.x, plan.z, -0.5, 2.2);
      if (!moved) { floatTextAt(plan.x, plan.y + 1, plan.z, 'Qui no', '#f88'); return; }
      const got = Math.max(1, Math.round(moved * 0.5)); s.res.dirt += got;
      if (Math.random() < 0.08) { s.res.stone++; floatTextAt(plan.x, plan.y + 1.4, plan.z, '+1 Pietra', '#d8f0a0'); }
      burst(plan.x, plan.y + 0.3, plan.z, 0x5a4028, 10); AudioFX.sfx.dig();
    } else {
      if (s.res.dirt < 1) { AudioFX.sfx.deny(); floatTextAt(plan.x, plan.y + 1, plan.z, 'Serve terra', '#f88'); return; }
      const moved = World.editTerrain(plan.x, plan.z, 0.5, 2.2);
      if (moved) { s.res.dirt -= 1; burst(plan.x, plan.y + 0.5, plan.z, 0x6a5038, 8); AudioFX.sfx.dig(); }
    }
    updateHUD(); buildHotbar();
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
    if (it.type === 'fish') return player.fishing ? 'Stai pescando…' : 'Pesca dal pontile';
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
      dropItem(p.x + 1, p.z + 1, Loot.roll(0.5, { minRarity: 1 }));
    }
    AudioFX.sfx.pickup(); burst(p.x, World.height(p.x, p.z) + 0.5, p.z, 0x9ad8ff, 14);
    updateHUD(); save();
  }
  function startFishing() {
    if (player.fishing) return;
    if (!G.S.quests.fish) { toast('Il pontile', 'L\'acqua è nera e immobile. Niente da fare qui… per ora.'); return; }
    player.fishing = { t: 0, dur: 2.2 + Math.random() * 1.5 };
    toast('Pesca', 'Lanci la lenza nell\'acqua scura…');
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
    AudioFX.sfx.quest(); shake(0.4);
    gainXP(300);
    setDawn(true);
    save();
    setTimeout(showEnding, 4200);
  }

  // ------------------------------------------------------------ loot drops
  function dropItem(x, z, item) {
    if (!item) return;
    const rc = Loot.RARITY[item.rarity];
    const g = new THREE.Group();
    const bag = new THREE.Mesh(new THREE.IcosahedronGeometry(0.3, 0), new THREE.MeshLambertMaterial({ color: 0x6a4a2a, emissive: new THREE.Color(rc.hex).multiplyScalar(0.3) }));
    bag.position.y = 0.35; g.add(bag);
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.2, 6, 8, 1, true), new THREE.MeshBasicMaterial({ color: rc.hex, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending }));
    beam.position.y = 3; g.add(beam);
    g.position.set(x, World.height(x, z), z); scene.add(g);
    const label = makeLabel(item.name, rc.name); label.classList.add('loot'); label.style.setProperty('--rc', rc.color); $('labels').appendChild(label);
    drops.push({ x, z, item, mesh: g, bag, label });
  }
  function updateDrops(dt) {
    for (let i = drops.length - 1; i >= 0; i--) {
      const d = drops[i];
      d.bag.rotation.y += dt * 2; d.bag.position.y = 0.35 + Math.sin(time * 3 + i) * 0.08;
      const dist = Math.hypot(d.x - player.x, d.z - player.z);
      if (dist < 1.6 && S().hp > 0) {
        if (S().gear.length >= 30) { if (!d.warned) { d.warned = true; toast('Borsa piena', 'Smantella qualcosa dalla borsa (I).'); } continue; }
        S().gear.push(d.item);
        const rc = Loot.RARITY[d.item.rarity];
        toast(d.item.name, `${rc.name} · ${Loot.describe(d.item)[0]} · premi I per equipaggiare`);
        $('toast').querySelector('b').style.color = rc.color;
        AudioFX.sfx.loot();
        scene.remove(d.mesh); d.label.remove(); drops.splice(i, 1);
        save();
      }
    }
  }
  function zonePower(x, z) {
    const d = Math.hypot(x, z);
    return U.clamp(d / 180, 0, 1);
  }

  // ------------------------------------------------------------ quests / actions
  const ACTIONS = {
    main_accept: { desc: 'il giocatore accetta di cercare le tre Braci Primordiali', run() { startQuest('main'); } },
    main_deliver: { desc: 'il giocatore consegna le tre Braci: la Lanterna Antica si riaccende', run() { const s = S(); s.inv.ember -= 3; s.quests.main.stage = 'faro'; lightLantern(true); gainXP(150); toast('La Lanterna Antica arde!', 'Porta la fiamma al Faro sul Colle, a nord-est.'); AudioFX.sfx.quest(); } },
    bless: { desc: 'Tobia benedice il giocatore e gli ripristina tutta la vita', run() { const s = S(); s.hp = D.maxHp; s.mana = s.maxMana; burst(player.x, player.y + 1, player.z, 0xffe0a0, 20); AudioFX.sfx.potion(); } },
    herbs_accept: { desc: 'il giocatore accetta di raccogliere 5 Erbe Lunari', run() { startQuest('herbs'); } },
    herbs_complete: { desc: 'il giocatore consegna 5 Erbe Lunari e riceve 3 pozioni', run() { const s = S(); s.inv.herb -= 5; s.inv.potion = (s.inv.potion || 0) + 3; finishQuest('herbs', 80, 25); } },
    buy_potion: { desc: 'il giocatore compra una pozione per 15 monete d\'oro', run() { const s = S(); s.gold -= 15; s.inv.potion = (s.inv.potion || 0) + 1; AudioFX.sfx.coin(); toast('Acquisto', 'Pozione di Elda (+1).'); } },
    iron_accept: { desc: 'il giocatore accetta di portare 3 Ferro Antico', run() { startQuest('iron'); } },
    iron_complete: { desc: 'il giocatore consegna 3 Ferro Antico e Bruno forgia per lui una spada lunga rara', run() { const s = S(); s.inv.iron -= 3; const it = Loot.make('weapon', 'long', 2, { dmg: 20, crit: 10 }, 'Spada lunga di Bruno'); s.gear.push(it); s.equip.weapon = it.id; refreshDerived(); finishQuest('iron', 100, 0); toast('Spada lunga di Bruno', 'Equipaggiata. Rara.'); } },
    forge_upgrade: { desc: 'Bruno rinforza l\'arma equipaggiata (+10% danno) in cambio di 3 minerale di ferro e 40 oro', run() { const s = S(); const w = equipped('weapon'); if (!w) return; s.res.iron -= 3; s.gold -= 40; w.affixes.dmg = (w.affixes.dmg || 0) + 10; refreshDerived(); AudioFX.sfx.clang(); toast('Arma rinforzata', `${w.name}: +10% danno.`); } },
    pendant_accept: { desc: 'il giocatore promette di ritrovare il ciondolo di Mira', run() { startQuest('pendant'); } },
    pendant_complete: { desc: 'il giocatore restituisce il ciondolo a Mira e riceve il suo sassolino portafortuna (+20 vita massima) e 25 monete', run() { const s = S(); s.inv.pendant = 0; s.maxHp += 20; s.hp += 20; refreshDerived(); finishQuest('pendant', 70, 25); } },
    wolves_accept: { desc: 'il giocatore accetta di abbattere 6 lupi', run() { startQuest('wolves'); S().quests.wolves.progress = 0; } },
    wolves_complete: { desc: 'il giocatore riceve 60 monete e uno spallaccio (+armatura)', run() { S().armor += 0.15; finishQuest('wolves', 90, 60); } },
    fish_accept: { desc: 'il giocatore accetta di pescare un Pesce d\'Argento per Ottone', run() { startQuest('fish'); } },
    fish_complete: { desc: 'il giocatore consegna il pesce e impara il Passo Felpato (+15% velocità)', run() { const s = S(); s.inv.fish = 0; s.speed += 0.15; finishQuest('fish', 60, 0); toast('Passo Felpato', 'Velocità di movimento +15%.'); } },
    reveal: { desc: 'il Viandante ammette di essere Anselmo, il vecchio guardiano del Faro', run() { S().flags.anselmo = 1; gainXP(40); toast('Rivelazione', 'Il Viandante è Anselmo, il guardiano del Faro.'); } },
  };
  G.ACTIONS = ACTIONS;
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

  const xpNeed = l => 60 + l * 50;
  function gainXP(n) {
    const s = S(); s.xp += n;
    let need = xpNeed(s.level);
    while (s.xp >= need) {
      s.xp -= need; s.level++; s.maxHp += 15; s.maxMana += 8; s.dmg += 2; s.sp++;
      refreshDerived(); s.hp = D.maxHp; s.mana = s.maxMana;
      toast('Livello ' + s.level + '!', 'Vita +15, Mana +8, Danno +2 · +1 punto abilità (K)');
      AudioFX.sfx.level(); burst(player.x, player.y + 1, player.z, 0xffe070, 30);
      need = xpNeed(s.level);
    }
    updateHUD();
  }

  function lightLantern(on, instant) {
    World.lanternLight.intensity = on ? 2.4 : 0;
    World.lanternCrystal.material.color.set(on ? 0xffd070 : 0x3a3a48);
    World.lanternCrystal.material.emissive.set(on ? 0xffa030 : 0x000000);
    World.lanternEmbers.forEach(e => e.material.color.set(on ? 0xff7020 : 0x302820));
    if (on && !instant) { shake(0.3); burst(0, World.height(0, 0) + 5, 0, 0xffc050, 40); }
  }
  function setDawn(on, instant) {
    if (on) { dawnT = instant ? 1 : 0.0001; if (AudioFX.ctx) AudioFX.setDawn(true); World.faroFlame.material.color.set(0xffd070); World.faroLight.intensity = 3; }
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
    World.stars.material.opacity = 1 - k; World.moon.material.opacity = 1 - k;
  }

  // ------------------------------------------------------------ dialogue
  let dlg = null;
  function openDialogue(n) {
    inDialogue = true; n.talking = true;
    if (document.exitPointerLock) document.exitPointerLock();
    const h = S().history[n.d.id] || (S().history[n.d.id] = []);
    dlg = { n, busy: false, ctl: null };
    $('dlg-name').textContent = n.d.name;
    $('dlg-title').textContent = n.d.title;
    $('dlg-mood').textContent = '';
    $('dlg-log').innerHTML = '';
    h.slice(-4).forEach(m => addLine(m.role, m.text, true));
    const greet = n.d.greet(G);
    addLine('npc', greet); pushHistory(n, 'npc', greet);
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
    $('dialogue').hidden = true; $('dlg-input').value = '';
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
  function scriptedReply(t) { return typeof t.reply === 'function' ? t.reply(G) : Array.isArray(t.reply) ? U.pick(t.reply) : t.reply; }
  function chooseTopic(t) {
    if (!dlg || dlg.busy) return;
    const n = dlg.n;
    addLine('player', t.label); pushHistory(n, 'player', t.label);
    if (AIVoice.available() && !t.action) { askAI(t.label, t); return; }
    const r = scriptedReply(t);
    typeLine(r); pushHistory(n, 'npc', r);
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
      typeLine(res.reply); pushHistory(n, 'npc', res.reply);
      if (res.action) runAction(res.action);
      setMood(res.mood);
    } catch (e) {
      if (!dlg || dlg.n !== n) return;
      wait.parentElement.remove();
      const kind = AIVoice.handleError(e);
      if (kind === 'cancel') return;
      const r = fallbackTopic ? scriptedReply(fallbackTopic) : U.pick(scriptedShrug(n));
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
    return map[n.d.id] || ['…'];
  }
  function setMood(m) { $('dlg-mood').textContent = { happy: '☺', amused: '☺', sad: '☹', angry: '!', afraid: '…', grateful: '♥' }[m] || ''; }
  function updateAIBadge(st) {
    const b = $('ai-badge'); if (!b) return;
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
    ['journal', 'inventory', 'map', 'skills'].forEach(p => $('panel-' + p).hidden = p !== name);
    if (name === 'journal') renderJournal();
    if (name === 'inventory') renderInventory();
    if (name === 'map') renderBigMap();
    if (name === 'skills') renderSkills();
  }
  function closePanel() { uiOpen = null; ['journal', 'inventory', 'map', 'skills'].forEach(p => $('panel-' + p).hidden = true); if (started && !paused) requestLock(); }
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
  function itemCard(it, isEq) {
    const rc = Loot.RARITY[it.rarity];
    const el = document.createElement('div'); el.className = 'gear' + (isEq ? ' eq' : ''); el.style.setProperty('--rc', rc.color);
    const top = document.createElement('div'); top.className = 'gtop';
    const nm = document.createElement('b'); nm.textContent = it.name;
    const tg = document.createElement('small'); tg.textContent = `${rc.name} · ${it.kind === 'weapon' ? 'Arma' : 'Scudo'}${isEq ? ' · equipaggiato' : ''}`;
    top.append(nm, tg); el.appendChild(top);
    const ul = document.createElement('ul');
    Loot.describe(it).forEach(l => { const li = document.createElement('li'); li.textContent = l; ul.appendChild(li); });
    el.appendChild(ul);
    if (!isEq) {
      const row = document.createElement('div'); row.className = 'gbtns';
      const eq = document.createElement('button'); eq.type = 'button'; eq.textContent = 'Equipaggia';
      eq.onclick = () => { S().equip[it.kind] = it.id; refreshDerived(); AudioFX.sfx.clang(); renderInventory(); updateHUD(); save(); };
      const sv = Loot.scrapValue(it);
      const sc = document.createElement('button'); sc.type = 'button'; sc.textContent = `Smantella (+${sv.iron} ferro, +${sv.gold} oro)`;
      sc.onclick = () => { const s = S(); s.gear = s.gear.filter(g => g.id !== it.id); s.res.iron += sv.iron; s.gold += sv.gold; AudioFX.sfx.coin(); renderInventory(); updateHUD(); save(); };
      row.append(eq, sc); el.appendChild(row);
    }
    return el;
  }
  function renderInventory() {
    const s = S();
    const stats = $('inv-stats'); stats.innerHTML = '';
    [['Livello', s.level], ['Vita', `${Math.round(s.hp)}/${D.maxHp}`], ['Stamina', `${Math.round(s.st)}/${D.maxSt}`], ['Danno', D.dmg], ['Critico', Math.round(D.crit * 100) + '%'], ['Blocco scudo', Math.round(D.block * 100) + '%'], ['Armatura', Math.round(s.armor * 100) + '%'], ['Oro', s.gold]].forEach(([k, v]) => {
      const d = document.createElement('div'); d.innerHTML = '<span></span><b></b>'; d.querySelector('span').textContent = k; d.querySelector('b').textContent = v; stats.appendChild(d);
    });
    const eq = $('inv-equip'); eq.innerHTML = '';
    for (const slot of ['weapon', 'shield']) { const it = equipped(slot); if (it) eq.appendChild(itemCard(it, true)); }
    const bag = $('inv-gear'); bag.innerHTML = '';
    const rest = s.gear.filter(g => g.id !== s.equip.weapon && g.id !== s.equip.shield).sort((a, b) => b.rarity - a.rarity);
    if (!rest.length) bag.innerHTML = '<p class="empty">Nessun equipaggiamento di ricambio. I nemici e gli scrigni lasciano armi e scudi.</p>';
    rest.forEach(it => bag.appendChild(itemCard(it, false)));
    const res = $('inv-res'); res.innerHTML = '';
    for (const k in Build.RES) { const d = document.createElement('div'); d.innerHTML = '<span></span><b></b>'; d.querySelector('span').textContent = Build.RES[k].name; d.querySelector('b').textContent = s.res[k] || 0; res.appendChild(d); }
    const box = $('inv-list'); box.innerHTML = '';
    const items = Object.entries(s.inv).filter(([, n]) => n > 0);
    if (!items.length) box.innerHTML = '<p class="empty">Niente.</p>';
    for (const [k, n] of items) {
      const it = Data.items[k]; if (!it) continue;
      const el = document.createElement('div'); el.className = 'item';
      el.innerHTML = '<i></i><div><b></b><small></small></div><em></em>';
      el.querySelector('i').textContent = it.icon; el.querySelector('b').textContent = it.name; el.querySelector('small').textContent = it.desc; el.querySelector('em').textContent = '×' + n;
      box.appendChild(el);
    }
  }
  function renderSkills() {
    const s = S(); $('sp-count').textContent = s.sp;
    const box = $('skills-list'); box.innerHTML = '';
    for (const sk of SKILLS) {
      const owned = has(sk.id), reqOk = !sk.req || has(sk.req);
      const el = document.createElement('div'); el.className = 'skill' + (owned ? ' owned' : '') + (!reqOk ? ' locked' : '');
      const h = document.createElement('b'); h.textContent = sk.name;
      const p = document.createElement('p'); p.textContent = sk.desc;
      el.append(h, p);
      if (owned) { const t = document.createElement('small'); t.textContent = 'Sbloccata'; el.appendChild(t); }
      else {
        const b = document.createElement('button'); b.type = 'button';
        b.textContent = !reqOk ? `Richiede ${SKILLS.find(x => x.id === sk.req).name}` : `Sblocca (${sk.cost} punt${sk.cost > 1 ? 'i' : 'o'})`;
        b.disabled = !reqOk || s.sp < sk.cost;
        b.onclick = () => { s.sp -= sk.cost; s.skills[sk.id] = 1; refreshDerived(); AudioFX.sfx.level(); renderSkills(); updateHUD(); save(); };
        el.appendChild(b);
      }
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
    const s = S(), t = [], q = s.quests;
    if (q.main && q.main.state === 'active') {
      if (q.main.stage === 'faro') t.push([World.faroDoor.x, World.faroDoor.z]);
      else if ((s.inv.ember || 0) >= 3) t.push([-10, -10]);
      else for (const b of ['alpha', 'knight', 'golem']) if (!s.bossDead[b]) { const sp = Data.spawns.find(x => x.type === b); t.push([sp.x, sp.z]); }
    }
    if (q.pendant && q.pendant.state === 'active' && !s.inv.pendant) t.push(Data.pendantSpot);
    if (q.fish && q.fish.state === 'active' && !s.inv.fish) t.push([World.dock.x, World.dock.z]);
    return t;
  }
  function drawMinimap() {
    const cv = $('minimap'); const g = cv.getContext('2d'); const N = cv.width;
    const scale = 3;
    g.save(); g.clearRect(0, 0, N, N);
    g.beginPath(); g.arc(N / 2, N / 2, N / 2 - 2, 0, 7); g.clip();
    const [px, pz] = worldToMap(player.x, player.z, 256);
    g.translate(N / 2, N / 2); g.rotate(cam.yaw - Math.PI); g.scale(scale * N / 256, scale * N / 256); g.translate(-px, -pz);
    g.drawImage(mapBase, 0, 0);
    const dot = (x, z, col, r) => { const [mx, mz] = worldToMap(x, z, 256); g.fillStyle = col; g.beginPath(); g.arc(mx, mz, r, 0, 7); g.fill(); };
    for (const s of Build.list) dot(s.x, s.z, '#c8a070', 0.5);
    for (const n of npcs) dot(n.x, n.z, '#f0d080', 1.2);
    for (const d of drops) dot(d.x, d.z, Loot.RARITY[d.item.rarity].color, 0.9);
    for (const e of enemies) if (!e.dead && !e.gone && Math.hypot(e.x - player.x, e.z - player.z) < 40) dot(e.x, e.z, e.def.boss ? '#ff4040' : '#d06060', e.def.boss ? 1.6 : 0.8);
    for (const [x, z] of questTargets()) { const [mx, mz] = worldToMap(x, z, 256); g.strokeStyle = '#ffe070'; g.lineWidth = 0.6; g.beginPath(); g.arc(mx, mz, 2.2, 0, 7); g.stroke(); }
    g.restore();
    g.save(); g.translate(N / 2, N / 2); g.rotate(-(player.yaw - cam.yaw - Math.PI));
    g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -7); g.lineTo(5, 5); g.lineTo(0, 2); g.lineTo(-5, 5); g.closePath(); g.fill();
    g.restore();
    g.save(); g.translate(N / 2, N / 2); g.rotate(cam.yaw - Math.PI);
    g.fillStyle = '#e8c070'; g.font = '600 11px sans-serif'; g.textAlign = 'center'; g.fillText('N', 0, -N / 2 + 14);
    g.restore();
  }
  function renderBigMap() {
    const cv = $('bigmap'); const g = cv.getContext('2d'); const N = cv.width;
    g.drawImage(mapBase, 0, 0, N, N);
    g.font = '600 13px Alegreya, Georgia, serif'; g.textAlign = 'center';
    for (const k in World.places) {
      const p = World.places[k]; const [x, z] = worldToMap(p.x, p.z, N);
      g.fillStyle = 'rgba(10,10,20,0.55)'; const w = g.measureText(p.name).width + 10; g.fillRect(x - w / 2, z - 22, w, 18);
      g.fillStyle = '#f0e0c0'; g.fillText(p.name, x, z - 9);
    }
    for (const n of npcs) { const [x, z] = worldToMap(n.x, n.z, N); g.fillStyle = '#f0d080'; g.beginPath(); g.arc(x, z, 3, 0, 7); g.fill(); }
    for (const s of Build.list) { const [x, z] = worldToMap(s.x, s.z, N); g.fillStyle = '#c8a070'; g.fillRect(x - 1.5, z - 1.5, 3, 3); }
    for (const [tx, tz] of questTargets()) { const [x, z] = worldToMap(tx, tz, N); g.strokeStyle = '#ffe070'; g.lineWidth = 2; g.beginPath(); g.arc(x, z, 8, 0, 7); g.stroke(); }
    const [x, z] = worldToMap(player.x, player.z, N);
    g.save(); g.translate(x, z); g.rotate(-player.yaw + Math.PI); g.fillStyle = '#fff'; g.beginPath(); g.moveTo(0, -9); g.lineTo(6, 6); g.lineTo(0, 3); g.lineTo(-6, 6); g.closePath(); g.fill(); g.restore();
  }

  // ------------------------------------------------------------ combat helpers
  function stunEnemy(e, t) {
    e.stun = Math.max(e.stun, t); e.state = 'stunned'; e.t = 0; e.tele.visible = false;
  }
  function damageEnemy(e, dmg, kx, kz, crit) {
    e.hp -= dmg; e.flash = 0.15; e.aggro = true;
    if (!e.def.boss) { e.x += kx * 0.6; e.z += kz * 0.6; }
    floatText(e, (crit ? 'CRITICO ' : '') + Math.round(dmg), crit ? '#ff9a3a' : '#ffd070', crit);
    burst(e.x, e.y + 1.2, e.z, e.type === 'wisp' ? 0x90d0ff : e.type === 'golem' ? 0x8a8a90 : e.type === 'skeleton' || e.type === 'knight' ? 0xe0d8c0 : 0x601010, crit ? 14 : 8);
    if (D.leech > 0) { const s = S(); s.hp = Math.min(D.maxHp, s.hp + dmg * D.leech); }
    if (e.hp <= 0) killEnemy(e);
  }
  function killEnemy(e) {
    const s = S();
    e.dead = true; e.deadT = 0; e.state = 'dead'; e.tele.visible = false; e.stars.visible = false;
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
    if (e.type === 'skeleton' && Math.random() < 0.5) { s.res.iron++; floatTextAt(e.x, e.y + 2.9, e.z, '+1 Ferro', '#d8f0a0'); }
    // gear loot
    if (e.def.boss) {
      dropItem(e.x + 1.5, e.z, Loot.unique(e.type));
      dropItem(e.x - 1.5, e.z, Loot.roll(0.9, { boss: true, minRarity: 2 }));
    } else if (Math.random() < 0.24) dropItem(e.x, e.z, Loot.roll(zonePower(e.x, e.z)));
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
    if (player.inv > 0 || S().hp <= 0) return;
    const s = S();
    const d = Math.round(dmg * (1 - s.armor) * (0.9 + Math.random() * 0.2));
    s.hp -= d; player.inv = 0.45; player.hurtT = 0.25;
    if (player.grapple) endGrapple(false);
    AudioFX.sfx.hurt(); shake(0.25);
    $('vignette').classList.remove('hit'); void $('vignette').offsetWidth; $('vignette').classList.add('hit');
    floatTextAt(player.x, player.y + 2.2, player.z, '-' + d, '#ff6060');
    if (fromX !== undefined) { const dx = player.x - fromX, dz = player.z - fromZ, l = Math.hypot(dx, dz) || 1; player.vx += dx / l * 6; player.vz += dz / l * 6; }
    if (s.hp <= 0) playerDie();
    updateHUD();
  }
  // an enemy melee blow lands: parry, block, or hurt
  function incomingMelee(e, dmg) {
    const dx = e.x - player.x, dz = e.z - player.z, d = Math.hypot(dx, dz) || 1;
    const facing = (dx * Math.sin(player.yaw) + dz * Math.cos(player.yaw)) / d > 0.15;
    if (player.blocking && facing && !e.unblockable) {
      if (time - player.blockT <= D.parryWin) return parry(e);
      // regular block
      const s = S();
      const chip = dmg * (1 - D.block);
      s.st -= dmg * 45 / Math.max(10, D.stab); player.stUse = 0.8;
      AudioFX.sfx.clang(); burst(player.x + dx / d * 0.7, player.y + 1.3, player.z + dz / d * 0.7, 0xffe0a0, 6);
      if (D.thorns) damageEnemy(e, D.thorns, -dx / d, -dz / d, false);
      if (s.st <= 0) { s.st = 0; player.stagger = 0.9; player.blocking = false; floatTextAt(player.x, player.y + 2.4, player.z, 'GUARDIA ROTTA', '#ff8a5a'); hurtPlayer(dmg * 0.6, e.x, e.z); return; }
      player.vx -= dx / d * 2.5; player.vz -= dz / d * 2.5;
      if (chip >= 1) { s.hp -= Math.round(chip); floatTextAt(player.x, player.y + 2.2, player.z, '-' + Math.round(chip), '#ffaa80'); if (s.hp <= 0) playerDie(); }
      updateHUD();
      return;
    }
    if (player.blocking && facing && e.unblockable) floatTextAt(player.x, player.y + 2.5, player.z, 'IMPARABILE!', '#ff5050');
    hurtPlayer(dmg, e.x, e.z);
  }
  function parry(e) {
    const st = (e.def.boss ? 1.1 : 1.9) * D.stunMul;
    stunEnemy(e, st);
    e.x += (e.x - player.x) * 0.15; e.z += (e.z - player.z) * 0.15;
    S().st = Math.min(D.maxSt, S().st + 20);
    AudioFX.sfx.parry();
    slowMo = 0.35; shake(0.3);
    $('parryflash').classList.remove('on'); void $('parryflash').offsetWidth; $('parryflash').classList.add('on');
    floatTextAt(e.x, e.y + 2.6, e.z, 'PARATA PERFETTA!', '#ffe680', true);
    burst((e.x + player.x) / 2, player.y + 1.4, (e.z + player.z) / 2, 0xfff0a0, 26);
    if (D.thorns) damageEnemy(e, D.thorns * 2, 0, 0, false);
  }
  function playerDie() {
    const s = S(); s.hp = 0; s.deaths++;
    player.atk = null; player.roll = null; player.grapple = null; player.bash = null; player.whirl = null;
    $('death').hidden = false;
    setTimeout(() => {
      $('death').hidden = true;
      s.hp = D.maxHp; s.mana = s.maxMana; s.st = D.maxSt; s.gold = Math.floor(s.gold * 0.85);
      const sp = s.spawn || { x: 0, z: 6 };
      player.x = sp.x; player.z = sp.z; player.y = World.height(sp.x, sp.z) + 1; player.vy = 0; player.vx = player.vz = 0;
      for (const e of enemies) if (!e.dead && e.aggro) { e.aggro = false; e.x = e.sx; e.z = e.sz; e.stun = 0; e.state = 'idle'; e.tele.visible = false; if (e.def.boss) e.hp = e.def.hp; }
      toast(s.spawn ? 'Ti risvegli al fuoco da campo' : 'Ti risvegli a Valdombra', 'Hai perso un po\' d\'oro.');
      updateHUD(); save();
    }, 2600);
  }

  function spawnProjectile(x, y, z, dir, speed, owner, dmg, color, explode) {
    const m = new THREE.Mesh(new THREE.IcosahedronGeometry(owner === 'player' ? 0.28 : 0.22, 1), new THREE.MeshBasicMaterial({ color }));
    m.position.set(x, y, z); scene.add(m);
    const l = new THREE.PointLight(color, 1.2, 8, 2); m.add(l);
    projectiles.push({ m, vx: dir.x * speed, vy: dir.y * speed, vz: dir.z * speed, owner, dmg, life: 2.4, color, explode });
  }
  function explode(x, y, z, dmg) {
    burst(x, y, z, 0xff7a20, 30); shake(0.25);
    for (const e of enemies) {
      if (e.dead || e.gone) continue;
      const d = Math.hypot(e.x - x, e.z - z);
      if (d < 3.2 + e.def.radius) damageEnemy(e, dmg * 0.6, (e.x - x) / (d || 1), (e.z - z) / (d || 1), false);
    }
  }

  const partGeo = new THREE.BoxGeometry(0.12, 0.12, 0.12);
  function burst(x, y, z, color, n) {
    const mat = new THREE.MeshBasicMaterial({ color, transparent: true });
    for (let i = 0; i < n; i++) {
      const m = new THREE.Mesh(partGeo, mat); m.position.set(x, y, z); scene.add(m);
      particles.push({ m, vx: (Math.random() - 0.5) * 6, vy: Math.random() * 5 + 1, vz: (Math.random() - 0.5) * 6, life: 0.6 + Math.random() * 0.5 });
    }
  }
  function floatText(e, txt, col, big) { floatTextAt(e.x, e.y + (e.def.boss ? 4 : 2.2), e.z, txt, col, big); }
  const floaters = [];
  function floatTextAt(x, y, z, txt, col, big) {
    const el = document.createElement('div'); el.className = 'float' + (big ? ' big' : ''); el.textContent = txt; el.style.color = col;
    $('labels').appendChild(el); floaters.push({ el, x, y, z, t: 0 });
  }
  let shakeAmt = 0;
  function shake(a) { shakeAmt = Math.max(shakeAmt, a); }

  // ------------------------------------------------------------ toasts / HUD
  let toastTimer = null;
  function toast(title, body) {
    const t = $('toast');
    t.querySelector('b').textContent = title; t.querySelector('b').style.color = ''; t.querySelector('span').textContent = body || '';
    t.classList.remove('show'); void t.offsetWidth; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 4800);
  }
  G.toast = toast;
  function updateHUD() {
    const s = S();
    $('xp-fill').style.width = (s.xp / xpNeed(s.level) * 100) + '%';
    $('lvl').textContent = s.level;
    $('gold').textContent = s.gold;
    $('potions').textContent = s.inv.potion || 0;
    $('embers').textContent = `${s.inv.ember || 0}/3`;
    $('sp-badge').hidden = !s.sp; $('sp-badge').textContent = `${s.sp} punt${s.sp > 1 ? 'i' : 'o'} abilità (K)`;
    for (const k of ['wood', 'stone', 'iron', 'crystal', 'dirt']) $('r-' + k).textContent = s.res[k] || 0;
    const q = s.quests.main && s.quests.main.state !== 'done' ? 'main' : Object.keys(s.quests).find(id => s.quests[id].state === 'active');
    $('track').hidden = !q;
    if (q) { $('track-title').textContent = Data.quests[q].title; $('track-text').textContent = Data.questText(q, G); }
    $('sk-whirl').hidden = !has('whirl');
    updateHUDFast();
  }
  function updateHUDFast() {
    const s = S();
    $('hp-fill').style.width = (Math.max(0, s.hp) / D.maxHp * 100) + '%';
    $('mp-fill').style.width = (s.mana / s.maxMana * 100) + '%';
    $('st-fill').style.width = (s.st / D.maxSt * 100) + '%';
    $('hp-txt').textContent = `${Math.max(0, Math.round(s.hp))} / ${D.maxHp}`;
    $('mp-txt').textContent = `${Math.round(s.mana)} / ${s.maxMana}`;
    $('lowhp').classList.toggle('on', s.hp > 0 && s.hp < D.maxHp * 0.3);
    const cd = (id, v, max) => { const el = $(id); if (el) el.style.setProperty('--cd', U.clamp(v / max, 0, 1)); };
    cd('sk-fire', player.cds.fire, 0.5); cd('sk-bash', player.cds.bash, 0.7); cd('sk-grapple', player.cds.grapple, D.grappleCd); cd('sk-whirl', player.cds.whirl, 5);
    $('sk-bash').classList.toggle('off', !D.hasShield);
  }

  function showEnding() {
    const s = S();
    paused = true; if (document.exitPointerLock) document.exitPointerLock();
    $('end-stats').textContent = `Livello ${s.level} · ${s.kills} nemici sconfitti · ${Object.values(s.quests).filter(q => q.state === 'done').length} missioni completate · ${Build.list.length} costruzioni · ${Math.round(s.playTime / 60)} minuti`;
    $('ending').hidden = false;
  }

  // ------------------------------------------------------------ loop
  G.loop = function () {
    requestAnimationFrame(G.loop);
    let rdt = Math.min(clock.getDelta(), 0.05);
    time += rdt;
    let dt = rdt;
    if (hitStop > 0) { hitStop -= rdt; dt = rdt * 0.05; }
    else if (slowMo > 0) { slowMo -= rdt; dt = rdt * 0.3; }
    if (dawnT > 0 && dawnT < 1) { dawnT = Math.min(1, dawnT + rdt / 7); applyDawn(dawnT); }
    if (started && !paused) update(dt, rdt);
    else if (!started) {
      const a = time * 0.05;
      camera.position.set(Math.cos(a) * 60, 32, Math.sin(a) * 60);
      camera.lookAt(0, 4, 0);
      World.update(rdt, time);
      animateNPCs(rdt);
    }
    renderer.render(scene, camera);
    if (started) positionLabels(rdt);
  };

  function update(dt, rdt) {
    const s = S();
    s.playTime += rdt;
    World.update(dt, time);
    Build.update(time);
    updatePlayer(dt);
    updateCamera(rdt);
    updateEnemies(dt);
    animateNPCs(dt);
    updateProjectiles(dt);
    updateParticles(dt);
    updatePickups(dt);
    updateDrops(dt);
    updateNodes(dt);
    // regen
    s.mana = Math.min(s.maxMana, s.mana + dt * 3.2);
    player.stUse -= dt;
    if (player.stUse <= 0 && !player.blocking) s.st = Math.min(D.maxSt, s.st + dt * 38);
    const fighting = enemies.some(e => e.aggro && !e.dead);
    const nearFire = Build.list.some(b => b.type === 'campfire' && Math.hypot(b.x - player.x, b.z - player.z) < 4);
    if (!fighting) s.hp = Math.min(D.maxHp, s.hp + dt * (nearFire ? 8 : 1.2));
    AudioFX.combat = fighting;
    // building ghost
    digCd -= rdt;
    if (buildMode && !inDialogue && !uiOpen) {
      const piece = Build.PIECES[buildSel];
      buildPlan = Build.aim(camera.position, camForward(), player, piece.id, buildRot, false);
      Build.showGhost(buildPlan, costOk(piece.cost));
      if (lmbHeld && piece.tool) buildAction(false);
      $('buildinfo').textContent = `${piece.name} · ${costStr(piece.cost)}${piece.tool ? '' : ' · rotazione ' + buildRot * 90 + '°'}`;
    }
    // interact prompt
    const it = (inDialogue || uiOpen) ? null : nearestInteractable();
    const lbl = interactLabel(it);
    $('prompt').hidden = !lbl; if (lbl) $('prompt-txt').textContent = lbl;
    const z = World.zoneAt(player.x, player.z);
    if (z !== lastZone) { lastZone = z; if (z) { const el = $('zone'); el.textContent = World.places[z].name; el.classList.remove('show'); void el.offsetWidth; el.classList.add('show'); } }
    const boss = enemies.find(e => e.def.boss && e.aggro && !e.dead && Math.hypot(e.x - player.x, e.z - player.z) < 40);
    $('bossbar').hidden = !boss;
    if (boss) { $('boss-name').textContent = boss.def.name; $('boss-fill').style.width = Math.max(0, boss.hp / boss.def.hp * 100) + '%'; }
    updateHUDFast();
    drawMinimap();
    saveTimer += rdt; if (saveTimer > 20) { saveTimer = 0; save(); }
    if (uiOpen === 'map') renderBigMap();
  }

  function groundAt(x, z, feetY) {
    return Math.max(World.height(x, z), World.WATER - 0.6, Build.groundAt(x, z, feetY));
  }

  function updatePlayer(dt) {
    const s = S();
    if (s.hp <= 0) { Models.animHumanoid(rig, 'dead', time, { k: 1 }); placeRig(); rope.visible = false; return; }
    for (const k in player.cds) player.cds[k] = Math.max(0, player.cds[k] - dt);
    player.inv = Math.max(0, player.inv - dt); player.hurtT = Math.max(0, player.hurtT - dt); player.stagger = Math.max(0, player.stagger - dt);
    player.comboT = Math.max(0, player.comboT - dt); player.castT = Math.max(0, player.castT - dt); player.potionCd = Math.max(0, player.potionCd - dt);
    player.flip = Math.max(0, player.flip - dt);
    const frozen = inDialogue || uiOpen;
    let mv = frozen ? { x: 0, z: 0 } : inputVector();
    const running = (keys.ShiftLeft || keys.ShiftRight) && s.st > 1;
    // blocking: hold right mouse
    player.blocking = !buildMode && rmbHeld && D.hasShield && !frozen && !player.roll && !player.atk && !player.bash && !player.whirl && player.stagger <= 0 && !player.grapple && s.st > 0;
    let speed = (running ? 8.2 : 4.6) * s.speed;
    if (running && (mv.x || mv.z)) { s.st -= dt * 14; player.stUse = 0.5; }
    if (player.blocking) speed *= 0.45;
    let state = 'idle';
    if (player.fishing) {
      mv = { x: 0, z: 0 };
      player.fishing.t += dt;
      if (player.fishing.t > player.fishing.dur) {
        player.fishing = null;
        if (Math.random() < 0.6) { s.inv.fish = 1; toast('Pesce d\'Argento!', 'Guizza e luccica. Ottone sarà… soddisfatto?'); AudioFX.sfx.pickup(); save(); }
        else toast('Niente…', 'Il pesce è scappato. Riprova (E).');
      }
    }
    if (player.stagger > 0) { mv = { x: 0, z: 0 }; state = 'hurt'; }
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
      speed *= 0.25; state = 'attack';
      if (k >= 1) { player.atk = null; if (player.queued) { player.queued = false; attack(); } }
    } else if (player.bash) {
      player.bash.t += dt; speed = 6; mv = { x: Math.sin(player.yaw), z: Math.cos(player.yaw) };
      if (!player.bash.hit && player.bash.t > 0.12) { player.bash.hit = true; doBashHit(); }
      if (player.bash.t > player.bash.dur) player.bash = null;
      state = 'bash';
    } else if (player.whirl) {
      player.whirl.t += dt; speed *= 0.6;
      const hits = Math.floor(player.whirl.t / 0.3);
      if (hits > player.whirl.hits && player.whirl.hits < 2) { player.whirl.hits++; doWhirlHit(); AudioFX.sfx.swing(); }
      if (player.whirl.t > player.whirl.dur) player.whirl = null;
      state = 'whirl';
    }
    let mx = mv.x * speed, mz = mv.z * speed;
    // grappling: reel toward the anchor
    if (player.grapple) {
      const g = player.grapple; g.t += dt;
      if (g.enemy && !g.enemy.dead) { g.x = g.enemy.x; g.z = g.enemy.z; g.y = g.enemy.y + 1.5; }
      const dx = g.x - player.x, dy = g.y - (player.y + 1.0), dz = g.z - player.z, d = Math.hypot(dx, dy, dz);
      const sp = 27;
      player.vx = dx / d * sp; player.vz = dz / d * sp; player.vy = dy / d * sp + 1.5;
      mx = mz = 0;
      if (d < (g.enemy ? 2.6 : 1.6) || g.t > 1.8) endGrapple(false);
      state = 'grapple';
    }
    // external velocity (grapple momentum, knockback)
    mx += player.vx; mz += player.vz;
    const fr = player.onGround ? Math.exp(-dt * 10) : Math.exp(-dt * 0.6);
    if (!player.grapple) { player.vx *= fr; player.vz *= fr; }
    let nx = player.x + mx * dt, nz = player.z + mz * dt;
    if (World.height(nx, nz) < -1.2 && Build.groundAt(nx, nz, player.y) < World.WATER - 0.5) { nx = player.x; nz = player.z; player.vx = player.vz = 0; }
    let r = World.resolve(nx, nz, 0.45);
    r = Build.resolve(r.x, r.z, 0.45, player.y);
    for (const n of npcs) { const dx = r.x - n.x, dz = r.z - n.z, d = Math.hypot(dx, dz); if (d < 0.9 && d > 0.01 && !n.d.cat) { r.x = n.x + dx / d * 0.9; r.z = n.z + dz / d * 0.9; } }
    player.x = r.x; player.z = r.z;
    const moving = Math.hypot(mv.x, mv.z) > 0.1;
    if (moving && !player.roll && !player.atk && !player.bash && !player.grapple) {
      if (!player.blocking) player.yaw = U.angleLerp(player.yaw, Math.atan2(mv.x, mv.z), Math.min(1, dt * 12));
      state = player.blocking ? 'walk' : running ? 'run' : 'walk';
    }
    if (player.blocking) player.yaw = U.angleLerp(player.yaw, cam.yaw + Math.PI, Math.min(1, dt * 14));
    // vertical
    const gh = groundAt(player.x, player.z, player.y);
    const gliding = has('glide') && keys.Space && !player.onGround && player.vy < 0 && !player.grapple && player.jumps >= D.jumps;
    if (!player.grapple) player.vy -= (gliding ? 6 : 22) * dt;
    if (gliding) player.vy = Math.max(player.vy, -2.4);
    player.y += player.vy * dt;
    const ceil = Build.ceilingAt(player.x, player.z, player.y + 1.8);
    if (player.y + 1.8 > ceil && player.vy > 0) { player.y = ceil - 1.8; player.vy = 0; }
    if (player.y <= gh) {
      if (!player.onGround && !player.grapple && player.vy < -16) { const fall = Math.round((-player.vy - 16) * 3); if (fall > 0) hurtPlayer(fall); }
      player.y = gh; player.vy = 0; player.onGround = true; player.jumps = 0;
    } else if (player.y > gh + 0.08) { if (player.onGround && player.vy <= 0) player.jumps = 1; player.onGround = false; }
    if (!player.onGround && !player.roll && !player.grapple && !player.atk && !player.whirl && !player.bash) state = gliding ? 'glide' : 'jump';
    if (player.castT > 0 && !player.atk && !player.roll) state = 'cast';
    if (player.hurtT > 0 && state === 'idle') state = 'hurt';
    if ((state === 'walk' || state === 'run') && player.onGround) { player.stepT -= dt * (state === 'run' ? 1.6 : 1); if (player.stepT <= 0) { player.stepT = 0.33; AudioFX.sfx.step(); } }
    const k = player.atk ? player.atk.t / player.atk.dur : player.roll ? player.roll.t / player.roll.dur : 0;
    const animState = ['bash', 'whirl', 'glide', 'grapple'].includes(state) ? 'idle' : state;
    Models.animHumanoid(rig, animState, time, { k, combo: player.atk ? player.atk.combo : 0 });
    // extra poses layered on the base rig
    if (player.blocking) { rig.armL.rotation.set(-0.45, 0, 1.25); rig.body.rotation.y = -0.2; }
    else if (D.hasShield && state !== 'roll' && state !== 'cast') { rig.armL.rotation.x = Math.max(rig.armL.rotation.x, -0.3) - 0.25; }
    if (state === 'bash') { const b = player.bash.t / player.bash.dur; rig.armL.rotation.set(-1.5 + b * 0.4, 0, 0.6); rig.body.rotation.y = -0.4 + b * 0.5; rig.body.rotation.x = 0.15; }
    if (state === 'whirl') { rig.body.rotation.y = player.whirl.t * 22; rig.armR.rotation.set(-1.5, 0, -1.2); rig.armL.rotation.set(-1.5, 0, 1.2); }
    if (state === 'glide' || state === 'grapple') { rig.armL.rotation.set(state === 'grapple' ? -2.6 : 0, 0, state === 'glide' ? 1.3 : 0); rig.armR.rotation.set(0, 0, -1.3); rig.legL.rotation.x = 0.3; rig.legR.rotation.x = -0.2; if (rig.cape) rig.cape.rotation.x = 1.3; }
    if (player.flip > 0) rig.body.rotation.x = -(1 - player.flip / 0.45) * Math.PI * 2;
    if (player.fishing) { rig.armR.rotation.x = -1.2; rig.armL.rotation.x = -1.0; }
    rig.root.visible = !(player.inv > 0 && !player.roll && Math.floor(time * 20) % 2 === 0);
    placeRig();
    if (rig.blade) rig.blade.material.emissiveIntensity = (player.atk || player.whirl) ? 2.2 : 1;
    // rope
    const ropeTarget = player.grapple || (player.grappleFx && player.grappleFx.t > 0 ? player.grappleFx : null);
    if (player.grappleFx) {
      player.grappleFx.t -= dt;
      const e = player.grappleFx.follow;
      if (e && e.yank) { const tx = player.x + Math.sin(player.yaw) * 1.8, tz = player.z + Math.cos(player.yaw) * 1.8; e.yank.t += dt * 4; e.x = U.lerp(e.yank.fx, tx, Math.min(1, e.yank.t)); e.z = U.lerp(e.yank.fz, tz, Math.min(1, e.yank.t)); player.grappleFx.x = e.x; player.grappleFx.z = e.z; if (e.yank.t >= 1) e.yank = null; }
    }
    if (ropeTarget) {
      const hp = new THREE.Vector3(); rig.armL.localToWorld(hp.set(0, -0.6, 0));
      const pos = rope.geometry.attributes.position; pos.setXYZ(0, hp.x, hp.y, hp.z); pos.setXYZ(1, ropeTarget.x, ropeTarget.y, ropeTarget.z); pos.needsUpdate = true;
      rope.visible = true;
    } else rope.visible = false;
  }
  function placeRig() {
    rig.root.position.set(player.x, player.y, player.z);
    rig.root.rotation.y = player.yaw;
    playerLight.position.set(player.x, player.y + 2.2, player.z);
    playerLight.intensity = S().flags.dawn ? 0.2 : 0.9;
    moonLight.position.set(player.x - 30, player.y + 60, player.z - 40);
    moonLight.target.position.set(player.x, player.y, player.z);
  }

  const camPos = new THREE.Vector3(), camTarget = new THREE.Vector3();
  function updateCamera(dt) {
    if (inDialogue && dlg) {
      const n = dlg.n;
      const mx = (player.x + n.x) / 2, mz = (player.z + n.z) / 2;
      const ang = Math.atan2(n.x - player.x, n.z - player.z) + Math.PI / 2;
      const tx = mx + Math.sin(ang) * 4.5, tz = mz + Math.cos(ang) * 4.5;
      camPos.lerp(tmpV.set(tx, World.height(tx, tz) + 2.6, tz), Math.min(1, dt * 3));
      camTarget.lerp(tmpV.set(mx, n.y + (n.d.cat ? 0.6 : 1.5), mz), Math.min(1, dt * 4));
      camera.position.copy(camPos); camera.lookAt(camTarget);
      player.yaw = U.angleLerp(player.yaw, Math.atan2(n.x - player.x, n.z - player.z), dt * 6);
      n.yaw = U.angleLerp(n.yaw, Math.atan2(player.x - n.x, player.z - n.z), dt * 6);
      return;
    }
    // over-the-shoulder
    const side = 0.75;
    const rx = Math.cos(cam.yaw), rz = -Math.sin(cam.yaw);
    const tx = player.x - rx * side, ty = player.y + 1.75, tz = player.z - rz * side;
    const dist = cam.dist;
    const cx = tx + Math.sin(cam.yaw) * Math.cos(cam.pitch) * dist;
    const cz = tz + Math.cos(cam.yaw) * Math.cos(cam.pitch) * dist;
    let cy = ty + Math.sin(cam.pitch) * dist;
    const gh = Math.max(World.height(cx, cz), World.WATER) + 0.5;
    if (cy < gh) cy = gh;
    camPos.lerp(tmpV.set(cx, cy, cz), Math.min(1, dt * 16));
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
      if (started && !inDialogue) {
        n.barkT -= dt;
        if (n.barkT <= 0 && dp < 9) { n.barkT = 14 + Math.random() * 10; floatTextAt(n.x, n.y + (n.d.cat ? 1.2 : 2.6), n.z, U.pick(Data.barks[n.d.id]), '#e8dcc0'); }
      }
    }
  }

  function updateNodes(dt) {
    // wobble struck trees/rocks (instanced: briefly offset via matrix)
    for (const n of World.nodesNear(player.x, player.z, 6)) {
      if (!n.shakeT || n.shakeT <= 0) continue;
      n.shakeT -= dt;
      if (n.group) n.group.rotation.z = n.shakeT > 0 ? Math.sin(time * 60) * 0.06 : 0;
    }
  }

  // ------------------------------------------------------------ enemies
  function updateEnemies(dt) {
    const s = S();
    for (const e of enemies) {
      const def = e.def;
      if (e.gone) {
        if (!def.boss) { e.respawnT -= dt; if (e.respawnT <= 0 && Math.hypot(player.x - e.sx, player.z - e.sz) > 45 && !s.flags.dawn) reviveEnemy(e); }
        continue;
      }
      e.flash = Math.max(0, e.flash - dt);
      if (e.dead) {
        e.deadT += dt;
        animEnemy(e, 'dead', Math.min(1, e.deadT * 2));
        if (e.deadT > 2.2) { e.gone = true; e.m.root.visible = false; e.respawnT = 90; }
        placeEnemy(e);
        continue;
      }
      const dx = player.x - e.x, dz = player.z - e.z, d = Math.hypot(dx, dz);
      const leash = Math.hypot(e.x - e.sx, e.z - e.sz);
      const alive = s.hp > 0;
      if (!e.aggro && alive && d < def.aggro && !inDialogue) { e.aggro = true; if (def.boss) { AudioFX.sfx.roar(); toast(def.name, 'Un guardiano corrotto ti sbarra la strada!'); } }
      if (e.aggro && (leash > (def.boss ? 30 : 40) || !alive || d > def.aggro * 2.6)) { e.aggro = false; e.state = 'return'; e.tele.visible = false; }
      if (s.flags.dawn && !def.boss) e.aggro = false;
      e.cd -= dt;
      let moveX = 0, moveZ = 0, anim = 'idle', k = 0;
      if (e.state === 'stunned') {
        e.stun -= dt; anim = 'stunned';
        e.stars.visible = true; e.stars.rotation.y += dt * 5;
        e.stars.children.forEach((st, i) => { const a = i / 3 * Math.PI * 2 + time * 4; st.position.set(Math.cos(a) * 0.5, Math.sin(time * 6 + i) * 0.08, Math.sin(a) * 0.5); });
        if (e.stun <= 0) { e.state = 'chase'; e.stars.visible = false; e.cd = 0.4; }
      } else if (e.state === 'windup') {
        e.t += dt; anim = 'windup'; e.yaw = U.angleLerp(e.yaw, Math.atan2(dx, dz), dt * (def.boss ? 2.5 : 5));
        e.tele.visible = true; const p = e.t / e.windup; e.tele.scale.setScalar((e.def.boss ? 2.2 : 1.3) * (0.4 + p * 0.9) * (1 + Math.sin(time * 40) * 0.08));
        e.tele.material.map = e.unblockable ? flashTexR : flashTexY;
        if (e.t >= e.windup) { e.state = 'attack'; e.t = 0; e.hitDone = false; e.tele.visible = false; if (def.ranged) enemyShoot(e); }
      } else if (e.state === 'attack') {
        e.t += dt; anim = 'attack'; k = Math.min(1, e.t / 0.4);
        if (e.type === 'wolf' || e.type === 'alpha') { moveX = Math.sin(e.yaw) * 9; moveZ = Math.cos(e.yaw) * 9; }
        if (!e.hitDone && e.t > 0.12 && !def.ranged) {
          e.hitDone = true;
          if (def.slam) {
            if (d < 5.5) incomingMelee(e, def.dmg);
            shake(0.6); AudioFX.sfx.boom(); burst(e.x + Math.sin(e.yaw) * 2.5, e.y + 0.3, e.z + Math.cos(e.yaw) * 2.5, 0x8a7a6a, 30);
          } else if (d < def.range + 0.6) {
            const dot = (dx * Math.sin(e.yaw) + dz * Math.cos(e.yaw)) / (d || 1);
            if (dot > 0.3) incomingMelee(e, def.dmg * (e.unblockable ? 1.4 : 1));
          }
        }
        if (e.t > 0.5 && e.state === 'attack') { e.state = 'chase'; e.cd = def.cooldown * (0.8 + Math.random() * 0.4) * (def.boss && e.hp < def.hp * 0.4 ? 0.7 : 1); }
      } else if (e.aggro) {
        e.yaw = U.angleLerp(e.yaw, Math.atan2(dx, dz), dt * 6);
        const want = def.ranged ? 8 : def.range * 0.8;
        if (d > want) { const sp = def.speed * (def.boss && e.hp < def.hp * 0.4 ? 1.25 : 1); moveX = dx / d * sp; moveZ = dz / d * sp; anim = sp > 4 ? 'run' : 'walk'; }
        else if (def.ranged && d < 5) { moveX = -dx / d * def.speed; moveZ = -dz / d * def.speed; anim = 'walk'; }
        if (e.cd <= 0 && d < (def.ranged ? def.range : def.range + 0.5)) {
          e.state = 'windup'; e.t = 0; e.atkCount++;
          e.unblockable = !!def.slam || (e.type === 'knight' && e.atkCount % 3 === 0) || (e.type === 'alpha' && e.atkCount % 4 === 0);
          e.windup = def.windup * (e.unblockable && !def.slam ? 1.4 : 1) * (0.9 + Math.random() * 0.25);
          AudioFX.sfx.warn(e.unblockable);
        }
      } else {
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
      if (e.yank) { moveX = moveZ = 0; }
      let nx = e.x + moveX * dt, nz = e.z + moveZ * dt;
      if (World.height(nx, nz) < -0.8 && !def.fly) { nx = e.x; nz = e.z; }
      let r = World.resolve(nx, nz, def.radius * 0.7);
      r = Build.resolve(r.x, r.z, def.radius * 0.7, e.y);
      e.x = r.x; e.z = r.z;
      const pd = Math.hypot(player.x - e.x, player.z - e.z), minD = def.radius + 0.5;
      if (pd < minD && pd > 0.01 && Math.abs(player.y - e.y) < 2) { e.x = player.x - (player.x - e.x) / pd * minD; e.z = player.z - (player.z - e.z) / pd * minD; }
      animEnemy(e, anim, k);
      placeEnemy(e);
    }
    for (let i = 0; i < enemies.length; i++) for (let j = i + 1; j < enemies.length; j++) {
      const a = enemies[i], b = enemies[j]; if (a.dead || b.dead || a.gone || b.gone) continue;
      const dx = b.x - a.x, dz = b.z - a.z, d = Math.hypot(dx, dz), m = (a.def.radius + b.def.radius) * 0.8;
      if (d < m && d > 0.01) { const p = (m - d) / 2; a.x -= dx / d * p; a.z -= dz / d * p; b.x += dx / d * p; b.z += dz / d * p; }
    }
  }
  function animEnemy(e, anim, k) {
    const stunned = anim === 'stunned';
    if (stunned) anim = 'idle';
    if (e.m.kind === 'wolf') Models.animWolf(e.m, anim, time, { k });
    else if (e.m.kind === 'wisp') Models.animWisp(e.m, anim, time, { k });
    else if (e.m.kind === 'golem') Models.animGolem(e.m, anim, time, { k });
    else Models.animHumanoid(e.m, anim === 'windup' ? 'attack' : anim, time, { k: anim === 'windup' ? 0.2 : anim === 'attack' ? 0.35 + k * 0.65 : k, combo: e.type === 'knight' ? 2 : 0 });
    if (stunned) { e.m.body.rotation.z = Math.sin(time * 5) * 0.12; e.m.body.rotation.x = -0.12; }
    else if (e.m.kind !== 'wisp' && anim !== 'dead') e.m.body.rotation.z = 0;
    const want = e.flash > 0 ? 0xffffff : e.state === 'windup' ? (e.unblockable ? 0xa00000 : 0x806000) : e.state === 'stunned' ? 0x202060 : -1;
    if (want !== e._flashOn) {
      e._flashOn = want;
      e.m.root.traverse(o => { if (o.isMesh && o.material && o.material.emissive) o.material.emissive.setHex(want >= 0 ? want : (o.material.userData.baseEm || 0)); });
    }
  }
  function placeEnemy(e) {
    e.y = Math.max(World.height(e.x, e.z), Build.groundAt(e.x, e.z, e.y || 0));
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
      let hit = p.life <= 0 || y < World.height(x, z) || Build.rayHit(p.m.position, tmpV.set(0, 1, 0), 0.31) > 0;
      if (!hit && p.owner === 'player') {
        for (const e of enemies) {
          if (e.dead || e.gone) continue;
          const ey = e.y + (e.def.fly ? 1.6 : e.def.boss ? 2 : 1);
          if (Math.hypot(e.x - x, e.z - z) < e.def.radius + 0.5 && Math.abs(ey - y) < (e.def.boss ? 3 : 1.4)) { damageEnemy(e, p.dmg, p.vx / 26, p.vz / 26, false); hit = true; break; }
        }
      } else if (!hit && p.owner === 'enemy') {
        if (Math.hypot(player.x - x, player.z - z) < 0.8 && y > player.y && y < player.y + 2.2) {
          const facing = ((x - player.x) * Math.sin(player.yaw) + (z - player.z) * Math.cos(player.yaw)) > 0;
          if (player.blocking && facing && time - player.blockT <= D.parryWin * 1.3) {
            // reflect!
            p.vx *= -1.6; p.vy = 0; p.vz *= -1.6; p.owner = 'player'; p.dmg *= 2.5; p.life = 2; p.m.material.color.set(0xffe060);
            AudioFX.sfx.parry(); floatTextAt(player.x, player.y + 2.5, player.z, 'RIFLESSO!', '#ffe680', true); slowMo = 0.2;
            continue;
          } else if (player.blocking && facing) {
            AudioFX.sfx.clang(); S().st -= 15; player.stUse = 0.8; hit = true;
          } else { hurtPlayer(p.dmg, x - p.vx, z - p.vz); hit = true; }
        }
      }
      if (hit) {
        burst(x, y, z, p.color, 10);
        if (p.owner === 'player') { AudioFX.sfx.boom(); if (p.explode) explode(x, y, z, p.dmg); }
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
  function positionLabels(rdt) {
    for (const n of npcs) {
      const d = Math.hypot(player.x - n.x, player.z - n.z);
      const sc = (n.d.look && n.d.look.scale) || 1;
      const pr = d < 22 && !inDialogue ? project(n.x, n.y + (n.d.cat ? 1.0 : 2.4) * sc, n.z) : null;
      n.label.hidden = !pr;
      if (pr) { n.label.style.transform = `translate(${pr[0]}px, ${pr[1]}px) translate(-50%, -100%)`; n.label.style.opacity = U.clamp(1.4 - d / 16, 0.15, 1); }
      const act = n.d.topics.some(t => t.action && !['bless', 'buy_potion', 'reveal', 'forge_upgrade'].includes(t.action) && (!t.cond || t.cond(G)));
      const done = n.d.topics.some(t => t.action && /complete|deliver/.test(t.action) && (!t.cond || t.cond(G)));
      const mp = act && d < 60 && !inDialogue ? project(n.x, n.y + (n.d.cat ? 1.6 : 3.1) * sc, n.z) : null;
      n.marker.hidden = !mp;
      if (mp) { n.marker.textContent = done ? '?' : '!'; n.marker.className = 'qmark' + (done ? ' done' : ''); n.marker.style.transform = `translate(${mp[0]}px, ${mp[1]}px) translate(-50%, -100%)`; }
    }
    for (const e of enemies) {
      const show = !e.dead && !e.gone && !e.def.boss && (e.aggro || e.hp < e.def.hp) && Math.hypot(player.x - e.x, player.z - e.z) < 25;
      const pr = show ? project(e.x, e.y + (e.def.fly ? 2.5 : e.type === 'wolf' ? 1.8 : 2.3), e.z) : null;
      e.hpBar.hidden = !pr;
      if (pr) { e.hpBar.style.transform = `translate(${pr[0]}px, ${pr[1]}px) translate(-50%, -100%)`; e.hpBar.firstChild.style.width = Math.max(0, e.hp / e.def.hp * 100) + '%'; }
    }
    for (const dr of drops) {
      const d = Math.hypot(player.x - dr.x, player.z - dr.z);
      const pr = d < 18 ? project(dr.x, World.height(dr.x, dr.z) + 1.1, dr.z) : null;
      dr.label.hidden = !pr;
      if (pr) dr.label.style.transform = `translate(${pr[0]}px, ${pr[1]}px) translate(-50%, -100%)`;
    }
    for (let i = floaters.length - 1; i >= 0; i--) {
      const f = floaters[i]; f.t += rdt;
      const pr = project(f.x, f.y + f.t * 1.2, f.z);
      if (!pr || f.t > 1.4) { f.el.remove(); floaters.splice(i, 1); continue; }
      f.el.style.transform = `translate(${pr[0]}px, ${pr[1]}px) translate(-50%, -50%)`; f.el.style.opacity = Math.min(1, (1.4 - f.t) * 2);
    }
  }

  G._debug = { player: () => player, enemies, npcs, drops, openDialogue: id => openDialogue(npcs.find(n => n.d.id === id)), keys, runAction, interact, cam, fireGrapple, toggleBuild, buildAction, setSel: i => { buildSel = i; }, camera: () => camera, dropItem, shieldBash, input: { lmb: v => { lmbHeld = v; }, rmb: v => { rmbHeld = v; if (v) player.blockT = time; } } };
})();
