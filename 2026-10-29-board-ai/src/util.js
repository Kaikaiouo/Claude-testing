// 共用工具:可重現的亂數產生器與 Zobrist 雜湊表。
// 同時支援 Node(require)與瀏覽器(self.BoardAI.util)。
(function () {
  function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // 為每個 (格子, 顏色) 產生兩組 32 位元亂數,合成約 53 位元的鍵,碰撞機率極低。
  function makeZobrist(cells, seed) {
    const rnd = mulberry32(seed);
    const r32 = () => Math.floor(rnd() * 4294967296) | 0;
    const a = new Int32Array(cells * 2);
    const b = new Int32Array(cells * 2);
    for (let i = 0; i < cells * 2; i++) { a[i] = r32(); b[i] = r32(); }
    return { a, b, sideA: r32(), sideB: r32() };
  }

  function hashKey(h1, h2) {
    return (h1 & 0x1fffff) * 4294967296 + (h2 >>> 0);
  }

  const api = { mulberry32, makeZobrist, hashKey };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else (self.BoardAI = self.BoardAI || {}).util = api;
})();
