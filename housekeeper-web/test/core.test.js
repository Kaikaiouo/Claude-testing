const test = require('node:test');
const assert = require('node:assert');
const HK = require('../core');

const T = '2026-10-29';
const form = (o = {}) => Object.assign({ name: '牛奶', category: '乳製品', location: '冷藏', quantity: 1, expiry: '2026-11-05', purchase: T }, o);

test('daysLeft:今天為 0、已過期為負、跨月跨年正確', () => {
  assert.strictEqual(HK.daysLeft('2026-10-29', T), 0);
  assert.strictEqual(HK.daysLeft('2026-10-30', T), 1);
  assert.strictEqual(HK.daysLeft('2026-10-26', T), -3);
  assert.strictEqual(HK.daysLeft('2027-01-01', T), 64);
  assert.strictEqual(HK.daysLeft('2024-03-01', '2024-02-28'), 2); // 閏年
  assert.strictEqual(HK.daysLeft('bad', T), null);
});

test('status 分級邊界:-1 過期、0 與 3 緊急、4 與 7 即將、8 安全', () => {
  assert.deepStrictEqual([-5, -1, 0, 3, 4, 7, 8, 100].map(HK.status), ['expired', 'expired', 'urgent', 'urgent', 'soon', 'soon', 'ok', 'ok']);
  assert.strictEqual(HK.status(null), 'ok');
});

test('日期運算:addDays 與 addMonths(月底、閏年、跨年)', () => {
  assert.strictEqual(HK.addDays('2026-12-31', 1), '2027-01-01');
  assert.strictEqual(HK.addDays('2026-03-01', -1), '2026-02-28');
  assert.strictEqual(HK.addMonths('2026-01-31', 1), '2026-02-28');
  assert.strictEqual(HK.addMonths('2024-01-31', 1), '2024-02-29');
  assert.strictEqual(HK.addMonths('2026-11-15', 3), '2027-02-15');
  assert.strictEqual(HK.addDays('2026-02-30', 1), null);
});

test('parseDay 拒絕不存在的日期與錯誤格式', () => {
  assert.strictEqual(HK.parseDay('2026-02-29'), null);
  assert.strictEqual(HK.parseDay('2026-2-9'), null);
  assert.strictEqual(HK.parseDay(''), null);
  assert.ok(HK.parseDay('2028-02-29') !== null);
});

test('makeItem:正常資料會正規化並補預設值', () => {
  const { item, errors } = HK.makeItem(form({ name: '  鮮奶  ', tempC: '4', category: '不存在', location: '火星' }), T);
  assert.deepStrictEqual(errors, []);
  assert.strictEqual(item.name, '鮮奶');
  assert.strictEqual(item.category, '其他');
  assert.strictEqual(item.location, '冷藏');
  assert.strictEqual(item.tempC, 4);
  assert.strictEqual(item.done, false);
  assert.ok(item.id.length >= 8);
});

test('makeItem 驗證:名稱、數量、日期、溫度、製造日期', () => {
  const bad = o => HK.makeItem(form(o), T).errors;
  assert.ok(bad({ name: '   ' }).length);
  assert.ok(bad({ name: 'x'.repeat(41) }).length);
  assert.ok(bad({ quantity: 0 }).length);
  assert.ok(bad({ quantity: 100 }).length);
  assert.ok(bad({ expiry: '' }).length);
  assert.ok(bad({ expiry: '2026-13-01' }).length);
  assert.ok(bad({ tempC: 99 }).length);
  assert.ok(bad({ mfg: '2026-12-01' }).length);              // 製造日期晚於到期日
  assert.deepStrictEqual(bad({ mfg: '2026-10-01', tempC: '' }), []);
  assert.strictEqual(HK.makeItem(form({ tempC: '' }), T).item.tempC, null);
});

test('編輯時沿用原本的 id', () => {
  assert.strictEqual(HK.makeItem(form(), T, 'abc123').item.id, 'abc123');
});

test('suggestExpiry:依類別與位置估算,冷凍比冷藏久', () => {
  const fridge = HK.suggestExpiry('肉類', '冷藏', T), freezer = HK.suggestExpiry('肉類', '冷凍', T);
  assert.strictEqual(fridge.days, 3);
  assert.strictEqual(freezer.date, HK.addDays(T, 90));
  assert.strictEqual(HK.suggestExpiry('藥品', '藥箱', T).days, 365);
  assert.strictEqual(HK.suggestExpiry('未知', '冷藏', T).days, 30);
});

