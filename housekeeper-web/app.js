// housekeeper 網頁版介面。資料先存本機(localStorage),有 db 時同步到雲端(私人、跨裝置)。
(function () {
  const $ = id => document.getElementById(id);
  const today = () => HK.todayStr();
  const DEFAULT = () => ({ items: [], shopping: [], settings: { reminderDays: 3, reminderHour: 9 }, updatedAt: 0 });

  // ---------- 儲存 ----------
  const LS = 'housekeeper.state.v1';
  function loadLocal() { try { const s = JSON.parse(localStorage.getItem(LS)); if (s && Array.isArray(s.items)) return s; } catch (e) { /* 略過 */ } return null; }
  function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* 隱私模式等:略過 */ } }

  let state = loadLocal() || DEFAULT();
  state.settings = Object.assign(DEFAULT().settings, state.settings); if (!Array.isArray(state.shopping)) state.shopping = [];
  let cloud = null, cloudDoc = null, writing = false, dirty = false, timer = null, syncMsg = '已儲存在這個裝置';

  function setSync(t) { syncMsg = t; $('sync').textContent = t; }
  function commit() {
    state.updatedAt = Date.now(); saveLocal(); render();
    if (cloudDoc) { dirty = true; clearTimeout(timer); timer = setTimeout(flush, 600); setSync('同步中…'); }
  }
  async function flush() {
    if (writing || !dirty || !cloudDoc) return;
    writing = true; dirty = false;
    try { await cloudDoc.set(JSON.parse(JSON.stringify(state))); setSync('已同步到雲端'); }
    catch (e) { setSync('雲端同步失敗,資料仍保存在這個裝置'); }
    writing = false; if (dirty) flush();
  }
  async function initCloud() {
    try {
      if (!(window.claude && window.claude.use)) return;
      const db = await window.claude.use('db'), user = await window.claude.use('user');
      const uid = user && user.id ? await user.id() : null;
      if (!db || !uid) return;
      cloud = db; cloudDoc = db.collection('data/users/' + uid).doc('state');
      cloudDoc.onSnapshot(snap => {
        const remote = snap.exists ? snap.data() : null;
        if (snap.metadata && snap.metadata.hasPendingWrites) return;
        const win = HK.pickNewer(state, remote);
        if (win === remote && remote) { state = JSON.parse(JSON.stringify(remote)); state.settings = Object.assign(DEFAULT().settings, state.settings); if (!Array.isArray(state.shopping)) state.shopping = []; saveLocal(); render(); setSync('已同步到雲端'); }
        else if (!remote && state.updatedAt) { dirty = true; flush(); }
        else setSync('已同步到雲端');
      }, () => setSync('雲端不可用,資料保存在這個裝置'));
    } catch (e) { /* 沒有雲端:維持本機模式 */ }
  }

  // ---------- 清單 ----------
  let locFilter = '', query = '', stFilter = '', sortMode = 'expiry';
  try { const s = localStorage.getItem('hk-sort'); if (HK.SORTS[s]) sortMode = s; } catch (e) {}
  const STATUS_LABEL = { expired: '已過期', urgent: '快到期', soon: '一週內', ok: '安全' };

  function el(tag, cls, text) { const e = document.createElement(tag); if (cls) e.className = cls; if (text !== undefined) e.textContent = text; return e; }

  function badge(days) {
    const st = HK.status(days), b = el('div', 'badge ' + st);
    if (days < 0) { b.append(el('b', '', String(-days)), el('small', '', '天前過期')); }
    else if (days === 0) { b.append(el('b', '', '今天'), el('small', '', '到期')); }
    else { b.append(el('b', '', String(days)), el('small', '', '天後到期')); }
    return b;
  }

  function rowFor(item, mode) {
    const days = HK.daysLeft(item.expiry, today()), li = el('li', 'row' + (mode === 'done' ? '' : ' s-' + HK.status(days)));
    li.append(mode === 'done' ? (() => { const b = el('div', 'badge ok'); b.append(el('b', '', '✓'), el('small', '', '已處理')); return b; })() : badge(days));
    const info = el('button', 'info'); info.type = 'button';
    info.append(el('div', 'nm', item.name + (item.quantity > 1 ? ` ×${item.quantity}` : '')));
    info.append(el('div', 'meta', `${item.category}・${item.location}${item.tempC !== null ? ' ' + item.tempC + '°C' : ''}`));
    info.append(el('div', 'meta', `${item.expiry}${item.estimated ? '(估算)' : ''}${item.openedAt ? '・已開封' : ''}`));
    info.onclick = () => openForm(item);
    li.append(info);
    if (mode === 'done') {
      const acts = el('div', 'acts'), undo = el('button', '', '還原'), del = el('button', 'danger', '刪除');
      undo.onclick = () => { item.done = false; item.doneAt = null; delete item.outcome; commit(); };
      del.onclick = () => { if (del.dataset.arm) { removeItem(item); } else { del.dataset.arm = '1'; del.textContent = '確定?'; setTimeout(() => { del.dataset.arm = ''; del.textContent = '刪除'; }, 2500); } };
      acts.append(undo, del); li.append(acts);
    } else {
      const d = el('button', 'done-btn', '吃完'); d.title = '標記為已吃完/已處理';
      const canOpen = !item.openedAt && HK.openedDays(item.category, item.location, item.openDays);
      d.onclick = () => { Object.assign(item, HK.finishItem(item, today()).item); commit(); offerRestock(item); };
      if (item.quantity > 1) {
        const one = el('button', 'done-btn', '用 1 個'); one.title = `數量 ${item.quantity} → ${item.quantity - 1}`;
        one.onclick = () => { const q = item.quantity; Object.assign(item, HK.finishItem(item, today(), { all: false }).item); commit(); snack(`「${item.name}」用掉 1 個,剩 ${item.quantity}`, '復原', () => { item.quantity = q; commit(); }); };
        const acts = el('div', 'acts'); acts.append(one, d); li.append(acts);
      } else if (canOpen) {
        const op = el('button', 'done-btn', '開封'); op.title = `標示已開封,約 ${canOpen} 天內吃完`; op.setAttribute('aria-label', `${item.name} 標示開封`);
        op.onclick = () => doOpen(item);
        const acts = el('div', 'acts'); acts.append(op, d); li.append(acts);
      } else li.append(d);
    }
    return li;
  }

  function render() {
    const t = today(), active = state.items.filter(i => !i.done), done = state.items.filter(i => i.done);
    // 摘要
    const s = HK.summarize(state.items, t), stats = $('stats'); stats.textContent = '';
    for (const k of ['expired', 'urgent', 'soon', 'ok']) { const d = el('button', 'stat ' + k); d.type = 'button'; d.setAttribute('aria-pressed', String(stFilter === k)); d.setAttribute('aria-label', `${STATUS_LABEL[k]} ${s[k]} 項,點一下只看這類`); d.append(el('b', '', String(s[k])), el('span', '', STATUS_LABEL[k])); d.onclick = () => { stFilter = stFilter === k ? '' : k; render(); }; stats.append(d); }
    // 提醒橫幅:已過期,或在「提醒天數」內
    const need = active.filter(i => HK.daysLeft(i.expiry, t) <= state.settings.reminderDays), bad = active.filter(i => HK.daysLeft(i.expiry, t) < 0).length;
    const bn = $('banner'); bn.textContent = '';
    if (need.length) { const b = el('div', 'banner' + (bad ? ' bad' : ''), bad ? `有 ${bad} 項已過期,另有 ${need.length - bad} 項快到期,請盡快處理` : `有 ${need.length} 項在 ${state.settings.reminderDays} 天內到期`); if (bad) { const all = el('button', 'ghost', `全部標為已處理(${bad})`); all.type = 'button'; all.onclick = () => { const r = HK.finishExpired(state.items, t); state.items = r.items; commit(); snack(`已處理 ${r.changed.length} 項過期物品`, '復原', () => { state.items = HK.restoreItems(state.items, r.changed); commit(); }); }; const ate = el('button', 'ghost', '其實吃掉了'); ate.type = 'button'; ate.title = '已過期但其實都吃掉了:記為用完,不算浪費'; ate.onclick = () => { const r = HK.finishExpired(state.items, t, Date.now(), 'used'); state.items = r.items; commit(); snack(`已將 ${r.changed.length} 項記為吃掉了`, '復原', () => { state.items = HK.restoreItems(state.items, r.changed); commit(); }); }; b.append(' ', all, ' ', ate); } const fz = HK.freezeSoon(state.items, t); if (fz.changed.length) { const fb = el('button', 'ghost', `可冷凍的先冷凍(${fz.changed.length})`); fb.type = 'button'; fb.title = '2 天內到期、尚未開封的肉/蔬果/乳製品移到冷凍(到期日為保守估算)'; fb.onclick = () => { const r = HK.freezeSoon(state.items, t); state.items = r.items; commit(); snack(`已將 ${r.changed.length} 項移到冷凍(估算)`, '復原', () => { state.items = HK.restoreItems(state.items, r.changed); commit(); }); }; b.append(' ', fb); } const cp = el('button', 'ghost', '複製清單'); cp.type = 'button'; cp.title = '複製 7 天內到期的物品(文字)'; cp.onclick = () => copyText(HK.expiringText(state.items, t, 7), '快到期清單'); b.append(' ', cp); if (sampleFn && HK.recipeCandidates(state.items, t).length) { const rc = el('button', 'ghost', '想菜色'); rc.type = 'button'; rc.title = '請 Claude 用快到期的食材想幾道家常菜(會使用你的 Claude 額度)'; rc.onclick = openRecipes; b.append(' ', rc); } bn.append(b); }
    if (HK.backupDue(lsGet('hk-backup'), lsGet('hk-backup-since'), state.items.length, t)) { const b = el('div', 'banner', '已經一個月沒備份了,下載一份備份檔比較安心。'); const go = el('button', 'ghost', '現在備份'); go.type = 'button'; go.onclick = () => $('sBackup').click(); const later = el('button', 'ghost', '稍後再說'); later.type = 'button'; later.onclick = () => { lsSet('hk-backup-since', t); render(); }; b.append(' ', go, ' ', later); bn.append(b); }
    // 位置篩選
    const chips = $('chips'); chips.textContent = '';
    for (const name of ['全部', ...HK.LOCATIONS.map(l => l.name)]) {
      const n = name === '全部' ? active.length : active.filter(i => i.location === name).length;
      if (name !== '全部' && !n && locFilter !== name) continue;
      const c = el('button', 'chip', `${name} ${n}`); c.type = 'button'; c.setAttribute('aria-pressed', String((name === '全部' ? '' : name) === locFilter));
      c.onclick = () => { locFilter = name === '全部' ? '' : name; render(); }; chips.append(c);
    }
    // 清單
    const list = $('list'); list.textContent = '';
    const shown = HK.sortItems(HK.filterItems(active, { location: locFilter, query, status: stFilter, today: t }), sortMode);
    if (!shown.length) {
      const li = el('li', 'empty');
      if (!state.items.length) {
        li.append(emptyArt('new'), el('h2', '', '還沒有任何物品'), el('div', '', '記下冰箱和家裡會到期的東西,到期前會提醒你。'));
        const a = el('div', 'actions'), add = el('button', 'primary', '新增第一個物品'), sample = el('button', '', '載入範例看看');
        add.onclick = () => openForm(null); sample.onclick = loadSample; a.append(add, sample); li.append(a);
      } else li.append(emptyArt(active.length ? 'search' : 'done'), el('h2', '', active.length ? '沒有符合的物品' : '目前沒有待處理的物品'), el('div', '', active.length ? (stFilter ? `沒有「${STATUS_LABEL[stFilter]}」的物品,再點一次上方數字可取消篩選。` : '換個關鍵字或位置試試。') : '全部都處理完了!'));
      list.append(li);
    } else for (const i of shown) list.append(rowFor(i, 'active'));
    // 已處理
    $('hist').hidden = !done.length; $('histSum').textContent = `已處理(${done.length})`;
    const hl = $('histList'); hl.textContent = ''; for (const i of HK.sortByExpiry(done).reverse()) hl.append(rowFor(i, 'done'));
    $('sync').textContent = syncMsg;
    const left = state.shopping.filter(x => !x.bought).length; $('btnShop').textContent = left ? `購物清單 ${left}` : '購物清單';
  }

  // 空狀態插圖(內嵌 SVG,色彩跟隨 token)
  function emptyArt(kind) {
    const w = el('div', 'empty-art'); w.setAttribute('aria-hidden', 'true');
    const check = kind === 'done';
    w.innerHTML = '<svg viewBox="0 0 96 96" width="84" height="84" fill="none" stroke-linecap="round" stroke-linejoin="round">'
      + '<rect x="22" y="10" width="52" height="76" rx="10" stroke="currentColor" stroke-width="3" opacity=".55"/>'
      + '<path d="M22 40h52" stroke="currentColor" stroke-width="3" opacity=".35"/>'
      + '<path d="M30 24v8" stroke="currentColor" stroke-width="3" opacity=".55"/>'
      + (check ? '<circle cx="48" cy="63" r="12" stroke="var(--ok, #2f9e6b)" stroke-width="3.5"/><path d="M42 63l5 5 8-10" stroke="var(--ok, #2f9e6b)" stroke-width="3.5"/>'
        : '<path d="M38 63h20M48 53v20" stroke="var(--accent, currentColor)" stroke-width="3.5"/>')
      + '</svg>';
    return w;
  }

  function loadSample() {
    const ids = new Set(state.items.map(i => i.id));
    for (const i of HK.sampleItems(today())) if (!ids.has(i.id)) state.items.push(i);
    commit(); $('setWrap').hidden = true;
  }


  // ---------- 購物清單 ----------
  let snackTimer = null;
  function snack(text, actionLabel, action) {
    const box = $('snack'); box.textContent = ''; clearTimeout(snackTimer);
    box.append(el('span', '', text));
    if (actionLabel) { const b = el('button', 'ghost', actionLabel); b.type = 'button'; b.onclick = () => { box.hidden = true; action(); }; box.append(b); }
    box.hidden = false; snackTimer = setTimeout(() => { box.hidden = true; }, 6000);
  }
  // 複製文字到剪貼簿;沙盒擋住時改開一個文字框讓使用者手動複製
  async function copyText(text, label) {
    if (!text) { snack('沒有可複製的內容'); return; }
    try { await navigator.clipboard.writeText(text); snack(`已複製${label},可貼到 LINE 或備忘錄`); return; } catch (e) { /* 改用手動複製 */ }
    const box = $('snack'); clearTimeout(snackTimer); box.textContent = '';
    const ta = el('textarea'); ta.readOnly = true; ta.value = text; ta.rows = Math.min(8, text.split('\n').length); ta.setAttribute('aria-label', label + '(請全選後複製)'); ta.style.width = 'min(360px,70vw)';
    const ok = el('button', 'ghost', '關閉'); ok.type = 'button'; ok.onclick = () => { box.hidden = true; };
    box.append(ta, ok); box.hidden = false; ta.focus(); ta.select();
  }
  function removeItem(item) {
    const idx = state.items.findIndex(i => i.id === item.id); if (idx < 0) return;
    state.items = HK.removeItem(state.items, item.id); commit();
    snack(`已刪除「${item.name}」`, '復原', () => { state.items = HK.reinsertItem(state.items, item, idx); commit(); });
  }
  function addToShopping(f) {
    const r = HK.addShopping(state.shopping, f); if (!r.added) return false;
    state.shopping = r.list; commit(); return r;
  }
  function offerRestock(item) {
    const box = $('snack');
    snack(`已處理「${item.name}」`, '加入購物清單', () => { const r = addToShopping({ name: item.name, category: item.category, location: item.location, quantity: item.quantity }); if (r) snack(r.merged ? `購物清單裡的「${item.name}」數量增加了` : `已加入購物清單:${item.name}`); });
    const u = el('button', 'ghost', '復原'); u.type = 'button';
    u.onclick = () => { box.hidden = true; item.done = false; item.doneAt = null; delete item.outcome; commit(); };
    box.append(u);
  }
  function showShop() {
    $('snack').hidden = true;
    const body = $('shopBody'); body.textContent = '';
    const list = HK.sortShopping(state.shopping);
    const sq = $('shopQuick'); sq.textContent = ''; const sg = HK.shopSuggestions(state.items, state.shopping);
    sq.hidden = !sg.length;
    for (const n of sg) { const b = el('button', '', '+ ' + n); b.type = 'button'; b.onclick = () => { addToShopping({ name: n, quantity: 1 }); showShop(); }; sq.append(b); }
    if (!list.length) body.append(el('p', 'note', '清單是空的。吃完東西時按「加入購物清單」,或在下面直接輸入要買的東西。'));
    else {
      for (const g of HK.groupShopping(state.shopping)) {
      body.append(el('h3', 'shopgrp', `${g.category}(${g.pending ? g.pending + ' 待買' : '都買好了'})`));
      const ul = el('ul', 'list shoplist');
      for (const x of g.items) {
        const li = el('li', 'row shoprow' + (x.bought ? ' bought' : '')), lab = el('label', 'shopname'), cb = el('input'); cb.type = 'checkbox'; cb.checked = x.bought;
        cb.setAttribute('aria-label', `買好了:${x.name}`);
        cb.onchange = () => { x.bought = cb.checked; commit(); showShop(); };
        const t = el('span', 'nm', x.name + (x.quantity > 1 ? ` ×${x.quantity}` : '')); lab.append(cb, t); li.append(lab);
        const acts = el('div', 'acts');
        if (x.bought) {
          const put = el('button', '', '放入清單'); put.title = '轉成要追蹤到期日的物品';
          put.onclick = () => { $('shopWrap').hidden = true; shopFrom = x.id; openForm(null, HK.shopToForm(x, today())); };
          acts.append(put);
        }
        const del = el('button', 'ghost', '移除'); del.setAttribute('aria-label', `移除${x.name}`);
        del.onclick = () => { const r = HK.removeShopping(state.shopping, y => y.id === x.id); state.shopping = r.shopping; commit(); showShop(); snack(`已移除「${x.name}」`, '復原', () => { state.shopping = HK.restoreShopping(state.shopping, r.removed); commit(); showShop(); }); };
        acts.append(del); li.append(acts); ul.append(li);
      }
      body.append(ul);
      }
      if (list.some(x => !x.bought)) { const cp = el('button', '', '複製待買清單'); cp.type = 'button'; cp.onclick = () => copyText(HK.shoppingText(state.shopping), '購物清單'); const w0 = el('div', 'btns'); w0.append(cp); body.append(w0); }
      if (list.some(x => x.bought)) { const ab = el('button', 'primary', `已買的全部放入清單(${list.filter(x => x.bought).length})`); ab.type = 'button'; ab.title = '到期日依類別估算,之後可再編輯';
        ab.onclick = () => { const r = HK.shopBoughtToItems(state.shopping, today()); if (!r.items.length) return; const prevShop = state.shopping; state.items.push(...r.items); state.shopping = r.shopping; commit(); showShop(); render();
          snack(`已放入 ${r.items.length} 項(到期日為估算)`, '復原', () => { const ids = new Set(r.items.map(i => i.id)); state.items = state.items.filter(i => !ids.has(i.id)); state.shopping = prevShop; commit(); showShop(); render(); }); };
        const wa = el('div', 'btns'); wa.append(ab); body.append(wa); }
      if (list.some(x => x.bought)) { const c = el('button', '', '清除已買的'); c.type = 'button'; c.onclick = () => { const r = HK.removeShopping(state.shopping, x => x.bought); state.shopping = r.shopping; commit(); showShop(); snack(`已清除 ${r.removed.length} 項已買的`, '復原', () => { state.shopping = HK.restoreShopping(state.shopping, r.removed); commit(); showShop(); }); }; const w = el('div', 'btns'); w.append(c); body.append(w); }
    }
    $('shopWrap').hidden = false;
  }
  let shopFrom = null;
  $('btnShop').onclick = showShop;
  $('shopClose').onclick = () => { $('shopWrap').hidden = true; };
  $('shopWrap').addEventListener('click', e => { if (e.target === $('shopWrap')) $('shopWrap').hidden = true; });
  $('shopAdd').onsubmit = e => {
    e.preventDefault(); const inp = $('shopName'), name = inp.value.trim(); if (!name) { inp.focus(); return; }
    addToShopping({ name, quantity: 1 }); inp.value = ''; showShop(); $('shopName').focus();
  };

  // ---------- 表單 ----------
  let editing = null;
  const selOpts = (sel, arr) => { sel.textContent = ''; for (const v of arr) sel.append(new Option(v, v)); };
  selOpts($('fCat'), HK.CATEGORIES); selOpts($('fLoc'), HK.LOCATIONS.map(l => l.name));

  function setQuick() {
    const q = $('quick'); q.textContent = '';
    const opts = [['+3天', d => HK.addDays(d, 3)], ['+1週', d => HK.addDays(d, 7)], ['+2週', d => HK.addDays(d, 14)], ['+1個月', d => HK.addMonths(d, 1)], ['+3個月', d => HK.addMonths(d, 3)], ['+半年', d => HK.addMonths(d, 6)], ['+1年', d => HK.addMonths(d, 12)]];
    for (const [label, fn] of opts) { const b = el('button', '', label); b.type = 'button'; b.onclick = () => { $('fExpiry').value = fn($('fPurchase').value || today()); $('fEst').checked = false; }; q.append(b); }
    const est = el('button', '', '依類別估算'); est.type = 'button';
    est.onclick = () => { const r = HK.suggestExpiry($('fCat').value, $('fLoc').value, $('fPurchase').value || today()); $('fExpiry').value = r.date; $('fEst').checked = true; };
    q.append(est);
  }
  setQuick();
  // 乳製品:鮮奶 / 保久乳 快速選項
  (function () {
    const q = $('milkQuick');
    for (const type of Object.keys(HK.MILK_TYPES)) {
      const b = el('button', '', type); b.type = 'button'; b.title = `開封後約 ${HK.MILK_TYPES[type].openDays} 天內吃完`;
      b.onclick = () => {
        const p = HK.milkPreset(type, $('fPurchase').value || today());
        if (!$('fName').value.trim() || Object.keys(HK.MILK_TYPES).includes($('fName').value.trim())) $('fName').value = p.name;
        $('fCat').value = p.category; $('fLoc').value = p.location; $('fLoc').onchange();
        $('fOpenDays').value = p.openDays; $('fExpiry').value = p.expiry; $('fEst').checked = true; syncOpened();
      };
      q.append(b);
    }
    $('fCat').addEventListener('input', () => { catTouched = true; });
    $('fCat').onchange = () => { $('milkRow').hidden = $('fCat').value !== '乳製品'; };
  })();

  $('fLoc').onchange = () => { const l = HK.LOCATIONS.find(x => x.name === $('fLoc').value); $('fTemp').value = l && l.tempC !== null ? l.tempC : ''; };
  $('qMinus').onclick = () => { $('fQty').value = Math.max(1, (+$('fQty').value || 1) - 1); };
  $('qPlus').onclick = () => { $('fQty').value = Math.min(99, (+$('fQty').value || 1) + 1); };

  let catTouched = false;
  function openForm(item, pre) {
    catTouched = false; editing = item; $('fSave').dataset.dupOk = ''; $('fSave').dataset.dateOk = ''; $('scanThumb').hidden = true; if (!pre) shopFrom = null; $('formErrs').textContent = ''; $('formTitle').textContent = item ? '編輯物品' : '新增物品';
    $('fName').value = item ? item.name : ''; $('fCat').value = item ? item.category : HK.CATEGORIES[0]; $('fQty').value = item ? item.quantity : 1;
    $('fLoc').value = item ? item.location : '冷藏'; $('fTemp').value = item ? (item.tempC === null ? '' : item.tempC) : 4;
    $('fPurchase').value = item ? item.purchase : today(); $('fMfg').value = item && item.mfg ? item.mfg : '';
    $('fExpiry').value = item ? item.expiry : ''; $('fEst').checked = item ? item.estimated : false; $('fNotes').value = item ? item.notes : ''; $('fOpenDays').value = item && item.openDays ? item.openDays : '';
    if (pre) { $('fName').value = pre.name; $('fCat').value = pre.category; $('fQty').value = pre.quantity; $('fLoc').value = pre.location; $('fTemp').value = pre.tempC; $('fPurchase').value = pre.purchase; $('fExpiry').value = pre.expiry; $('fEst').checked = true; }
    $('recallMsg').hidden = true; const dl = $('nameList'); dl.textContent = ''; for (const n of HK.knownNames(state.items, 50, state.shopping)) dl.append(new Option(n, n));
    const fq = $('freqNames'); fq.textContent = ''; const fn = item ? [] : HK.frequentNames(state.items);
    for (const n of fn) { const b = el('button', '', n); b.type = 'button'; b.onclick = () => { $('fName').value = n; $('fName').dispatchEvent(new Event('change')); }; fq.append(b); } fq.hidden = !fn.length;
    $('fCat').onchange(); syncOpened(); syncFreeze();
    $('fDelete').hidden = !item; $('fDelete').textContent = '刪除'; $('fDelete').dataset.arm = '';
    $('bulkFromForm').hidden = !!item || !!pre; $('formWrap').hidden = false; if (!item) setTimeout(() => $('fName').focus(), 50);
  }
  // 輸入已用過的名稱:帶入上次的類別/位置/保存天數(只在新增、且到期日還沒填時)
  $('fName').addEventListener('change', () => {
    if (editing) return;
    const r = HK.recallItem(state.items, $('fName').value, today(), state.shopping);
    if (!r) {
      const g = !catTouched && HK.guessCategory($('fName').value); if (!g) return;
      $('fCat').value = g.category; $('fLoc').value = g.location; $('fLoc').onchange && $('fLoc').onchange(); $('fCat').onchange();
      let extra = '';
      if (g.days && !$('fExpiry').value) { $('fExpiry').value = HK.addDays($('fPurchase').value || today(), g.days); $('fEst').checked = true; extra = `,保存約 ${g.days} 天(估算,以包裝為準)`; }
      const m0 = $('recallMsg'); m0.textContent = `依品名猜是「${g.category}」,放${g.location}${extra}(可自行修改)`; m0.hidden = false; syncOpened(); return;
    }
    $('fCat').value = r.category; $('fLoc').value = r.location; $('fTemp').value = r.tempC; $('fCat').onchange();
    if (r.openDays && !$('fOpenDays').value) $('fOpenDays').value = r.openDays;
    const m = $('recallMsg');
    if (r.expiry && !$('fExpiry').value) { $('fExpiry').value = r.expiry; $('fEst').checked = true; m.textContent = `已依上次帶入(保存約 ${r.shelfDays} 天,標為估算),請對照包裝確認`; }
    else m.textContent = '已依上次帶入類別與位置';
    m.hidden = false; syncOpened();
  });
  function syncOpened() {
    const row = $('openedRow'), b = $('fOpen'), m = $('openedMsg');
    const it = editing, od = HK.okOpenDays($('fOpenDays').value), n = it && HK.openedDays(it.category, it.location, od); row.hidden = !it || it.done || !(it.openedAt || n);
    if (row.hidden) return;
    if (it.openedAt) { b.textContent = '復原開封'; m.textContent = `${it.openedAt} 開封`; }
    else { b.textContent = '已開封:縮短到期日'; m.textContent = `開封後約 ${n} 天內吃完${od ? '(你設定的天數)' : '(保守估計,以包裝為準)'}`; }
  }
  function syncFreeze() {
    const row = $('freezeRow'), it = editing, r = it && !it.done ? (it.locationBeforeFreeze ? { undo: true } : HK.freezeItem(it, today())) : null;
    row.hidden = !r; if (!r) return;
    $('fFreeze').textContent = r.undo ? '復原冷凍' : '移到冷凍保存';
    $('freezeMsg').textContent = r.undo ? `原本放${it.locationBeforeFreeze}` : `冷凍約可放 ${r.days} 天(保守估計,以食材狀態為準)`;
  }
  $('fFreeze').onclick = () => {
    const it = editing; if (!it) return;
    if (it.locationBeforeFreeze) { Object.assign(it, HK.unfreezeItem(it)); closeForm(); commit(); return; }
    const r = HK.freezeItem(it, today()); if (!r) return;
    Object.assign(it, r.item); closeForm(); commit();
    snack(`「${it.name}」移到冷凍,到期日改為 ${it.expiry}(估算)`, '復原', () => { Object.assign(it, HK.unfreezeItem(it)); commit(); });
  };
  $('fOpenDays').oninput = syncOpened;
  $('fOpen').onclick = () => {
    const it = editing; if (!it) return;
    it.openDays = HK.okOpenDays($('fOpenDays').value);
    if (it.openedAt) { Object.assign(it, HK.unopenItem(it)); delete it.openedAt; delete it.expiryBeforeOpen; closeForm(); commit(); return; }
    closeForm(); doOpen(it);
  };
  function doOpen(it) {
    const r = HK.openItem(it, today()); if (!r) return;
    Object.assign(it, r.item); commit();
    snack(r.changed ? `「${it.name}」開封,到期日改為 ${it.expiry}` : `「${it.name}」已標示開封,原到期日更早,不變`, '復原', () => { Object.assign(it, HK.unopenItem(it)); delete it.openedAt; delete it.expiryBeforeOpen; commit(); });
  }
  // 拍照辨識(需 sample 能力且 images 可用,否則整個區塊隱藏)
  let sampleFn = null, scanCtl = null;
  async function initScan() {
    try {
      if (!(window.claude && window.claude.use)) return;
      const sm = await window.claude.use('sample'); if (!sm) return;
      const lim = await sm.limits().catch(() => null); if (!lim || !lim.images) return;
      sampleFn = sm; $('scanFile').accept = lim.images.mediaTypes.join(','); $('scanBox').hidden = false; render();
    } catch (e) { /* 沒有就維持手動輸入 */ }
  }
  let thumbUrl = null;
  function showThumb(f) {
    try { if (thumbUrl) URL.revokeObjectURL(thumbUrl); thumbUrl = URL.createObjectURL(f); const t = $('scanThumb'); t.src = thumbUrl; t.hidden = false; } catch (e) { /* 預覽失敗不影響辨識 */ }
  }
  const SCAN_ERR = { not_granted: '你沒有允許使用 Claude,可以手動輸入。', rate_limited: '太頻繁了,請稍後再試。', image_rejected: '這張圖片無法使用,換一張試試。', invalid_json: '沒有讀出內容,請拍清楚一點再試。', cancelled: '已取消。' };
  $('scanBtn').onclick = () => { if (scanCtl) { scanCtl.abort(); return; } $('scanFile').click(); };
  $('scanFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f || !sampleFn) return;
    const msg = $('scanMsg'), btn = $('scanBtn'); scanCtl = new AbortController(); showThumb(f); btn.textContent = '辨識中…(再按一次取消)'; msg.textContent = '正在讀取包裝…';
    try {
      const raw = await sampleFn.json(HK.scanPrompt(today()), { images: [f], modelTier: 'quick', signal: scanCtl.signal });
      const r = HK.parseScan(raw, today());
      if (!r) { msg.textContent = '沒有認出品名,請手動輸入。'; return; }
      $('fName').value = r.name; $('fCat').value = r.category; $('fQty').value = r.quantity; $('fLoc').value = r.location; $('fTemp').value = r.tempC;
      $('fMfg').value = r.mfg; $('fExpiry').value = r.expiry; $('fEst').checked = r.estimated;
      msg.textContent = r.readDate ? '已填入,請對照包裝確認日期。' : '包裝日期看不到,到期日用類別估算,請自行確認。';
    } catch (err) { msg.textContent = SCAN_ERR[err && err.code] || '辨識失敗,請手動輸入。'; }
    finally { scanCtl = null; btn.textContent = '📷 拍照/選圖辨識'; }
  };

  // 快到期食材想菜色(沿用 sample;只送品名與剩餘天數)
  let recipeCtl = null;
  async function openRecipes() {
    const list = HK.recipeCandidates(state.items, today()); if (!list.length || !sampleFn) return;
    $('recipeWrap').hidden = false;
    $('recipeUse').textContent = '用到:' + list.map(c => c.name + (c.daysLeft === 0 ? '(今天)' : `(${c.daysLeft}天)`)).join('、');
    const out = $('recipeOut'), btn = $('recipeAgain'); out.textContent = '正在想菜色…'; btn.disabled = true;
    if (recipeCtl) recipeCtl.abort(); const ctl = recipeCtl = new AbortController();
    try {
      const raw = await sampleFn.json(HK.recipePrompt(list, today()), { modelTier: 'quick', signal: ctl.signal });
      const rs = HK.parseRecipes(raw, list); out.textContent = '';
      if (!rs.length) { out.textContent = '這次沒想出合適的菜色,再試一次看看。'; return; }
      for (const r of rs) {
        const d = el('div', 'rcp'); d.append(el('b', '', r.title + (r.minutes ? `・約 ${r.minutes} 分鐘` : '')), el('div', 'note', '用到:' + r.uses.join('、')), el('div', '', r.how)); out.append(d);
      }
      out.append(el('div', 'note', '食譜由 Claude 提供,僅供參考;食材若有異味或外觀不對請勿食用。'));
    } catch (err) { if (ctl.signal.aborted) return; out.textContent = SCAN_ERR[err && err.code] || '想不出來,請稍後再試。'; }
    finally { if (recipeCtl === ctl) { recipeCtl = null; btn.disabled = false; } }
  }
  const closeRecipes = () => { if (recipeCtl) recipeCtl.abort(); recipeCtl = null; $('recipeWrap').hidden = true; };
  $('recipeClose').onclick = closeRecipes; $('recipeAgain').onclick = openRecipes;
  $('recipeWrap').addEventListener('click', e => { if (e.target === $('recipeWrap')) closeRecipes(); });

  // 一次新增多項
  const bulkSync = () => { const r = HK.parseBulk($('bulkText').value, today()); $('bulkPrev').textContent = r.items.length ? `將加入 ${r.items.length} 項:` + r.items.slice(0, 8).map(i => `${i.name}×${i.quantity}(${i.category}/${i.location})`).join('、') + (r.items.length > 8 ? '…' : '') + (r.skipped.length ? `;略過 ${r.skipped.length} 行無法辨識` : '') : ''; $('bulkSave').disabled = !r.items.length; };
  $('bulkFromForm').onclick = () => { closeForm(); $('bulkOpen').onclick(); };
  $('bulkOpen').onclick = () => { $('bulkText').value = ''; bulkSync(); $('bulkWrap').hidden = false; setTimeout(() => $('bulkText').focus(), 50); };
  $('bulkText').oninput = bulkSync;
  $('bulkCancel').onclick = () => { $('bulkWrap').hidden = true; };
  $('bulkWrap').addEventListener('click', e => { if (e.target === $('bulkWrap')) $('bulkWrap').hidden = true; });
  $('bulkSave').onclick = () => {
    const r = HK.parseBulk($('bulkText').value, today()); if (!r.items.length) return;
    state.items.push(...r.items); $('bulkWrap').hidden = true; commit();
    const ids = new Set(r.items.map(i => i.id));
    snack(`已加入 ${r.items.length} 項(到期日為估算)`, '復原', () => { state.items = state.items.filter(i => !ids.has(i.id)); commit(); });
  };
  const closeForm = () => { $('formWrap').hidden = true; editing = null; shopFrom = null; };
  $('fab').onclick = () => openForm(null);
  $('addWide').onclick = () => openForm(null);
  $('fCancel').onclick = closeForm;
  $('formWrap').addEventListener('click', e => { if (e.target === $('formWrap')) closeForm(); });
  $('fSave').onclick = () => {
    const r = HK.makeItem({ name: $('fName').value, category: $('fCat').value, location: $('fLoc').value, quantity: $('fQty').value, tempC: $('fTemp').value, purchase: $('fPurchase').value, mfg: $('fMfg').value, expiry: $('fExpiry').value, estimated: $('fEst').checked, notes: $('fNotes').value, openDays: $('fOpenDays').value, openedAt: editing && editing.openedAt, expiryBeforeOpen: editing && editing.expiryBeforeOpen }, today(), editing ? editing.id : undefined);
    if (r.errors.length) { $('formErrs').textContent = r.errors.join('、'); return; }
    { const dw = HK.dateWarnings(r.item, today()), key = dw.join('|') + r.item.expiry;
      if (dw.length && $('fSave').dataset.dateOk !== key) { $('formErrs').textContent = dw.join('、') + '。確定的話再按一次儲存。'; $('fSave').dataset.dateOk = key; return; } }
    if (!editing && $('fSave').dataset.dupOk !== r.item.name + '|' + r.item.location) {
      const dup = HK.findDuplicate(state.items, r.item.name, r.item.location);
      if (dup) { $('formErrs').textContent = `「${dup.name}」已在${dup.location}(${dup.expiry} 到期)。若是另一批,再按一次儲存。`; $('fSave').dataset.dupOk = r.item.name + '|' + r.item.location; return; }
    }
    $('fSave').dataset.dupOk = '';
    if (editing) { Object.assign(editing, r.item, { done: editing.done, doneAt: editing.doneAt, createdAt: editing.createdAt }); delete editing.locationBeforeFreeze; delete editing.expiryBeforeFreeze; delete editing.tempCBeforeFreeze; }
    else { state.items.push(r.item); if (shopFrom) state.shopping = state.shopping.filter(x => x.id !== shopFrom); }
    closeForm(); commit();
  };
  $('fDelete').onclick = () => {
    const b = $('fDelete');
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = '再按一次確認刪除'; return; }
    const gone = editing; closeForm(); removeItem(gone);
  };

  // ---------- 設定 ----------
  for (let h = 0; h < 24; h++) $('sHour').append(new Option(`${String(h).padStart(2, '0')}:00`, h));
  { const sel = $('sortSel'); for (const [k, v] of Object.entries(HK.SORTS)) sel.append(new Option('排序:' + v, k)); sel.value = sortMode;
    sel.onchange = () => { sortMode = HK.SORTS[sel.value] ? sel.value : 'expiry'; try { localStorage.setItem('hk-sort', sortMode); } catch (e) {} render(); }; }
  $('btnSettings').onclick = () => { $('sDays').value = state.settings.reminderDays; $('sHour').value = state.settings.reminderHour; $('exportMsg').textContent = ''; $('setWrap').hidden = false; };
  $('sClose').onclick = () => {
    const d = Math.round(Number($('sDays').value)); state.settings.reminderDays = d >= 0 && d <= 60 ? d : 3; state.settings.reminderHour = +$('sHour').value;
    $('setWrap').hidden = true; commit();
  };
  $('setWrap').addEventListener('click', e => { if (e.target === $('setWrap')) $('sClose').click(); });
  $('sSample').onclick = loadSample;
  $('sCopy').onclick = () => { $('setWrap').hidden = true; copyText(HK.expiringText(state.items, today(), 7), '快到期清單'); };
  $('sExport').onclick = async () => {
    const d = Math.round(Number($('sDays').value)), h = +$('sHour').value;
    const ics = HK.toICS(state.items, { reminderDays: d >= 0 && d <= 60 ? d : 3, reminderHour: h }), msg = $('exportMsg');
    if (!state.items.some(i => !i.done)) { msg.textContent = '目前沒有待處理的物品可匯出。'; return; }
    try {
      const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
      if (dl) { await dl.save({ filename: 'housekeeper-expiry.ics', data: new Blob([ics], { type: 'text/calendar' }) }); msg.textContent = '已匯出,用行事曆 App 開啟檔案即可加入提醒。'; }
      else { const a = el('a'); a.href = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' })); a.download = 'housekeeper-expiry.ics'; document.body.append(a); a.click(); a.remove(); msg.textContent = '已下載 housekeeper-expiry.ics。'; }
    } catch (e) { msg.textContent = '沒有儲存成功(可能被取消了)。'; }
  };

  // 備份/還原
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  if (!lsGet('hk-backup-since')) lsSet('hk-backup-since', today());
  async function saveFile(name, text, type) {
    const dl = window.claude && window.claude.use ? await window.claude.use('downloads') : null;
    if (dl) return dl.save({ filename: name, data: new Blob([text], { type }) });
    const a = el('a'); a.href = URL.createObjectURL(new Blob([text], { type })); a.download = name; document.body.append(a); a.click(); a.remove();
  }
  $('sBackup').onclick = async () => {
    try { await saveFile('housekeeper-backup-' + today() + '.json', HK.exportBackup(state), 'application/json'); lsSet('hk-backup', today()); render(); $('backupMsg').textContent = `已備份 ${state.items.length} 項物品。`; }
    catch (e) { $('backupMsg').textContent = '沒有儲存成功(可能被取消了)。'; }
  };
  $('sCsv').onclick = async () => {
    try { await saveFile('housekeeper-items-' + today() + '.csv', HK.toCSV(state.items, today()), 'text/csv'); $('backupMsg').textContent = `已匯出 ${state.items.length} 項物品為 CSV(可用試算表開啟)。`; }
    catch (e) { $('backupMsg').textContent = '沒有儲存成功(可能被取消了)。'; }
  };
  $('sCsvIn').onclick = () => $('sCsvFile').click();
  $('sCsvFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const msg = $('backupMsg');
    if (f.size > 5e6) { msg.textContent = '檔案太大,不像是物品清單。'; return; }
    const r = HK.parseCSV(await f.text(), today(), state.items);
    if (!r.ok) { msg.textContent = r.error + '。'; return; }
    state.items = HK.mergeItems(state.items, r.items); commit();
    msg.textContent = `已匯入 ${r.items.length} 項物品` + (r.duplicates ? `,${r.duplicates} 項與現有清單重複而略過` : '') + (r.skipped ? `,${r.skipped} 列資料無效(需有名稱與有效到期日)` : '') + '。';
  };
  $('sRestore').onclick = () => $('sFile').click();
  $('sFile').onchange = async e => {
    const f = e.target.files[0]; e.target.value = ''; if (!f) return;
    const msg = $('backupMsg');
    if (f.size > 5e6) { msg.textContent = '檔案太大,不像是備份檔。'; return; }
    const r = HK.parseBackup(await f.text(), today());
    if (!r.ok) { msg.textContent = r.error + '。'; return; }
    state.items = HK.mergeItems(state.items, r.items); state.shopping = HK.mergeItems(state.shopping, r.shopping); state.settings = Object.assign(state.settings, r.settings); commit();
    msg.textContent = `已還原 ${r.items.length} 項物品` + (r.skipped ? `,略過 ${r.skipped} 筆無效資料。` : '。');
  };

  // 統計
  function showStats() {
    const s = HK.stats(state.items, today()), body = $('statBody'); body.textContent = '';
    if (!state.items.length) { body.append(el('p', 'note', '還沒有資料。新增物品、處理幾項之後,這裡會顯示浪費率與類別分佈。')); }
    else {
      const big = el('div', 'big');
      for (const [v, l] of [[String(s.activeCount), '待處理'], [String(s.doneCount), '已處理'], [s.wasteRate === null ? '—' : Math.round(s.wasteRate * 100) + '%', '浪費率']]) { const d = el('div'); d.append(el('b', '', v), el('span', '', l)); big.append(d); }
      body.append(big);
      body.append(el('p', 'note', s.doneCount ? `已處理的 ${s.doneCount} 項中,${s.used} 項在到期前處理、${s.wasted} 項是過期後才處理。` : '浪費率 = 過期後才處理的比例,處理過物品後才會出現。'));
      if (s.cleanDays !== null) body.append(el('p', 'note', s.cleanDays === 0 ? (s.lastWasted ? '今天有東西過期才處理,明天重新累積無浪費的天數。' : '今天開始累積無浪費的天數。') : `已連續 ${s.cleanDays} 天沒有浪費${s.lastWasted ? '(自上次過期才處理起算)' : ''},繼續保持!`));
      if (s.doneCount) {
        body.append(el('h2', '', '最近 4 週處理'));
        const wk = el('div', 'bars'), wmax = Math.max(1, ...s.weeks.map(w => w.used + w.wasted));
        for (const w of s.weeks) {
          const r = el('div', 'bar'), st = el('div', 'stack'), n = w.used + w.wasted;
          st.style.width = n ? Math.max(4, n / wmax * 100) + '%' : '0';
          if (w.used) { const u = el('i'); u.style.flex = String(w.used); st.append(u); }
          if (w.wasted) { const x = el('i', 'w'); x.style.flex = String(w.wasted); st.append(x); }
          const sw = el('div', 'stackwrap'); sw.append(st);
          r.append(el('span', '', w.weeksAgo ? w.weeksAgo + ' 週前' : '本週'), sw, el('em', '', String(n)));
          r.title = `吃完/用完 ${w.used} 項、過期才處理 ${w.wasted} 項`; wk.append(r);
        }
        wk.setAttribute('role', 'img'); wk.setAttribute('aria-label', '最近 4 週處理數量:' + s.weeks.map(w => (w.weeksAgo ? w.weeksAgo + ' 週前' : '本週') + ' ' + (w.used + w.wasted) + ' 項(過期 ' + w.wasted + ')').join('、'));
        body.append(wk);
        const lg = el('p', 'note legend'); lg.innerHTML = '<span class="dot"></span>到期前處理 <span class="dot w"></span>過期才處理'; body.append(lg);
      }
      if (s.topWasted.length) {
        body.append(el('h2', '', '最常過期才處理'));
        const tw = el('div', 'bars'), tmax = s.topWasted[0].count;
        for (const c of s.topWasted) { const r = el('div', 'bar'), i = el('i'); i.style.width = Math.max(4, c.count / tmax * 100) + '%'; i.style.background = 'var(--expired)'; r.append(el('span', '', c.name), i, el('em', '', String(c.count))); tw.append(r); }
        body.append(tw);
      }
      body.append(el('h2', '', '待處理的類別'));
      if (s.categories.length) { const bars = el('div', 'bars'), max = s.categories[0].count; for (const c of s.categories) { const r = el('div', 'bar'), i = el('i'); i.style.width = Math.max(4, c.count / max * 100) + '%'; r.append(el('span', '', c.name), i, el('em', '', String(c.count))); bars.append(r); } body.append(bars); }
      else body.append(el('p', 'note', '目前沒有待處理的物品。'));
    }
    $('statWrap').hidden = false;
  }
  $('btnStats').onclick = showStats; $('statClose').onclick = () => { $('statWrap').hidden = true; };
  $('statWrap').addEventListener('click', e => { if (e.target === $('statWrap')) $('statWrap').hidden = true; });

  // 對話框焦點管理:開啟時移入、Tab 不跳出、關閉時還原到原本的按鈕
  const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]):not([type=hidden]),select,textarea,[tabindex]:not([tabindex="-1"])';
  const openWrap = () => [...document.querySelectorAll('.sheetwrap')].find(w => !w.hidden);
  const lastFocus = new Map();
  for (const w of document.querySelectorAll('.sheetwrap')) {
    new MutationObserver(() => {
      if (!w.hidden) {
        if (!lastFocus.has(w)) lastFocus.set(w, document.activeElement);
        const sheet = w.querySelector('.sheet'); sheet.setAttribute('tabindex', '-1');
        setTimeout(() => { if (!w.hidden && !w.contains(document.activeElement)) { const f = [...sheet.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null)[0]; (f || sheet).focus(); } }, 60);
      } else { const p = lastFocus.get(w); lastFocus.delete(w); if (p && p.focus && document.contains(p)) p.focus(); }
    }).observe(w, { attributes: true, attributeFilter: ['hidden'] });
  }
  document.addEventListener('keydown', e => {
    if (e.key !== 'Tab') return; const w = openWrap(); if (!w) return;
    const f = [...w.querySelectorAll(FOCUSABLE)].filter(x => x.offsetParent !== null); if (!f.length) return;
    const first = f[0], last = f[f.length - 1];
    if (!w.contains(document.activeElement)) { e.preventDefault(); first.focus(); }
    else if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeForm(); $('shopWrap').hidden = true; $('bulkWrap').hidden = true; $('setWrap').hidden = true; $('statWrap').hidden = true; if (!$('recipeWrap').hidden) closeRecipes(); } });
  // 桌機快捷鍵:/ 搜尋、n 新增(輸入中或對話框開著時不觸發)
  document.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, typing = t && (/^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName) || t.isContentEditable);
    if (typing || document.querySelector('.sheetwrap:not([hidden])')) return;
    if (e.key === '/') { e.preventDefault(); $('search').focus(); }
    else if (e.key === 'n' || e.key === 'N') { e.preventDefault(); openForm(null); }
  });
  $('search').addEventListener('input', e => { query = e.target.value; render(); });
  window.__hk = { state: () => state, commit };
  render(); initCloud(); initScan();
})();
