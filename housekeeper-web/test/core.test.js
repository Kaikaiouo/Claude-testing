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
  assert.ok(unfolded.includes('SUMMARY:牛奶\\, 低脂\\;特價 到期'));
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

test('stats:浪費率與類別分佈', () => {
  const mk = (n, cat, o) => Object.assign(HK.makeItem(form({ name: n, category: cat }), T, n).item, o);
  const items = [mk('a', '蔬菜', {}), mk('b', '蔬菜', { quantity: 2 }), mk('c', '肉類', {}), mk('d', '乳製品', { done: true, outcome: 'wasted' }), mk('e', '乳製品', { done: true, outcome: 'used' }), mk('f', '乳製品', { done: true })];
  const s = HK.stats(items, T);
  assert.strictEqual(s.activeCount, 3); assert.strictEqual(s.doneCount, 3); assert.strictEqual(s.wasted, 1); assert.strictEqual(s.used, 2);
  assert.ok(Math.abs(s.wasteRate - 1 / 3) < 1e-9);
  assert.deepStrictEqual(s.categories[0], { name: '蔬菜', count: 3 });
  assert.strictEqual(HK.stats([], T).wasteRate, null);
});

test('stats:最常浪費品項與最近 4 週趨勢', () => {
  const at = d => new Date(d + 'T12:00:00').getTime();
  const D = HK.todayStr(new Date('2026-10-31T12:00:00'));
  const mk = (n, o) => Object.assign(HK.makeItem(form({ name: n }), D, n + Math.random()).item, { done: true }, o);
  const items = [mk('牛奶', { outcome: 'wasted', doneAt: at('2026-10-30') }), mk('牛奶', { outcome: 'wasted', doneAt: at('2026-10-20') }), mk('鮮奶', { outcome: 'wasted', doneAt: at('2026-10-10') }),
    mk('蛋', { outcome: 'used', doneAt: at('2026-10-31') }), mk('舊', { outcome: 'wasted', doneAt: at('2026-08-01') }), mk('無時間', { outcome: 'used' })];
  const s = HK.stats(items, D);
  assert.deepStrictEqual(s.topWasted[0], { name: '牛奶', count: 2 });
  assert.strictEqual(s.weeks.length, 4);
  assert.deepStrictEqual(s.weeks[3], { weeksAgo: 0, used: 1, wasted: 1 });
  assert.strictEqual(s.weeks[2].wasted, 1); assert.strictEqual(s.weeks[1].wasted, 0); assert.strictEqual(s.weeks[0].wasted, 1);
});

test('備份:匯出再匯入內容一致;壞資料略過;非備份檔回報錯誤', () => {
  const a = HK.makeItem(form({ name: '牛奶' }), T, 'x1').item, b = Object.assign(HK.makeItem(form({ name: '雞蛋' }), T, 'x2').item, { done: true, doneAt: 5, outcome: 'wasted' });
  const st = { items: [a, b], settings: { reminderDays: 5, reminderHour: 8 } };
  const r = HK.parseBackup(HK.exportBackup(st), T);
  assert.ok(r.ok); assert.strictEqual(r.skipped, 0); assert.strictEqual(r.items.length, 2);
  assert.deepStrictEqual(r.items[0], a); assert.deepStrictEqual(r.items[1], b); assert.deepStrictEqual(r.settings, { reminderDays: 5, reminderHour: 8 });
  const bad = JSON.stringify({ app: 'housekeeper', items: [a, { name: '' }, null, 3] });
  const r2 = HK.parseBackup(bad, T); assert.strictEqual(r2.items.length, 1); assert.strictEqual(r2.skipped, 3);
  assert.strictEqual(HK.parseBackup('nope', T).ok, false); assert.strictEqual(HK.parseBackup('{"items":[]}', T).ok, false);
});

test('mergeItems:同 id 以匯入為準', () => {
  const a = { id: '1', name: 'old' }, b = { id: '2', name: 'k' }, a2 = { id: '1', name: 'new' };
  const m = HK.mergeItems([a, b], [a2]); assert.strictEqual(m.length, 2); assert.strictEqual(m.find(i => i.id === '1').name, 'new');
});

test('購物清單:新增、同名合併、排序、轉成物品預填', () => {
  let r = HK.addShopping([], { name: ' 鮮奶 ', category: '乳製品', quantity: 2 }, 100);
  assert.strictEqual(r.list.length, 1); assert.strictEqual(r.list[0].name, '鮮奶'); assert.strictEqual(r.merged, false);
  r = HK.addShopping(r.list, { name: '鮮奶', quantity: 3 }, 200);
  assert.strictEqual(r.list.length, 1); assert.strictEqual(r.list[0].quantity, 5); assert.strictEqual(r.merged, true);
  assert.strictEqual(HK.addShopping(r.list, { name: '  ' }).added, null);
  const bought = r.list.map(x => Object.assign({}, x, { bought: true }));
  r = HK.addShopping(bought, { name: '鮮奶', quantity: 1 }, 300); // 已買的不合併
  assert.strictEqual(r.list.length, 2);
  assert.strictEqual(HK.sortShopping(r.list)[0].bought, false);
  const f = HK.shopToForm(HK.makeShopItem({ name: '雞胸肉', category: '肉類', location: '冷凍', quantity: 2 }), T);
  assert.strictEqual(f.estimated, true); assert.strictEqual(f.tempC, -18); assert.ok(HK.makeItem(f, T).item);
  assert.strictEqual(HK.makeShopItem({ name: 'x', quantity: 500 }).quantity, 1);
});

test('備份包含購物清單;舊備份沒有也能匯入', () => {
  const sh = HK.makeShopItem({ name: '蛋', quantity: 2, bought: true }, 's1', 9);
  const r = HK.parseBackup(HK.exportBackup({ items: [], settings: {}, shopping: [sh] }), T);
  assert.deepStrictEqual(r.shopping, [sh]);
  assert.deepStrictEqual(HK.parseBackup('{"app":"housekeeper","items":[]}', T).shopping, []);
});

test('parseScan:驗證並正規化辨識結果', () => {
  const T = '2026-10-29';
  const r = HK.parseScan({ name: ' 鮮奶 ', category: '乳製品', location: '冷藏', expiry: '2026-11-05', mfg: '2026-10-20', quantity: 2 }, T);
  assert.equal(r.name, '鮮奶'); assert.equal(r.expiry, '2026-11-05'); assert.equal(r.estimated, false); assert.equal(r.quantity, 2); assert.equal(r.tempC, 4);
  const e = HK.parseScan({ name: '蘋果', category: '亂寫', location: '火星', expiry: '2026-02-31', quantity: 500 }, T);
  assert.equal(e.category, '其他'); assert.equal(e.location, '冷藏'); assert.equal(e.estimated, true); assert.equal(e.quantity, 1);
  assert.ok(HK.parseDay(e.expiry) !== null);
  assert.equal(HK.parseScan({ name: 'x', expiry: '2026-11-01', mfg: '2026-12-01' }, T).mfg, '');
  assert.equal(HK.parseScan({ name: '' }, T), null); assert.equal(HK.parseScan(null, T), null); assert.equal(HK.parseScan([1], T), null);
  assert.ok(HK.scanPrompt(T).includes(T));
});

test('groupShopping:依類別分組、全買完的組排後面、未知類別歸其他', () => {
  const mk = (name, category, bought, addedAt) => ({ id: name, name, category, bought, addedAt, quantity: 1 });
  const g = HK.groupShopping([mk('a', HK.CATEGORIES[1], true, 1), mk('b', HK.CATEGORIES[0], false, 2), mk('c', 'zzz', false, 3), mk('d', HK.CATEGORIES[0], false, 5)]);
  assert.deepStrictEqual(g.map(x => x.category), [HK.CATEGORIES[0], '其他', HK.CATEGORIES[1]]);
  assert.deepStrictEqual(g[0].items.map(i => i.name), ['d', 'b']);
  assert.strictEqual(g[2].pending, 0);
  assert.deepStrictEqual(HK.groupShopping([]), []);
});

test('findDuplicate:同名同位置未處理才算重複', () => {
  const its = [{ name: '鮮 奶', location: '冷藏', done: false }, { name: '優格', location: '冷藏', done: true }];
  assert.ok(HK.findDuplicate(its, '鮮奶', '冷藏'));
  assert.equal(HK.findDuplicate(its, '鮮奶', '冷凍'), null);
  assert.equal(HK.findDuplicate(its, '優格', '冷藏'), null);
  assert.equal(HK.findDuplicate(its, '', '冷藏'), null);
});

test('finishItem:數量>1 且 all=false 只減 1;否則標記處理並判定 outcome', () => {
  const it = { quantity: 3, expiry: '2026-10-31', done: false };
  const r = HK.finishItem(it, '2026-10-30', { all: false });
  assert.equal(r.done, false); assert.equal(r.item.quantity, 2); assert.equal(it.quantity, 3);
  const used = HK.finishItem({ quantity: 1, expiry: '2026-10-30' }, '2026-10-30', { all: false, now: 5 });
  assert.deepStrictEqual([used.done, used.item.outcome, used.item.doneAt], [true, 'used', 5]);
  assert.equal(HK.finishItem(it, '2026-11-02').item.outcome, 'wasted');
});

