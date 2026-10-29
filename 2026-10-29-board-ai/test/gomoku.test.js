const test = require('node:test');
const assert = require('node:assert');
const { Gomoku, BLACK, WHITE } = require('../src/gomoku');
const { mulberry32 } = require('../src/util');

// 依序下子:黑白交替,以座標字串表示;fillers 為對手用的不連線棋子
function setup(g, black, white) {
  const n = Math.max(black.length, white.length);
  for (let i = 0; i < n; i++) {
    if (i < black.length) g.play(g.parseMove(black[i]));
    if (i < white.length && !g.isOver()) g.play(g.parseMove(white[i]));
  }
}

test('空棋盤:未結束、勝者 null、候選步為天元', () => {
  const g = new Gomoku(15);
  assert.strictEqual(g.isOver(), false);
  assert.strictEqual(g.winner(), null);
  assert.deepStrictEqual(g.searchMoves(), [7 * 15 + 7]);
  assert.strictEqual(g.allMoves().length, 225);
});

test('橫向五連獲勝', () => {
  const g = new Gomoku(15);
  setup(g, ['A1', 'B1', 'C1', 'D1', 'E1'], ['A5', 'B5', 'C5', 'D5']);
  assert.strictEqual(g.winner(), BLACK);
  assert.ok(g.isOver());
});

test('直向、斜向、反斜向五連都算獲勝', () => {
  let g = new Gomoku(15);
  setup(g, ['A1', 'A2', 'A3', 'A4', 'A5'], ['C1', 'C2', 'C3', 'C4']);
  assert.strictEqual(g.winner(), BLACK);
  g = new Gomoku(15);
  setup(g, ['A1', 'B2', 'C3', 'D4', 'E5'], ['A3', 'A5', 'A7', 'A9']);
  assert.strictEqual(g.winner(), BLACK);
  g = new Gomoku(15);
  setup(g, ['E1', 'D2', 'C3', 'B4', 'A5'], ['H1', 'H3', 'H5', 'H7']);
  assert.strictEqual(g.winner(), BLACK);
});

test('白棋也能獲勝', () => {
  const g = new Gomoku(15);
  setup(g, ['A1', 'A3', 'A5', 'C1', 'C3'], ['B1', 'B2', 'B3', 'B4', 'B5']);
  assert.strictEqual(g.winner(), WHITE);
});

test('四連不算勝利,六連(長連)也算勝利', () => {
  let g = new Gomoku(15);
  setup(g, ['A1', 'B1', 'C1', 'D1'], ['A5', 'B5', 'C5', 'D5']);
  assert.strictEqual(g.isOver(), false);
  g = new Gomoku(15);
  // 黑棋先下 A1 B1 C1 E1 F1,再補 D1 形成六連
  setup(g, ['A1', 'B1', 'C1', 'E1', 'F1', 'D1'], ['A5', 'B5', 'C5', 'D5', 'E9']);
  assert.strictEqual(g.winner(), BLACK);
});

test('被對手截斷的連線不算五連', () => {
  const g = new Gomoku(15);
  setup(g, ['A1', 'B1', 'C1', 'E1', 'F1'], ['D1', 'A5', 'B5', 'C5']);
  assert.strictEqual(g.isOver(), false);
});

test('結束後不能再落子;不能下在已有棋子處或界外', () => {
  const g = new Gomoku(15);
  setup(g, ['A1', 'B1', 'C1', 'D1', 'E1'], ['A5', 'B5', 'C5', 'D5']);
  assert.throws(() => g.play(100), /已結束/);
  const h = new Gomoku(9);
  h.play(0);
  assert.throws(() => h.play(0), /已有棋子/);
  assert.throws(() => h.play(81), /超出範圍/);
  assert.throws(() => h.play(-1), /超出範圍/);
});

