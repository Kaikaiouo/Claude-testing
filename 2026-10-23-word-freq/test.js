const assert = require('assert');
const { count } = require('./wordfreq');
const f = count('The the THE cat 貓貓', 1);
assert.strictEqual(f.get('the'), 3);
assert.strictEqual(f.get('貓'), 2);
assert.strictEqual(count('a bb', 2).has('a'), false);
console.log('所有測試通過');
