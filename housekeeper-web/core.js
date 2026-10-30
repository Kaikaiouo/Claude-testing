// housekeeper 網頁版核心邏輯(無 DOM,可在 Node 測試)。
// 對應 iOS 版的 Item.swift:類別、位置、剩餘天數、狀態顏色。
(function () {
  const CATEGORIES = ['蔬菜', '水果', '肉類', '乳製品', '飲料', '調味料', '藥品', '保養品', '日用品', '其他'];
  const LOCATIONS = [
    { name: '冷藏', tempC: 4 }, { name: '冷凍', tempC: -18 }, { name: '常溫', tempC: null },
    { name: '櫃子', tempC: null }, { name: '藥箱', tempC: null },
  ];

  // 估算保存天數(包裝沒有標示時的粗略值,使用者可修改):[類別][位置] -> 天數,'*' 為預設
  const SHELF_DAYS = {
    蔬菜: { 冷藏: 5, 冷凍: 240, '*': 3 }, 水果: { 冷藏: 7, 冷凍: 240, '*': 4 },
    肉類: { 冷藏: 3, 冷凍: 90, '*': 1 }, 乳製品: { 冷藏: 7, 冷凍: 60, '*': 2 },
    飲料: { 冷藏: 14, '*': 180 }, 調味料: { 冷藏: 180, '*': 365 },
    藥品: { '*': 365 }, 保養品: { '*': 365 }, 日用品: { '*': 365 }, 其他: { 冷凍: 90, '*': 30 },
  };

  const pad = n => String(n).padStart(2, '0');
  const fmtDate = d => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; // 本地日期
  const todayStr = (now = new Date()) => fmtDate(now);

  function parseDay(s) {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(s || '');
    if (!m) return null;
    const t = Date.UTC(+m[1], +m[2] - 1, +m[3]), d = new Date(t);
    return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? t : null;
  }
  function addDays(s, n) {
    const t = parseDay(s); if (t === null) return null;
    const d = new Date(t + n * 86400000);
    return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  }
  function addMonths(s, n) {
    const t = parseDay(s); if (t === null) return null;
    const d = new Date(t), y = d.getUTCFullYear(), mo = d.getUTCMonth() + n, day = d.getUTCDate();
    const lastDay = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
    const r = new Date(Date.UTC(y, mo, Math.min(day, lastDay)));
    return `${r.getUTCFullYear()}-${pad(r.getUTCMonth() + 1)}-${pad(r.getUTCDate())}`;
  }

  // 距離到期還有幾天(今天到期 = 0,已過期為負)
  function daysLeft(expiry, today) {
    const a = parseDay(expiry), b = parseDay(today);
    return a === null || b === null ? null : Math.round((a - b) / 86400000);
  }

  // 狀態分級:expired 已過期、urgent 3 天內(含今天)、soon 7 天內、ok 安全
  function status(days) {
    if (days === null) return 'ok';
    return days < 0 ? 'expired' : days <= 3 ? 'urgent' : days <= 7 ? 'soon' : 'ok';
  }

  function suggestExpiry(category, location, purchase) {
    const t = SHELF_DAYS[category] || SHELF_DAYS['其他'];
    const days = t[location] !== undefined ? t[location] : t['*'];
    return { date: addDays(purchase, days), days };
  }

  // 開封後建議的保守保存天數(冷藏/常溫;冷凍與無明確規則的類別為 null)。僅供估算,以包裝標示為準。
  const OPENED_DAYS = { 乳製品: 5, 飲料: 7, 調味料: 90, 肉類: 2, 蔬菜: 3, 水果: 3, 藥品: 30, 保養品: 180 };
  // custom:該物品自訂的開封後天數(例如保久乳 7 天),優先於類別預設,且冷凍也適用
  const okOpenDays = v => { const n = Math.round(Number(v)); return v !== '' && v !== null && v !== undefined && n >= 1 && n <= 365 ? n : null; };
  function openedDays(category, location, custom) { return okOpenDays(custom) || (location === '冷凍' ? null : (OPENED_DAYS[category] || null)); }
  // 標示開封:到期日只會提前、不會延後;回傳 { item, changed, days } 或 null(不適用/已開封)
  function openItem(item, today) {
    const days = openedDays(item.category, item.location, item.openDays);
    if (!days || item.done || item.openedAt) return null;
    const cap = addDays(today, days), changed = cap < item.expiry;
    return { days, changed, item: Object.assign({}, item, { openedAt: today, expiryBeforeOpen: item.expiry, expiry: changed ? cap : item.expiry, estimated: changed ? true : item.estimated }) };
  }
  // 牛奶種類快速選項:鮮奶(冷藏、開封 5 天)、保久乳(常溫可放、開封後冷藏 7 天)。天數為保守估計,以包裝為準
  const MILK_TYPES = { 鮮奶: { location: '冷藏', shelf: 7, openDays: 5 }, 保久乳: { location: '常溫', shelf: 180, openDays: 7 } };
  function milkPreset(type, purchase) {
    const m = MILK_TYPES[type]; if (!m) return null;
    return { name: type, category: '乳製品', location: m.location, openDays: m.openDays, expiry: addDays(purchase, m.shelf), estimated: true };
  }
  function unopenItem(item) {
    if (!item.openedAt) return item;
    const r = Object.assign({}, item, { expiry: item.expiryBeforeOpen || item.expiry }); delete r.openedAt; delete r.expiryBeforeOpen; return r;
  }

  function newId() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 8); }

  // 驗證並正規化表單資料;回傳 { item, errors }
  function makeItem(f, today, id) {
    const errors = [];
    const name = String(f.name || '').trim();
    if (!name) errors.push('請輸入物品名稱');
    if (name.length > 40) errors.push('名稱最多 40 字');
    const qty = Math.round(Number(f.quantity));
    if (!(qty >= 1 && qty <= 99)) errors.push('數量需介於 1 到 99');
    if (parseDay(f.expiry) === null) errors.push('請填寫有效的到期日');
    const purchase = f.purchase || today;
    if (parseDay(purchase) === null) errors.push('購買日格式錯誤');
    if (f.mfg && parseDay(f.mfg) === null) errors.push('製造日期格式錯誤');
    if (f.mfg && parseDay(f.expiry) !== null && parseDay(f.mfg) > parseDay(f.expiry)) errors.push('製造日期不能晚於到期日');
    let temp = f.tempC === '' || f.tempC === null || f.tempC === undefined ? null : Number(f.tempC);
    if (temp !== null && !(temp >= -50 && temp <= 60)) errors.push('存放溫度需介於 -50 到 60 °C');
    if (errors.length) return { item: null, errors };
    return {
      errors, item: {
        id: id || newId(), name, category: CATEGORIES.includes(f.category) ? f.category : '其他',
        location: LOCATIONS.some(l => l.name === f.location) ? f.location : '冷藏', quantity: qty,
        mfg: f.mfg || null, expiry: f.expiry, estimated: !!f.estimated, purchase, tempC: temp,
        notes: String(f.notes || '').slice(0, 300), openDays: okOpenDays(f.openDays), openedAt: parseDay(f.openedAt) !== null ? f.openedAt : null, expiryBeforeOpen: parseDay(f.expiryBeforeOpen) !== null ? f.expiryBeforeOpen : null, done: false, doneAt: null, createdAt: Date.now(),
      },
    };
  }

  const sortByExpiry = items => [...items].sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.name.localeCompare(b.name)));

  function filterItems(items, { location = '', query = '' } = {}) {
    const q = query.trim().toLowerCase();
    return items.filter(i => (!location || i.location === location) && (!q || i.name.toLowerCase().includes(q) || i.category.includes(q) || (i.notes || '').toLowerCase().includes(q)));
  }

  function summarize(items, today) {
    const s = { expired: 0, urgent: 0, soon: 0, ok: 0 };
    for (const i of items) if (!i.done) s[status(daysLeft(i.expiry, today))]++;
    return s;
  }

  // 兩邊狀態合併:updatedAt 較新者勝(用於本機與雲端同步)
  function pickNewer(local, remote) {
    if (!remote) return local;
    if (!local) return remote;
    return (remote.updatedAt || 0) > (local.updatedAt || 0) ? remote : local;
  }

  // ---- iCalendar 匯出:每個未處理物品一個全天事件 + 提前提醒 ----
  const icsEscape = s => String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  function fold(line) {
    const enc = new TextEncoder(); let out = '', cur = '', bytes = 0, first = true;
    for (const ch of line) {
      const n = enc.encode(ch).length, limit = first ? 73 : 72;
      if (bytes + n > limit) { out += cur + '\r\n '; cur = ''; bytes = 0; first = false; }
      cur += ch; bytes += n;
    }
    return out + cur;
  }
  function toICS(items, { reminderDays = 3, reminderHour = 9, now = new Date() } = {}) {
    const stamp = `${now.getUTCFullYear()}${pad(now.getUTCMonth() + 1)}${pad(now.getUTCDate())}T${pad(now.getUTCHours())}${pad(now.getUTCMinutes())}${pad(now.getUTCSeconds())}Z`;
    const minutes = reminderDays * 1440 - reminderHour * 60; // 事件從 00:00 開始,提醒落在「前 n 天的 H 點」
    const trigger = minutes > 0 ? `-PT${minutes}M` : `PT${-minutes}M`;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//housekeeper//TW//', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH'];
    for (const i of items) {
      if (i.done || parseDay(i.expiry) === null) continue;
      const d = i.expiry.replace(/-/g, ''), e = addDays(i.expiry, 1).replace(/-/g, '');
      lines.push('BEGIN:VEVENT', `UID:${i.id}@housekeeper`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${e}`,
        `SUMMARY:${icsEscape(`${i.name} 到期`)}`,
        `DESCRIPTION:${icsEscape(`${i.category}・${i.location}・數量 ${i.quantity}${i.notes ? '\n' + i.notes : ''}`)}`,
        'BEGIN:VALARM', 'ACTION:DISPLAY', `DESCRIPTION:${icsEscape(`${i.name} 即將到期`)}`, `TRIGGER:${trigger}`, 'END:VALARM', 'END:VEVENT');
    }
    lines.push('END:VCALENDAR');
    return lines.map(fold).join('\r\n') + '\r\n';
  }

  // ---- 統計:處理結果以「處理當下是否已過期」判定(過期才吃完/丟掉 = 浪費)----
  function stats(items, today) {
    const active = items.filter(i => !i.done), done = items.filter(i => i.done);
    const wasted = done.filter(i => i.outcome === 'wasted').length;
    const byCategory = {};
    for (const i of active) byCategory[i.category] = (byCategory[i.category] || 0) + (i.quantity || 1);
    const cats = Object.entries(byCategory).map(([name, count]) => ({ name, count })).sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
    return { activeCount: active.length, doneCount: done.length, wasted, used: done.length - wasted,
      wasteRate: done.length ? wasted / done.length : null, categories: cats,
      expiredNow: active.filter(i => daysLeft(i.expiry, today) < 0).length };
  }

  // ---- 購物清單:吃完的物品可加入補貨;未買的同名項目合併數量 ----
  function makeShopItem(f, id, now = Date.now()) {
    const name = String(f.name || '').trim().slice(0, 40);
    if (!name) return null;
    const qty = Math.round(Number(f.quantity));
    return { id: id || newId(), name, category: CATEGORIES.includes(f.category) ? f.category : '其他',
      location: LOCATIONS.some(l => l.name === f.location) ? f.location : '冷藏',
      quantity: qty >= 1 && qty <= 99 ? qty : 1, bought: !!f.bought, addedAt: Number.isFinite(f.addedAt) ? f.addedAt : now };
  }
  // 回傳新陣列;同名(忽略大小寫)且尚未買的項目合併數量(上限 99)
  function addShopping(list, f, now = Date.now()) {
    const it = makeShopItem(f, undefined, now); if (!it) return { list, added: null, merged: false };
    const key = it.name.toLowerCase(), hit = list.find(x => !x.bought && x.name.toLowerCase() === key);
    if (hit) return { list: list.map(x => (x === hit ? Object.assign({}, x, { quantity: Math.min(99, x.quantity + it.quantity) }) : x)), added: hit, merged: true };
    return { list: [...list, it], added: it, merged: false };
  }
  // 未買的在前(新加入的在上),已買的在後
  const sortShopping = list => [...list].sort((a, b) => (a.bought - b.bought) || (b.addedAt - a.addedAt));
  // 依類別分組(類別順序同 CATEGORIES,未知類別放最後);組內未買在前。全部已買的組排到後面
  function groupShopping(list) {
    const map = new Map();
    for (const x of sortShopping(list)) { const k = CATEGORIES.includes(x.category) ? x.category : '其他'; if (!map.has(k)) map.set(k, []); map.get(k).push(x); }
    const idx = k => { const i = CATEGORIES.indexOf(k); return i < 0 ? 999 : i; };
    return [...map.entries()].map(([category, items]) => ({ category, items, pending: items.filter(i => !i.bought).length }))
      .sort((a, b) => ((a.pending === 0) - (b.pending === 0)) || (idx(a.category) - idx(b.category)));
  }
  // 買好後轉成物品表單的預填值(到期日用類別估算,標為估算)
  function shopToForm(s, today) {
    const r = suggestExpiry(s.category, s.location, today), l = LOCATIONS.find(x => x.name === s.location);
    return { name: s.name, category: s.category, location: s.location, quantity: s.quantity, purchase: today, expiry: r.date, estimated: true, tempC: l && l.tempC !== null ? l.tempC : '' };
  }

  // ---- JSON 備份:匯出/匯入,匯入時逐筆驗證,壞資料略過並回報 ----
  function exportBackup(state, now = Date.now()) {
    return JSON.stringify({ app: 'housekeeper', version: 1, exportedAt: now, settings: state.settings, items: state.items, shopping: state.shopping || [] }, null, 2);
  }
  function parseBackup(text, today) {
    let data; try { data = JSON.parse(text); } catch (e) { return { ok: false, error: '檔案不是有效的 JSON', items: [], skipped: 0 }; }
    if (!data || data.app !== 'housekeeper' || !Array.isArray(data.items)) return { ok: false, error: '這不是 housekeeper 的備份檔', items: [], skipped: 0 };
    const items = []; let skipped = 0;
    for (const raw of data.items) {
      const r = raw && typeof raw === 'object' ? makeItem(raw, today, typeof raw.id === 'string' && raw.id ? raw.id.slice(0, 40) : undefined) : { item: null };
      if (!r.item) { skipped++; continue; }
      r.item.done = !!raw.done; r.item.doneAt = raw.done && Number.isFinite(raw.doneAt) ? raw.doneAt : null;
      r.item.createdAt = Number.isFinite(raw.createdAt) ? raw.createdAt : r.item.createdAt;
      if (raw.done && (raw.outcome === 'wasted' || raw.outcome === 'used')) r.item.outcome = raw.outcome;
      items.push(r.item);
    }
    const s = data.settings || {}, d = Math.round(Number(s.reminderDays)), h = Math.round(Number(s.reminderHour));
    const shopping = (Array.isArray(data.shopping) ? data.shopping : []).map(x => (x && typeof x === 'object' ? makeShopItem(x, typeof x.id === 'string' && x.id ? x.id.slice(0, 40) : undefined) : null)).filter(Boolean);
    return { ok: true, items, skipped, shopping, settings: { reminderDays: d >= 0 && d <= 60 ? d : 3, reminderHour: h >= 0 && h <= 23 ? h : 9 } };
  }
  // 匯入合併:同 id 以匯入檔為準,其餘保留
  function mergeItems(current, incoming) {
    const map = new Map(current.map(i => [i.id, i]));
    for (const i of incoming) map.set(i.id, i);
    return [...map.values()];
  }

  // ---- 拍照辨識:組 prompt、驗證 Claude 回傳的 JSON(不信任輸入,逐欄檢查)----
  function scanPrompt(today) {
    return `你是家庭物品到期管理的助手。圖片是食品、藥品或日用品的包裝照片。請讀出資訊,只回傳一個 JSON 物件,不要其他文字:
{"name": 品名(繁體中文,最多 20 字,不含品牌廣告詞), "category": 從 ${CATEGORIES.join('、')} 擇一, "location": 建議存放位置,從 ${LOCATIONS.map(l => l.name).join('、')} 擇一, "expiry": 包裝上印的有效日期/保存期限,格式 YYYY-MM-DD,看不到就填 null, "mfg": 製造日期 YYYY-MM-DD 或 null, "quantity": 圖中同樣的商品數量(整數,預設 1)}
今天是 ${today}。民國年請換算成西元;只有年月時取該月最後一天。看不清楚的欄位填 null,不要猜測日期。`;
  }
  function parseScan(raw, today) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
    const name = typeof raw.name === 'string' ? raw.name.trim().slice(0, 40) : '';
    if (!name) return null;
    const category = CATEGORIES.includes(raw.category) ? raw.category : '其他';
    const loc = LOCATIONS.some(l => l.name === raw.location) ? raw.location : '冷藏';
    const q = Math.round(Number(raw.quantity));
    const okDay = v => (typeof v === 'string' && parseDay(v) !== null ? v : null);
    let expiry = okDay(raw.expiry), mfg = okDay(raw.mfg);
    if (mfg && expiry && mfg > expiry) mfg = null;
    let estimated = false;
    if (!expiry) { expiry = suggestExpiry(category, loc, today).date; estimated = true; }
    const l = LOCATIONS.find(x => x.name === loc);
    return { name, category, location: loc, quantity: q >= 1 && q <= 99 ? q : 1, expiry, mfg: mfg || '', purchase: today, estimated, readDate: !estimated, tempC: l && l.tempC !== null ? l.tempC : '' };
  }

  // 新增時偵測重複:同名(忽略空白與大小寫)、未處理、同位置的物品
  function findDuplicate(items, name, location) {
    const k = s => String(s || '').replace(/\s+/g, '').toLowerCase(), n = k(name);
    if (!n) return null;
    return (items || []).find(i => !i.done && k(i.name) === n && i.location === location) || null;
  }

  // 處理物品:all=false 且數量>1 時只用掉一個(數量減 1,仍留在清單);否則整筆標記已處理並記錄 outcome
  function finishItem(item, today, { all = true, now = Date.now() } = {}) {
    if (!all && item.quantity > 1) return { item: Object.assign({}, item, { quantity: item.quantity - 1 }), done: false };
    const wasted = daysLeft(item.expiry, today) < 0;
    return { item: Object.assign({}, item, { done: true, doneAt: now, outcome: wasted ? 'wasted' : 'used' }), done: true };
  }

  // 範例資料(使用者按「載入範例」才會加入)
  function sampleItems(today) {
    const mk = (name, category, location, quantity, off, estimated = false) => makeItem({ name, category, location, quantity, expiry: addDays(today, off), purchase: addDays(today, -3), estimated, tempC: location === '冷藏' ? 4 : location === '冷凍' ? -18 : '' }, today).item;
    return [mk('鮮奶', '乳製品', '冷藏', 2, 2), mk('雞胸肉', '肉類', '冷凍', 3, 45, true), mk('青江菜', '蔬菜', '冷藏', 1, -1, true),
      mk('優格', '乳製品', '冷藏', 4, 6), mk('感冒藥水', '藥品', '藥箱', 1, 120), mk('洗面乳', '保養品', '櫃子', 1, 300), mk('橄欖油', '調味料', '常溫', 1, 200)];
  }

  const api = { CATEGORIES, LOCATIONS, SHELF_DAYS, todayStr, fmtDate, parseDay, addDays, addMonths, daysLeft, status, suggestExpiry, makeItem, sortByExpiry, filterItems, summarize, pickNewer, toICS, stats, exportBackup, parseBackup, mergeItems, makeShopItem, addShopping, sortShopping, groupShopping, shopToForm, findDuplicate, finishItem, MILK_TYPES, milkPreset, OPENED_DAYS, openedDays, okOpenDays, openItem, unopenItem, scanPrompt, parseScan, sampleItems, newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.HK = api;
})();