test('openItem:開封後到期日只會提前,可復原;冷凍/已開封/無規則類別不適用', () => {
  const mk = o => HK.makeItem(form(o), T).item;
  const milk = mk({ expiry: '2026-11-20' });
  const r = HK.openItem(milk, T);
  assert.strictEqual(r.item.expiry, '2026-11-03'); assert.strictEqual(r.item.openedAt, T); assert.strictEqual(r.changed, true); assert.strictEqual(r.item.estimated, true);
  assert.strictEqual(HK.openItem(r.item, T), null); // 已開封
  const back = HK.unopenItem(r.item);
  assert.strictEqual(back.expiry, '2026-11-20'); assert.strictEqual(back.openedAt, undefined);
  const soon = HK.openItem(mk({ expiry: '2026-10-31' }), T); // 本來就更早:不延後
  assert.strictEqual(soon.item.expiry, '2026-10-31'); assert.strictEqual(soon.changed, false);
  assert.strictEqual(HK.openItem(mk({ location: '冷凍' }), T), null);
  assert.strictEqual(HK.openItem(mk({ category: '日用品', location: '櫃子' }), T), null);
});

test('openDays 自訂開封天數:保久乳 7 天、優先於類別預設、冷凍也適用、壞值忽略', () => {
  const uht = HK.makeItem(form({ name: '保久乳', expiry: '2027-03-01', openDays: '7' }), T).item;
  assert.strictEqual(uht.openDays, 7);
  const r = HK.openItem(uht, T);
  assert.strictEqual(r.item.expiry, '2026-11-05'); assert.strictEqual(r.days, 7);
  assert.strictEqual(HK.openItem(HK.makeItem(form({ location: '冷凍', openDays: 3, expiry: '2027-03-01' }), T).item, T).item.expiry, '2026-11-01');
  assert.strictEqual(HK.makeItem(form({ openDays: 0 }), T).item.openDays, null);
  assert.strictEqual(HK.makeItem(form({ openDays: '' }), T).item.openDays, null);
  assert.strictEqual(HK.openedDays('乳製品', '冷藏', null), 5);
});

test('milkPreset:鮮奶/保久乳預設值', () => {
  const u = HK.milkPreset('保久乳', T);
  assert.deepStrictEqual([u.location, u.openDays, u.expiry, u.estimated], ['冷藏', 7, '2027-04-27', true]);
  const f = HK.milkPreset('鮮奶', T); assert.deepStrictEqual([f.location, f.openDays, f.expiry], ['冷藏', 5, '2026-11-05']);
  assert.strictEqual(HK.milkPreset('豆漿', T), null);
});

test('makeItem 保留合法的 openedAt,壞值變 null(備份往返不遺失)', () => {
  const ok = HK.makeItem(form({ openedAt: '2026-10-28', expiryBeforeOpen: '2026-11-20' }), T).item;
  assert.strictEqual(ok.openedAt, '2026-10-28'); assert.strictEqual(ok.expiryBeforeOpen, '2026-11-20');
  assert.strictEqual(HK.makeItem(form({ openedAt: 'bad' }), T).item.openedAt, null);
});

test('filterItems:依到期狀態篩選', () => {
  const t = '2026-10-30';
  const mk = (n, e) => ({ name: n, category: '其他', location: '冷藏', expiry: e, done: false });
  const items = [mk('a', '2026-10-28'), mk('b', '2026-10-31'), mk('c', '2027-01-01')];
  assert.deepStrictEqual(HK.filterItems(items, { status: 'expired', today: t }).map(i => i.name), ['a']);
  assert.strictEqual(HK.filterItems(items, { status: '', today: t }).length, 3);
});

test('sortItems:依名稱/最近新增排序,未知模式回到到期日', () => {
  const mk = (n, e, c) => ({ name: n, expiry: e, createdAt: c });
  const items = [mk('b', '2026-11-01', 1), mk('a', '2026-12-01', 3), mk('c', '2026-10-01', 2)];
  assert.deepStrictEqual(HK.sortItems(items, 'name').map(i => i.name), ['a', 'b', 'c']);
  assert.deepStrictEqual(HK.sortItems(items, 'added').map(i => i.name), ['a', 'c', 'b']);
  assert.deepStrictEqual(HK.sortItems(items, 'zzz').map(i => i.name), ['c', 'b', 'a']);
});

test('finishExpired 只處理已過期並可復原', () => {
  const today = '2026-10-30';
  const mk = (n, off) => HK.makeItem({ name: n, category: '蔬菜', location: '冷藏', quantity: 1, expiry: HK.addDays(today, off) }, today).item;
  const items = [mk('a', -2), mk('b', 0), mk('c', -1)];
  const r = HK.finishExpired(items, today, 123);
  assert.equal(r.changed.length, 2);
  assert.deepEqual(r.items.map(i => i.done), [true, false, true]);
  assert.equal(r.items[0].outcome, 'wasted');
  const back = HK.restoreItems(r.items, r.changed);
  assert.deepEqual(back.map(i => i.done), [false, false, false]);
});

test('knownNames 去重並依最近新增排序', () => {
  const mk = (name, createdAt) => ({ name, createdAt });
  assert.deepStrictEqual(HK.knownNames([mk('鮮奶', 1), mk('優格', 3), mk(' 鮮 奶 ', 5), mk('', 9)]), [' 鮮 奶 ', '優格']);
});
test('recallItem 帶入上次的類別與保存天數', () => {
  const items = [{ name: '鮮奶', category: '乳製品', location: '冷藏', quantity: 2, tempC: 4, openDays: 5, purchase: '2026-10-01', expiry: '2026-10-08', createdAt: 1 }];
  const r = HK.recallItem(items, ' 鮮奶 ', '2026-10-31');
  assert.strictEqual(r.category, '乳製品'); assert.strictEqual(r.shelfDays, 7); assert.strictEqual(r.expiry, '2026-11-07'); assert.strictEqual(r.openDays, 5);
  assert.strictEqual(HK.recallItem(items, '沒有', '2026-10-31'), null);
  assert.strictEqual(HK.recallItem([{ name: 'x', category: '其他', location: '常溫', purchase: '2026-10-10', expiry: '2026-10-01' }], 'x', '2026-10-31').expiry, null);
});

test('knownNames / recallItem 也納入購物清單名稱', () => {
  const shop = [{ name: '豆腐', category: '蔬菜', location: '冷藏', quantity: 2, addedAt: 10 }];
  assert.deepStrictEqual(HK.knownNames([{ name: '鮮奶', createdAt: 1 }], 50, shop), ['豆腐', '鮮奶']);
  const r = HK.recallItem([], '豆腐', '2026-10-31', shop);
  assert.strictEqual(r.category, '蔬菜'); assert.strictEqual(r.quantity, 2); assert.strictEqual(r.expiry, null);
  assert.strictEqual(HK.recallItem([], '豆腐', '2026-10-31'), null);
});

test('finishExpired 可指定記為 used(不算浪費)', () => {
  const today = '2026-10-30';
  const it = HK.makeItem({ name: 'a', category: '蔬菜', location: '冷藏', quantity: 1, expiry: HK.addDays(today, -2) }, today).item;
  const r = HK.finishExpired([it], today, 5, 'used');
  assert.equal(r.items[0].outcome, 'used');
  assert.equal(r.items[0].done, true);
});
test('removeItem / reinsertItem 刪除後可原位復原', () => {
  const mk = n => HK.makeItem({ name: n, category: '蔬菜', location: '冷藏', quantity: 1, expiry: '2026-11-05' }, T).item;
  const [a, b, c] = ['a', 'b', 'c'].map(mk);
  const after = HK.removeItem([a, b, c], b.id);
  assert.deepEqual(after.map(i => i.name), ['a', 'c']);
  assert.deepEqual(HK.reinsertItem(after, b, 1).map(i => i.name), ['a', 'b', 'c']);
  assert.equal(HK.reinsertItem([a, b], b, 0).length, 2);
  assert.equal(HK.reinsertItem([], b, 9).length, 1);
});

