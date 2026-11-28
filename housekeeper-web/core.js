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
  // 數量多於 1 時只開封其中 1 個:拆成「開封的 1 個」與「沒開的其餘」,其餘到期日不變。
  // splitFrom 讓「常買」統計不會把拆出來的那個算成又買一次。回傳 { opened, rest(數量 1 時為 null), changed, days } 或 null
  function openOne(item, today, id) {
    const r = openItem(item, today); if (!r) return null;
    if (!(item.quantity > 1)) return { opened: r.item, rest: null, changed: r.changed, days: r.days };
    return { opened: Object.assign(r.item, { id: id || newId(), quantity: 1, splitFrom: item.id }), rest: Object.assign({}, item, { quantity: item.quantity - 1 }), changed: r.changed, days: r.days };
  }
  function unopenItem(item) {
    if (!item.openedAt) return item;
    const r = Object.assign({}, item, { expiry: item.expiryBeforeOpen || item.expiry }); delete r.openedAt; delete r.expiryBeforeOpen; return r;
  }

  // 移到冷凍:保守的冷凍保存天數(僅供估算)。已過期、已處理、已開封、已在冷凍或不適用的類別回傳 null
  const FREEZE_DAYS = { 肉類: 90, 蔬菜: 120, 水果: 120, 乳製品: 30, 其他: 60 };
  // 品名看得出不適合直接冷凍:帶殼蛋與熟蛋、罐頭、乾貨零食、冷凍後會出水變質的生菜/瓜果/根莖與乳品甜點
  // (生菜、黃瓜、蘿蔔、芹菜、生高麗菜、熟馬鈴薯、熟蛋、酸奶油、卡士達、美乃滋:K-State Extension「Foods that Do Not Freeze Well」)
  const NO_FREEZE = /蛋(?![糕餅塔捲黃麵餃果])|罐頭|罐裝|泡麵|餅乾|洋芋片|零食|生菜|萵苣|沙拉|黃瓜|西瓜|芹菜|豆芽|(?<![胡紅])蘿蔔(?!糕)|高麗菜|馬鈴薯|優格|優酪|養樂多|乳酸|酸奶|布丁|鮮奶油|美乃滋|涼麵|茶碗蒸|豆花|愛玉|仙草|飼料/;
  const BREAD = /麵包|吐司|土司|貝果|饅頭|包子/;
  // 「其他」類什麼都有:只有冷藏中的(熟食、剩菜等)和麵包類才提供;肉與乳製品不在冷藏的多半是耐放包裝品,也不提供
  function canFreeze(item) {
    const name = String(item.name || ''), at = item.location;
    if (!FREEZE_DAYS[item.category] || at === '冷凍' || at === '藥箱' || NO_FREEZE.test(name)) return false;
    if (item.category === '其他') return at === '冷藏' || BREAD.test(name);
    return !['肉類', '乳製品'].includes(item.category) || at === '冷藏';
  }
  function freezeItem(item, today) {
    const days = FREEZE_DAYS[item.category];
    if (!canFreeze(item) || item.done || item.openedAt || daysLeft(item.expiry, today) < 0) return null;
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

  // 一鍵冷凍後的提示:列出品名,使用者才知道要把哪幾樣實際拿去冷凍
  function freezeText(changed) {
    const names = changed.slice(0, 3).map(i => `「${i.name}」`).join('、');
    return `已移到冷凍:${names}${changed.length > 3 ? ` 等 ${changed.length} 項` : ''}(到期日為估算)`;
  }

  // 讀入本機/雲端資料時的防呆:丟掉壞掉的項目(非物件、缺名稱或日期無效),避免整頁畫面壞掉
  function cleanState(s) {
    if (!s || typeof s !== 'object' || !Array.isArray(s.items)) return null;
    const ok = i => i && typeof i === 'object' && typeof i.id === 'string' && typeof i.name === 'string' && i.name && parseDay(i.expiry) !== null;
    const items = s.items.filter(ok).map(i => Object.assign({ quantity: 1, category: '其他', location: '冷藏', done: false }, i));
    return { state: Object.assign({}, s, { items, shopping: Array.isArray(s.shopping) ? s.shopping.filter(x => x && typeof x === 'object' && typeof x.name === 'string') : [] }), dropped: s.items.length - items.length };
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

  // 編輯表單儲存:next 是 makeItem 的結果。處理狀態與建立時間沿用舊的;
  // 位置或到期日有改才放棄「復原冷凍」;開封中的物品若手動改了到期日,「復原開封」不可蓋掉新日期
  function applyEdit(old, next) {
    const r = Object.assign({}, old, next, { done: old.done, doneAt: old.doneAt, createdAt: old.createdAt });
    if (next.location !== old.location || next.expiry !== old.expiry) { delete r.locationBeforeFreeze; delete r.expiryBeforeFreeze; delete r.tempCBeforeFreeze; }
    if (r.openedAt && next.expiry !== old.expiry) r.expiryBeforeOpen = next.expiry;
    return r;
  }

  const sortByExpiry = items => [...items].sort((a, b) => (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : a.name.localeCompare(b.name)));

  const SORTS = { expiry: '到期日', name: '名稱', added: '最近新增' };
  function sortItems(items, mode) {
    if (mode === 'name') return [...items].sort((a, b) => a.name.localeCompare(b.name, 'zh-Hant') || (a.expiry < b.expiry ? -1 : a.expiry > b.expiry ? 1 : 0));
    if (mode === 'added') return [...items].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0) || a.name.localeCompare(b.name));
    return sortByExpiry(items);
  }

  function filterItems(items, { location = '', query = '', status: st = '', today: t = null, expiry = '' } = {}) {
    const q = query.trim().toLowerCase();
    return items.filter(i => (!location || i.location === location) && (!st || !t || status(daysLeft(i.expiry, t)) === st) && (!expiry || i.expiry === expiry) && (!q || i.name.toLowerCase().includes(q) || i.category.includes(q) || (i.notes || '').toLowerCase().includes(q)));
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

  // 收到雲端資料時該做什麼:'adopt' 採用雲端、'push' 把本機較新的資料補傳、'keep' 不動
  // 本機是空的、雲端有資料時不自動覆蓋(新裝置可能只動過設定),寧可保守
  function syncAction(local, remote) {
    const size = s => ((s && s.items) || []).length + ((s && s.shopping) || []).length;
    if (!remote) return local && local.updatedAt ? 'push' : 'keep';
    const r = remote.updatedAt || 0, l = (local && local.updatedAt) || 0;
    if (r > l) return cleanState(remote) ? 'adopt' : 'keep';
    return l > r && (size(local) || !size(remote)) ? 'push' : 'keep';
  }
  // 採用雲端資料,但同 id 的物件沿用原本那一個(就地更新),讓開著的表單與「復原」鈕仍指向清單裡的物品
  function adoptState(current, incoming) {
    const reuse = (olds, news) => {
      const m = new Map((olds || []).map(x => [x.id, x]));
      return (news || []).map(n => {
        const o = m.get(n.id); if (!o) return n;
        m.delete(n.id); for (const k of Object.keys(o)) delete o[k];
        return Object.assign(o, n);
      });
    };
    return Object.assign({}, incoming, { items: reuse(current.items, incoming.items), shopping: reuse(current.shopping, incoming.shopping) });
  }

  // 同一裝置開了兩個分頁:另一個分頁寫入 localStorage 的原始字串比目前新才採用,否則回傳 null
  function fromOtherTab(current, raw) {
    let s; try { s = JSON.parse(raw); } catch (e) { return null; }
    const c = cleanState(s);
    return c && (c.state.updatedAt || 0) > ((current && current.updatedAt) || 0) ? adoptState(current, c.state) : null;
  }

  // 設定欄位的「提前幾天提醒」:空白或超出 0~60 時維持原值(空白字串轉數字是 0,不可直接用)
  function reminderDaysFrom(value, fallback) {
    const n = String(value).trim() === '' ? NaN : Math.round(Number(value));
    return n >= 0 && n <= 60 ? n : fallback;
  }

  // ---- 存檔失敗的說明:Artifact 的 downloads 能力以 code 區分原因 ----
  function saveErrorText(code, name = '') {
    if (code === 'declined') return '已取消,沒有儲存。';
    if (code === 'rate_limited') return '沒有儲存:請先處理跳出的儲存視窗,或稍等一下再試。';
    if (code === 'rejected_extension' || code === 'extension_not_enabled') return /\.ics$/.test(name)
      ? '這個頁面不能下載行事曆檔(.ics)。打開本頁時上方仍會提醒,也可以用下面的「複製清單」貼到行事曆或備忘錄。'
      : '沒有儲存:這個頁面不開放下載這種檔案。';
    if (['unavailable', 'host_unavailable', 'not_granted', 'capability_disabled', 'capability_removed', 'transform_error'].includes(code)) return '沒有儲存:這裡無法下載檔案,請改用瀏覽器開啟本頁再試。';
    return '沒有儲存成功,請再試一次。';
  }

  // ---- 雲端容量:整份清單存成一個 db 文件,上限 256 KiB;快滿時提醒清舊紀錄 ----
  const CLOUD_LIMIT = 256 * 1024;
  const cloudBytes = state => new TextEncoder().encode(JSON.stringify(state)).length;
  const cloudLevel = bytes => (bytes > CLOUD_LIMIT ? 'over' : bytes > CLOUD_LIMIT * 0.8 ? 'near' : 'ok');
  function syncText(ok, bytes) {
    const level = cloudLevel(bytes);
    if (ok) return level === 'ok' ? '已同步到雲端' : '已同步到雲端,但容量快滿了:建議備份後清除舊的「已處理」紀錄';
    return level === 'over' ? '資料太多,雲端存不下(仍保存在這個裝置):請備份後清除舊的「已處理」紀錄' : '雲端同步失敗,資料仍保存在這個裝置';
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

  // 提醒橫幅文字:expired 已過期筆數、soon 在提醒天數內(未過期)筆數;沒有要提醒的回傳空字串
  // 「12/3」;跨年份才帶年
  function shortDay(day, today) {
    const [y, m, d] = String(day).split('-').map(Number);
    return `${String(day).slice(0, 4) === String(today).slice(0, 4) ? '' : y + '/'}${m}/${d}`;
  }

  function bannerText(expired, soon, days) {
    const within = days > 0 ? `在 ${days} 天內到期` : '今天到期';
    if (expired) return `有 ${expired} 項已過期${soon ? `,另有 ${soon} 項快到期` : ''},請盡快處理`;
    return soon ? `有 ${soon} 項${within}` : '';
  }
  // 已處理列的說明:何時處理、算不算浪費(與統計同口徑:沒有 outcome 的舊資料算用完)
  function doneNote(item, today) {
    const what = item.outcome === 'wasted' ? '過期才處理' : '用完';
    if (!Number.isFinite(item.doneAt)) return what;
    const [y, m, d] = todayStr(new Date(item.doneAt)).split('-').map(Number);
    return `${y === Number(String(today).slice(0, 4)) ? '' : y + '/'}${m}/${d} ${what}`;
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
  // 只有品名時(手動輸入、常買快選)的類別/位置:先看以前的紀錄,再依品名猜;都沒有回傳 {}
  function shopDefaults(name, items) {
    const g = recallItem(items, name, '') || guessCategory(name);
    return g ? { category: g.category, location: g.location } : {};
  }
  // 依品名、類別、位置估算到期日:上次同樣類別與位置的保存天數 > 品名專屬天數 > 類別估算
  function estimateExpiry(name, category, location, purchase, items = []) {
    const h = recallItem(items, name, purchase);
    if (h && h.expiry && h.category === category && h.location === location) return h.expiry;
    const g = guessCategory(name);
    return g && g.days && g.category === category && g.location === location ? addDays(purchase, g.days) : suggestExpiry(category, location, purchase).date;
  }
  // 買好後轉成物品表單的預填值。到期日一律標為估算
  function shopToForm(s, today, items = []) {
    // 其他/冷藏 是沒分類時的預設值(舊清單裡手動加的鮮奶也是),重新判斷,避免鮮奶被估成 30 天
    const d = s.category === '其他' && s.location === '冷藏' ? shopDefaults(s.name, items) : {};
    const category = d.category || s.category, location = d.location || s.location;
    const h = recallItem(items, s.name, today), same = !!h && h.category === category && h.location === location;
    const l = LOCATIONS.find(x => x.name === location);
    const expiry = estimateExpiry(s.name, category, location, today, items);
    // rough:沒有紀錄、品名也認不出類別,到期日只是通用天數,介面要特別提醒
    const rough = !h && category === '其他' && location === '冷藏' && !guessCategory(s.name);
    return { name: s.name, category, location, quantity: s.quantity, purchase: today, expiry, estimated: true, openDays: same ? h.openDays : '', tempC: same ? h.tempC : l && l.tempC !== null ? l.tempC : '', rough };
  }

  // 已買好的購物清單項目一次放入庫存(到期日依類別估算,標為估算);回傳新物品與剩餘清單
  function shopBoughtToItems(shopping, today, history = []) {
    const items = [], rest = [], moved = [], rough = [];
    for (const s of shopping || []) {
      if (!s.bought) { rest.push(s); continue; }
      const f = shopToForm(s, today, history), r = makeItem(f, today);
      if (r.item) { items.push(r.item); moved.push(s); if (f.rough) rough.push(r.item.name); } else rest.push(s);
    }
    return { items, shopping: rest, moved, rough };
  }

  function shopPutText(count, rough = []) {
    if (!rough.length) return `已放入 ${count} 項(到期日為估算)`;
    return `已放入 ${count} 項(到期日為估算)。認不出類別:${rough.slice(0, 2).join('、')}${rough.length > 2 ? ` 等 ${rough.length} 項` : ''},請對照包裝改日期`;
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
    const rows = [['名稱', '類別', '位置', '數量', '購買日', '到期日', '剩餘天數', '狀態', '到期日為估算', '已處理', '處理結果', '處理日', '備註']];
    for (const i of items) {
      const d = daysLeft(i.expiry, today);
      rows.push([i.name, i.category, i.location, i.quantity, i.purchase || '', i.expiry || '', d === null ? '' : d, i.done ? '已處理' : (STATUS_TAG[status(d)] || ''), i.estimated ? '是' : '', i.done ? '是' : '', i.done ? (i.outcome === 'wasted' ? '浪費' : '用完') : '', i.done && Number.isFinite(i.doneAt) ? todayStr(new Date(i.doneAt)) : '', i.notes || '']);
    }
    return '\ufeff' + rows.map(r => r.map(q).join(',')).join('\r\n') + '\r\n';
  }

  // ---- CSV 匯入:讀回 toCSV 匯出的格式(或自製試算表,至少要有「名稱」「到期日」欄);逐列驗證、現有清單已有幾筆同名同位置同到期日就略過檔案裡幾筆 ----
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
  // 檔案位元組轉文字:先當 UTF-8,不合法時改試 Big5(繁中版 Excel 另存「CSV」的預設編碼)
  function decodeCSV(bytes) {
    for (const enc of ['utf-8', 'big5']) { try { return new TextDecoder(enc, { fatal: true }).decode(bytes); } catch (e) { /* 試下一種 */ } }
    return new TextDecoder('utf-8').decode(bytes);
  }
  // 試算表存檔常把日期改成 2026/12/1;也接受民國年(115/12/1)。認不得的原樣回傳,交給後續驗證擋下
  function looseDate(s) {
    const m = /^(\d{3,4})([-/.])(\d{1,2})\2(\d{1,2})$/.exec(s);
    if (!m) return s;
    const y = m[1].length === 3 ? +m[1] + 1911 : +m[1];
    return `${y}-${pad(+m[3])}-${pad(+m[4])}`;
  }
  function parseCSV(text, today, existing = []) {
    const rows = parseCSVRows(text);
    if (!rows.length) return { ok: false, error: '檔案是空的', items: [], skipped: 0, duplicates: 0 };
    const head = rows[0].map(h => h.trim()), col = n => head.indexOf(n);
    if (col('名稱') < 0 || col('到期日') < 0) return { ok: false, error: '這不像是 housekeeper 的 CSV(需要「名稱」和「到期日」欄)', items: [], skipped: 0, duplicates: 0 };
    const get = (r, n) => { const k = col(n); return k < 0 ? '' : String(r[k] || '').replace(/^'(?=[=+\-@\t\r])/, '').trim(); };
    // 用「筆數」比對(待處理與已處理分開算):清單裡有幾筆同樣的,就略過檔案裡幾筆。
    // 分兩批登記的同品項、處理過多次的紀錄都會保留;同一份檔案重複匯入不會翻倍
    const keyOf = i => [i.name, i.location, i.expiry].join('|'), pendingLeft = new Map(), doneLeft = new Map();
    for (const i of existing) { const m = i.done ? doneLeft : pendingLeft; m.set(keyOf(i), (m.get(keyOf(i)) || 0) + 1); }
    const items = []; let skipped = 0, duplicates = 0;
    for (const r of rows.slice(1).slice(0, 2000)) {
      const done = get(r, '已處理') === '是';
      const res = makeItem({ name: get(r, '名稱'), category: get(r, '類別'), location: get(r, '位置'), quantity: get(r, '數量') || 1, purchase: looseDate(get(r, '購買日')) || today, expiry: looseDate(get(r, '到期日')), estimated: get(r, '到期日為估算') === '是', notes: get(r, '備註') }, today);
      if (!res.item) { skipped++; continue; }
      const key = keyOf(res.item), pool = done ? doneLeft : pendingLeft, left = pool.get(key) || 0;
      if (left) { pool.set(key, left - 1); duplicates++; continue; }
      if (done) {
        // 沒有處理日就留空,不要假裝是今天處理的(會灌水本週統計、打斷無浪費天數)
        const day = looseDate(get(r, '處理日')), t = parseDay(day);
        res.item.done = true; res.item.doneAt = t === null ? null : new Date(day + 'T12:00:00').getTime(); res.item.outcome = get(r, '處理結果') === '浪費' ? 'wasted' : 'used';
      }
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
      if (typeof raw.splitFrom === 'string' && raw.splitFrom) r.item.splitFrom = raw.splitFrom.slice(0, 40);
      if (LOCATIONS.some(l => l.name === raw.locationBeforeFreeze) && parseDay(raw.expiryBeforeFreeze) !== null) { // 保留「復原冷凍」
        r.item.locationBeforeFreeze = raw.locationBeforeFreeze; r.item.expiryBeforeFreeze = raw.expiryBeforeFreeze;
        r.item.tempCBeforeFreeze = Number.isFinite(raw.tempCBeforeFreeze) ? raw.tempCBeforeFreeze : null;
      }
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

  // 多件商品一次辨識(購物照、冰箱照、收據):回傳陣列,轉成「一次新增多項」的文字行讓使用者確認
  function scanMultiPrompt(today, { receipt = false } = {}) {
    const extra = receipt ? `\n這張是購物收據:只列需要管理保存期限的食品、藥品、日用品;略過價格、金額、折扣、稅額、塑膠袋、會員、贈品與非商品的行;把縮寫還原成常見品名(例如「無糖豆漿1L」→ 無糖豆漿);收據上沒有有效日期,expiry 一律填 null。` : '';
    return `你是家庭物品到期管理的助手。圖片裡有多件食品、藥品或日用品(可能是購物戰利品、冰箱內部或收據)。請列出看得出來的每一項,只回傳一個 JSON 陣列,不要其他文字,最多 15 項:
[{"name": 品名(繁體中文,最多 20 字), "category": 從 ${CATEGORIES.join('、')} 擇一, "location": 建議存放位置,從 ${LOCATIONS.map(l => l.name).join('、')} 擇一, "expiry": 包裝上清楚可見的有效日期 YYYY-MM-DD,看不到就填 null, "quantity": 整數,預設 1}]
今天是 ${today}。民國年請換算成西元;不要猜測日期;同樣的商品合併成一項並填數量。${extra}`;
  }
  function parseScanMulti(raw, today) {
    const arr = Array.isArray(raw) ? raw : (raw && Array.isArray(raw.items) ? raw.items : null);
    if (!arr) return [];
    const out = [];
    for (const x of arr.slice(0, 15)) { const r = parseScan(x, today); if (r) out.push(r); }
    return out;
  }
  function scanToBulkText(list) {
    return (list || []).map(r => [r.name.replace(/[\n,,、]/g, ' ').trim(), r.quantity > 1 ? 'x' + r.quantity : '', r.readDate ? r.expiry : '', '@' + r.location].filter(Boolean).join(' ')).join('\n');
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
      const k = String(i.name || '').replace(/\s+/g, '').toLowerCase(); if (!k || i.splitFrom) continue;
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
    let hit = [...(items || [])].filter(i => k(i.name) === n).sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0))[0];
    // 開封、移到冷凍是買回來之後的事:下次購買要用原本的位置與到期日
    if (hit) hit = unfreezeItem(unopenItem(hit));
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
    // 容易被後面的字誤判的詞放最前面(例:雞蛋含「雞」、牛油果含「牛」、豬油含「豬」、山藥含「藥」)
    ['蔬菜', '冷藏', ['山藥'], 10],
    ['蔬菜', '冷藏', ['牛蒡', '牛番茄', '牛蕃茄', '雞腿菇']],
    // 名字裡帶著蔬菜、茶、鹽、酒、蘋果,其實是別類的東西
    ['日用品', '櫃子', ['便當盒', '便當袋', '沙拉脫']],
    ['調味料', '常溫', ['番茄醬', '蕃茄醬', '沙茶', '沙拉醬', '美乃滋', '料理米酒', '料理酒', '壽司醋', '涼麵醬', '滷包', '滷味包']],
    ['飲料', '常溫', ['無酒精', '蘋果西打']],
    ['調味料', '常溫', ['豆腐乳', '巧克力醬', '辣椒醬', '辣椒油', '辣椒粉', '椰子油', '干貝醬', '煉乳']],
    ['乳製品', '冷藏', ['巧克力牛奶', '巧克力鮮奶', '調味乳'], 7],
    ['藥品', '藥箱', ['膠原蛋白', '維生素', 'B群', '葉酸', '鈣片', '鼻噴', '紗布']],
    ['其他', '冷藏', ['滴雞精']],
    ['藥品', '藥箱', ['生理食鹽水', '酒精', '優碘', '雙氧水', 'OK繃', 'ok繃', 'Ok繃']],
    ['其他', '常溫', ['壽司米', '壽司海苔', '乾香菇']],
    // 熟食、即食品放不久:超商鮮食以當天或隔天為準;剩菜熟食冷藏 3 天(USDA 建議 3–4 天,取保守值)
    ['其他', '冷藏', ['飯糰', '便當', '壽司', '三明治', '涼麵'], 1],
    ['其他', '冷藏', ['茶碗蒸'], 2],
    ['其他', '冷藏', ['剩菜', '剩飯', '剩湯', '熟食', '滷味', '滷菜', '味噌湯', '紫菜湯'], 3],
    ['其他', '常溫', ['紫菜']],
    ['其他', '冷凍', ['蔥油餅', '蔥抓餅']],
    ['肉類', '冷藏', ['藥燉', '藥膳'], 3],
    ['藥品', '藥箱', ['魚油', '葉黃素']],
    ['日用品', '櫃子', ['藥皂']],
    // 乾貨、零食、糕餅:名字裡有肉、魚、蝦、水果、奶、蛋,但不是生鮮
    ['其他', '常溫', ['肉鬆', '魚鬆', '肉乾', '果乾', '葡萄乾', '莓乾', '蝦味先', '牛奶糖', '牛軋糖', '糖果', '巧克力', '蛋捲', '蛋白粉', '奶粉', '麵粉', '太白粉', '喉糖', '口香糖', '肉紙', '米果', '蜜餞', '話梅', '蘇打餅', '瓜子']],
    ['其他', '常溫', ['鳳梨酥', '太陽餅', '桃酥', '月餅', '蛋黃酥', '芋頭酥', '柿餅'], 14],
    ['其他', '冷藏', ['蛋餅', '茶葉蛋', '蘿蔔糕', '豆花', '愛玉', '仙草'], 3],
    ['調味料', '常溫', ['肉桂', '蘋果醋', '蜂蜜']],
    ['飲料', '常溫', ['果汁', '檸檬汁', '葡萄汁', '莓汁', '柳丁汁', '番茄汁', '燕麥奶', '米漿']],
    ['乳製品', '冷藏', ['養樂多', '乳酸'], 14],
    ['肉類', '冷藏', ['貢丸'], 3],
    ['蔬菜', '冷藏', ['木耳', '蓮藕', '竹筍', '苦瓜', '秋葵', '四季豆', '毛豆']],
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
    ['保養品', '櫃子', ['洗面乳', '乳液', '面膜', '精華', '防曬', '化妝水', '卸妝', '護手霜', '洗髮', '沐浴', '牙膏', '漱口水', '保濕', '口紅', '粉底', '染髮']],
    ['日用品', '櫃子', ['衛生紙', '洗衣', '洗碗', '洗潔', '電池', '垃圾袋', '漂白', '柔軟精', '衛生棉', '尿布', '濕紙巾', '保鮮膜', '鋁箔', '洗手乳', '肥皂', '香皂', '牙刷', '刮鬍刀', '蚊香', '殺蟲', '芳香劑', '濾心', '棉花棒']],
    // 以下為保守的冷藏天數估計(參考 USDA FoodKeeper 的一般範圍,以包裝與食材狀態為準);要放在同類別的一般列之前
    ['蔬菜', '冷藏', ['泡菜', '榨菜', '醃菜'], 30],
    ['乳製品', '冷藏', ['鮮奶油'], 10],
    ['乳製品', '冷藏', ['牛奶', '鮮奶'], 7],
    ['乳製品', '冷藏', ['優格', '優酪'], 10],
    ['肉類', '冷藏', ['絞肉', '肉末', '魚', '蝦', '蟹', '花枝', '透抽', '蛤', '海鮮', '鮭', '牡蠣', '蚵', '蜆', '干貝', '小卷'], 2],
    ['肉類', '冷藏', ['雞', '豬', '牛排', '羊', '鴨', '排骨', '肉片', '肉絲'], 3],
    ['水果', '冷藏', ['草莓', '藍莓', '葡萄', '荔枝'], 5],
    ['蔬菜', '冷藏', ['高麗菜', '白菜', '蘿蔔', '馬鈴薯', '洋蔥', '南瓜', '地瓜', '玉米', '花椰'], 10],
    ['蔬菜', '冷藏', ['青江菜', '菠菜', '空心菜', '小白菜', '地瓜葉', '萵苣', '生菜', '芹菜', '韭菜', '豆芽', '菜'], 4],
    ['乳製品', '冷藏', ['牛奶', '鮮奶', '優格', '優酪', '起司', '乳酪', '奶油', '鮮奶油', '保久乳', '布丁']],
    ['肉類', '冷藏', ['雞', '豬', '牛', '羊', '鴨', '肉', '排骨', '火腿', '香腸', '培根', '熱狗', '臘腸', '魚', '蝦', '蟹', '花枝', '透抽', '蛤', '海鮮', '鮭']],
    ['水果', '冷藏', ['蘋果', '香蕉', '葡萄', '芭樂', '柳丁', '橘', '柑', '西瓜', '木瓜', '芒果', '鳳梨', '草莓', '藍莓', '奇異果', '檸檬', '梨', '桃', '李', '柚', '荔枝', '蓮霧', '百香果', '棗子', '釋迦', '柿子', '哈密瓜', '香瓜', '水果']],
    ['蔬菜', '冷藏', ['菜', '蔥', '蒜', '薑', '菇', '蘿蔔', '番茄', '蕃茄', '黃瓜', '小黃瓜', '玉米', '地瓜', '馬鈴薯', '洋蔥', '高麗', '花椰', '青椒', '茄子', '豆芽', '南瓜', '絲瓜', '豆腐', '九層塔', '甜椒', '辣椒', '芋頭']],
    // 乾貨放在肉類、蔬菜之後:「蚵仔麵線」是鮮食,不是乾麵線
    ['其他', '常溫', ['麵線', '燕麥', '穀片', '薏仁']],
    ['飲料', '常溫', ['舒跑', '椰奶', '高粱', '茶', '咖啡', '汽水', '可樂', '果汁', '豆漿', '氣泡水', '礦泉水', '運動飲料', '啤酒', '酒']],
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
  // 從行尾取出到期日:「12/3」「12月3號」「115/12/3」(民國)「20261203」,前面可有「有效期限:」,外面可有括號
  const DATE_LABEL = '(?:有效期限|有效日期|保存期限|賞味期限|到期日|效期|期限|到期|exp(?:iry)?\\.?)';
  const DATE_TAIL = new RegExp(`^(.*?)\\s*[((【]?\\s*(?:${DATE_LABEL}\\s*[::]?\\s*)?(?:(?:民國)?\\s*(?<!\\d)(\\d{4}|1\\d{2})[-/.年])?(?<!\\d)(\\d{1,2})[-/.月](\\d{1,2})[日號]?\\s*(?:前|止|到期)?\\s*[))】]?$`, 'i');
  const DATE_SOLID = new RegExp(`^(.*?)(?:\\s+|${DATE_LABEL}\\s*[::]?\\s*)(20\\d{2})(\\d{2})(\\d{2})$`, 'i');
  function splitDate(text, today) {
    const m = DATE_SOLID.exec(text) || DATE_TAIL.exec(text); if (!m) return null;
    const name = m[1].replace(new RegExp(`\\s*${DATE_LABEL}\\s*[::]?$`, 'i'), '').trim(); if (!name) return null;
    const year = m[2] && m[2].length === 3 ? +m[2] + 1911 : m[2];
    const date = bulkDate(year, m[3], m[4], today);
    return date ? { name, date } : null;
  }
  // 中文數量與寫在前面的數量:「鮮奶兩瓶」→「鮮奶 2瓶」、「兩瓶鮮奶」「2盒雞蛋」→「鮮奶 x2」。
  // 一定要接量詞才算(三明治、五花肉、九層塔是品名);「一條根」「四個月…」「五片裝…」也不是數量
  const MEASURE = '(?:個|瓶|包|盒|顆|條|片|袋|罐|組|入|把|支|根)';
  const CN_NUM = '(?:[二兩三四五六七八九]?十[一二三四五六七八九]?|[一二兩三四五六七八九])';
  // 行尾只換中文數字(阿拉伯數字原本的規則就認得);行首兩種都換,但「入」多半是包裝規格(3入組衛生紙)
  const NUM_SUFFIX = new RegExp(`(?<![一二兩三四五六七八九十第])\\s*(${CN_NUM})(${MEASURE})(?=\\s|$)`);
  const NUM_PREFIX = new RegExp(`^(${CN_NUM}|\\d{1,2})(?!入)(${MEASURE})(?![月裝入])\\s*(\\D.*)$`);
  const NOT_COUNT = /^(?:[一二兩三\d]條根|三支雨傘)/; // 以數字開頭的商品名
  function cnNumber(s) {
    if (/^\d+$/.test(s)) return +s;
    const d = c => (c === '兩' ? 2 : '一二三四五六七八九'.indexOf(c) + 1);
    const t = s.indexOf('十');
    return t < 0 ? d(s) : (t ? d(s[0]) : 1) * 10 + (s[t + 1] ? d(s[t + 1]) : 0);
  }
  function normalizeCount(line) {
    const m = NUM_SUFFIX.exec(line);
    if (m && m.index > 0) return `${line.slice(0, m.index)} ${cnNumber(m[1])}${m[2]}${line.slice(m.index + m[0].length)}`;
    const p = NOT_COUNT.test(line) ? null : NUM_PREFIX.exec(line);
    // 後面已經寫了 x2 之類的數量就不重複換
    return p && !/[x×*X]\s*\d/.test(p[3]) ? `${p[3]} x${cnNumber(p[1])}` : line;
  }
  function parseBulk(text, today) {
    const unknown = new Set();
    const parts = String(text || '').split(/[\n\r,，、;；]+/), map = new Map(), skipped = [];
    for (let raw of parts) {
      raw = raw.replace(/^[\s\-•*·●]*\d+[.)](?!\d)\s*/, '').replace(/^[\s\-•*·●]+/, '').trim(); if (!raw) continue;
      let qty = 1, name = raw, m, given = null, forceLoc = null;
      const lm = name.match(/\s*[@＠]\s*(冷藏|冷凍|常溫|櫃子|藥箱)\s*/);
      if (lm) { forceLoc = lm[1]; name = (name.slice(0, lm.index) + ' ' + name.slice(lm.index + lm[0].length)).trim(); }
      // 日期後面又寫數量(「鮮奶 12/3 x2」「鮮奶 12/3 2瓶」):先把數量拿掉,日期才在結尾
      name = normalizeCount(name);
      let counted = false;
      if ((m = name.match(/^(.*?)\s*[x×*X]\s*(\d{1,4})\s*[^\s\d]{0,2}$/)) || (m = name.match(/^(.*?)\s+(\d{1,2})\s*(?:個|瓶|包|盒|顆|條|片|袋|罐|組|入|把|支|根)$/))) { name = m[1]; qty = +m[2]; counted = true; }
      const dated = splitDate(name, today);
      if (dated) { name = dated.name; given = dated.date; }
      if (!counted && (m = name.match(/^(.*?)\s*[x×*X]\s*(\d{1,4})\s*[^\s\d]{0,2}$/))) { name = m[1]; qty = +m[2]; counted = true; }
      // 緊接在英文字母後、又沒有單位的數字是品名的一部分(維他命B12、輔酵素Q10),不是數量
      if (!counted && (m = name.match(/^(.*?\D)\s*(\d{1,2})\s*(個|瓶|包|盒|顆|條|片|袋|罐|組|入|把|支|根)?$/)) && (m[3] || !/[A-Za-z]\d+$/.test(name))) { name = m[1]; qty = +m[2]; }
      name = name.trim();
      if (!name || /[\d]\s*[\/.\-:]\s*$|[\/.\-:]$/.test(name) || name.length > 40 || !(qty >= 1 && qty <= 99)) { skipped.push(raw); continue; }
      // 同名但到期日或指定的存放位置不同,是兩批東西,分開記(併在一起會弄丟其中一個日期)
      const key = [name.replace(/\s+/g, '').toLowerCase(), given || '', forceLoc || ''].join('|'), prev = map.get(key);
      if (prev) { prev.quantity = Math.min(99, prev.quantity + qty); continue; }
      const guessed = guessCategory(name);
      let g = guessed || { category: '其他', location: '冷藏' };
      if (forceLoc && forceLoc !== g.location) g = { category: g.category, location: forceLoc };
      const loc = LOCATIONS.find(l => l.name === g.location);
      const exp = given || (g.days ? addDays(today, g.days) : suggestExpiry(g.category, g.location, today).date);
      const r = makeItem({ name, category: g.category, location: g.location, quantity: qty, purchase: today, expiry: exp, estimated: !given, tempC: loc && loc.tempC !== null ? loc.tempC : '' }, today);
      if (r.item) { map.set(key, r.item); if (!guessed && !given) unknown.add(r.item.id); } else skipped.push(raw);
      if (map.size >= 50) break;
    }
    // unknown:認不出類別又沒寫日期的 id,到期日只是通用估算,介面要特別提醒
    return { items: [...map.values()], skipped, unknown };
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
  // avoid:「換一批」時帶入已經建議過的菜名,免得又拿到同樣的幾道
  function recipePrompt(list, today, avoid = []) {
    const lines = list.map(c => `- ${c.name}(${c.daysLeft === 0 ? '今天到期' : c.daysLeft + ' 天後到期'},放${c.location})`).join('\n');
    return `你是台灣家庭的料理助手。以下食材快到期,請想 3 道簡單家常菜,盡量一次用掉越多越好,其他只可再用常見調味料與家裡一定有的基本食材(油、鹽、醬油、蛋、米)。今天是 ${today}。
${lines}
只回傳 JSON 陣列,不要其他文字:[{"title": 菜名(繁體中文,最多 16 字), "uses": 用到上面清單中的食材名稱陣列, "minutes": 預估分鐘數(整數), "how": 做法一兩句話(最多 80 字)}]
食材若已有異味或外觀不對請不要建議食用;不要編造清單以外的食材當主料。` + (avoid.length ? `\n這些已經建議過了,請換不一樣的做法:${avoid.slice(-12).join('、')}` : '');
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

  // 未來 n 天(含今天)每天到期的未處理物品數;已過期者另計 overdue
  function upcoming(items, today, n = 14) {
    const days = Array.from({ length: n }, (_, k) => ({ date: addDays(today, k), count: 0, names: [] })); let overdue = 0, later = 0;
    for (const i of items) { if (i.done) continue; const d = daysLeft(i.expiry, today); if (d < 0) overdue++; else if (d < n) { days[d].count++; days[d].names.push(i.name); } else later++; }
    return { days, overdue, later };
  }

  const api = { shortDay, saveErrorText, CLOUD_LIMIT, cloudBytes, cloudLevel, syncText, bannerText, doneNote, cleanState, upcoming, CATEGORIES, LOCATIONS, SHELF_DAYS, todayStr, fmtDate, parseDay, addDays, addMonths, daysLeft, status, suggestExpiry, makeItem, sortByExpiry, SORTS, sortItems, filterItems, summarize, titleFor, sortDone, pruneDone, pickNewer, syncAction, adoptState, fromOtherTab, reminderDaysFrom, toICS, stats, exportBackup, parseBackup, mergeItems, makeShopItem, addShopping, sortShopping, groupShopping, shopDefaults, estimateExpiry, shopToForm, shopBoughtToItems, shopPutText, expiringText, shoppingText, toCSV, parseCSV, decodeCSV, applyEdit, dateWarnings, backupDue, findDuplicate, knownNames, frequentNames, shopSuggestions, recallItem, guessCategory, parseBulk, finishItem, finishExpired, restoreItems, removeItem, reinsertItem, removeShopping, restoreShopping, MILK_TYPES, milkPreset, OPENED_DAYS, openedDays, okOpenDays, openItem, openOne, unopenItem, freezeItem, canFreeze, freezeText, freezeSoon, unfreezeItem, FREEZE_DAYS, scanPrompt, parseScan, scanMultiPrompt, parseScanMulti, scanToBulkText, recipeCandidates, recipePrompt, parseRecipes, sampleItems, newId };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else window.HK = api;
})();
