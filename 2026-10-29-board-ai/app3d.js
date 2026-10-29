// 3D 介面(three.js):黑白棋翻面動畫、五子棋木盤、立體四連。與 src/ 共用同一份規則與 AI。
(function () {
  const { Othello, PASS } = BoardAI.othello, { Gomoku } = BoardAI.gomoku, { Score4 } = BoardAI.score4;
  const { search } = BoardAI.search;
  const BLACK = 1, WHITE = -1;
  const $ = id => document.getElementById(id);
  const stage = $('stage');

  // ---------- three.js 場景 ----------
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  stage.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  function applyBg() { const c = getComputedStyle(document.documentElement).getPropertyValue('--stage').trim() || '#cfd8cf'; scene.background = new THREE.Color(c); }
  applyBg(); matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyBg);
  const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 200);
  scene.add(new THREE.HemisphereLight(0xffffff, 0x445566, 0.75));
  const sun = new THREE.DirectionalLight(0xffffff, 0.85);
  sun.position.set(6, 14, 8); sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 14, bottom: -14, near: 1, far: 50 });
  scene.add(sun);

  // 環繞式相機:左鍵/單指拖曳旋轉,滾輪/雙指縮放
  const cam = { theta: 0, phi: 1.0, radius: 12, ty: 0, goal: null };
  function placeCamera() {
    cam.phi = Math.max(0.12, Math.min(1.5, cam.phi)); cam.radius = Math.max(4, Math.min(40, cam.radius));
    camera.position.set(cam.radius * Math.sin(cam.phi) * Math.sin(cam.theta), cam.ty + cam.radius * Math.cos(cam.phi), cam.radius * Math.sin(cam.phi) * Math.cos(cam.theta));
    camera.lookAt(0, cam.ty, 0);
  }
  function resize() {
    const w = stage.clientWidth, h = Math.max(320, Math.min(stage.clientWidth * 0.8, innerHeight * 0.72));
    renderer.setSize(w, h); camera.aspect = w / h; camera.updateProjectionMatrix();
  }
  addEventListener('resize', resize);

  // ---------- 動畫 ----------
  const tweens = [];
  const ease = u => (u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2);
  function tween(dur, fn, delay = 0) { tweens.push({ t0: performance.now() + delay, dur, fn }); }
  function runTweens(now) {
    for (let i = tweens.length - 1; i >= 0; i--) {
      const t = tweens[i], u = Math.min(1, Math.max(0, (now - t.t0) / t.dur));
      if (now < t.t0) continue;
      t.fn(ease(u), u);
      if (u >= 1) tweens.splice(i, 1);
    }
  }

  // ---------- 遊戲狀態 ----------
  let kind = 'score4', game, human = BLACK, depth = 3, thinking = false, token = 0, lastInfo = '';
  let world = new THREE.Group(); scene.add(world);
  const pieces = new Map();        // 格子索引 -> { mesh, color }
  let pickPlane = null, pegPick = [], hover = -1, ghost = null, hints = new THREE.Group();
  let winMeshes = [];

  const LEVELS = {
    score4: [['簡單(深度 2)', 2], ['普通(深度 4)', 4], ['困難(深度 5)', 5], ['大師(深度 6)', 6]],
    othello: [['簡單(深度 2)', 2], ['普通(深度 4)', 4], ['困難(深度 6)', 6], ['大師(深度 8)', 8]],
    gomoku: [['簡單(深度 1)', 1], ['普通(深度 2)', 2], ['困難(深度 3)', 3], ['大師(深度 4)', 4]],
  };

  const mat = (c, o = {}) => new THREE.MeshStandardMaterial(Object.assign({ color: c, roughness: 0.5, metalness: 0.05 }, o));

  function clearWorld() {
    scene.remove(world);
    world.traverse(o => { if (o.geometry) o.geometry.dispose(); });
    world = new THREE.Group(); scene.add(world);
    pieces.clear(); tweens.length = 0; pegPick = []; ghost = null; winMeshes = []; hover = -1;
    hints = new THREE.Group(); world.add(hints);
  }

  function addSlab(w, h, d, color, y, extra) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(color, extra));
    m.position.y = y; m.receiveShadow = true; m.castShadow = true; world.add(m); return m;
  }
  function lineSet(points, color) {
    const g = new THREE.BufferGeometry().setFromPoints(points);
    const l = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
    world.add(l); return l;
  }
  function invisiblePlane(size, y) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
    m.rotation.x = -Math.PI / 2; m.position.y = y; world.add(m); return m;
  }

  // ---------- 各遊戲的幾何配置 ----------
  const L = {
    othello: {
      pos: i => new THREE.Vector3((i % 8) - 3.5, 0.2 + 0.09, ((i / 8) | 0) - 3.5),
      build() {
        addSlab(8.8, 0.4, 8.8, 0x5b3a1e, 0);                       // 木框
        addSlab(8.1, 0.42, 8.1, 0x1c7a43, 0, { roughness: 0.8 });   // 綠色氈面
        const pts = [];
        for (let i = 0; i <= 8; i++) { const p = i - 4; pts.push(new THREE.Vector3(p, 0.215, -4), new THREE.Vector3(p, 0.215, 4), new THREE.Vector3(-4, 0.215, p), new THREE.Vector3(4, 0.215, p)); }
        lineSet(pts, 0x0b3d21);
        pickPlane = invisiblePlane(8, 0.22);
        cam.radius = 12.5; cam.ty = 0;
      },
      cellOf(pt) { const c = Math.floor(pt.x + 4), r = Math.floor(pt.z + 4); return c < 0 || c > 7 || r < 0 || r > 7 ? -1 : r * 8 + c; },
      piece(color) {
        const geo = new THREE.CylinderGeometry(0.4, 0.4, 0.18, 40);
        const m = new THREE.Mesh(geo, [mat(0x888888), mat(0x151515, { roughness: 0.3 }), mat(0xf4f4f0, { roughness: 0.3 })]); // 側面、上蓋(黑)、下蓋(白)
        m.castShadow = true; m.receiveShadow = true;
        m.rotation.x = color === BLACK ? 0 : Math.PI; return m;
      },
    },
    gomoku: {
      pos(i) { const n = game.size; return new THREE.Vector3((i % n) - (n - 1) / 2, 0.3 + 0.2, ((i / n) | 0) - (n - 1) / 2); },
      build() {
        const n = game.size;
        addSlab(n + 1.2, 0.6, n + 1.2, 0xd9a65a, 0, { roughness: 0.7 });
        const h = (n - 1) / 2, pts = [];
        for (let i = 0; i < n; i++) { const p = i - h; pts.push(new THREE.Vector3(p, 0.305, -h), new THREE.Vector3(p, 0.305, h), new THREE.Vector3(-h, 0.305, p), new THREE.Vector3(h, 0.305, p)); }
        lineSet(pts, 0x4a3010);
        if (n === 15) for (const [r, c] of [[3, 3], [3, 11], [11, 3], [11, 11], [7, 7]]) {
          const d = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.02, 12), mat(0x4a3010)); d.position.set(c - h, 0.31, r - h); world.add(d);
        }
        pickPlane = invisiblePlane(n + 1, 0.32);
        cam.radius = n * 1.35 + 3; cam.ty = 0;
      },
      cellOf(pt) { const n = game.size, c = Math.round(pt.x + (n - 1) / 2), r = Math.round(pt.z + (n - 1) / 2); return c < 0 || c >= n || r < 0 || r >= n ? -1 : r * n + c; },
      piece(color) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.44, 32, 20), mat(color === BLACK ? 0x111111 : 0xf2f2ee, { roughness: 0.25, metalness: 0.1 }));
        m.scale.y = 0.55; m.castShadow = true; return m;
      },
    },
    score4: {
      pegPos(p) { return new THREE.Vector3(((p % 4) - 1.5) * 1.6, 0, (((p / 4) | 0) - 1.5) * 1.6); },
      pos(i) { const p = i % 16, z = (i / 16) | 0, v = this.pegPos(p); return new THREE.Vector3(v.x, 0.2 + 0.5 + z * 1.02, v.z); },
      build() {
        addSlab(8, 0.4, 8, 0x4d3524, 0);
        for (let p = 0; p < 16; p++) {
          const v = this.pegPos(p);
          const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 4.4, 12), mat(0xcdb48a, { roughness: 0.4, metalness: 0.2 }));
          peg.position.set(v.x, 0.2 + 2.2, v.z); peg.castShadow = true; world.add(peg);
          const pick = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.62, 4.6, 10), new THREE.MeshBasicMaterial({ transparent: true, opacity: 0, depthWrite: false }));
          pick.position.copy(peg.position); pick.userData.peg = p; world.add(pick); pegPick.push(pick);
        }
        pickPlane = null; cam.radius = 12; cam.ty = 1.8;
      },
      piece(color) {
        const m = new THREE.Mesh(new THREE.SphereGeometry(0.5, 32, 24), mat(color === BLACK ? 0xe0452b : 0x2f8fe0, { roughness: 0.22, metalness: 0.15 }));
        m.castShadow = true; return m;
      },
    },
  };

  // ---------- 棋子同步(含動畫) ----------
  const cfg = () => L[kind];
  function cellsToCheck() { return game.board.length; }

  function sync(animate) {
    const last = game.history.length ? game.history[game.history.length - 1] : null;
    const lastCell = last ? (kind === 'score4' ? last.cell : last.move) : -1;
    const lastPos = lastCell >= 0 && lastCell < 64 + 200 && kind !== 'score4' ? cfg().pos(lastCell) : null;
    for (const [idx, pc] of pieces) if (!game.board[idx]) { world.remove(pc.mesh); pieces.delete(idx); }
    for (let i = 0; i < cellsToCheck(); i++) {
      const color = game.board[i]; if (!color) continue;
      const pc = pieces.get(i), target = cfg().pos(i);
      if (!pc) {
        const mesh = cfg().piece(color); mesh.position.copy(target); world.add(mesh);
        pieces.set(i, { mesh, color });
        if (animate) {
          const y1 = target.y, rx = mesh.rotation.x; mesh.position.y = y1 + 4; mesh.visible = false;
          tween(380, u => { mesh.visible = true; mesh.position.y = y1 + 4 * (1 - u); });
        }
      } else if (pc.color !== color) {
        pc.color = color;
        const m = pc.mesh, from = m.rotation.x, to = color === BLACK ? 0 : Math.PI, y0 = target.y;
        if (!animate) { m.rotation.x = to; continue; }
        const delay = lastPos ? lastPos.distanceTo(target) * 70 + 150 : 0;
        tween(520, (u, raw) => { m.rotation.x = from + (to - from) * u; m.position.y = y0 + Math.sin(raw * Math.PI) * 0.9; }, delay);
      }
    }
    updateHints();
  }

  function updateHints() {
    hints.clear();
    if (kind !== 'othello' || thinking || game.isOver() || game.player !== human) return;
    for (const m of game.legalMoves()) {
      if (m === PASS) continue;
      const d = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.03, 16), new THREE.MeshBasicMaterial({ color: 0xffe27a }));
      d.position.copy(cfg().pos(m)); d.position.y = 0.23; hints.add(d);
    }
  }

  function showWin() {
    winMeshes.forEach(m => { m.userData.glow = true; });
    let cells = null;
    if (kind === 'score4' && game.winLine) cells = game.winLine;
    else if (kind === 'gomoku' && game.win) {
      const n = game.size, mv = game.history[game.history.length - 1].move, r = (mv / n) | 0, c = mv % n, p = game.win;
      for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
        const line = [mv];
        for (const s of [1, -1]) for (let k = 1; ; k++) { const rr = r + dr * k * s, cc = c + dc * k * s; if (rr < 0 || rr >= n || cc < 0 || cc >= n || game.board[rr * n + cc] !== p) break; line.push(rr * n + cc); }
        if (line.length >= 5) { cells = line; break; }
      }
    }
    if (!cells) return;
    for (const i of cells) {
      const pc = pieces.get(i); if (!pc) continue;
      pc.mesh.material = pc.mesh.material.clone ? pc.mesh.material.clone() : pc.mesh.material;
      pc.mesh.material.emissive = new THREE.Color(0xffd54a); pc.mesh.material.emissiveIntensity = 0.7;
      winMeshes.push(pc.mesh);
    }
  }

  // ---------- 流程 ----------
  function fillLevels() {
    const sel = $('level'); sel.innerHTML = '';
    LEVELS[$('game').value].forEach(([label, d], i) => { const o = new Option(label, d); if (i === 1) o.selected = true; sel.add(o); });
  }

  function newGame() {
    token++; thinking = false; lastInfo = '';
    kind = $('game').value; human = +$('side').value; depth = +$('level').value;
    game = kind === 'othello' ? new Othello() : kind === 'gomoku' ? new Gomoku(15, 10) : new Score4();
    clearWorld(); cfg().build(); cam.theta = human === BLACK ? 0 : Math.PI; cam.phi = 0.95; placeCamera();
    sync(false); setStatus(''); nextTurn();
  }

  function setStatus(t) { $('status').textContent = t; $('info').textContent = lastInfo; }

  function endText() {
    const w = game.winner(), who = w === 0 ? '平手' : w === human ? '你贏了!' : 'AI 獲勝';
    if (kind === 'othello') { const c = game.counts(); return `遊戲結束 黑 ${c.black} : 白 ${c.white} — ${who}`; }
    return `遊戲結束 — ${who}`;
  }

  function nextTurn() {
    updateHints();
    if (game.isOver()) { setStatus(endText()); showWin(); return; }
    if (kind === 'othello' && game.legalMoves()[0] === PASS) {
      const mine = game.player === human;
      setStatus(mine ? '你沒有合法步,自動跳過' : 'AI 沒有合法步,跳過');
      game.play(PASS); setTimeout(nextTurn, 700); return;
    }
    if (game.player === human) { setStatus('輪到你了'); return; }
    thinking = true; updateHints(); setStatus('AI 思考中…');
    const my = token;
    setTimeout(() => {
      if (my !== token) return;
      const t = performance.now(), r = search(game, { depth, timeMs: 4000 });
      lastInfo = `AI 評分 ${r.score.toFixed(0)}・深度 ${r.depth}・${r.nodes} 節點・${(performance.now() - t).toFixed(0)} ms`;
      game.play(r.move); thinking = false; sync(true);
      setTimeout(() => { if (my === token) nextTurn(); }, 450);
    }, 450);
  }

  function humanPlay(move) {
    if (thinking || game.isOver() || game.player !== human) return;
    try { game.play(move); } catch (e) { setStatus('這裡不能下:' + e.message); return; }
    lastInfo = ''; sync(true); removeGhost();
    const my = token; setTimeout(() => { if (my === token) nextTurn(); }, 450);
  }

  // ---------- 滑鼠 / 觸控 ----------
  const ray = new THREE.Raycaster(), ptr = new THREE.Vector2();
  function pick(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    ptr.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ptr, camera);
    if (kind === 'score4') { const h = ray.intersectObjects(pegPick); return h.length ? h[0].object.userData.peg : -1; }
    const h = ray.intersectObject(pickPlane); return h.length ? cfg().cellOf(h[0].point) : -1;
  }
  function removeGhost() { if (ghost) { world.remove(ghost); ghost = null; } hover = -1; }
  function legalFor(m) {
    if (m < 0 || thinking || game.isOver() || game.player !== human) return false;
    if (kind === 'othello') return game.board[m] === 0 && game.flipsFor(m, human).length > 0;
    if (kind === 'gomoku') return game.board[m] === 0;
    return game.heights[m] < 4;
  }
  function updateGhost(m) {
    if (m === hover) return;
    removeGhost(); hover = m;
    if (!legalFor(m)) return;
    const idx = kind === 'score4' ? game.landing(m) : m;
    ghost = cfg().piece(human); ghost.position.copy(cfg().pos(idx));
    ghost.traverse(o => { if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(mm => { mm.transparent = true; mm.opacity = 0.45; }); });
    ghost.castShadow = false; world.add(ghost);
  }

  const pointers = new Map(); let downPos = null, moved = 0, pinch = 0;
  const cv = renderer.domElement;
  cv.style.touchAction = 'none';
  cv.addEventListener('pointerdown', e => { cv.setPointerCapture(e.pointerId); pointers.set(e.pointerId, e); downPos = { x: e.clientX, y: e.clientY }; moved = 0; });
  cv.addEventListener('pointermove', e => {
    const prev = pointers.get(e.pointerId);
    if (prev) {
      pointers.set(e.pointerId, e);
      if (pointers.size === 1) { const dx = e.clientX - prev.clientX, dy = e.clientY - prev.clientY; moved += Math.abs(dx) + Math.abs(dy); cam.theta -= dx * 0.008; cam.phi -= dy * 0.008; placeCamera(); }
      else if (pointers.size === 2) {
        const [a, b] = [...pointers.values()], d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
        if (pinch) { cam.radius *= pinch / d; placeCamera(); } pinch = d; moved += 10;
      }
    } else updateGhost(pick(e));
  });
  const up = e => {
    if (pointers.has(e.pointerId) && pointers.size === 1 && moved < 6) { const m = pick(e); if (m >= 0) humanPlay(m); }
    pointers.delete(e.pointerId); if (pointers.size < 2) pinch = 0;
  };
  cv.addEventListener('pointerup', up); cv.addEventListener('pointercancel', up);
  cv.addEventListener('pointerleave', () => removeGhost());
  cv.addEventListener('wheel', e => { e.preventDefault(); cam.radius *= 1 + Math.sign(e.deltaY) * 0.08; placeCamera(); }, { passive: false });

  // ---------- 控制列 ----------
  $('new').onclick = newGame;
  $('game').onchange = () => { fillLevels(); newGame(); };
  $('side').onchange = newGame;
  $('level').onchange = () => { depth = +$('level').value; };
  $('view').onclick = () => { cam.phi = cam.phi > 0.5 ? 0.15 : 0.95; placeCamera(); };
  $('undo').onclick = () => {
    if (thinking) return;
    let n = 0;
    while (game.history.length && n < 20) { game.undo(); n++; if (game.player === human && !(kind === 'othello' && game.legalMoves()[0] === PASS)) break; }
    token++; lastInfo = ''; sync(false); removeGhost(); nextTurn();
  };

  // ---------- 主迴圈 ----------
  function frame(now) {
    runTweens(now);
    const k = 0.5 + 0.5 * Math.sin(now / 220);
    for (const m of winMeshes) if (m.material.emissiveIntensity !== undefined) m.material.emissiveIntensity = 0.3 + 0.6 * k;
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  window.__app = { game: () => game, kind: () => kind, humanPlay, pick, camera };
  resize(); fillLevels(); $('game').value = 'score4'; fillLevels(); newGame(); requestAnimationFrame(frame);
})();