test('expiringText / shoppingText', () => {
  const T = '2026-11-01', mk = (name, off, extra = {}) => HK.makeItem(Object.assign({ name, category: '蔬菜', location: '冷藏', quantity: 1, expiry: HK.addDays(T, off), purchase: T }, extra), T).item;
  const items = [mk('牛奶', 2, { quantity: 2 }), mk('青江菜', -1), mk('橄欖油', 100), mk('優格', 0)];
  const done = Object.assign(mk('吃掉的', 1), { done: true });
  const t = HK.expiringText([...items, done], T, 7).split('\n');
  assert.equal(t.length, 4); assert.match(t[1], /青江菜.*過期 1 天/); assert.match(t[2], /優格.*今天到期/); assert.match(t[3], /牛奶 ×2.*2 天後/);
  assert.equal(HK.expiringText([items[2]], T, 7), '');
  let l = []; l = HK.addShopping(l, { name: '蛋', category: '其他', quantity: 2 }).list; l = HK.addShopping(l, { name: '菠菜', category: '蔬菜' }).list; l = HK.addShopping(l, { name: '已買', bought: true }).list;
  const s = HK.shoppingText(l); assert.match(s, /^【購物清單】/); assert.match(s, /蔬菜\n□ 菠菜/); assert.match(s, /□ 蛋 ×2/); assert.doesNotMatch(s, /已買/);
  assert.equal(HK.shoppingText([]), '');
});

test('guessCategory 依品名猜類別', () => {
  assert.deepEqual(HK.guessCategory('牛肉片'), { category: '肉類', location: '冷藏', days: 3 });
  assert.equal(HK.guessCategory('鮭魚').days, 2);
  assert.equal(HK.guessCategory('鮮奶').days, 7);
  assert.equal(HK.guessCategory('保久乳').days, undefined);
  assert.equal(HK.guessCategory('高麗菜').days, 10);
  assert.equal(HK.guessCategory('青江菜').days, 4);
  assert.equal(HK.guessCategory('草莓').days, 5);
  assert.equal(HK.guessCategory('韓式泡菜').days, 30);
  assert.equal(HK.guessCategory('蛋糕').days, 3);
  assert.equal(HK.guessCategory('牛奶').category, '乳製品');
  assert.equal(HK.guessCategory('小黃瓜').category, '蔬菜');
  assert.equal(HK.guessCategory('鮮奶油').category, '乳製品');
  assert.equal(HK.guessCategory('感冒藥水').category, '藥品');
  assert.equal(HK.guessCategory('洗面乳').category, '保養品');
  assert.equal(HK.guessCategory('烏龍茶').category, '飲料');
  assert.deepEqual(HK.guessCategory('雞蛋'), { category: '其他', location: '冷藏', days: 21 });
  assert.deepEqual(HK.guessCategory('全麥吐司'), { category: '其他', location: '常溫', days: 4 });
  assert.equal(HK.guessCategory('牛油果').category, '水果');
  assert.equal(HK.guessCategory('豬油').category, '調味料');
  assert.deepEqual(HK.guessCategory('泡麵'), { category: '其他', location: '常溫' });
  assert.equal(HK.guessCategory('雞胸肉').category, '肉類');
  assert.deepEqual(HK.guessCategory('水餃'), { category: '其他', location: '冷凍' });
  assert.deepEqual(HK.guessCategory('冷凍雞胸肉'), { category: '肉類', location: '冷凍' });
  assert.deepEqual(HK.guessCategory('板豆腐'), { category: '蔬菜', location: '冷藏', days: 5 });
  assert.deepEqual(HK.guessCategory('餃子皮'), { category: '其他', location: '冷藏', days: 5 });
  assert.equal(HK.guessCategory('  '), null); assert.equal(HK.guessCategory('xyz'), null); assert.equal(HK.guessCategory(null), null);
});

test('freezeItem:移到冷凍延長到期日、可還原;不適用的回傳 null', () => {
  const it = HK.makeItem(form({ name: '雞胸肉', category: '肉類', expiry: '2026-10-31', tempC: 4 }), T).item;
  const r = HK.freezeItem(it, T);
  assert.equal(r.item.location, '冷凍'); assert.equal(r.item.tempC, -18); assert.equal(r.item.expiry, '2027-01-27'); assert.equal(r.item.estimated, true);
  const back = HK.unfreezeItem(r.item);
  assert.equal(back.location, '冷藏'); assert.equal(back.expiry, '2026-10-31'); assert.equal(back.tempC, 4); assert.equal(back.locationBeforeFreeze, undefined);
  assert.equal(HK.freezeItem(Object.assign({}, it, { expiry: '2026-10-28' }), T), null);
  assert.equal(HK.freezeItem(Object.assign({}, it, { location: '冷凍' }), T), null);
  assert.equal(HK.freezeItem(Object.assign({}, it, { category: '飲料' }), T), null);
  assert.equal(HK.freezeItem(Object.assign({}, it, { openedAt: T }), T), null);
});

test('freezeSoon:只冷凍 2 天內到期且可冷凍者,changed 可用 restoreItems 還原', () => {
  const a = HK.makeItem(form({ name: '雞胸肉', category: '肉類', expiry: '2026-11-01' }), T).item;
  const b = HK.makeItem(form({ name: '牛奶', category: '飲料', expiry: '2026-11-01' }), T).item;
  const c = HK.makeItem(form({ name: '豬肉', category: '肉類', expiry: '2026-12-30' }), T).item;
  const r = HK.freezeSoon([a, b, c], '2026-10-31');
  assert.equal(r.changed.length, 1); assert.equal(r.items[0].location, '冷凍'); assert.equal(r.items[1], b); assert.equal(r.items[2], c);
  assert.deepEqual(HK.restoreItems(r.items, r.changed)[0], a);
});

test('toCSV:BOM、跳脫逗號與引號、公式注入防護、狀態與處理結果', () => {
  const a = HK.makeItem(form({ name: '牛奶, "特濃"', expiry: '2026-10-28' }), T).item;
  const b = HK.makeItem(form({ name: '=CMD()', expiry: '2026-12-01' }), T).item;
  const c = Object.assign({}, HK.makeItem(form({ name: '蛋' }), T).item, { done: true, outcome: 'wasted' });
  const csv = HK.toCSV([a, b, c], T);
  assert.ok(csv.startsWith('﻿名稱,'));
  const lines = csv.trim().split('\r\n');
  assert.equal(lines.length, 4);
  assert.ok(lines[1].startsWith('"牛奶, ""特濃""",乳製品,冷藏,1,'));
  assert.ok(lines[1].includes(',-1,已過期,'));
  assert.ok(lines[2].startsWith("'=CMD(),"));
  assert.ok(lines[3].endsWith(',是,浪費,,')); // 最後兩欄是「處理日」「備註」,沒有 doneAt、沒備註時留空
});

test('dateWarnings:早於購買日、過期一年多、5 年後會提醒;正常日期無提醒', () => {
  const mk = f => HK.makeItem(form(f), T).item;
  assert.deepEqual(HK.dateWarnings(mk({ expiry: '2026-12-01' }), T), []);
  assert.ok(HK.dateWarnings(mk({ expiry: '2026-10-01', purchase: '2026-10-20' }), T).includes('到期日早於購買日'));
  assert.equal(HK.dateWarnings(mk({ expiry: '2025-01-01', purchase: '2024-12-01' }), T).length, 1);
  assert.equal(HK.dateWarnings(mk({ expiry: '2036-01-01' }), T).length, 1);
});

test('parseCSV:可讀回 toCSV 匯出(含逗號引號、公式防護、已處理)、略過壞列與重複', () => {
  const a = HK.makeItem(form({ name: '牛奶, "特濃"', expiry: '2026-12-01', quantity: 2 }), T).item;
  const b = HK.makeItem(form({ name: '=CMD()', expiry: '2026-12-05' }), T).item;
  const c = Object.assign({}, HK.makeItem(form({ name: '蛋', expiry: '2026-11-20' }), T).item, { done: true, outcome: 'wasted' });
  const csv = HK.toCSV([a, b, c], T) + '壞列,,,1,,not-a-date\r\n';
  const r = HK.parseCSV(csv, T, [a]);
  assert.equal(r.ok, true);
  assert.equal(r.skipped, 1);
  assert.equal(r.duplicates, 1);
  assert.equal(r.items.length, 2);
  assert.equal(r.items[0].name, '=CMD()');
  assert.equal(r.items[1].done, true);
  assert.equal(r.items[1].outcome, 'wasted');
  const r2 = HK.parseCSV(csv, T, []);
  assert.equal(r2.items[0].name, '牛奶, "特濃"');
  assert.equal(r2.items[0].quantity, 2);
  assert.equal(HK.parseCSV('a,b\r\n1,2', T).ok, false);
  assert.equal(HK.parseCSV('', T).ok, false);
});

test('backupDue:物品太少不提醒;超過 30 天才提醒;以備份日優先於起算日', () => {
  assert.equal(HK.backupDue(null, '2026-01-01', 4, T), false);
  assert.equal(HK.backupDue(null, '2026-01-01', 5, T), true);
  assert.equal(HK.backupDue('2026-01-01', '2026-01-01', 5, HK.addDays('2026-01-01', 29)), false);
  assert.equal(HK.backupDue('2026-01-01', '2020-01-01', 5, HK.addDays('2026-01-01', 30)), true);
  assert.equal(HK.backupDue(null, null, 9, T), false);
});

