// housekeeper 網頁版介面。資料先存本機(localStorage),有 db 時同步到雲端(私人、跨裝置)。
(function () {
  const $ = id => document.getElementById(id);
  const today = () => HK.todayStr();
  const DEFAULT = () => ({ items: [], settings: { reminderDays: 3, reminderHour: 9 }, updatedAt: 0 });

  // ---------- 儲存 ----------
  const LS = 'housekeeper.state.v1';
  function loadLocal() { try { const s = JSON.parse(localStorage.getItem(LS)); if (s && Array.isArray(s.items)) return s; } catch (e) { /* 略過 */ } return null; }
  function saveLocal() { try { localStorage.setItem(LS, JSON.stringify(state)); } catch (e) { /* 隱私模式等:略過 */ } }

  let state = loadLocal() || DEFAULT();
  state.settings = Object.assign(DEFAULT().settings, state.settings);
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
        if (win === remote && remote) { state = JSON.parse(JSON.stringify(remote)); state.settings = Object.assign(DEFAULT().settings, state.settings); saveLocal(); render(); setSync('已同步到雲端'); }
        else if (!remote && state.updatedAt) { dirty = true; flush(); }
        else setSync('已同步到雲端');
      }, () => setSync('雲端不可用,資料保存在這個裝置'));
    } catch (e) { /* 沒有雲端:維持本機模式 */ }
  }

  // ---------- 清單 ----------
  let locFilter = '', query = '';
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
    const days = HK.daysLeft(item.expiry, today()), li = el('li', 'row');
    li.append(mode === 'done' ? (() => { const b = el('div', 'badge ok'); b.append(el('b', '', '✓'), el('small', '', '已處理')); return b; })() : badge(days));
    const info = el('button', 'info'); info.type = 'button';
    info.append(el('div', 'nm', item.name + (item.quantity > 1 ? ` ×${item.quantity}` : '')));
    info.append(el('div', 'meta', `${item.category}・${item.location}${item.tempC !== null ? ' ' + item.tempC + '°C' : ''}`));
    info.append(el('div', 'meta', `${item.expiry}${item.estimated ? '(估算)' : ''}`));
    info.onclick = () => openForm(item);
    li.append(info);
    if (mode === 'done') {
      const acts = el('div', 'acts'), undo = el('button', '', '還原'), del = el('button', 'danger', '刪除');
      undo.onclick = () => { item.done = false; item.doneAt = null; commit(); };
      del.onclick = () => { if (del.dataset.arm) { state.items = state.items.filter(i => i.id !== item.id); commit(); } else { del.dataset.arm = '1'; del.textContent = '確定?'; setTimeout(() => { del.dataset.arm = ''; del.textContent = '刪除'; }, 2500); } };
      acts.append(undo, del); li.append(acts);
    } else {
      const d = el('button', 'done-btn', '吃完'); d.title = '標記為已吃完/已處理';
      d.onclick = () => { item.done = true; item.doneAt = Date.now(); commit(); };
      li.append(d);
    }
    return li;
  }

  function render() {
    const t = today(), active = state.items.filter(i => !i.done), done = state.items.filter(i => i.done);
    // 摘要
    const s = HK.summarize(state.items, t), stats = $('stats'); stats.textContent = '';
    for (const k of ['expired', 'urgent', 'soon', 'ok']) { const d = el('div', 'stat ' + k); d.append(el('b', '', String(s[k])), el('span', '', STATUS_LABEL[k])); stats.append(d); }
    // 提醒橫幅:已過期,或在「提醒天數」內
    const need = active.filter(i => HK.daysLeft(i.expiry, t) <= state.settings.reminderDays), bad = active.filter(i => HK.daysLeft(i.expiry, t) < 0).length;
    const bn = $('banner'); bn.textContent = '';
    if (need.length) { const b = el('div', 'banner' + (bad ? ' bad' : ''), bad ? `有 ${bad} 項已過期,另有 ${need.length - bad} 項快到期,請盡快處理` : `有 ${need.length} 項在 ${state.settings.reminderDays} 天內到期`); bn.append(b); }
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
    const shown = HK.sortByExpiry(HK.filterItems(active, { location: locFilter, query }));
    if (!shown.length) {
      const li = el('li', 'empty');
      if (!state.items.length) {
        li.append(el('h2', '', '還沒有任何物品'), el('div', '', '記下冰箱和家裡會到期的東西,到期前會提醒你。'));
        const a = el('div', 'actions'), add = el('button', 'primary', '新增第一個物品'), sample = el('button', '', '載入範例看看');
        add.onclick = () => openForm(null); sample.onclick = loadSample; a.append(add, sample); li.append(a);
      } else li.append(el('h2', '', active.length ? '沒有符合的物品' : '目前沒有待處理的物品'), el('div', '', active.length ? '換個關鍵字或位置試試。' : '全部都處理完了!'));
      list.append(li);
    } else for (const i of shown) list.append(rowFor(i, 'active'));
    // 已處理
    $('hist').hidden = !done.length; $('histSum').textContent = `已處理(${done.length})`;
    const hl = $('histList'); hl.textContent = ''; for (const i of HK.sortByExpiry(done).reverse()) hl.append(rowFor(i, 'done'));
    $('sync').textContent = syncMsg;
  }

  function loadSample() {
    const ids = new Set(state.items.map(i => i.id));
    for (const i of HK.sampleItems(today())) if (!ids.has(i.id)) state.items.push(i);
    commit(); $('setWrap').hidden = true;
  }

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

  $('fLoc').onchange = () => { const l = HK.LOCATIONS.find(x => x.name === $('fLoc').value); $('fTemp').value = l && l.tempC !== null ? l.tempC : ''; };
  $('qMinus').onclick = () => { $('fQty').value = Math.max(1, (+$('fQty').value || 1) - 1); };
  $('qPlus').onclick = () => { $('fQty').value = Math.min(99, (+$('fQty').value || 1) + 1); };

  function openForm(item) {
    editing = item; $('formErrs').textContent = ''; $('formTitle').textContent = item ? '編輯物品' : '新增物品';
    $('fName').value = item ? item.name : ''; $('fCat').value = item ? item.category : HK.CATEGORIES[0]; $('fQty').value = item ? item.quantity : 1;
    $('fLoc').value = item ? item.location : '冷藏'; $('fTemp').value = item ? (item.tempC === null ? '' : item.tempC) : 4;
    $('fPurchase').value = item ? item.purchase : today(); $('fMfg').value = item && item.mfg ? item.mfg : '';
    $('fExpiry').value = item ? item.expiry : ''; $('fEst').checked = item ? item.estimated : false; $('fNotes').value = item ? item.notes : '';
    $('fDelete').hidden = !item; $('fDelete').textContent = '刪除'; $('fDelete').dataset.arm = '';
    $('formWrap').hidden = false; if (!item) setTimeout(() => $('fName').focus(), 50);
  }
  const closeForm = () => { $('formWrap').hidden = true; editing = null; };
  $('fab').onclick = () => openForm(null);
  $('fCancel').onclick = closeForm;
  $('formWrap').addEventListener('click', e => { if (e.target === $('formWrap')) closeForm(); });
  $('fSave').onclick = () => {
    const r = HK.makeItem({ name: $('fName').value, category: $('fCat').value, location: $('fLoc').value, quantity: $('fQty').value, tempC: $('fTemp').value, purchase: $('fPurchase').value, mfg: $('fMfg').value, expiry: $('fExpiry').value, estimated: $('fEst').checked, notes: $('fNotes').value }, today(), editing ? editing.id : undefined);
    if (r.errors.length) { $('formErrs').textContent = r.errors.join('、'); return; }
    if (editing) { Object.assign(editing, r.item, { done: editing.done, doneAt: editing.doneAt, createdAt: editing.createdAt }); }
    else state.items.push(r.item);
    closeForm(); commit();
  };
  $('fDelete').onclick = () => {
    const b = $('fDelete');
    if (!b.dataset.arm) { b.dataset.arm = '1'; b.textContent = '再按一次確認刪除'; return; }
    state.items = state.items.filter(i => i.id !== editing.id); closeForm(); commit();
  };

  // ---------- 設定 ----------
  for (let h = 0; h < 24; h++) $('sHour').append(new Option(`${String(h).padStart(2, '0')}:00`, h));
  $('btnSettings').onclick = () => { $('sDays').value = state.settings.reminderDays; $('sHour').value = state.settings.reminderHour; $('exportMsg').textContent = ''; $('setWrap').hidden = false; };
  $('sClose').onclick = () => {
    const d = Math.round(Number($('sDays').value)); state.settings.reminderDays = d >= 0 && d <= 60 ? d : 3; state.settings.reminderHour = +$('sHour').value;
    $('setWrap').hidden = true; commit();
  };
  $('setWrap').addEventListener('click', e => { if (e.target === $('setWrap')) $('sClose').click(); });
  $('sSample').onclick = loadSample;
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

  document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeForm(); $('setWrap').hidden = true; } });
  $('search').addEventListener('input', e => { query = e.target.value; render(); });
  window.__hk = { state: () => state, commit };
  render(); initCloud();
})();
