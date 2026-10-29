const test = require('node:test');
const assert = require('node:assert');
const { Othello, BLACK, WHITE, PASS } = require('../src/othello');
const { mulberry32 } = require('../src/util');

const sorted = a => [...a].sort((x, y) => x - y);

test('初始盤面:四顆棋子,黑棋有 4 個合法步', () => {
  const g = new Othello();
  assert.deepStrictEqual(g.counts(), { black: 2, white: 2 });
  assert.deepStrictEqual(sorted(g.legalMoves()), [19, 26, 37, 44]); // d3 c4 f5 e6
  assert.strictEqual(g.player, BLACK);
  assert.strictEqual(g.isOver(), false);
  assert.strictEqual(g.winner(), null);
});

test('落子會翻轉夾住的棋子', () => {
  const g = new Othello();
  g.play(Othello.parseMove('d3'));
  assert.deepStrictEqual(g.counts(), { black: 4, white: 1 });
  assert.strictEqual(g.board[27], BLACK); // d4 被翻成黑
  assert.strictEqual(g.player, WHITE);
});

test('非法步與已佔位置會丟出錯誤', () => {
  const g = new Othello();
  assert.throws(() => g.play(0), /非法步/);
  assert.throws(() => g.play(27), /非法步/);
  assert.throws(() => g.play(99), /超出範圍/);
  assert.throws(() => g.play(PASS), /不能 PASS/);
});

test('座標轉換往返一致,並拒絕錯誤格式', () => {
  for (let i = 0; i < 64; i++) assert.strictEqual(Othello.parseMove(Othello.moveToString(i)), i);
  assert.strictEqual(Othello.parseMove(' D3 '), 19);
  assert.strictEqual(Othello.parseMove('pass'), PASS);
  assert.throws(() => Othello.parseMove('i9'));
  assert.throws(() => Othello.parseMove(''));
});

test('復原後盤面、玩家與雜湊完全還原', () => {
  const g = new Othello();
  const snap = { board: g.board.slice(), h: g.hash(), p: g.player };
  g.play(19); g.play(18); g.play(17);
  g.undo(); g.undo(); g.undo();
  assert.deepStrictEqual(g.board, snap.board);
  assert.strictEqual(g.hash(), snap.h);
  assert.strictEqual(g.player, snap.p);
  assert.throws(() => g.undo(), /沒有可復原/);
});

test('增量雜湊等於重新計算的雜湊(隨機對局)', () => {
  const rng = mulberry32(7);
  for (let t = 0; t < 10; t++) {
    const g = new Othello();
    while (!g.isOver()) {
      const m = g.legalMoves();
      g.play(m[Math.floor(rng() * m.length)]);
      const fresh = Othello.fromArray(g.board, g.player);
      assert.strictEqual(g.hash(), fresh.hash());
    }
  }
});

test('無子可下時只能 PASS,PASS 後換對手', () => {
  // 黑 b1、白 a1(角落):黑無法夾住白,白可在 c1 夾住黑
  const cells = new Array(64).fill(0);
  cells[0] = WHITE; cells[1] = BLACK;
  const g = Othello.fromArray(cells, BLACK);
  assert.deepStrictEqual(g.legalMoves(), [PASS]);
  assert.strictEqual(g.isOver(), false);
  g.play(PASS);
  assert.strictEqual(g.player, WHITE);
  assert.deepStrictEqual(g.legalMoves(), [2]);
  g.undo();
  assert.strictEqual(g.player, BLACK);
});

test('雙方皆無合法步時遊戲結束並判定勝負', () => {
  const cells = new Array(64).fill(0);
  cells[0] = BLACK; cells[63] = BLACK; cells[7] = WHITE;
  const g = Othello.fromArray(cells, BLACK);
  assert.strictEqual(g.isOver(), true);
  assert.deepStrictEqual(g.legalMoves(), []);
  assert.strictEqual(g.winner(), BLACK);
  assert.ok(g.terminalScore() > 0);
  const draw = Othello.fromArray(Object.assign(new Array(64).fill(0), { 0: BLACK, 7: WHITE }), BLACK);
  assert.strictEqual(draw.winner(), 0);
  assert.strictEqual(draw.terminalScore(), 0);
});

test('隨機對局:棋子總數守恆、最終必定結束', () => {
  const rng = mulberry32(42);
  for (let t = 0; t < 20; t++) {
    const g = new Othello();
    let placed = 0;
    while (!g.isOver()) {
      const m = g.legalMoves();
      const mv = m[Math.floor(rng() * m.length)];
      if (mv !== PASS) placed++;
      g.play(mv);
      const { black, white } = g.counts();
      assert.strictEqual(black + white, 4 + placed);
    }
    assert.ok(g.winner() !== null);
  }
});

test('完整對局後逐步復原回到初始局面', () => {
  const rng = mulberry32(3);
  const g = new Othello(), start = g.hash();
  while (!g.isOver()) { const m = g.legalMoves(); g.play(m[Math.floor(rng() * m.length)]); }
  while (g.history.length) g.undo();
  assert.strictEqual(g.hash(), start);
  assert.deepStrictEqual(g.counts(), { black: 2, white: 2 });
});

test('clone 是獨立副本', () => {
  const g = new Othello(), c = g.clone();
  c.play(19);
  assert.strictEqual(g.board[19], 0);
  assert.notStrictEqual(g.hash(), c.hash());
});

test('評估函式:對稱起始局面為 0,角落有利', () => {
  assert.strictEqual(new Othello().evaluate(), 0);
  const a = new Array(64).fill(0), b = new Array(64).fill(0);
  a[0] = BLACK; a[27] = WHITE; a[28] = BLACK;
  b[1] = BLACK; b[27] = WHITE; b[28] = BLACK;
  assert.ok(Othello.fromArray(a, BLACK).evaluate() > Othello.fromArray(b, BLACK).evaluate());
});

test('toString 顯示棋盤與合法步提示', () => {
  const s = new Othello().toString();
  assert.match(s, /● 2  ○ 2/);
  assert.strictEqual((s.match(/·/g) || []).length, 4);
});