test('frequentNames 依次數排序、需出現至少 2 次、忽略空白大小寫', () => {
  const mk = (name, createdAt) => ({ name, createdAt });
  const items = [mk('鮮奶', 1), mk('雞蛋', 2), mk('鮮 奶', 5), mk('雞蛋', 6), mk('鮮奶', 7), mk('優格', 9), mk('', 3)];
  assert.deepStrictEqual(HK.frequentNames(items), ['鮮奶', '雞蛋']);
  assert.deepStrictEqual(HK.frequentNames(items, 1), ['鮮奶']);
  assert.deepStrictEqual(HK.frequentNames([], 6), []);
});

test('shopSuggestions:常買但庫存沒有、清單也沒待買者才建議', () => {
  const mk = (name, done) => ({ name, done: !!done, createdAt: 1 });
  const items = [mk('牛奶', true), mk('牛奶', true), mk('雞蛋', true), mk('雞蛋', true), mk('吐司', true), mk('吐司', false), mk('吐司', true), mk('豆腐', true)];
  assert.deepStrictEqual(HK.shopSuggestions(items, []).sort(), ['牛奶', '雞蛋']);
  assert.deepStrictEqual(HK.shopSuggestions(items, [{ name: '牛奶', bought: false }]), ['雞蛋']);
  assert.deepStrictEqual(HK.shopSuggestions(items, [{ name: '牛奶', bought: true }]).sort(), ['牛奶', '雞蛋']);
});

test('parseBulk:多行/逗號、數量寫法、同名合併、猜類別並標估算', () => {
  const r = HK.parseBulk('鮮奶 x2\n- 雞蛋 1盒\n青江菜，豆腐、鮮奶\n\n洗面乳 ×3', T);
  const by = n => r.items.find(i => i.name === n);
  assert.equal(r.items.length, 5);
  assert.equal(by('鮮奶').quantity, 3);
  assert.equal(by('雞蛋').quantity, 1);
  assert.equal(by('洗面乳').quantity, 3);
  assert.equal(by('鮮奶').expiry, HK.addDays(T, 7));
  assert.equal(by('雞蛋').expiry, HK.addDays(T, 21));
  assert.equal(by('豆腐').category, '蔬菜');
  assert.ok(r.items.every(i => i.estimated && i.purchase === T));
  const u = HK.parseBulk('神祕東西', T).items[0];
  assert.equal(u.category, '其他');
  assert.equal(HK.parseBulk('', T).items.length, 0);
  assert.equal(HK.parseBulk('牛奶 x500', T).skipped.length, 1);
});

test('parseBulk:支援附到期日(11/20、11月20日、2027-01-05、到期11/20),不標估算', () => {
  const t = '2026-11-03';
  const r = HK.parseBulk('優格 x2 11/20\n豆腐 到期11月8日\n罐頭 2027-01-05\n牛奶 1/2\n青江菜', t);
  const by = n => r.items.find(i => i.name === n);
  assert.equal(by('優格').expiry, '2026-11-20'); assert.equal(by('優格').quantity, 2); assert.equal(by('優格').estimated, false);
  assert.equal(by('豆腐').expiry, '2026-11-08');
  assert.equal(by('罐頭').expiry, '2027-01-05');
  assert.equal(by('牛奶').expiry, '2027-01-02');
  assert.equal(by('青江菜').estimated, true);
  assert.equal(HK.parseBulk('鮮奶 10/20', t).items[0].expiry, '2026-10-20');
  assert.equal(HK.parseBulk('鮮奶 10/01', t).items[0].expiry, '2027-10-01');
});

test('parseBulk:@位置 語法覆蓋猜測的位置,且可與數量/到期日並用;非日期數字被略過', () => {
  const t = '2026-11-03';
  const r = HK.parseBulk('雞胸肉 @冷凍 x2\n@藥箱 感冒藥水 11/20\n鮮奶 @常溫\n牛奶 13/45', t);
  const by = n => r.items.find(i => i.name === n);
  assert.equal(by('雞胸肉').location, '冷凍'); assert.equal(by('雞胸肉').quantity, 2);
  assert.equal(by('雞胸肉').expiry, HK.suggestExpiry('肉類', '冷凍', t).date);
  assert.equal(by('感冒藥水').location, '藥箱'); assert.equal(by('感冒藥水').expiry, '2026-11-20');
  assert.equal(by('鮮奶').location, '常溫');
  assert.equal(r.skipped.length, 1);
});

test('removeShopping / restoreShopping 移除後可原位復原', () => {
  const l = [{ id: 'a', bought: false }, { id: 'b', bought: true }, { id: 'c', bought: true }, { id: 'd', bought: false }];
  const r = HK.removeShopping(l, x => x.bought);
  assert.deepEqual(r.shopping.map(x => x.id), ['a', 'd']);
  assert.deepEqual(HK.restoreShopping(r.shopping, r.removed).map(x => x.id), ['a', 'b', 'c', 'd']);
  assert.equal(HK.restoreShopping(l, r.removed).length, 4);
});

test('recipeCandidates:只取 3 天內到期的食材,排除過期/藥品/已處理/同名,依剩餘天數排序', () => {
  const mk = (name, category, location, off, extra = {}) => HK.makeItem(Object.assign({ name, category, location, quantity: 1, expiry: HK.addDays(T, off), purchase: T }, extra), T).item;
  const items = [mk('鮮奶', '乳製品', '冷藏', 2), mk('青江菜', '蔬菜', '冷藏', 0), mk('過期菜', '蔬菜', '冷藏', -1), mk('感冒藥', '藥品', '藥箱', 1),
    mk('雞胸肉', '肉類', '冷凍', 40), mk('鮮奶', '乳製品', '冷藏', 1), Object.assign(mk('吃完了', '蔬菜', '冷藏', 1), { done: true }), mk('洗面乳', '保養品', '櫃子', 1)];
  const c = HK.recipeCandidates(items, T);
  assert.deepStrictEqual(c.map(x => x.name), ['青江菜', '鮮奶']);
  assert.strictEqual(c[0].daysLeft, 0);
  assert.deepStrictEqual(HK.recipeCandidates([], T), []);
  assert.strictEqual(HK.recipeCandidates(items, T, 3, 1).length, 1);
});

test('recipePrompt 含食材與剩餘天數;parseRecipes 只收用到清單食材的有效食譜', () => {
  const list = [{ name: '青江菜', daysLeft: 0, location: '冷藏' }, { name: '鮮奶', daysLeft: 2, location: '冷藏' }];
  const p = HK.recipePrompt(list, T);
  assert.ok(p.includes("青江菜(今天到期,放冷藏)") && p.includes("鮮奶(2 天後到期,放冷藏)"));
  const raw = [{ title: '清炒青江菜', uses: ['青江菜', '不存在', '青江菜'], minutes: 10.4, how: '熱油爆香,下菜炒熟。' },
    { title: '亂編', uses: ['牛排'], minutes: 5, how: 'x' }, { title: '', uses: ['鮮奶'], how: 'x' }, null, 'str', { title: '奶茶', uses: ['鮮奶'], minutes: 9999, how: '煮開。' }];
  const r = HK.parseRecipes(raw, list);
  assert.strictEqual(r.length, 2);
  assert.deepStrictEqual(r[0], { title: '清炒青江菜', uses: ['青江菜'], minutes: 10, how: '熱油爆香,下菜炒熟。' });
  assert.strictEqual(r[1].minutes, null);
  assert.deepStrictEqual(HK.parseRecipes({ recipes: raw }, list).length, 2);
  assert.deepStrictEqual(HK.parseRecipes('壞掉', list), []);
});

test('shopBoughtToItems:已買項目一次轉成庫存物品,未買留在清單', () => {
  const T = '2026-11-04';
  let sh = HK.addShopping([], { name: '鮮奶', category: '乳製品', location: '冷藏', quantity: 2 }).list;
  sh = HK.addShopping(sh, { name: '青菜', category: '蔬菜', location: '冷藏', quantity: 1 }).list;
  sh.find(x => x.name === '鮮奶').bought = true;
  const r = HK.shopBoughtToItems(sh, T);
  assert.strictEqual(r.items.length, 1);
  assert.strictEqual(r.items[0].name, '鮮奶'); assert.strictEqual(r.items[0].quantity, 2);
  assert.strictEqual(r.items[0].estimated, true); assert.strictEqual(r.items[0].purchase, T);
  assert.deepStrictEqual(r.shopping.map(x => x.name), ['青菜']);
  assert.strictEqual(r.moved.length, 1);
  assert.strictEqual(HK.shopBoughtToItems(r.shopping, T).items.length, 0);
});

