const test = require('node:test');
const assert = require('node:assert');
const { Othello } = require('../src/othello');
const { Gomoku } = require('../src/gomoku');
const { search, plainMinimax } = require('../src/search');
const { randomPlayer, aiPlayer, playGame } = require('../src/players');
const { mulberry32 } = require('../src/util');

function randomOthello(rng, plies) {
  const g = new Othello();
  for (let i = 0; i < plies && !g.isOver(); i++) { const m = g.legalMoves(); g.play(m[Math.floor(rng() * m.length)]); }
  return g;
}

test('Alpha-Beta(無置換表)與純 minimax 分數一致:黑白棋', () => {
  const rng = mulberry32(5);
  for (let t = 0; t < 6; t++) {
    const g = randomOthello(rng, 6 + t * 3);
    if (g.isOver()) continue;
    for (const d of [1, 2, 3]) {
      const r = search(g, { depth: d, useTT: false });
      assert.strictEqual(r.score, plainMinimax(g, d), `局面 ${t} 深度 ${d}`);
    }
  }
});

test('Alpha-Beta + 置換表在開局局面與純 minimax 一致', () => {
  const rng = mulberry32(9);
  for (let t = 0; t < 4; t++) {
    const g = randomOthello(rng, 4 + t);
    const r = search(g, { depth: 3 });
    assert.strictEqual(r.score, plainMinimax(g, 3));
  }
});

test('Alpha-Beta 與純 minimax 一致:五子棋(小棋盤)', () => {
  const g = new Gomoku(9, 6);
  for (const m of [40, 41, 31, 49]) g.play(m);
  for (const d of [1, 2, 3]) assert.strictEqual(search(g, { depth: d, useTT: false }).score, plainMinimax(g, d));
});

test('搜尋結束後局面完全不變(play/undo 平衡)', () => {
  const g = randomOthello(mulberry32(1), 12), board = g.board.slice(), h = g.hash(), p = g.player, n = g.history.length;
  search(g, { depth: 4 });
  assert.deepStrictEqual(g.board, board);
  assert.strictEqual(g.hash(), h);
  assert.strictEqual(g.player, p);
  assert.strictEqual(g.history.length, n);
});

test('剪枝確實減少節點數', () => {
  const g = randomOthello(mulberry32(2), 10);
  const withTT = search(g, { depth: 5 }), without = search(g, { depth: 5, useTT: false });
  assert.strictEqual(withTT.score, without.score);
  assert.ok(withTT.nodes <= without.nodes);
});

test('只有一個合法步(PASS)時直接回傳', () => {
  const cells = new Array(64).fill(0);
  cells[0] = -1; cells[1] = 1;
  const g = Othello.fromArray(cells, 1);
  assert.strictEqual(search(g, { depth: 4 }).move, 64);
});

test('遊戲已結束時回傳 move = null', () => {
  const cells = new Array(64).fill(0);
  cells[0] = 1; cells[63] = 1; cells[7] = -1;
  assert.strictEqual(search(Othello.fromArray(cells, 1), { depth: 3 }).move, null);
});

test('時間限制:迭代加深在時限內返回合法步', () => {
  const g = randomOthello(mulberry32(8), 8);
  const t0 = Date.now();
  const r = search(g, { depth: 30, timeMs: 150 });
  assert.ok(Date.now() - t0 < 1500);
  assert.ok(g.legalMoves().includes(r.move));
  assert.ok(r.depth >= 1);
});

test('五子棋 AI:有四連時直接取勝', () => {
  const g = new Gomoku(15);
  for (const m of ['A1', 'A5', 'B1', 'B5', 'C1', 'C5', 'D1', 'D9']) g.play(g.parseMove(m));
  assert.strictEqual(search(g, { depth: 3 }).move, g.parseMove('E1'));
});

test('五子棋 AI:擋住對手的四連', () => {
  const g = new Gomoku(15);
  for (const m of ['H8', 'A1', 'H9', 'A5', 'H10', 'A9', 'H11']) g.play(g.parseMove(m));
  const r = search(g, { depth: 3 });
  assert.ok([g.parseMove('H7'), g.parseMove('H12')].includes(r.move));
});

test('五子棋 AI:看見自己的活三可以做出活四(兩端皆空)並獲勝', () => {
  const g = new Gomoku(15);
  // 黑 H8 H9 H10 形成活三,白棋散落;輪到黑,深度 4 應該走 H7 或 H11 並保證勝利
  for (const m of ['H8', 'A1', 'H9', 'O1', 'H10', 'A15']) g.play(g.parseMove(m));
  const r = search(g, { depth: 4 });
  assert.ok([g.parseMove('H7'), g.parseMove('H11')].includes(r.move), g.moveToString(r.move));
  assert.ok(r.score > 900000);
});

test('黑白棋 AI(深度 4)勝過隨機玩家', () => {
  const rng = mulberry32(100);
  let wins = 0, games = 6;
  for (let i = 0; i < games; i++) {
    const aiColor = i % 2 === 0 ? 1 : -1;
    const g = new Othello();
    const players = { [aiColor]: aiPlayer({ depth: 4 }), [-aiColor]: randomPlayer(rng) };
    const { winner } = playGame(g, players, { rng, openingPlies: 2 });
    if (winner === aiColor) wins++;
  }
  assert.ok(wins >= 5, `只贏了 ${wins}/${games}`);
});

test('五子棋 AI(深度 2)在 9x9 棋盤勝過隨機玩家', () => {
  const rng = mulberry32(200);
  let wins = 0, games = 4;
  for (let i = 0; i < games; i++) {
    const aiColor = i % 2 === 0 ? 1 : -1;
    const g = new Gomoku(9, 8);
    const players = { [aiColor]: aiPlayer({ depth: 2 }), [-aiColor]: randomPlayer(rng) };
    const { winner } = playGame(g, players, { rng, openingPlies: 2 });
    if (winner === aiColor) wins++;
  }
  assert.ok(wins >= 3, `只贏了 ${wins}/${games}`);
});

test('更深的搜尋不輸給較淺的搜尋(黑白棋 深度 4 vs 深度 1)', () => {
  const rng = mulberry32(300);
  let deepWins = 0, shallowWins = 0;
  for (let i = 0; i < 4; i++) {
    const deepColor = i % 2 === 0 ? 1 : -1;
    const g = new Othello();
    const players = { [deepColor]: aiPlayer({ depth: 4 }), [-deepColor]: aiPlayer({ depth: 1 }) };
    const { winner } = playGame(g, players, { rng, openingPlies: 4 });
    if (winner === deepColor) deepWins++; else if (winner === -deepColor) shallowWins++;
  }
  assert.ok(deepWins > shallowWins, `深 ${deepWins} : 淺 ${shallowWins}`);
});
