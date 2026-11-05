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
  // 牛奶種類快速選項:鮮奶(冷藏、開封 5 天)、保久乳(預設冷藏、未開封也可常溫;開封後 7 天)。天數為保守估計,以包裝為準
  const MILK_TYPES = { 鮮奶: { location: '冷藏', shelf: 7, openDays: 5 }, 保久乳: { location: '冷藏', shelf: 180, openDays: 7 } };
  function milkPreset(type, purchase) {
    const m = MILK_TYPES[type]; if (!m) return null;
    return { name: type, category: '乳製品', location: m.location, openDays: m.openDays, expiry: addDays(purchase, m.shelf), estimated: true };
  }
  function unopenItem(item) {
    if (!item.openedAt) return item;
    const r = Object.assign({}, item, { expiry: item.expiryBeforeOpen || item.expiry }); delete r.openedAt; delete r.expiryBeforeOpen; return r;
  }

  // 移到冷凍:保守的冷凍保存天數(僅供估算)。已過期、已處理、已開封、已在冷凍或不適用的類別回傳 null
  const FREEZE_DAYS = { 肉類: 90, 蔬菜: 120, 水果: 120, 乳製品: 30, 其他: 60 };
  function freezeItem(item, today) {
    const days = FREEZE_DAYS[item.category];
    if (!days || item.done || item.openedAt || item.location === '冷凍' || daysLeft(item.expiry, today) < 0) return null;
    const expiry = addDays(today, days);
    return { days, item: Object.assign({}, item, { location: '冷凍', tempC: -18, expiryBeforeFreeze: item.expiry, locationBeforeFreeze: item.location, tempCBeforeFreeze: item.tempC, expiry: expiry > item.expiry ? expiry : item.expiry, estimated: true }) };
  }
  function unfreezeItem(item) {
    if (!item.locationBeforeFreeze) return item;
    const r = Object.assign({}, item, { location: item.locationBeforeFreeze, tempC: item.tempCBeforeFreeze === undefined ? null : item.tempCBeforeFreeze, expiry: item.expiryBeforeFreeze || item.expiry });
    delete r.locationBeforeFreeze; delete r.expiryBeforeFreeze; delete r.tempCBeforeFreeze; return r;
  }

  // 一鍵冷凍:未過期、距今 within 天內到期且可冷凍的物品。回傳 { items, changed(原始快照) }
  function freezeSoon(items, today, within = 2) {
    const changed = [], out = items.map(i => {
      if (i.done || daysLeft(i.expiry, today) > within) return i;
      const r = freezeItem(i, today); if (!r) return i;
      changed.push(i); return r.item;
    });
    return { items: out, changed };
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

  const SORTS = { expiry: '到期日', name: '名稱', added: '最近新增' };
  function sortItems(items, mode) {
    if (mode === 'name') return [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant') || (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0));
    if (mode === 'added') return [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.name.localeCompare(b.name));
    return sortByExpiry(items);
  }

  function filterItems(items, { location = '', query = '', status: st = '', today: t = null } = {}) {
    const q = query.trim().toLowerCase();
    return items.filter(i => (!location || i.location === location) && (!st || !t || status(daysLeft(i.expiry, t)) === st) && (!q || i.name.toLowerCase().includes(q) || i.category.includes(q) || (i.notes || '').toLowerCase().includes(q)));
  }

  function summarize(items, today) {
    const s = { expired: 0, urgent: 0, soon: 0, ok: 0 };
    for (const i of items) if (!i.done) s[status(daysLeft(i.expiry, today))]++;
    return s;
  }

  // 分頁標題:已過期 + 快到期(urgent)的數量放在前面,例如「(3) housekeeper」;0 項時維持原名
  function titleFor(s, base = 'housekeeper') { const n = (s.expired || 0) + (s.urgent || 0); return n > 0 ? `(${n > 99 ? '99+' : n}) ${base}` : base; }


  // ---- 已處理紀錄:依處理時間新到舊排序(無 doneAt 者排後面、依到期日新到舊);清除 N 天前的舊紀錄 ----
  function sortDone(items) {
    return items.slice().sort((a, b) => {
      const x = Number.isFinite(a.doneAt) ? a.doneAt : -Infinity, y = Number.isFinite(b.doneAt) ? b.doneAt : -Infinity;
      if (x !== y) return y - x;
      return String(b.expiry).localeCompare(String(a.expiry));
    });
  }
  // 只清有 doneAt 且早於 today 往前 days 天的已處理項目;沒有 doneAt 的舊資料與未處理者一律保留
  function pruneDone(items, days, today) {
    const cutoff = parseDay(addDays(today, -days)); const kept = [], removed = [];
    for (const i of items) {
      const old = i.done && Number.isFinite(i.doneAt) && parseDay(todayStr(new Date(i.doneAt))) < cutoff;
      (old ? removed : kept).push(i);
    }
    return { kept, removed };
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
    // 最常浪費的品項(同名合併,忽略大小寫,至多 5 筆)
    const wm = new Map();
    for (const i of done.filter(x => x.outcome === 'wasted')) { const k = String(i.name).trim().toLowerCase(), e = wm.get(k) || { name: String(i.name).trim(), count: 0 }; e.count++; wm.set(k, e); }
    const topWasted = [...wm.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name)).slice(0, 5);
    // 最近 4 週(含本週,每週 7 天,以處理時間 doneAt 換算成台灣當地日期的天數差)
    const weeks = [0, 1, 2, 3].map(n => ({ weeksAgo: 3 - n, used: 0, wasted: 0 }));
    for (const i of done) {
      if (!Number.isFinite(i.doneAt)) continue;
      const ago = daysLeft(todayStr(new Date(i.doneAt)), today) * -1, w = Math.floor(ago / 7);
      if (ago < 0 || w > 3) continue;
      weeks[3 - w][i.outcome === 'wasted' ? 'wasted' : 'used']++;
    }
    // 連續幾天沒有浪費:自最近一次 wasted 的處理日起算;從沒浪費過則自最早一筆處理日起算(無處理紀錄 → null)
    const dayOf = i => todayStr(new Date(i.doneAt));
    const stamped = done.filter(i => Number.isFinite(i.doneAt));
    let cleanDays = null;
    if (stamped.length) {
      const bad = stamped.filter(i => i.outcome === 'wasted').map(dayOf).sort().pop();
      const first = stamped.map(dayOf).sort()[0];
      cleanDays = Math.max(0, daysLeft(bad || first, today) * -1);
    }
    return { cleanDays, lastWasted: stamped.some(i => i.outcome === 'wasted'), topWasted, weeks, activeCount: active.length, doneCount: done.length, wasted, used: done.length - wasted,
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

  // 已買好的購物清單項目一次放入庫存(到期日依類別估算,標為估算);回傳新物品與剩餘清單
  function shopBoughtToItems(shopping, today) {
    const items = [], rest = [], moved = [];
    for (const s of shopping || []) {
      if (!s.bought) { rest.push(s); continue; }
      const r = makeItem(shopToForm(s, today), today);
      if (r.item) { items.push(r.item); moved.push(s); } else rest.push(s);
    }
    return { items, shopping: rest, moved };
  }

  // ---- 文字分享:快到期清單、購物清單(可貼到 LINE / 備忘錄)----
  const STATUS_TAG = { expired: '已過期', urgent: '快到期', soon: '一週內', ok: '安全' };
  function expiringText(items, today, days = 7) {
    const rows = items.filter(i => !i.done && daysLeft(i.expiry, today) !== null && daysLeft(i.expiry, today) <= days)
      .sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.name.localeCompare(b.name)));
    if (!rows.length) return '';
    const lines = rows.map(i => { const d = daysLeft(i.expiry, today), w = d < 0 ? `過期 ${-d} 天` : d === 0 ? '今天到期' : `${d} 天後到期`;
      return `・${i.name}${i.quantity > 1 ? ' ×' + i.quantity : ''}(${i.location},${i.expiry}${i.estimated ? ' 估算' : ''},${w})`; });
    return `【${today} 快到期清單】\n${lines.join('\n')}`;
  }
  function shoppingText(list) {
    const todo = (list || []).filter(x => !x.bought); if (!todo.length) return '';
    const out = ['【購物清單】'];
    for (const g of groupShopping(todo)) { out.push(g.category); for (const x of g.items) out.push(`□ ${x.name}${x.quantity > 1 ? ' ×' + x.quantity : ''}`); }
    return out.join('\n');
  }

  // ---- CSV 匯出(Excel/Google 試算表可開;加 BOM 避免中文亂碼;開頭為 = + - @ 的欄位加單引號防公式注入)----
  function toCSV(items, today) {
    const q = v => { let s = v == null ? '' : String(v); if (typeof v !== 'number' && /^[=+\-@\t\r]/.test(s)) s = "'" + s; return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
    const rows = [['名稱', '類別', '位置', '數量', '購買日', '到期日', '剩餘天數', '狀態', '到期日為估算', '已處理', '處理結果']];
    for (const i of items) {
      const d = daysLeft(i.expiry, today);
      rows.push([i.name, i.category, i.location, i.quantity, i.purchase || '', i.expiry || '', d === null ? '' : d, i.done ? '已處理' : (STATUS_TAG[status(d)] || ''), i.estimated ? '是' : '', i.done ? '是' : '', i.done ? (i.outcome === 'wasted' ? '浪費' : '用完') : '']);
    }
    return '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  // ---- CSV 匯入:讀回 toCSV 匯出的格式(或自製試算表,至少要有「名稱」「到期日」欄);逐列驗證、與現有同名同位置同到期日者略過 ----
  function parseCSVRows(text) {
    const rows = []; let row = [], cur = '', inQ = false;
    const s = String(text).replace(/^﻿/, '');
    for (let k = 0; k < s.length; k++) {
      const c = s[k];
      if (inQ) { if (c === '"') { if (s[k + 1] === '"') { cur += '"'; k++; } else inQ = false; } else cur += c; }
      else if (c === '"') inQ = true;
      else if (c === ',') { row.push(cur); cur = ''; }
      else if (c === '\n' || c === '\r') { if (c === '\r' && s[k + 1] === '\n') k++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
      else cur += c;
    }
    row.push(cur); if (row.some(x => x !== '')) rows.push(row);
    return rows;
  }
  function parseCSV(text, today, existing = []) {
    const rows = parseCSVRows(text);
    if (!rows.length) return { ok: false, error: '檔案是空的', items: [], skipped: 0, duplicates: 0 };
    const head = rows[0].map(h => h.trim()), col = n => head.indexOf(n);
    if (col('名稱') < 0 || col('到期日') < 0) return { ok: false, error: '這不像是 housekeeper 的 CSV(需要「名稱」和「到期日」欄)', items: [], skipped: 0, duplicates: 0 };
    const get = (r, n) => { const k = col(n); return k < 0 ? '' : String(r[k] || '').replace(/^'(?=[=+\-@\t\r])/, '').trim(); };
    const seen = new Set(existing.filter(i => !i.done).map(i => [i.name, i.location, i.expiry].join('|')));
    const items = []; let skipped = 0, duplicates = 0;
    for (const r of rows.slice(1).slice(0, 2000)) {
      const done = get(r, '已處理') === '是';
      const res = makeItem({ name: get(r, '名稱'), category: get(r, '類別'), location: get(r, '位置'), quantity: get(r, '數量') || 1, purchase: get(r, '購買日') || today, expiry: get(r, '到期日'), estimated: get(r, '到期日為估算') === '是' }, today);
      if (!res.item) { skipped++; continue; }
      const key = [res.item.name, res.item.location, res.item.expiry].join('|');
      if (!done && seen.has(key)) { duplicates++; continue; }
      seen.add(key);
      if (done) { res.item.done = true; res.item.doneAt = Date.now(); res.item.outcome = get(r, '處理結果') === '浪費' ? 'wasted' : 'used'; }
      items.push(res.item);
    }
    return { ok: true, items, skipped, duplicates };
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
  // 日期合理性(軟提醒,不擋存檔):到期日早於購買日、已過期超過一年(可能年份打錯)、距今超過 5 年
  function dateWarnings(item, today) {
    const w = [], e = parseDay(item.expiry), p = parseDay(item.purchase), t = parseDay(today);
    if (e === null || t === null) return w;
    const d = Math.round((e - t) / 86400000);
    if (p !== null && e < p) w.push('到期日早於購買日');
    if (d < -365) w.push('到期日已是一年多前,年份是否打錯');
    if (d > 365 * 5) w.push('到期日超過 5 年後,年份是否打錯');
    return w;
  }

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

  // 批次處理已過期物品:回傳 { items: 新陣列, changed: 被處理的原物品快照(供復原) };全部記為 wasted
  function finishExpired(items, today, now = Date.now(), outcome = 'wasted') {
    const changed = [];
    const out = items.map(i => {
      if (i.done || daysLeft(i.expiry, today) === null || daysLeft(i.expiry, today) >= 0) return i;
      changed.push(i); const d = finishItem(i, today, { now }).item; return outcome === 'used' ? Object.assign({}, d, { outcome: 'used' }) : d;
    });
    return { items: out, changed };
  }
  // 備份提醒:至少 5 項物品,且距上次備份(沒備份過則距首次使用/上次按「稍後」)超過 days 天
  function backupDue(lastBackup, since, count, today, days = 30) {
    if (count < 5) return false;
    const ref = parseDay(lastBackup) ? lastBackup : since;
    if (!parseDay(ref)) return false;
    return daysLeft(ref, today) <= -days;
  }
  function removeItem(items, id) { return items.filter(i => i.id !== id); }
  function removeShopping(list, pred) { const removed = []; const out = []; list.forEach((x, i) => { if (pred(x)) removed.push({ item: x, idx: i }); else out.push(x); }); return { shopping: out, removed }; }
  function restoreShopping(list, removed) { const a = list.slice(); for (const r of removed) { if (a.some(x => x.id === r.item.id)) continue; a.splice(Math.max(0, Math.min(r.idx, a.length)), 0, r.item); } return a; }
  function reinsertItem(items, item, idx) { if (items.some(i => i.id === item.id)) return items; const a = items.slice(); a.splice(Math.max(0, Math.min(idx, a.length)), 0, item); return a; }
  function restoreItems(items, snapshots) { const m = new Map(snapshots.map(i => [i.id, i])); return items.map(i => m.get(i.id) || i); }

  // 常用名稱(含已處理的),最近新增的在前,去重(忽略大小寫與空白)
  function knownNames(items, limit = 50, shopping = []) {
    const seen = new Set(), out = [];
    const sh = (shopping || []).map(x => ({ name: x.name, createdAt: x.addedAt }));
    for (const i of [...(items || []), ...sh].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))) {
      const k = String(i.name || '').replace(/\s+/g, '').toLowerCase(); if (!k || seen.has(k)) continue;
      seen.add(k); out.push(i.name); if (out.length >= limit) break;
    }
    return out;
  }
  // 最常買的名稱:依出現次數(同次數取最近新增),忽略大小寫與空白;至少出現 minCount 次
  function frequentNames(items, limit = 6, minCount = 2) {
    const m = new Map();
    for (const i of items || []) {
      const k = String(i.name || '').replace(/\s+/g, '').toLowerCase(); if (!k) continue;
      const e = m.get(k) || { name: i.name, n: 0, last: 0 }; e.n++;
      if ((i.createdAt || 0) >= e.last) { e.last = i.createdAt || 0; e.name = i.name; } m.set(k, e);
    }
    return [...m.values()].filter(e => e.n >= minCount).sort((a, b) => b.n - a.n || b.last - a.last).slice(0, limit).map(e => e.name);
  }
  // 購物清單快選:常買品名中,目前沒有「待買」同名項目、且庫存裡沒有未處理同名物品者
  function shopSuggestions(items, shopping, limit = 6) {
    const k = s => String(s || '').replace(/\s+/g, '').toLowerCase();
    const pending = new Set((shopping || []).filter(x => !x.bought).map(x => k(x.name)));
    const stocked = new Set((items || []).filter(i => !i.doneAt && !i.done).map(i => k(i.name)));
    return frequentNames(items, 50).filter(n => !pending.has(k(n)) && !stocked.has(k(n))).slice(0, limit);
  }
  // 依過去同名物品預填:類別、位置、溫度、開封天數,以及「上次從購買到期的天數」套到今天(標為估算)
  function recallItem(items, name, today, shopping = []) {
    const k = s => String(s || '').replace(/\s+/g, '').toLowerCase(), n = k(name); if (!n) return null;
    const hit = [...(items || [])].filter(i => k(i.name) === n).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    if (!hit) {
      const sh = (shopping || []).filter(x => k(x.name) === n).sort((a, b) => (b.addedAt || 0) - (a.addedAt || 0))[0];
      return sh ? { name: sh.name, category: sh.category, location: sh.location, quantity: sh.quantity || 1, tempC: '', openDays: '', shelfDays: null, expiry: null } : null;
    }
    const span = daysLeft(hit.expiry, hit.purchase), ok = span !== null && span >= 1 && span <= 3650;
    return { name: hit.name, category: hit.category, location: hit.location, quantity: hit.quantity || 1, tempC: hit.tempC === null || hit.tempC === undefined ? '' : hit.tempC,
      openDays: hit.openDays || '', shelfDays: ok ? span : null, expiry: ok ? addDays(today, span) : null };
  }

  // 依品名關鍵字猜類別與常見存放位置(新增物品時的建議,使用者可改)。找不到回傳 null。
  const NAME_HINTS = [
    // 容易被後面的字誤判的詞放最前面(例:雞蛋含「雞」、牛油果含「牛」、豬油含「豬」)
    ['水果', '冷藏', ['牛油果', '酪梨', '火龍果', '雞蛋果']],
    ['調味料', '常溫', ['豬油', '牛油', '雞粉', '雞精', '花生油', '沙拉油', '魚露', '蠔油', '蝦醬', '豆瓣', '牛肉醬', '雞湯塊']],
    ['其他', '冷凍', ['水餃', '餛飩', '湯圓', '冰淇淋', '冰棒', '雪糕', '冷凍食品', '鍋貼']],
    ['蔬菜', '冷藏', ['豆腐', '豆干', '豆皮', '豆包'], 5],
    ['其他', '冷藏', ['鮮麵', '生麵', '麵條', '餃子皮', '餛飩皮', '年糕', '粿'], 5],
    ['其他', '冷藏', ['蛋糕', '泡芙', '蛋塔'], 3],
    ['其他', '冷藏', ['蛋'], 21],
    ['其他', '常溫', ['麵包', '吐司', '土司', '貝果', '饅頭', '包子'], 4],
    ['其他', '常溫', ['泡麵', '餅乾', '零食', '罐頭', '洋芋片', '麥片', '糙米', '白米', '米粉', '冬粉', '義大利麵', '堅果', '海苔']],
    ['藥品', '藥箱', ['藥', '感冒', '止痛', '維他命', '益生菌', '眼藥', '消炎', '貼布', '口罩']],
    ['保養品', '櫃子', ['洗面乳', '乳液', '面膜', '精華', '防曬', '化妝水', '卸妝', '護手霜', '洗髮', '沐浴', '牙膏']],
    ['日用品', '櫃子', ['衛生紙', '洗衣', '洗碗', '洗潔', '電池', '垃圾袋', '漂白', '柔軟精']],
    // 以下為保守的冷藏天數估計(參考 USDA FoodKeeper 的一般範圍,以包裝與食材狀態為準);要放在同類別的一般列之前
    ['蔬菜', '冷藏', ['泡菜', '榨菜', '醃菜'], 30],
    ['乳製品', '冷藏', ['鮮奶油'], 10],
    ['乳製品', '冷藏', ['牛奶', '鮮奶'], 7],
    ['乳製品', '冷藏', ['優格', '優酪'], 10],
    ['肉類', '冷藏', ['絞肉', '肉末', '魚', '蝦', '蟹', '花枝', '透抽', '蛤', '海鮮', '鮭'], 2],
    ['肉類', '冷藏', ['雞', '豬', '牛排', '羊', '鴨', '排骨', '肉片', '肉絲'], 3],
    ['水果', '冷藏', ['草莓', '藍莓', '葡萄', '荔枝'], 5],
    ['蔬菜', '冷藏', ['高麗菜', '白菜', '蘿蔔', '馬鈴薯', '洋蔥', '南瓜', '地瓜', '玉米', '花椰'], 10],
    ['蔬菜', '冷藏', ['青江菜', '菠菜', '空心菜', '小白菜', '地瓜葉', '萵苣', '生菜', '芹菜', '韭菜', '豆芽', '菜'], 4],
    ['乳製品', '冷藏', ['牛奶', '鮮奶', '優格', '優酪', '起司', '乳酪', '奶油', '鮮奶油', '保久乳', '布丁']],
    ['肉類', '冷藏', ['雞', '豬', '牛', '羊', '鴨', '肉', '排骨', '火腿', '香腸', '培根', '魚', '蝦', '蟹', '花枝', '透抽', '蛤', '海鮮', '鮭']],
    ['水果', '冷藏', ['蘋果', '香蕉', '葡萄', '芭樂', '柳丁', '橘', '柑', '西瓜', '木瓜', '芒果', '鳳梨', '草莓', '藍莓', '奇異果', '檸檬', '梨', '桃', '李', '柚', '荔枝', '水果']],
    ['蔬菜', '冷藏', ['菜', '蔥', '蒜', '薑', '菇', '蘿蔔', '番茄', '蕃茄', '黃瓜', '小黃瓜', '玉米', '地瓜', '馬鈴薯', '洋蔥', '高麗', '花椰', '青椒', '茄子', '豆芽', '南瓜', '絲瓜', '豆腐']],
    ['飲料', '常溫', ['茶', '咖啡', '汽水', '可樂', '果汁', '豆漿', '氣泡水', '礦泉水', '運動飲料', '啤酒', '酒']],
    ['調味料', '常溫', ['醬油', '醋', '鹽', '糖', '油', '醬', '胡椒', '味噌', '味醂', '麻油', '香料', '咖哩', '高湯']],
  ];
  function guessCategory(name) {
    const n = String(name || '').replace(/\s+/g, ''); if (!n) return null;
    if (/^冷凍|冷凍$/.test(n) && n.length > 2) { // 「冷凍雞胸肉」→ 肉類放冷凍;猜不到類別則歸其他
      const g = guessCategory(n.replace(/冷凍/g, '')); return { category: g ? g.category : '其他', location: '冷凍' };
    }
    for (const [category, location, words, days] of NAME_HINTS) if (words.some(w => n.includes(w))) return days ? { category, location, days } : { category, location };
    return null;
  }

  // 一次新增多項:每行(或以逗號、頓號分隔)一個品名,可加數量(「鮮奶 x2」「雞蛋 2盒」);
  // 依品名猜類別/位置/保存天數,全部標為估算。同名會合併數量。回傳 { items, skipped }
  // 「11/20」「11月20日」「2026-11-20」→ YYYY-MM-DD;沒寫年份時取今天起 30 天前以後的最近一次
  function bulkDate(y, mo, d, today) {
    const tt = parseDay(today); if (tt === null) return null;
    if (y) { const s = `${y}-${pad(+mo)}-${pad(+d)}`; return parseDay(s) !== null ? s : null; }
    const yr = new Date(tt).getUTCFullYear();
    for (const yy of [yr, yr + 1]) { const s = `${yy}-${pad(+mo)}-${pad(+d)}`, t = parseDay(s); if (t !== null && t >= tt - 30 * 86400000) return s; }
    return null;
  }
  function parseBulk(text, today) {
    const parts = String(text || '').split(/[\n\r,，、;；]+/), map = new Map(), skipped = [];
    for (let raw of parts) {
      raw = raw.replace(/^[\s\-•*·●\d]+[.)、]\s*/, '').replace(/^[\s\-•*·●]+/, '').trim(); if (!raw) continue;
      let qty = 1, name = raw, m, given = null, forceLoc = null;
      const lm = name.match(/\s*[@＠]\s*(冷藏|冷凍|常溫|櫃子|藥箱)\s*/);
      if (lm) { forceLoc = lm[1]; name = (name.slice(0, lm.index) + ' ' + name.slice(lm.index + lm[0].length)).trim(); }
      const dm = name.match(/^(.*?)\s*(?:到期|exp\.?)?\s*(?:(\d{4})[-\/.])?(\d{1,2})[-\/.月](\d{1,2})日?$/i);
      if (dm && dm[1].trim()) { const d = bulkDate(dm[2], dm[3], dm[4], today); if (d) { given = d; name = dm[1]; } }
      if ((m = name.match(/^(.*?)\s*[x×*X]\s*(\d{1,4})\s*[^\s\d]{0,2}$/))) { name = m[1]; qty = +m[2]; }
      else if ((m = name.match(/^(.*?\D)\s*(\d{1,2})\s*(個|瓶|包|盒|顆|條|片|袋|罐|盒|組|入)?$/))) { name = m[1]; qty = +m[2]; }
      name = name.trim();
      if (!name || /[\d]\s*[\/.\-:]\s*$|[\/.\-:]$/.test(name) || name.length > 40 || !(qty >= 1 && qty <= 99)) { skipped.push(raw); continue; }
      const key = name.replace(/\s+/g, '').toLowerCase(), prev = map.get(key);
      if (prev) { prev.quantity = Math.min(99, prev.quantity + qty); continue; }
      let g = guessCategory(name) || { category: '其他', location: '冷藏' };
      if (forceLoc && forceLoc !== g.location) g = { category: g.category, location: forceLoc };
      const loc = LOCATIONS.find(l => l.name === g.location);
      const exp = given || (g.days ? addDays(today, g.days) : suggestExpiry(g.category, g.location, today).date);
      const r = makeItem({ name, category: g.category, location: g.location, quantity: qty, purchase: today, expiry: exp, estimated: !given, tempC: loc && loc.tempC !== null ? loc.tempC : '' }, today);
      if (r.item) map.set(key, r.item); else skipped.push(raw);
      if (map.size >= 50) break;
    }
    return { items: [...map.values()], skipped };
  }

  // ---- 快到期食材想菜色(需 sample 能力;只送品名與剩餘天數,不送其他資料) ----
  const FOOD_CATS = ['蔬菜', '水果', '肉類', '乳製品', '其他'];
  function recipeCandidates(items, today, within = 3, max = 8) {
    const seen = new Set(), out = [];
    for (const i of items.filter(x => !x.done && FOOD_CATS.includes(x.category) && x.location !== '藥箱' && x.location !== '櫃子')
      .map(x => ({ x, d: daysLeft(x.expiry, today) })).filter(o => o.d >= 0 && o.d <= within).sort((a, b) => a.d - b.d)) {
      const k = String(i.x.name).trim().toLowerCase(); if (!k || seen.has(k)) continue; seen.add(k);
      out.push({ name: String(i.x.name).trim().slice(0, 20), daysLeft: i.d, location: i.x.location });
      if (out.length >= max) break;
    }
    return out;
  }
  function recipePrompt(list, today) {
    const lines = list.map(c => `- ${c.name}(${c.daysLeft === 0 ? '今天到期' : c.daysLeft + ' 天後到期'},放${c.location})`).join('\n');
    return `你是台灣家庭的料理助手。以下食材快到期,請想 3 道簡單家常菜,盡量一次用掉越多越好,其他只可再用常見調味料與家裡一定有的基本食材(油、鹽、醬油、蛋、米)。今天是 ${today}。
${lines}
只回傳 JSON 陣列,不要其他文字:[{"title": 菜名(繁體中文,最多 16 字), "uses": 用到上面清單中的食材名稱陣列, "minutes": 預估分鐘數(整數), "how": 做法一兩句話(最多 80 字)}]
食材若已有異味或外觀不對請不要建議食用;不要編造清單以外的食材當主料。`;
  }
  function parseRecipes(raw, list) {
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.recipes) ? raw.recipes : null); if (!arr) return [];
    const names = new Set(list.map(c => c.name)); const out = [];
    for (const r of arr) {
      if (!r || typeof r !== 'object') continue;
      const title = typeof r.title === 'string' ? r.title.trim().slice(0, 30) : '', how = typeof r.how === 'string' ? r.how.trim().slice(0, 160) : '';
      if (!title || !how) continue;
      const uses = (Array.isArray(r.uses) ? r.uses : []).filter(u => typeof u === 'string' && names.has(u.trim())).map(u => u.trim());
      if (!uses.length) continue;
      const m = Math.round(Number(r.minutes));
      out.push({ title, uses: [...new Set(uses)], minutes: m >= 1 && m <= 240 ? m : null, how });
      if (out.length >= 5) break;
    }
    return out;
  }

  // 範例資料(使用者按「載入範例」才會加入)
  function sampleItems(today) {
    const mk = (name, category, location, quantity, off, estimated = false) => makeItem({ name, category, location, quantity, expiry: addDays(today, off), purchase: addDays(today, -3), estimated, tempC: location === '冷藏' ? 4 : location === '冷凍' ? -18 : '' }, today).item;
    return [mk('鮮奶', '乳製品', '冷藏', 2, 2), mk('雞胸肉', '肉類', '冷凍', 3, 45, true), mk('青江菜', '蔬菜', '冷藏', 1, -1, true),
      mk('優格', '乳製品', '冷藏', 4, 6), mk('感冒藥水', '藥品', '藥箱', 1, 120), mk('洗面乳', '保養品', '櫃子', 1, 300), mk('橄欖油', '調味料', '常溫', 1, 200)];
  }

  const api = { CATEGORIES, LOCATIONS, SHELF_DAYS, todayStr, fmtDate, parseDay, addDays, addMonths, daysLeft, status, suggestExpiry, makeItem, sortByExpiry, SORTS, sortItems, filterItems, summarize, titleFor, sortDone, pruneDone, pickNewer, toICS, stats, exportBackup, parseBackup, mergeItems, makeShopItem, addShopping, sortShopping, groupShopping, shopToForm, shopBoughtToItems, expiringText, shoppingText, toCSV, parseCSV, dateWarnings, backupDue, findDuplicate, knownNames, frequentNames, shopSuggestions, recallItem, guessCategory, parseBulk, finishItem, finishExpired, restoreItems, removeItem, reinsertItem, removeShopping, restoreShopping, MILK_TYPES, milkPreset, OPENED_DAYS, openedDays, okOpenDays, openItem, unopenItem, freezeItem, freezeSoon, unfreezeItem, FREEZE_DAYS, scanPrompt, parseScan, recipeCandidates, recipePrompt, parseRecipes, sampleItems, newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.HK = api;
})();