test('復原會清除勝利狀態並還原雜湊', () => {
  const g = new Gomoku(15), start = g.hash();
  setup(g, ['A1', 'B1', 'C1', 'D1', 'E1'], ['A5', 'B5', 'C5', 'D5']);
  assert.ok(g.isOver());
  g.undo();
  assert.strictEqual(g.isOver(), false);
  while (g.history.length) g.undo();
  assert.strictEqual(g.hash(), start);
  assert.ok(g.board.every(v => v === 0));
  assert.strictEqual(g.player, BLACK);
});

test('座標解析:不含字母 I,拒絕界外與錯誤格式', () => {
  const g = new Gomoku(15);
  assert.strictEqual(g.parseMove('H8'), 7 * 15 + 7);
  assert.strictEqual(g.parseMove('j1'), 8);
  for (let i = 0; i < 225; i++) assert.strictEqual(g.parseMove(g.moveToString(i)), i);
  assert.throws(() => g.parseMove('I5'));
  assert.throws(() => g.parseMove('Z1'));
  assert.throws(() => g.parseMove('A16'));
  assert.throws(() => new Gomoku(9).parseMove('K1'));
});

test('棋盤大小限制', () => {
  assert.throws(() => new Gomoku(4));
  assert.throws(() => new Gomoku(20));
  assert.doesNotThrow(() => new Gomoku(5));
});

test('候選步只包含鄰近空格;必勝步優先、必擋步其次', () => {
  const g = new Gomoku(15);
  g.play(g.parseMove('H8'));
  const cells = g.candidateCells();
  assert.ok(cells.length === 24 && !cells.includes(g.parseMove('H8')));
  assert.ok(!cells.includes(g.parseMove('L8')));

  // 黑 A1-D1 四連,輪到黑:必勝步是 E1
  const w = new Gomoku(15);
  setup(w, ['A1', 'B1', 'C1', 'D1'], ['A5', 'B5', 'C5', 'D5']);
  assert.deepStrictEqual(w.searchMoves(), [w.parseMove('E1')]);

  // 黑 A1-D1 四連,輪到白:必擋 E1(A1 在邊界)
  const b = new Gomoku(15);
  setup(b, ['A1', 'B1', 'C1', 'D1'], ['A5', 'B5', 'C5']);
  assert.deepStrictEqual(b.searchMoves(), [b.parseMove('E1')]);
});

test('評估函式:對稱為 0,連線越長分數越高,視角隨輪次翻轉', () => {
  const g = new Gomoku(15);
  assert.strictEqual(g.evaluate(), 0);
  setup(g, ['H8', 'H9', 'H10'], ['A1', 'A3', 'C1']);
  // 現在輪到黑;黑有三連應為正
  assert.ok(g.evaluate() > 0);
  g.play(g.parseMove('O15'));
  assert.ok(g.evaluate() < 0); // 換白視角,黑領先 => 對白為負
});

test('增量雜湊:相同局面不同手順得到相同雜湊', () => {
  const a = new Gomoku(15), b = new Gomoku(15);
  for (const m of ['H8', 'H9', 'J8', 'J9']) a.play(a.parseMove(m));
  for (const m of ['J8', 'J9', 'H8', 'H9']) b.play(b.parseMove(m));
  assert.strictEqual(a.hash(), b.hash());
  const c = new Gomoku(15);
  for (const m of ['H8', 'J8', 'J9', 'H9']) c.play(c.parseMove(m));
  assert.notStrictEqual(a.hash(), c.hash()); // 顏色不同
});

test('隨機對局的雜湊在完整復原後回到起點', () => {
  const rng = mulberry32(11), g = new Gomoku(9), start = g.hash();
  while (!g.isOver()) { const m = g.allMoves(); g.play(m[Math.floor(rng() * m.length)]); }
  while (g.history.length) g.undo();
  assert.strictEqual(g.hash(), start);
});

test('clone 是獨立副本', () => {
  const g = new Gomoku(9);
  g.play(40);
  const c = g.clone();
  c.play(41);
  assert.strictEqual(g.board[41], 0);
  assert.strictEqual(g.history.length, 1);
  c.undo(); c.undo();
  assert.strictEqual(g.history.length, 1);
});
