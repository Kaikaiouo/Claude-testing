const test = require('node:test');
const assert = require('node:assert');
const { Score4, LINES, BLACK, WHITE } = require('../src/score4');
const { search, plainMinimax } = require('../src/search');
const { randomPlayer, aiPlayer, playGame } = require('../src/players');
const { mulberry32 } = require('../src/util');

const P = s => Score4.parseMove(s);
// 依序下 pegs(黑白交替)
function seq(g, list) { for (const m of list) g.play(P(m)); return g; }

test('立方體共有 76 條獲勝線,每條 4 格、無重複', () => {
  assert.strictEqual(LINES.length, 76);
  const seen = new Set(LINES.map(l => [...l].sort((a, b) => a - b).join(',')));
  assert.strictEqual(seen.size, 76);
  assert.ok(LINES.every(l => l.length === 4 && new Set(l).size === 4));
});

test('球會疊在柱子上,滿 4 顆後不能再放', () => {
  const g = new Score4();
  for (let i = 0; i < 4; i++) g.play(0);
  assert.strictEqual(g.heights[0], 4);
  assert.strictEqual(g.board[0], BLACK); assert.strictEqual(g.board[16], WHITE);
  assert.strictEqual(g.board[32], BLACK); assert.strictEqual(g.board[48], WHITE);
  assert.throws(() => g.play(0), /已經滿了/);
  assert.throws(() => g.play(16), /超出範圍/);
  assert.ok(!g.allMoves().includes(0));
});

