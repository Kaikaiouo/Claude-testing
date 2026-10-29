#!/usr/bin/env node
// 命令列介面:與 AI 對戰,或讓兩個 AI 互相對戰(arena)。
const readline = require('node:readline');
const { Othello, BLACK, WHITE, PASS } = require('./src/othello');
const { Gomoku } = require('./src/gomoku');
const { search } = require('./src/search');
const { aiPlayer, randomPlayer, playGame } = require('./src/players');
const { mulberry32 } = require('./src/util');

function parseArgs(argv) {
  const pos = [], opt = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i].startsWith('--')) opt[argv[i].slice(2)] = argv[++i];
    else pos.push(argv[i]);
  }
  return { pos, opt };
}

function newGame(name, opt) {
  if (name === 'othello') return new Othello();
  if (name === 'gomoku') return new Gomoku(+opt.size || 15, +opt.branch || 12);
  throw new Error('遊戲必須是 othello 或 gomoku');
}

const fmtMove = (g, m) => (g instanceof Othello ? Othello.moveToString(m) : g.moveToString(m));
const parseMove = (g, s) => (g instanceof Othello ? Othello.parseMove(s) : g.parseMove(s));

async function play(name, opt) {
  const g = newGame(name, opt);
  const human = (opt.color || 'black') === 'white' ? WHITE : BLACK;
  const depth = +opt.depth || (name === 'othello' ? 5 : 3), timeMs = +opt.time || 3000;
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const ask = q => new Promise(res => rl.question(q, res));
  console.log(`你執${human === BLACK ? '黑' : '白'}(搜尋深度 ${depth},每步上限 ${timeMs}ms)。輸入座標落子,例如 ${name === 'othello' ? 'd3' : 'H8'};輸入 q 離開。\n`);
  while (!g.isOver()) {
    console.log(g.toString() + '\n');
    let move;
    if (g.player === human) {
      if (g.legalMoves()[0] === PASS) { console.log('你沒有合法步,自動 PASS。'); move = PASS; }
      else {
        for (;;) {
          const line = (await ask('你的步:')).trim();
          if (line === 'q') { rl.close(); return; }
          try { move = parseMove(g, line); g.play(move); g.undo(); break; } catch (e) { console.log('  ✗ ' + e.message); }
        }
      }
    } else {
      const r = search(g, { depth, timeMs });
      move = r.move;
      console.log(`AI 走 ${fmtMove(g, move)}(評分 ${r.score.toFixed(1)},深度 ${r.depth},${r.nodes} 節點)\n`);
    }
    g.play(move);
  }
  console.log(g.toString() + '\n');
  const w = g.winner();
  console.log(w === 0 ? '平手!' : w === human ? '你贏了!' : 'AI 獲勝!');
  rl.close();
}

function arena(name, opt) {
  const games = +opt.games || 10, d1 = +opt.depth1 || 4, d2 = +opt.depth2 || 2;
  const seed = +opt.seed || 1, rng = mulberry32(seed);
  const p1 = aiPlayer({ depth: d1 }), p2 = opt.random ? randomPlayer(rng) : aiPlayer({ depth: d2 });
  const tally = { A: 0, B: 0, draw: 0 };
  const t0 = Date.now();
  for (let i = 0; i < games; i++) {
    const aColor = i % 2 === 0 ? BLACK : WHITE;
    const g = newGame(name, opt);
    const { winner, plies } = playGame(g, { [aColor]: p1, [-aColor]: p2 }, { rng, openingPlies: +opt.opening || (name === 'othello' ? 4 : 2) });
    const r = winner === 0 ? 'draw' : winner === aColor ? 'A' : 'B';
    tally[r]++;
    console.log(`第 ${i + 1} 局:A(深度 ${d1})執${aColor === BLACK ? '黑' : '白'} → ${r === 'draw' ? '平手' : r + ' 勝'}(${plies} 手)`);
  }
  console.log(`\n結果:A(深度 ${d1}) ${tally.A} 勝 / B(${opt.random ? '隨機' : '深度 ' + d2}) ${tally.B} 勝 / ${tally.draw} 平,耗時 ${((Date.now() - t0) / 1000).toFixed(1)} 秒`);
}

function usage() {
  console.log(`用法:
  node cli.js play <othello|gomoku> [--color black|white] [--depth N] [--time ms] [--size 15]
  node cli.js arena <othello|gomoku> [--games 10] [--depth1 4] [--depth2 2] [--random 1] [--seed 1] [--size 9]`);
}

(async () => {
  const { pos, opt } = parseArgs(process.argv.slice(2));
  try {
    if (pos[0] === 'play' && pos[1]) await play(pos[1], opt);
    else if (pos[0] === 'arena' && pos[1]) arena(pos[1], opt);
    else usage();
  } catch (e) { console.error('錯誤:' + e.message); process.exit(1); }
})();
