// 通用搜尋引擎:Negamax + Alpha-Beta 剪枝 + 置換表(Zobrist)+ 迭代加深 + 時間限制。
// 遊戲物件需實作:isOver() terminalScore() evaluate() searchMoves() play(m) undo() hash()
// 所有分數皆從「輪到走棋的一方」角度計算。
(function () {
  const EXACT = 0, LOWER = 1, UPPER = 2;
  const INF = 1e9;

  function search(game, opts = {}) {
    const maxDepth = opts.depth || 4;
    const deadline = opts.timeMs ? Date.now() + opts.timeMs : Infinity;
    const useTT = opts.useTT !== false;
    const tt = opts.tt || new Map();
    let nodes = 0, aborted = false, canAbort = false;

    function negamax(depth, alpha, beta, ply) {
      if ((++nodes & 1023) === 0 && canAbort && Date.now() > deadline) aborted = true;
      if (aborted) return 0;
      if (game.isOver()) {
        const t = game.terminalScore();
        return t > 0 ? t - ply : t < 0 ? t + ply : 0; // 越快獲勝越好、越晚輸越好
      }
      if (depth === 0) return game.evaluate();

      const alpha0 = alpha;
      let ttMove = null, key = 0;
      if (useTT) {
        key = game.hash();
        const e = tt.get(key);
        if (e) {
          ttMove = e.move;
          if (e.depth >= depth) {
            if (e.flag === EXACT) return e.score;
            if (e.flag === LOWER) alpha = Math.max(alpha, e.score);
            else beta = Math.min(beta, e.score);
            if (alpha >= beta) return e.score;
          }
        }
      }

      const moves = game.searchMoves();
      if (ttMove !== null) {
        const i = moves.indexOf(ttMove);
        if (i > 0) { moves.splice(i, 1); moves.unshift(ttMove); }
      }
      let best = -INF, bestMove = moves[0];
      for (const m of moves) {
        game.play(m);
        const s = -negamax(depth - 1, -beta, -alpha, ply + 1);
        game.undo();
        if (aborted) return 0;
        if (s > best) { best = s; bestMove = m; }
        if (best > alpha) alpha = best;
        if (alpha >= beta) break;
      }
      if (useTT) {
        const flag = best <= alpha0 ? UPPER : best >= beta ? LOWER : EXACT;
        tt.set(key, { depth, score: best, flag, move: bestMove });
      }
      return best;
    }

    const rootMoves = game.searchMoves();
    if (!rootMoves.length) return { move: null, score: game.isOver() ? game.terminalScore() : 0, depth: 0, nodes: 0 };
    if (rootMoves.length === 1) return { move: rootMoves[0], score: 0, depth: 0, nodes: 0 };

    let bestMove = rootMoves[0], bestScore = 0, reached = 0;
    for (let d = 1; d <= maxDepth; d++) {
      canAbort = d > 1; // 第一層一定完成,確保一定有答案
      let alpha = -INF, iterBest = null, iterScore = -INF;
      const ordered = rootMoves.slice();
      const bi = ordered.indexOf(bestMove);
      if (bi > 0) { ordered.splice(bi, 1); ordered.unshift(bestMove); }
      for (const m of ordered) {
        game.play(m);
        const s = -negamax(d - 1, -INF, -alpha, 1);
        game.undo();
        if (aborted) break;
        if (s > iterScore) { iterScore = s; iterBest = m; }
        if (s > alpha) alpha = s;
      }
      if (aborted) break;
      bestMove = iterBest; bestScore = iterScore; reached = d;
      if (Math.abs(bestScore) > 900000) break; // 已找到必勝 / 必敗,不必再加深
    }
    return { move: bestMove, score: bestScore, depth: reached, nodes };
  }

  // 無剪枝、無置換表的純 minimax,僅供驗證 alpha-beta 結果是否一致
  function plainMinimax(game, depth, ply = 0) {
    if (game.isOver()) {
      const t = game.terminalScore();
      return t > 0 ? t - ply : t < 0 ? t + ply : 0;
    }
    if (depth === 0) return game.evaluate();
    let best = -INF;
    for (const m of game.searchMoves()) {
      game.play(m);
      best = Math.max(best, -plainMinimax(game, depth - 1, ply + 1));
      game.undo();
    }
    return best;
  }

  const api = { search, plainMinimax };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (self.BoardAI = self.BoardAI || {}).search = api;
})();
