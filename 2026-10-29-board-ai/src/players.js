// 玩家:隨機玩家與搜尋型 AI,以及用來對戰的 playGame。
(function () {
  const S = typeof require !== 'undefined' && typeof module !== 'undefined' ? require('./search') : self.BoardAI.search;

  function randomPlayer(rng) {
    return game => { const m = game.allMoves(); return m[Math.floor(rng() * m.length)]; };
  }

  function aiPlayer(opts) {
    return game => S.search(game, opts).move;
  }

  // 對戰:players = { [1]: 黑方函式, [-1]: 白方函式 };openingPlies 為開局隨機手數(增加多樣性)
  function playGame(game, players, opts = {}) {
    const { openingPlies = 0, rng = Math.random, maxPlies = 1000 } = opts;
    let plies = 0;
    while (!game.isOver() && plies < maxPlies) {
      let move;
      if (plies < openingPlies) {
        const cells = game.candidateCells ? game.candidateCells() : game.allMoves();
        move = cells[Math.floor(rng() * cells.length)];
      } else move = players[game.player](game);
      game.play(move);
      plies++;
    }
    return { winner: game.winner(), plies };
  }

  const api = { randomPlayer, aiPlayer, playGame };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (self.BoardAI = self.BoardAI || {}).players = api;
})();