test('stats.cleanDays:距最近一次浪費的天數;沒浪費過則自最早處理日起算', () => {
  const T = '2026-11-05', at = d => new Date(d + 'T12:00:00').getTime();
  const mk = (o, d, name) => ({ id: name, name, done: true, outcome: o, doneAt: at(d), expiry: '2026-01-01', category: '其他', location: '冷藏', quantity: 1 });
  assert.strictEqual(HK.stats([], T).cleanDays, null);
  assert.strictEqual(HK.stats([{ id: 'x', name: 'x', done: true, expiry: T }], T).cleanDays, null);
  const a = HK.stats([mk('used', '2026-11-01', 'a'), mk('wasted', '2026-11-02', 'b'), mk('used', '2026-11-04', 'c')], T);
  assert.strictEqual(a.cleanDays, 3); assert.strictEqual(a.lastWasted, true);
  const b = HK.stats([mk('used', '2026-10-29', 'a')], T);
  assert.strictEqual(b.cleanDays, 7); assert.strictEqual(b.lastWasted, false);
});

test('titleFor 把需要注意的數量放在分頁標題', () => {
  assert.strictEqual(HK.titleFor({ expired: 0, urgent: 0, soon: 3, ok: 5 }), 'housekeeper');
  assert.strictEqual(HK.titleFor({ expired: 1, urgent: 2, soon: 0, ok: 0 }), '(3) housekeeper');
  assert.strictEqual(HK.titleFor({ expired: 150, urgent: 0 }), '(99+) housekeeper');
});

test('sortDone 依處理時間新到舊;pruneDone 只清舊的已處理紀錄', () => {
  const mk = (n, doneAt, done = true, expiry = '2026-10-01') => ({ id: n, name: n, done, doneAt, expiry });
  const now = Date.parse('2026-11-05T04:00:00Z');
  const day = 86400000;
  const items = [mk('a', now - 200 * day), mk('b', now - 1 * day), mk('c', null), mk('d', now - 100 * day), mk('e', now - 300 * day, false)];
  assert.deepStrictEqual(HK.sortDone(items.filter(i => i.done)).map(i => i.id), ['b', 'd', 'a', 'c']);
  const r = HK.pruneDone(items, 90, '2026-11-05');
  assert.deepStrictEqual(r.removed.map(i => i.id), ['a', 'd']);
  assert.deepStrictEqual(r.kept.map(i => i.id), ['b', 'c', 'e']);
  assert.strictEqual(HK.pruneDone(items, 400, '2026-11-05').removed.length, 0);
});

test('parseScanMulti / scanToBulkText:多件辨識轉成批次新增文字', () => {
  const raw = [{ name: '鮮奶', category: '乳製品', location: '冷藏', expiry: '2026-11-20', quantity: 2 }, { name: '青江菜', category: '蔬菜', location: '冷藏', expiry: null }, { name: '' }, 'x'];
  const list = HK.parseScanMulti(raw, T);
  assert.equal(list.length, 2);
  assert.deepEqual(HK.parseScanMulti({ items: raw }, T).map(r => r.name), ['鮮奶', '青江菜']);
  assert.deepEqual(HK.parseScanMulti('壞掉', T), []);
  assert.equal(HK.parseScanMulti(new Array(30).fill({ name: 'a' }), T).length, 15);
  const txt = HK.scanToBulkText(list);
  const b = HK.parseBulk(txt, T).items;
  assert.equal(b.length, 2); assert.equal(b[0].quantity, 2); assert.equal(b[0].expiry, '2026-11-20'); assert.equal(b[0].location, '冷藏');
  assert.equal(b[1].estimated, true);
});

test('scanMultiPrompt: 收據模式加註略過價格且 expiry 填 null', () => {
  const n = HK.scanMultiPrompt('2026-11-05'), r = HK.scanMultiPrompt('2026-11-05', { receipt: true });
  assert.ok(!n.includes('收據:只列'));
  assert.ok(r.includes('略過價格') && r.includes('expiry 一律填 null'));
  assert.ok(r.startsWith(n.slice(0, 40)));
});

test('upcoming: 未來 14 天每日到期數', () => {
  const mk = (name, expiry, done = false) => ({ name, expiry, done });
  const u = HK.upcoming([mk('a', '2026-11-05'), mk('b', '2026-11-05'), mk('c', '2026-11-07'), mk('d', '2026-11-18'), mk('e', '2026-11-19'), mk('f', '2026-11-01'), mk('g', '2026-11-05', true)], '2026-11-05');
  assert.equal(u.days.length, 14); assert.equal(u.days[0].count, 2); assert.equal(u.days[2].count, 1); assert.equal(u.days[13].count, 1);
  assert.equal(u.overdue, 1); assert.equal(u.later, 1); assert.equal(u.days[13].date, '2026-11-18');
});

test('filterItems 可依到期日篩選', () => {
  const m = (name, expiry) => ({ name, category: '其他', location: '冷藏', expiry });
  const r = HK.filterItems([m('a', '2026-11-08'), m('b', '2026-11-09')], { expiry: '2026-11-08' });
  assert.deepEqual(r.map(i => i.name), ['a']);
});

test('cleanState:丟掉壞項目、補預設欄位、非預期結構回傳 null', () => {
  assert.strictEqual(HK.cleanState(null), null);
  assert.strictEqual(HK.cleanState({ items: 'x' }), null);
  const r = HK.cleanState({ items: [null, 5, { id: 'a', name: '蛋', expiry: '2026-11-20' }, { id: 'b', name: '', expiry: '2026-11-20' }, { id: 'c', name: '壞日期', expiry: 'abc' }], shopping: [null, { name: '米' }] });
  assert.strictEqual(r.dropped, 4);
  assert.strictEqual(r.state.items.length, 1);
  assert.strictEqual(r.state.items[0].quantity, 1);
  assert.strictEqual(r.state.items[0].location, '冷藏');
  assert.strictEqual(r.state.shopping.length, 1);
  assert.deepStrictEqual(HK.cleanState({ items: [] }).state.shopping, []);
});

test('syncAction:雲端較新採用、本機較新補傳、空的本機不覆蓋雲端', () => {
  const st = (updatedAt, n) => ({ updatedAt, items: Array.from({ length: n }, (_, k) => ({ id: 'i' + k, name: 'a', expiry: '2026-12-01' })), shopping: [] });
  assert.strictEqual(HK.syncAction(st(1, 1), st(2, 1)), 'adopt');
  assert.strictEqual(HK.syncAction(st(3, 1), st(2, 1)), 'push');
  assert.strictEqual(HK.syncAction(st(2, 1), st(2, 1)), 'keep');
  assert.strictEqual(HK.syncAction(st(3, 0), st(2, 4)), 'keep');
  assert.strictEqual(HK.syncAction(st(1, 1), null), 'push');
  assert.strictEqual(HK.syncAction(st(0, 0), null), 'keep');
  assert.strictEqual(HK.syncAction(st(1, 1), { updatedAt: 9, items: 'broken' }), 'keep');
});

test('adoptState:同 id 物件就地更新、多出的欄位清掉、新增與刪除照雲端', () => {
  const a = { id: 'a', name: '舊', openedAt: '2026-11-01' }, gone = { id: 'g', name: 'x' };
  const r = HK.adoptState({ items: [a, gone], shopping: [] }, { updatedAt: 5, items: [{ id: 'a', name: '新' }, { id: 'b', name: 'y' }], shopping: [] });
  assert.strictEqual(r.items[0], a);
  assert.deepStrictEqual(a, { id: 'a', name: '新' });
  assert.deepStrictEqual(r.items.map(i => i.id), ['a', 'b']);
  assert.strictEqual(r.updatedAt, 5);
});

test('CSV 匯入:試算表改過的日期格式與民國年', () => {
  const r = HK.parseCSV('名稱,到期日,購買日\n牛奶,2026/12/1,2026/11/20\n醬油,116/3/5,\n怪,12/1/2026,\n怪二,2026/13/1,', '2026-11-26');
  assert.deepStrictEqual(r.items.map(i => i.expiry), ['2026-12-01', '2027-03-05']);
  assert.strictEqual(r.items[0].purchase, '2026-11-20');
  assert.strictEqual(r.skipped, 2);
});

test('CSV 匯入:Big5 與 UTF-8 位元組都能解讀', () => {
  // 「名稱」的 Big5 位元組
  assert.strictEqual(HK.decodeCSV(new Uint8Array([0xa6, 0x57, 0xba, 0xd9])), '名稱');
  assert.strictEqual(HK.decodeCSV(new TextEncoder().encode('名稱,到期日')), '名稱,到期日');
});

test('CSV 匯入:已處理紀錄不重複匯入,處理日保留', () => {
  const mk = () => Object.assign(HK.makeItem({ name: '牛奶', quantity: 1, expiry: '2026-11-10' }, '2026-11-26').item, { done: true, doneAt: new Date(2026, 10, 9, 8).getTime(), outcome: 'used' });
  const csv = HK.toCSV([mk(), mk()], '2026-11-26');
  const fresh = HK.parseCSV(csv, '2026-11-26', []);
  assert.strictEqual(fresh.items.length, 2);
  assert.strictEqual(HK.todayStr(new Date(fresh.items[0].doneAt)), '2026-11-09');
  assert.strictEqual(HK.parseCSV(csv, '2026-11-26', fresh.items).items.length, 0);
  assert.strictEqual(HK.parseCSV(csv, '2026-11-26', [mk()]).items.length, 1);
  const noDay = HK.parseCSV('名稱,到期日,已處理\n蛋,2026-11-01,是', '2026-11-26');
  assert.strictEqual(noDay.items[0].doneAt, null);
});

