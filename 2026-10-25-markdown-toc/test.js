const assert = require('assert');
const { buildToc } = require('./toc');
const out = buildToc('# A\n## B\n## B\n```\n# x\n```\n#### D', 3);
assert.strictEqual(out, '- [A](#a)\n  - [B](#b)\n  - [B](#b-1)');
console.log('測試通過');