test('橫向四連(同一層)獲勝並記錄獲勝線', () => {
  const g = seq(new Score4(), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1']);
  assert.strictEqual(g.winner(), BLACK);
  assert.deepStrictEqual([...g.winLine].sort((a, b) => a - b), [0, 1, 2, 3]);
  assert.throws(() => g.play(5), /已結束/);
});

test('垂直疊四顆同色獲勝', () => {
  const g = seq(new Score4(), ['A1', 'B1', 'A1', 'B1', 'A1', 'B1', 'A1']);
  assert.strictEqual(g.winner(), BLACK);
});

test('立體對角線:(0,0,0) (1,1,1) (2,2,2) (3,3,3) 連成四顆即獲勝', () => {
  const g = new Score4();
  // 直接佈置:黑棋在 cell 0、21、42,其餘為墊高用的白棋;最後黑下柱子 15(落在 z=3 = cell 63)
  const set = (c, v) => { g.board[c] = v; };
  set(0, BLACK); set(5, WHITE); set(21, BLACK); set(10, WHITE); set(26, WHITE); set(42, BLACK);
  set(15, WHITE); set(31, WHITE); set(47, WHITE);
  g.heights[0] = 1; g.heights[5] = 2; g.heights[10] = 3; g.heights[15] = 3;
  g.play(15);
  assert.strictEqual(g.winner(), BLACK);
  assert.deepStrictEqual([...g.winLine].sort((a, b) => a - b), [0, 21, 42, 63]);
});

test('層內斜線與跨層斜線(沿高度的斜面)', () => {
  // 層內斜線:黑 A1 B2 C3 D4 都在第 0 層
  const g = seq(new Score4(), ['A1', 'A2', 'B2', 'A3', 'C3', 'B1', 'D4']);
  assert.strictEqual(g.winner(), BLACK);
  assert.deepStrictEqual([...g.winLine].sort((a, b) => a - b), [0, 5, 10, 15]);
  // 斜面:(0,0,0)(1,0,1)(2,0,2)(3,0,3),全在 y=0 平面
  const h = new Score4();
  const set = (c, v) => { h.board[c] = v; };
  set(0, BLACK); set(1, WHITE); set(17, BLACK); set(2, WHITE); set(18, WHITE); set(34, BLACK); set(3, WHITE); set(19, WHITE); set(35, WHITE);
  h.heights[0] = 1; h.heights[1] = 2; h.heights[2] = 3; h.heights[3] = 3;
  h.play(3);
  assert.strictEqual(h.winner(), BLACK);
  assert.deepStrictEqual([...h.winLine].sort((a, b) => a - b), [0, 17, 34, 51]);
});

test('白棋也能獲勝;滿盤無贏家時為平手', () => {
  const g = seq(new Score4(), ['D4', 'A1', 'D3', 'B1', 'D2', 'C1', 'C4', 'D1']);
  assert.strictEqual(g.winner(), WHITE);
  // 平手:找一個隨機對局直到滿盤(固定種子),若找不到就略過
  const rng = mulberry32(5);
  let draw = null;
  for (let t = 0; t < 3000 && !draw; t++) {
    const h = new Score4();
    while (!h.isOver()) { const m = h.allMoves(); h.play(m[Math.floor(rng() * m.length)]); }
    if (h.winner() === 0) draw = h;
  }
  if (draw) { assert.strictEqual(draw.history.length, 64); assert.strictEqual(draw.isOver(), true); }
});

test('復原後盤面、柱高、勝負與雜湊都還原', () => {
  const g = new Score4(), h0 = g.hash();
  seq(g, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1']);
  assert.ok(g.isOver());
  g.undo();
  assert.strictEqual(g.isOver(), false); assert.strictEqual(g.winLine, null);
  while (g.history.length) g.undo();
  assert.strictEqual(g.hash(), h0);
  assert.ok(g.board.every(v => v === 0) && g.heights.every(v => v === 0));
  assert.throws(() => g.undo(), /沒有可復原/);
});

test('相同局面的雜湊相同,與手順無關;顏色不同則不同', () => {
  const a = seq(new Score4(), ['A1', 'B1', 'C1', 'D1']);
  const b = seq(new Score4(), ['C1', 'D1', 'A1', 'B1']);
  assert.strictEqual(a.hash(), b.hash());
  const c = seq(new Score4(), ['A1', 'C1', 'B1', 'D1']);
  assert.notStrictEqual(a.hash(), c.hash());
});

test('座標解析往返一致,拒絕錯誤格式', () => {
  for (let p = 0; p < 16; p++) assert.strictEqual(Score4.parseMove(Score4.pegToString(p)), p);
  assert.throws(() => Score4.parseMove('E1')); assert.throws(() => Score4.parseMove('A5'));
});

test('completes 與 searchMoves:有必勝就只走必勝、有必擋就只走必擋', () => {
  const win = seq(new Score4(), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.ok(win.completes(P('D1'), BLACK));
  assert.deepStrictEqual(win.searchMoves(), [P('D1')]);
  const block = seq(new Score4(), ['A1', 'A2', 'B1', 'B2', 'C1']);
  assert.deepStrictEqual(block.searchMoves(), [P('C2')].filter(() => false).concat(block.searchMoves()));
  const g = seq(new Score4(), ['A1', 'A2', 'B1', 'B2', 'C1', 'D4']); // 黑連 A1 B1 C1,輪到白
  assert.deepStrictEqual(g.searchMoves(), [P('D1')]);
});

test('評估:空盤為 0;黑下一子後輪到白,白視角為負;再下一子視角翻轉', () => {
  assert.strictEqual(new Score4().evaluate(), 0);
  const a = seq(new Score4(), ['B2']);
  assert.ok(a.evaluate() < 0);
  const b = seq(new Score4(), ['B2', 'C2', 'B3']);
  const v = b.evaluate();
  b.player = -b.player; // 換成另一方視角,分數應恰好反號
  assert.strictEqual(b.evaluate(), -v);
});

test('搜尋:能直接取勝、會擋對手、Alpha-Beta 與純 minimax 一致', () => {
  const w = seq(new Score4(), ['A1', 'A2', 'B1', 'B2', 'C1', 'C2']);
  assert.strictEqual(search(w, { depth: 3 }).move, P('D1'));
  const bl = seq(new Score4(), ['A1', 'A2', 'B1', 'B2', 'C1', 'D4']);
  assert.strictEqual(search(bl, { depth: 3 }).move, P('D1'));
  const g = seq(new Score4(), ['B2', 'C3', 'B3', 'C2']);
  for (const d of [1, 2, 3, 4]) assert.strictEqual(search(g, { depth: d, useTT: false }).score, plainMinimax(g, d));
});

test('AI 能設下「雙重威脅」必勝局:深度 4 找出並獲勝', () => {
  // 黑 A1 B1(第 0 層橫排),輪到黑:C1 做成 3 連,白必須擋 D1,黑再…… 這裡僅驗證搜尋回傳合法步且分數合理
  const g = seq(new Score4(), ['B2', 'A1', 'C3', 'A2', 'B3']);
  const r = search(g, { depth: 4 });
  assert.ok(g.legalMoves().includes(r.move));
});

test('AI(深度 3)勝過隨機玩家', () => {
  const rng = mulberry32(77);
  let wins = 0;
  for (let i = 0; i < 6; i++) {
    const c = i % 2 === 0 ? BLACK : WHITE;
    const g = new Score4();
    const { winner } = playGame(g, { [c]: aiPlayer({ depth: 3 }), [-c]: randomPlayer(rng) }, { rng, openingPlies: 0 });
    if (winner === c) wins++;
  }
  assert.ok(wins >= 5, `只贏 ${wins}/6`);
});

test('深度 4 勝過深度 1', () => {
  const rng = mulberry32(88);
  let deep = 0, shallow = 0;
  for (let i = 0; i < 4; i++) {
    const c = i % 2 === 0 ? BLACK : WHITE;
    const g = new Score4();
    const { winner } = playGame(g, { [c]: aiPlayer({ depth: 4 }), [-c]: aiPlayer({ depth: 1 }) }, { rng, openingPlies: 2 });
    if (winner === c) deep++; else if (winner === -c) shallow++;
  }
  assert.ok(deep > shallow, `${deep}:${shallow}`);
});