test('CSV 匯入:同名同位置同到期日的兩批都保留,重複匯入不翻倍', () => {
  const mk = q => HK.makeItem({ name: '優格', quantity: q, expiry: '2026-12-10' }, '2026-11-26').item;
  const csv = HK.toCSV([mk(1), mk(4)], '2026-11-26');
  const fresh = HK.parseCSV(csv, '2026-11-26', []);
  assert.deepStrictEqual(fresh.items.map(i => i.quantity), [1, 4]);
  const again = HK.parseCSV(csv, '2026-11-26', fresh.items);
  assert.strictEqual(again.items.length, 0);
  assert.strictEqual(again.duplicates, 2);
  const one = HK.parseCSV(csv, '2026-11-26', [mk(1)]);
  assert.strictEqual(one.items.length, 1);
  assert.strictEqual(one.duplicates, 1);
});

test('applyEdit:只改備註保留復原冷凍;改到期日才放棄', () => {
  const base = HK.makeItem({ name: '雞肉', category: '肉類', quantity: 1, expiry: '2026-11-28' }, '2026-11-26').item;
  const frozen = HK.freezeItem(base, '2026-11-26').item;
  const next = o => HK.makeItem(Object.assign({}, frozen, o), '2026-11-26', frozen.id).item;
  assert.strictEqual(HK.applyEdit(frozen, next({ notes: '一半' })).locationBeforeFreeze, '冷藏');
  assert.strictEqual(HK.applyEdit(frozen, next({ expiry: '2027-01-01' })).locationBeforeFreeze, undefined);
});

test('applyEdit:開封中手動改到期日,復原開封不蓋掉新日期', () => {
  const base = HK.makeItem({ name: '牛奶', category: '乳製品', quantity: 1, expiry: '2026-12-20' }, '2026-11-26').item;
  const opened = HK.openItem(base, '2026-11-26').item;
  const edited = HK.applyEdit(opened, HK.makeItem(Object.assign({}, opened, { expiry: '2026-12-05' }), '2026-11-26', opened.id).item);
  assert.strictEqual(HK.unopenItem(edited).expiry, '2026-12-05');
});

test('備份還原保留復原冷凍資訊', () => {
  const base = HK.makeItem({ name: '雞肉', category: '肉類', quantity: 1, expiry: '2026-11-28', tempC: 4 }, '2026-11-26').item;
  const frozen = HK.freezeItem(base, '2026-11-26').item;
  const back = HK.parseBackup(HK.exportBackup({ items: [frozen], settings: {} }), '2026-11-26').items[0];
  assert.strictEqual(HK.unfreezeItem(back).location, '冷藏');
  assert.strictEqual(HK.unfreezeItem(back).expiry, '2026-11-28');
});

test('一次新增:行首編號會去掉,小數容量不被截斷', () => {
  const r = HK.parseBulk('1. 牛奶\n2)蘋果\n2.5L鮮奶', '2026-11-26');
  assert.deepStrictEqual(r.items.map(i => i.name), ['牛奶', '蘋果', '2.5L鮮奶']);
});

test('購物清單:只有品名時依紀錄或品名分類,鮮奶不會被估成 30 天', () => {
  assert.deepStrictEqual(HK.shopDefaults('鮮奶', []), { category: '乳製品', location: '冷藏' });
  assert.deepStrictEqual(HK.shopDefaults('神秘物', []), {});
  // 舊清單裡未分類(其他/冷藏)的項目在放入清單時重新判斷
  const old = { name: '鮮奶', category: '其他', location: '冷藏', quantity: 1, bought: true };
  const f = HK.shopToForm(old, '2026-11-26');
  assert.strictEqual(f.category, '乳製品');
  assert.strictEqual(f.expiry, '2026-12-03');
  assert.strictEqual(HK.shopToForm({ name: '吐司', category: '其他', location: '常溫', quantity: 1 }, '2026-11-26').expiry, '2026-11-30');
});

test('購物清單:放入清單沿用上次的保存天數與開封天數', () => {
  const hist = [{ id: 'a', name: '保久乳', category: '乳製品', location: '冷藏', purchase: '2026-05-01', expiry: '2026-10-28', openDays: 7, tempC: 4, createdAt: 1, done: true }];
  const r = HK.shopBoughtToItems([{ id: 's', name: '保久乳', category: '乳製品', location: '冷藏', quantity: 2, bought: true }], '2026-11-26', hist);
  assert.strictEqual(r.items[0].expiry, HK.addDays('2026-11-26', 180));
  assert.strictEqual(r.items[0].openDays, 7);
  assert.strictEqual(r.items[0].estimated, true);
});

test('名稱記憶:忽略上次開封或移到冷凍後改過的位置與到期日', () => {
  const base = HK.makeItem({ name: '雞胸肉', category: '肉類', location: '冷藏', quantity: 1, purchase: '2026-11-01', expiry: '2026-11-04', tempC: 4 }, '2026-11-01').item;
  const frozen = HK.freezeItem(base, '2026-11-02').item;
  const a = HK.recallItem([frozen], '雞胸肉', '2026-11-26');
  assert.strictEqual(a.location, '冷藏');
  assert.strictEqual(a.shelfDays, 3);
  assert.strictEqual(a.tempC, 4);
  const milk = HK.makeItem({ name: '鮮奶', category: '乳製品', location: '冷藏', quantity: 1, purchase: '2026-11-01', expiry: '2026-11-15' }, '2026-11-01').item;
  assert.strictEqual(HK.recallItem([HK.openItem(milk, '2026-11-02').item], '鮮奶', '2026-11-26').shelfDays, 14);
});

test('estimateExpiry:紀錄 > 品名天數 > 類別估算,改類別或位置就換算法', () => {
  const d = '2026-11-26';
  assert.equal(HK.estimateExpiry('雞胸肉', '肉類', '冷藏', d), '2026-11-29');
  assert.equal(HK.estimateExpiry('雞胸肉', '肉類', '冷凍', d), HK.suggestExpiry('肉類', '冷凍', d).date);
  assert.equal(HK.estimateExpiry('牛番茄', '蔬菜', '冷藏', d), HK.suggestExpiry('蔬菜', '冷藏', d).date);
  const old = HK.makeItem({ name: '雞胸肉', category: '肉類', location: '冷藏', quantity: 1, purchase: '2026-11-01', expiry: '2026-11-03' }, d).item;
  assert.equal(HK.estimateExpiry('雞胸肉', '肉類', '冷藏', d, [old]), '2026-11-28');
});

test('guessCategory:台灣常見品名不被單一字誤判', () => {
  const g = n => { const r = HK.guessCategory(n); return `${r.category}/${r.location}`; };
  for (const n of ['山藥', '牛蒡', '牛番茄', '雞腿菇']) assert.equal(g(n), '蔬菜/冷藏', n);
  for (const n of ['藥燉排骨', '藥膳雞']) assert.equal(g(n), '肉類/冷藏', n);
  for (const n of ['肉鬆', '魚鬆', '豬肉乾', '芒果乾', '蝦味先', '牛奶糖', '鳳梨酥', '蛋捲']) assert.equal(g(n), '其他/常溫', n);
  assert.equal(g('蘋果汁'), '飲料/常溫');
  assert.equal(g('魚油'), '藥品/藥箱');
  assert.equal(HK.guessCategory('茶葉蛋').days, 3);
  assert.equal(HK.guessCategory('雞蛋').days, 21);
});

test('parseBulk:緊接英文字母的數字是品名,不是數量', () => {
  const one = t => { const i = HK.parseBulk(t, '2026-11-26').items[0]; return [i.name, i.quantity]; };
  assert.deepEqual(one('維他命B12'), ['維他命B12', 1]);
  assert.deepEqual(one('輔酵素Q10 3瓶'), ['輔酵素Q10', 3]);
  assert.deepEqual(one('B12 x2'), ['B12', 2]);
  assert.deepEqual(one('可樂2'), ['可樂', 2]);
  assert.deepEqual(one('Coke 2'), ['Coke', 2]);
});

test('openOne:數量多於 1 只開封一個,其餘到期日不變;不重複計入常買', () => {
  const d = '2026-11-26';
  const milk = HK.makeItem({ name: '鮮奶', category: '乳製品', location: '冷藏', quantity: 3, expiry: '2026-12-10' }, d, 'm').item;
  const r = HK.openOne(milk, d, 'o');
  assert.deepEqual([r.opened.id, r.opened.quantity, r.opened.expiry, r.opened.openedAt, r.opened.splitFrom], ['o', 1, '2026-12-01', d, 'm']);
  assert.deepEqual([r.rest.id, r.rest.quantity, r.rest.expiry, r.rest.openedAt], ['m', 2, '2026-12-10', null]);
  assert.equal(milk.quantity, 3);
  assert.deepEqual(HK.frequentNames([r.rest, r.opened]), []);
  assert.equal(HK.parseBackup(HK.exportBackup({ items: [r.opened], settings: {} }), d).items[0].splitFrom, 'm');
  const single = HK.openOne(Object.assign({}, milk, { quantity: 1 }), d);
  assert.equal(single.rest, null);
  assert.equal(single.opened.id, 'm');
  assert.equal(HK.openOne(r.opened, d), null);
});