test('sortByExpiry:依到期日排序且不改動原陣列', () => {
  const a = [{ name: 'b', expiry: '2026-11-02' }, { name: 'a', expiry: '2026-10-30' }, { name: 'c', expiry: '2026-10-30' }];
  const s = HK.sortByExpiry(a);
  assert.deepStrictEqual(s.map(x => x.name), ['a', 'c', 'b']);
  assert.strictEqual(a[0].name, 'b');
});

test('filterItems:位置與關鍵字(名稱/類別/備註)', () => {
  const items = HK.sampleItems(T);
  assert.ok(HK.filterItems(items, { location: '冷凍' }).every(i => i.location === '冷凍'));
  assert.strictEqual(HK.filterItems(items, { query: '牛' }).length, 0);
  assert.strictEqual(HK.filterItems(items, { query: '鮮奶' }).length, 1);
  assert.ok(HK.filterItems(items, { query: '乳製品' }).length >= 2);
  assert.strictEqual(HK.filterItems(items, {}).length, items.length);
});

test('summarize 只計算未處理的物品', () => {
  const items = HK.sampleItems(T);
  const s = HK.summarize(items, T);
  assert.strictEqual(s.expired + s.urgent + s.soon + s.ok, items.length);
  assert.strictEqual(s.expired, 1);
  items[2].done = true; // 過期的青江菜吃完了
  assert.strictEqual(HK.summarize(items, T).expired, 0);
});

test('pickNewer:較新的 updatedAt 勝出,缺值時用另一邊', () => {
  const a = { updatedAt: 5, v: 'a' }, b = { updatedAt: 9, v: 'b' };
  assert.strictEqual(HK.pickNewer(a, b), b);
  assert.strictEqual(HK.pickNewer(b, a), b);
  assert.strictEqual(HK.pickNewer(a, null), a);
  assert.strictEqual(HK.pickNewer(null, b), b);
  assert.strictEqual(HK.pickNewer(a, { updatedAt: 5, v: 'tie' }), a);
});

test('toICS:格式、全天事件、跳脫字元、略過已處理項目', () => {
  const items = [HK.makeItem(form({ name: '牛奶, 低脂;特價', notes: '第一行\n第二行' }), T, 'id1').item, Object.assign(HK.makeItem(form({ name: '吃完了' }), T, 'id2').item, { done: true })];
  const ics = HK.toICS(items, { reminderDays: 3, reminderHour: 9, now: new Date(Date.UTC(2026, 9, 29, 1, 2, 3)) });
  assert.ok(ics.startsWith('BEGIN:VCALENDAR\r\n') && ics.endsWith('END:VCALENDAR\r\n'));
  assert.strictEqual((ics.match(/BEGIN:VEVENT/g) || []).length, 1);
  assert.ok(ics.includes('DTSTART;VALUE=DATE:20261105'));
  assert.ok(ics.includes('DTEND;VALUE=DATE:20261106'));
  assert.ok(ics.includes('DTSTAMP:20261029T010203Z'));
  assert.ok(ics.includes('TRIGGER:-PT3780M')); // 3 天 − 9 小時 = 63 小時
  assert.ok(!ics.includes('吃完了'));
  const unfolded = ics.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('SUMMARY:牛奶\\, 低脂\;特價 到期'));
  assert.ok(unfolded.includes('\\n第二行'));
});

test('toICS:當天提醒使用正值 TRIGGER;每行不超過 75 位元組', () => {
  const long = HK.makeItem(form({ name: '很長的名稱'.repeat(7), notes: '備註'.repeat(60) }), T, 'id3').item;
  const ics = HK.toICS([long], { reminderDays: 0, reminderHour: 9 });
  assert.ok(ics.includes('TRIGGER:PT540M'));
  const enc = new TextEncoder();
  for (const line of ics.split('\r\n')) assert.ok(enc.encode(line).length <= 75, line);
});

test('sampleItems 都是有效資料,且包含各種狀態', () => {
  const items = HK.sampleItems(T);
  assert.ok(items.length >= 5 && items.every(Boolean));
  const kinds = new Set(items.map(i => HK.status(HK.daysLeft(i.expiry, T))));
  assert.deepStrictEqual([...kinds].sort(), ['expired', 'ok', 'soon', 'urgent'].sort());
});