test('另一個分頁的資料:較新才採用,同 id 沿用原物件,壞資料不理', () => {
  const item = { id: 'a', name: '鮮奶', expiry: '2026-12-01', quantity: 2 };
  const cur = { items: [item], shopping: [], updatedAt: 10 };
  const raw = JSON.stringify({ items: [{ id: 'a', name: '鮮奶', expiry: '2026-12-01', quantity: 1 }], shopping: [], updatedAt: 20 });
  assert.equal(HK.fromOtherTab(cur, 'not json'), null);
  assert.equal(HK.fromOtherTab(cur, 'null'), null);
  assert.equal(HK.fromOtherTab(cur, JSON.stringify({ items: [], updatedAt: 10 })), null);
  const next = HK.fromOtherTab(cur, raw);
  assert.equal(next.updatedAt, 20);
  assert.equal(next.items[0], item);
  assert.equal(item.quantity, 1);
});

test('提醒天數:空白或超出範圍時維持原值,0 是有效值', () => {
  assert.equal(HK.reminderDaysFrom('', 5), 5);
  assert.equal(HK.reminderDaysFrom('  ', 5), 5);
  assert.equal(HK.reminderDaysFrom('0', 5), 0);
  assert.equal(HK.reminderDaysFrom('7.4', 5), 7);
  assert.equal(HK.reminderDaysFrom('-1', 5), 5);
  assert.equal(HK.reminderDaysFrom('61', 5), 5);
  assert.equal(HK.reminderDaysFrom('abc', 5), 5);
});

test('CSV 匯出再匯入保留備註(含換行、逗號與公式開頭)', () => {
  const a = HK.makeItem({ name: '果醬', expiry: '2027-01-01', quantity: 1, notes: '阿嬤做的,冰最下層\n開了要快吃' }, '2026-11-27').item;
  const b = HK.makeItem({ name: '藥膏', expiry: '2027-02-01', quantity: 1, notes: '=一天兩次' }, '2026-11-27').item;
  const csv = HK.toCSV([a, b], '2026-11-27');
  assert.ok(csv.includes("'=一天兩次"));
  const r = HK.parseCSV(csv, '2026-11-27');
  assert.deepStrictEqual(r.items.map(i => i.notes), [a.notes, b.notes]);
  assert.strictEqual(HK.parseCSV('名稱,到期日\n米,2027-01-01\n', '2026-11-27').items[0].notes, '');
});

test('想菜色「換一批」把建議過的菜名帶進提示,最多 12 道', () => {
  const list = [{ name: '雞蛋', daysLeft: 1, location: '冷藏' }];
  assert.ok(!HK.recipePrompt(list, '2026-11-27').includes('已經建議過'));
  const seen = Array.from({ length: 15 }, (_, k) => `菜${k + 1}號`);
  const p = HK.recipePrompt(list, '2026-11-27', seen);
  assert.ok(p.includes('菜15號') && p.includes('菜4號') && !p.includes('菜3號'));
});

test('bannerText:沒有快到期時不寫「另有 0 項」,提醒 0 天寫今天到期', () => {
  assert.strictEqual(HK.bannerText(2, 0, 3), '有 2 項已過期,請盡快處理');
  assert.strictEqual(HK.bannerText(2, 1, 3), '有 2 項已過期,另有 1 項快到期,請盡快處理');
  assert.strictEqual(HK.bannerText(0, 3, 3), '有 3 項在 3 天內到期');
  assert.strictEqual(HK.bannerText(0, 1, 0), '有 1 項今天到期');
  assert.strictEqual(HK.bannerText(0, 0, 3), '');
});

test('doneNote:顯示處理日與結果,跨年帶年份,沒有處理日只寫結果', () => {
  const at = s => new Date(s + 'T12:00:00').getTime();
  assert.strictEqual(HK.doneNote({ doneAt: at('2026-10-05'), outcome: 'used' }, T), '10/5 用完');
  assert.strictEqual(HK.doneNote({ doneAt: at('2025-12-31'), outcome: 'wasted' }, T), '2025/12/31 過期才處理');
  assert.strictEqual(HK.doneNote({ doneAt: null }, T), '用完');
});

test('已處理紀錄可改處理結果:applyEdit 保留處理日,統計跟著變;搜尋找得到', () => {
  const base = HK.makeItem({ name: '鮮奶', category: '乳製品', quantity: 1, expiry: '2026-11-20' }, '2026-11-10').item;
  const done = HK.finishItem(base, '2026-11-27', { now: 1000 }).item;
  assert.strictEqual(done.outcome, 'wasted');
  const next = HK.makeItem(Object.assign({}, done), '2026-11-27', done.id).item;
  assert.strictEqual(HK.applyEdit(done, next).outcome, 'wasted'); // 沒改就維持原結果
  const fixed = HK.applyEdit(done, Object.assign(next, { outcome: 'used' }));
  assert.deepStrictEqual([fixed.done, fixed.doneAt, fixed.outcome], [true, 1000, 'used']);
  assert.strictEqual(HK.stats([fixed], '2026-11-27').wasted, 0);
  assert.strictEqual(HK.filterItems([fixed], { query: '鮮' }).length, 1);
});

test('存檔失敗依原因說明,行事曆檔被擋要講清楚', () => {
  assert.match(HK.saveErrorText('declined', 'a.json'), /已取消/);
  assert.match(HK.saveErrorText('rejected_extension', 'housekeeper-expiry.ics'), /行事曆檔/);
  assert.doesNotMatch(HK.saveErrorText('rejected_extension', 'a.csv'), /行事曆/);
  assert.match(HK.saveErrorText('unavailable', 'a.json'), /無法下載/);
  assert.match(HK.saveErrorText(undefined), /沒有儲存成功/);
});

test('雲端容量:快滿與超過上限時的同步訊息', () => {
  assert.equal(HK.cloudBytes({ a: '中' }), Buffer.byteLength(JSON.stringify({ a: '中' })));
  assert.equal(HK.cloudLevel(1000), 'ok');
  assert.equal(HK.cloudLevel(HK.CLOUD_LIMIT * 0.9), 'near');
  assert.equal(HK.cloudLevel(HK.CLOUD_LIMIT + 1), 'over');
  assert.equal(HK.syncText(true, 10), '已同步到雲端');
  assert.match(HK.syncText(true, HK.CLOUD_LIMIT * 0.9), /快滿/);
  assert.match(HK.syncText(false, HK.CLOUD_LIMIT + 1), /存不下/);
  assert.match(HK.syncText(false, 10), /同步失敗/);
});

test('guessCategory:熟食即食品給短天數,名字帶菜、茶、鹽、酒的不再誤判', () => {
  const g = HK.guessCategory;
  for (const n of ['飯糰', '雞腿便當', '鮪魚三明治', '壽司']) assert.deepStrictEqual(g(n), { category: '其他', location: '冷藏', days: 1 }, n);
  for (const n of ['剩菜', '滷味', '味噌湯']) assert.strictEqual(g(n).days, 3, n);
  assert.strictEqual(g('茶碗蒸').location, '冷藏');
  for (const n of ['番茄醬', '沙茶醬', '料理米酒', '滷味包', '壽司醋']) assert.strictEqual(g(n).category, '調味料', n);
  for (const n of ['生理食鹽水', '酒精', 'OK繃']) assert.strictEqual(g(n).category, '藥品', n);
  assert.strictEqual(g('蘋果西打').category, '飲料');
  assert.strictEqual(g('無酒精啤酒').category, '飲料');
  assert.strictEqual(g('便當盒').category, '日用品');
  assert.strictEqual(g('沙拉油').category, '調味料');
  assert.strictEqual(g('番茄').category, '蔬菜');
  assert.strictEqual(g('紫菜').location, '常溫');
});

test('parseBulk:有效期限標籤、民國年、8 位數、括號、號、日期後接數量', () => {
  const one = s => HK.parseBulk(s, '2026-11-28').items[0];
  for (const s of ['鮮奶 有效期限:12/3', '鮮奶 保存期限12/3', '鮮奶 到期日 12/3', '鮮奶(12/3)', '鮮奶 12/3前', '鮮奶 12月3號', '鮮奶 115/12/3', '鮮奶 民國115年12月3日', '鮮奶 20261203', '鮮奶 exp 2026.12.03']) {
    const i = one(s);
    assert.ok(i, s); assert.deepStrictEqual([i.name, i.expiry, i.quantity, i.estimated], ['鮮奶', '2026-12-03', 1, false], s);
  }
  for (const s of ['鮮奶 12/3 x2', '鮮奶 12/3 2瓶', '鮮奶x2 (12/3)', '鮮奶 2瓶 12/3']) {
    const i = one(s);
    assert.deepStrictEqual([i.name, i.expiry, i.quantity], ['鮮奶', '2026-12-03', 2], s);
  }
  assert.strictEqual(one('可樂 1.5L').name, '可樂 1.5L');
  assert.strictEqual(one('維他命B12').quantity, 1);
  assert.strictEqual(one('雞蛋 10').quantity, 10);
  assert.deepStrictEqual(HK.parseBulk('鮮奶 2/30', '2026-11-28').items, []);
});

test('shortDay:同年省略年份', () => {
  assert.strictEqual(HK.shortDay('2026-12-03', '2026-11-28'), '12/3');
  assert.strictEqual(HK.shortDay('2027-01-05', '2026-11-28'), '2027/1/5');
});

test('parseBulk:同名但到期日或位置不同分開記,完全相同才合併', () => {
  const r = HK.parseBulk('鮮奶 12/10\n鮮奶 11/30\n鮮奶 11/30\n雞胸肉 @冷凍\n雞胸肉', '2026-11-28');
  assert.deepStrictEqual(r.items.map(i => [i.name, i.quantity, i.location, i.estimated ? '' : i.expiry]),
    [['鮮奶', 1, '冷藏', '2026-12-10'], ['鮮奶', 2, '冷藏', '2026-11-30'], ['雞胸肉', 1, '冷凍', ''], ['雞胸肉', 1, '冷藏', '']]);
});

test('parseBulk:中文數量與寫在前面的數量', () => {
  const one = s => { const i = HK.parseBulk(s, '2026-11-28').items[0]; return [i.name, i.quantity]; };
  for (const [s, name, q] of [['鮮奶兩瓶', '鮮奶', 2], ['雞蛋 一盒', '雞蛋', 1], ['兩瓶鮮奶', '鮮奶', 2], ['2盒雞蛋', '雞蛋', 2],
    ['十二顆蘋果', '蘋果', 12], ['蘋果二十顆', '蘋果', 20], ['牙刷三支', '牙刷', 3], ['一把青菜', '青菜', 1], ['三顆蛋', '蛋', 3], ['兩個便當 @冷凍', '便當', 2], ['B12兩瓶', 'B12', 2]])
    assert.deepStrictEqual(one(s), [name, q], s);
});

test('parseBulk:中文數量可與日期並用', () => {
  for (const s of ['鮮奶兩瓶 12/3', '鮮奶 12/3 兩瓶', '兩瓶鮮奶 12/3']) {
    const i = HK.parseBulk(s, '2026-11-28').items[0];
    assert.deepStrictEqual([i.name, i.quantity, i.expiry], ['鮮奶', 2, '2026-12-03'], s);
  }
});

test('parseBulk:帶中文數字的品名不當成數量', () => {
  for (const s of ['三明治', '五花肉', '九層塔', '四季豆', '百香果', '一條根貼布', '四個月寶寶米餅', '五片裝面膜', '三合一咖啡', '兩百片', '第一包', '3入組衛生紙', '2條根', '三支雨傘標友露安', '十全十美'])
    assert.deepStrictEqual(HK.parseBulk(s, '2026-11-28').items.map(i => [i.name, i.quantity]), [[s, 1]], s);
  const x = HK.parseBulk('三入組衛生紙 x2', '2026-11-28').items[0];
  assert.deepStrictEqual([x.name, x.quantity], ['三入組衛生紙', 2]);
});

test('parseBulk:認不出類別又沒寫日期的列在 unknown', () => {
  const r = HK.parseBulk('神祕東西\n鮮奶\n某某物 12/3\n怪東西 @冷凍', '2026-11-28');
  assert.deepStrictEqual(r.items.filter(i => r.unknown.has(i.id)).map(i => i.name), ['神祕東西', '怪東西']);
});

test('常見台灣品名分類:易混詞與先前認不出的品名', () => {
  const g = n => { const r = HK.guessCategory(n); return r ? `${r.category}/${r.location}` : null; };
  const want = {
    '調味料/常溫': ['豆腐乳', '巧克力醬', '辣椒醬', '椰子油', '干貝醬', '煉乳'],
    '乳製品/冷藏': ['巧克力牛奶', '調味乳'],
    '藥品/藥箱': ['膠原蛋白', '維生素C', 'B群', '鈣片', '鼻噴劑'],
    '其他/冷藏': ['滴雞精'],
    '其他/常溫': ['喉糖', '口香糖', '豬肉紙', '香瓜子', '蛋黃酥', '芋頭酥', '麵線', '燕麥', '穀片'],
    '保養品/櫃子': ['漱口水', '口紅', '粉底液'],
    '日用品/櫃子': ['衛生棉', '尿布', '洗手乳', '香皂', '牙刷', '保鮮膜', '棉花棒'],
    '肉類/冷藏': ['蚵仔', '牡蠣', '干貝', '小卷', '熱狗', '臘腸', '蚵仔麵線'],
    '水果/冷藏': ['蓮霧', '百香果', '釋迦', '哈密瓜', '香瓜', '香水檸檬'],
    '蔬菜/冷藏': ['九層塔', '甜椒', '辣椒', '芋頭'],
    '飲料/常溫': ['舒跑', '椰奶', '高粱', '燕麥奶'],
  };
  for (const [k, names] of Object.entries(want)) for (const n of names) assert.strictEqual(g(n), k, n);
});

test('購物清單放入庫存:認不出類別的品名要標示暫估', () => {
  assert.strictEqual(HK.shopToForm(HK.makeShopItem({ name: '神祕商品' }), T).rough, true);
  assert.strictEqual(HK.shopToForm(HK.makeShopItem({ name: '鮮奶' }), T).rough, false);
  const old = HK.makeItem({ name: '神祕商品', category: '其他', location: '冷藏', quantity: 1, purchase: T, expiry: HK.addDays(T, 9) }, T).item;
  assert.strictEqual(HK.shopToForm(HK.makeShopItem({ name: '神祕商品' }), T, [old]).rough, false);
  const list = ['神祕商品', '鮮奶', '另一個怪東西', '第三個怪東西'].map(name => HK.makeShopItem({ name, bought: true }));
  const r = HK.shopBoughtToItems(list, T);
  assert.deepStrictEqual(r.rough, ['神祕商品', '另一個怪東西', '第三個怪東西']);
  assert.match(HK.shopPutText(4, r.rough), /認不出類別:神祕商品、另一個怪東西 等 3 項/);
  assert.strictEqual(HK.shopPutText(2, []), '已放入 2 項(到期日為估算)');
});

test('canFreeze:不建議冷凍帶殼蛋、罐頭、乾貨、生菜瓜果等;熟食、麵包、一般食材仍可', () => {
  const mk = (name, category, location) => ({ name, category, location, expiry: '2026-11-29', quantity: 1 });
  const check = name => { const g = HK.guessCategory(name) || { category: '其他', location: '冷藏' }; return HK.canFreeze(mk(name, g.category, g.location)); };
  for (const n of ['雞蛋', '洗選蛋', '茶葉蛋', '皮蛋', '鮪魚罐頭', '玉米罐頭', '泡麵', '餅乾', '生菜', '小黃瓜', '西瓜', '馬鈴薯', '白蘿蔔', '高麗菜', '優格', '布丁', '鮮奶油', '寵物飼料', '白米', '感冒藥'])
    assert.strictEqual(check(n), false, n);
  for (const n of ['雞胸肉', '鮮奶', '起司', '青江菜', '紅蘿蔔', '胡蘿蔔', '蘿蔔糕', '香蕉', '豆腐', '吐司', '饅頭', '蛋糕', '蛋餅', '剩菜', '便當'])
    assert.strictEqual(check(n), true, n);
  // 使用者把肉放常溫(多半是耐放包裝)、其他類放櫃子:不提供
  assert.strictEqual(HK.canFreeze(mk('肉乾禮盒', '肉類', '常溫')), false);
  assert.strictEqual(HK.canFreeze(mk('神祕東西', '其他', '櫃子')), false);
  const r = HK.freezeSoon([mk('雞蛋', '其他', '冷藏'), mk('雞胸肉', '肉類', '冷藏')], '2026-11-28');
  assert.deepEqual(r.changed.map(i => i.name), ['雞胸肉']);
});

test('freezeText:列出品名,超過三項縮寫', () => {
  const it = n => ({ name: n });
  assert.strictEqual(HK.freezeText([it('雞胸肉'), it('鮮奶')]), '已移到冷凍:「雞胸肉」、「鮮奶」(到期日為估算)');
  assert.strictEqual(HK.freezeText(['a', 'b', 'c', 'd'].map(it)), '已移到冷凍:「a」、「b」、「c」 等 4 項(到期日為估算)');
});
