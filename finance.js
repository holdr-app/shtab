import { register } from './registry.js';
import * as db from './db.js';
import { rub, esc, pad, dayKey, MONTHS, MONTHS_G, parseOldExport, DEFAULT_CATS, mergeCats } from './lib.js';
import { toast, ask, askText, removeWithUndo, closeSheet, trackDirty, relDay, ICON } from './ui.js';

const st = { tab: 'ov', off: 0, f: 'all', cat: '' };   // вкладка, сдвиг месяца, фильтр истории           // вкладка и сдвиг месяца
let recs = [], cats = null, limits = {}, credit = null;

async function load() {
  recs = await db.all('money');
  const c = await db.get('settings', 'cats'); cats = c ? c.v : structuredClone(DEFAULT_CATS);
  const l = await db.get('settings', 'limits'); limits = l ? l.v : {};
  const cr = await db.get('settings', 'credit'); credit = cr ? cr.v : null;
}
const saveCats = () => db.put('settings', { id: 'cats', v: cats });
const saveLimits = () => db.put('settings', { id: 'limits', v: limits });
const monthOf = off => { const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + off); return d; };
const inMonth = (r, d) => { const x = new Date(r.ts); return x.getFullYear() === d.getFullYear() && x.getMonth() === d.getMonth(); };
const sum = a => a.reduce((s, r) => s + r.amount, 0);
const usage = type => { const m = {}; for (const r of recs) if (r.type === type) m[r.cat] = (m[r.cat] || 0) + 1; return m; };

function head(el, d) {
  return `<div class="seg" role="tablist"><button data-act="tab" data-v="ov" role="tab" aria-selected="${st.tab === 'ov'}">Обзор</button><button data-act="tab" data-v="hist" role="tab" aria-selected="${st.tab === 'hist'}">История</button></div>
  <div class="mnav"><button data-act="prev" aria-label="Предыдущий месяц">‹</button><span>${MONTHS[d.getMonth()]} ${d.getFullYear()}</span><button data-act="next" aria-label="Следующий месяц" ${st.off >= 0 ? 'disabled' : ''}>›</button></div>`;
}
function overview(d) {
  const m = recs.filter(r => inMonth(r, d)), inc = sum(m.filter(r => r.type === 'inc')), exp = sum(m.filter(r => r.type === 'exp'));
  const bal = inc - exp;
  const by = {}; for (const r of m) if (r.type === 'exp') by[r.cat] = (by[r.cat] || 0) + r.amount;
  const rows = Object.entries(by).sort((a, b) => b[1] - a[1]).map(([n, a]) => {
    const lim = limits[n], pct = lim ? a / lim * 100 : 0;
    const col = !lim ? 'var(--acc)' : pct > 100 ? 'var(--over)' : pct >= 90 ? 'var(--warn)' : 'var(--acc)';
    const tag = lim ? (pct > 100 ? `<b style="color:${col}">перебор ${rub(a - lim)}</b>` : pct >= 90 ? `<b style="color:${col}">почти лимит</b>` : '') : '';
    const w = lim ? Math.min(100, pct) : (a / exp * 100);
    return `<button class="catrow" data-act="showcat" data-n="${esc(n)}" aria-label="${esc(n)}: ${rub(a)}. Показать записи"><div class="l"><span>${esc(n)} ${tag}</span><span><b>${rub(a)}</b>${lim ? `<span class="mut"> из ${rub(lim)}</span>` : ''}</span></div><div class="bar"><i style="width:${w.toFixed(0)}%;background:${col}"></i></div></button>`;
  }).join('') || '<div class="mut">В этом месяце расходов нет.</div>';
  if (!m.length && !recs.length) return `<div class="empty"><b>Записей пока нет</b><p>Добавь первую трату кнопкой ниже или перенеси данные из старого приложения в настройках.</p><button class="save" data-act="add">Добавить трату</button><a class="btn wide" href="#settings">Импорт из CSV</a></div>`;
  const crd = credit ? (() => { const left = Math.max(0, credit.left), done = credit.total ? Math.round((1 - left / credit.total) * 100) : 0, mo = credit.pay ? Math.ceil(left / credit.pay) : 0;
    return `<button class="card crd" data-act="credit"><div class="lab">Кредитка <span class="mut">изменить ›</span></div><div class="cl"><b>${rub(left)}</b><span class="mut">осталось${left && credit.pay ? ' · платежей: ' + mo : ''}</span></div><div class="bar"><i style="width:${done}%;background:var(--acc)"></i></div><div class="mut" style="font-size:13px;margin-top:8px">${left ? `Платёж ${rub(Math.min(credit.pay, left))} · ${credit.day} числа` : 'Кредитка закрыта'}</div></button>${left ? '<button class="btn wide" data-act="cpay">Платёж внесён</button>' : ''}`; })()
    : '<button class="btn wide" data-act="credit">Добавить кредитку</button>';
  return `<div class="bal"><div>Остаток за месяц</div><strong>${bal >= 0 ? '+' : '−'}${rub(Math.abs(bal))}</strong><div class="two"><div><small>Доходы</small><b class="inc">+${rub(inc)}</b></div><div><small>Расходы</small><b>−${rub(exp)}</b></div></div></div>
  ${crd}<div class="card"><div class="lab">Расходы по категориям <span class="mut">нажми, чтобы увидеть записи</span></div>${rows}</div>
  <div class="card"><div class="lab">Категории и лимиты</div><div class="btns"><button class="btn" data-act="cats" data-v="exp">Расходы</button><button class="btn" data-act="cats" data-v="inc">Доходы</button></div></div>`;
}
function history(d) {
  const all = recs.filter(r => inMonth(r, d)), m = all.filter(r => (st.f === 'all' || r.type === st.f) && (!st.cat || r.cat === st.cat)).sort((a, b) => b.ts - a.ts);
  const fl = `<div class="chips tabs">${[['all', 'Все'], ['exp', 'Расходы'], ['inc', 'Доходы']].map(([k, n]) => `<button data-act="hf" data-v="${k}" aria-pressed="${st.f === k && !st.cat}">${n}</button>`).join('')}${st.cat ? `<button data-act="hcat" aria-pressed="true" aria-label="Убрать фильтр ${esc(st.cat)}">${esc(st.cat)} ✕</button>` : ''}</div>`;
  if (!m.length) return fl + `<div class="card mut">${all.length ? 'По этому фильтру записей нет.' : 'В этом месяце записей нет.'}</div>`;
  const g = {}; for (const r of m) (g[dayKey(r.ts)] ||= []).push(r);
  const tot = sum(m.filter(r => r.type === 'inc')) - sum(m.filter(r => r.type === 'exp'));
  return fl + `<div class="mut" style="font-size:13px">${m.length} записей · итого ${tot >= 0 ? '+' : '−'}${rub(Math.abs(tot))}. Нажми на запись, чтобы изменить или удалить.</div>` + Object.entries(g).map(([k, a]) => {
    const tot = sum(a.filter(r => r.type === 'inc')) - sum(a.filter(r => r.type === 'exp'));
    return `<div class="dh"><span>${relDay(k, MONTHS_G)}</span><span>${tot >= 0 ? '+' : '−'}${rub(Math.abs(tot))}</span></div><div class="card list">${a.map(r => `<button class="item" data-act="edit" data-id="${esc(r.id)}"><div><b>${esc(r.cat)}</b><small>${esc([r.sub, r.comment].filter(Boolean).join(' · ') || (r.type === 'inc' ? 'Доход' : ''))}</small></div><span class="${r.type}">${r.type === 'inc' ? '+' : '−'}${rub(r.amount)}</span></button>`).join('')}</div>`;
  }).join('');
}

// ---- добавление записи
function sheet(type = 'exp', pre = {}, edit = null) {
  let s = edit ? { type: edit.type, cat: edit.cat, sub: edit.sub || '', amount: String(edit.amount), date: dayKey(edit.ts), account: edit.account || 'Карта', comment: edit.comment || '' }
    : { type, cat: pre.cat || null, sub: pre.sub || '', amount: pre.amount || '', date: pre.date || dayKey(Date.now()), account: 'Карта', comment: '' };
  const root = document.createElement('div'); root.className = 'sheet'; trackDirty(root);
  const accounts = [...new Set(['Карта', 'Наличные', ...recs.map(r => r.account)])];
  const draw = () => {
    const use = usage(s.type), list = [...cats[s.type]].sort((a, b) => (use[b.n] || 0) - (use[a.n] || 0));
    const c = list.find(x => x.n === s.cat);
    const freq = {}; for (const r of recs) if (r.type === s.type) { const k = [r.cat, r.sub, r.amount].join('|'); freq[k] = (freq[k] || 0) + 1; }
    const pres = Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([k]) => k.split('|'));
    root.innerHTML = `<div class="panel"><div class="ph"><button data-s="close" aria-label="Закрыть">${ICON.close}</button><b>${edit ? 'Изменить запись' : s.type === 'exp' ? 'Новая трата' : 'Новый доход'}</b></div>
    <div class="seg"><button data-s="type" data-v="exp" aria-selected="${s.type === 'exp'}">Расход</button><button data-s="type" data-v="inc" aria-selected="${s.type === 'inc'}">Доход</button></div>
    <div class="amt"><input id="amt" inputmode="decimal" placeholder="0" aria-label="Сумма" value="${esc(s.amount)}"><span>₽</span></div>
    ${pres.length && !edit ? `<div class="lab">Часто</div><div class="chips">${pres.map(([ct, sb, am]) => `<button data-s="pre" data-c="${esc(ct)}" data-b="${esc(sb)}" data-a="${esc(am)}">${esc(sb || ct)} · ${rub(am)}</button>`).join('')}</div>` : ''}
    <div class="lab">Категория <button class="lnk" data-s="cats">Изменить список</button></div><div class="grid">${list.map(x => `<button data-s="cat" data-n="${esc(x.n)}" aria-pressed="${x.n === s.cat}">${esc(x.n)}</button>`).join('')}${s.cat && !list.some(x => x.n === s.cat) ? `<button data-s="cat" data-n="${esc(s.cat)}" aria-pressed="true">${esc(s.cat)}</button>` : ''}</div>
    ${c && c.subs.length ? `<div class="lab">Подкатегория «${esc(c.n)}»</div><div class="chips">${c.subs.map(b => `<button data-s="sub" data-n="${esc(b)}" aria-pressed="${b === s.sub}">${esc(b)}</button>`).join('')}</div>` : ''}
    <div class="row3"><input type="date" id="dt" value="${s.date}" aria-label="Дата"><select id="acc" aria-label="Счёт">${accounts.map(a => `<option ${a === s.account ? 'selected' : ''}>${esc(a)}</option>`).join('')}</select></div>
    <input id="cm" placeholder="Комментарий" aria-label="Комментарий" value="${esc(s.comment)}">
    <button class="save" data-s="save">Сохранить</button>${edit ? '<button class="ghost danger-t" data-s="del">Удалить запись</button>' : ''}</div>`;
  };
  const sync = () => { s.amount = root.querySelector('#amt').value; s.date = root.querySelector('#dt').value; s.account = root.querySelector('#acc').value; s.comment = root.querySelector('#cm').value; };
  root.addEventListener('click', async e => {
    const b = e.target.closest('[data-s]'); if (!b) return; sync(); const a = b.dataset.s;
    if (a === 'close') return closeSheet(root);
    if (a === 'del') { root.remove(); return removeWithUndo([['money', edit]], 'Запись удалена', render); }
    if (a === 'cats') return catsSheet(s.type, () => draw());
    if (a === 'type') { s.type = b.dataset.v; s.cat = null; s.sub = ''; }
    if (a === 'cat') { s.cat = b.dataset.n; s.sub = ''; }
    if (a === 'sub') s.sub = s.sub === b.dataset.n ? '' : b.dataset.n;
    if (a === 'pre') { s.cat = b.dataset.c; s.sub = b.dataset.b; s.amount = b.dataset.a; root.dataset.dirty = '1'; }
    if (a === 'cat' || a === 'sub') root.dataset.dirty = '1';
    if (a === 'save') {
      const amount = parseFloat(String(s.amount).replace(/\s/g, '').replace(',', '.'));
      if (!(amount > 0)) { toast('Введи сумму'); return root.querySelector('#amt').focus(); }
      if (!s.cat) return toast('Выбери категорию');
      const [y, m, d] = s.date.split('-').map(Number), t0 = edit ? new Date(edit.ts) : new Date();
      const ts = new Date(y, m - 1, d, t0.getHours(), t0.getMinutes()).getTime();
      const saved = await db.put('money', { ...(edit || {}), type: s.type, amount, cat: s.cat, sub: s.sub, account: s.account, comment: s.comment.trim(), ts });
      root.remove(); await render();
      if (edit) toast('Изменения сохранены');
      else toast(`${s.type === 'exp' ? '−' : '+'}${rub(amount)} · ${s.sub || s.cat}`, { undo: async () => { await db.del('money', saved.id); render(); } });
      return;
    }
    draw();
  });
  draw(); document.body.append(root); if (!edit) setTimeout(() => root.querySelector('#amt').focus(), 50);
}
// Управление категориями: переименовать, удалить, добавить, подкатегории.
function catsSheet(type, after) {
  const r = document.createElement('div'); r.className = 'sheet in'; r.style.zIndex = 12; let open = null;
  const draw = () => {
    const list = cats[type];
    r.innerHTML = `<div class="panel"><div class="ph"><button data-c="close" aria-label="Закрыть">${ICON.close}</button><b>Категории ${type === 'exp' ? 'расходов' : 'доходов'}</b></div>
    <div class="card list">${list.map((c, i) => `<div class="crow"><button class="item" data-c="open" data-i="${i}" aria-expanded="${open === i}"><div><b>${esc(c.n)}</b><small>${c.subs.length ? esc(c.subs.join(', ')) : 'без подкатегорий'}${limits[c.n] ? ' · лимит ' + rub(limits[c.n]) : ''}</small></div><span class="mut">${open === i ? '▴' : '▾'}</span></button>
      ${open === i ? `<div class="cedit"><div class="btns">${type === 'exp' ? `<button class="btn" data-c="lim" data-i="${i}">${limits[c.n] ? 'Лимит ' + rub(limits[c.n]) : 'Задать лимит'}</button>` : ''}<button class="btn" data-c="ren" data-i="${i}">Переименовать</button><button class="btn" data-c="sub" data-i="${i}">+ Подкатегория</button><button class="btn danger-t" data-c="del" data-i="${i}">Удалить</button></div>
        ${c.subs.length ? `<div class="chips" style="margin:8px 0 0;padding:0;flex-wrap:wrap">${c.subs.map((b, j) => `<button data-c="delsub" data-i="${i}" data-j="${j}" aria-label="Удалить подкатегорию ${esc(b)}">${esc(b)} ✕</button>`).join('')}</div>` : ''}</div>` : ''}</div>`).join('')}</div>
    <button class="btn wide" data-c="add">+ Новая категория</button><p class="mut note">Удаление убирает категорию из списка. Старые записи с ней остаются в истории.</p></div>`;
  };
  r.addEventListener('click', async e => {
    const b = e.target.closest('[data-c]'); if (!b) return; const a = b.dataset.c, i = +b.dataset.i, list = cats[type], c = list[i];
    if (a === 'close') { r.remove(); return after && after(); }
    if (a === 'open') { open = open === i ? null : i; return draw(); }
    if (a === 'lim') {
      const v = await askText(`Лимит на месяц: ${c.n}`, { value: limits[c.n] || '', placeholder: 'Сумма в ₽', inputmode: 'numeric', hint: 'Оставь пустым, чтобы убрать лимит. Полоска станет оранжевой при 90% и красной при перерасходе.' });
      if (v === null) return; const x = parseFloat(v.replace(/\s/g, '').replace(',', '.'));
      if (x > 0) limits[c.n] = x; else delete limits[c.n]; await saveLimits(); return draw();
    }
    if (a === 'add') { const n = await askText('Новая категория', { placeholder: 'Например, Кофе', ok: 'Добавить' }); if (!n) return; if (list.some(x => x.n === n)) return toast('Такая уже есть'); list.push({ n, subs: [] }); }
    if (a === 'ren') {
      const n = await askText('Новое название', { value: c.n, ok: 'Сохранить' }); if (!n || n === c.n) return; if (list.some(x => x.n === n)) return toast('Такая уже есть');
      const old = recs.filter(x => x.type === type && x.cat === c.n);
      if (old.length && await ask(`Переименовать и в старых записях?`, { text: `Записей с категорией «${c.n}»: ${old.length}. Если нет — они останутся со старым названием.`, ok: 'Да, везде', cancel: 'Только в списке' })) for (const x of old) await db.put('money', { ...x, cat: n });
      if (limits[c.n]) { limits[n] = limits[c.n]; delete limits[c.n]; await saveLimits(); } c.n = n;
    }
    if (a === 'sub') { const n = await askText(`Подкатегория для «${c.n}»`, { placeholder: 'Например, Кофейня', ok: 'Добавить' }); if (!n) return; if (!c.subs.includes(n)) c.subs.push(n); }
    if (a === 'delsub') { const [x] = c.subs.splice(+b.dataset.j, 1); await saveCats(); draw(); return toast(`Подкатегория «${x}» удалена`, { undo: async () => { c.subs.splice(+b.dataset.j, 0, x); await saveCats(); draw(); } }); }
    if (a === 'del') {
      if (!await ask(`Удалить категорию «${c.n}»?`, { text: 'Она пропадёт из списка. Старые записи с ней останутся в истории.', ok: 'Удалить', danger: true })) return;
      const lim = limits[c.n]; list.splice(i, 1); delete limits[c.n]; await saveLimits(); await saveCats(); open = null; draw();
      return toast(`Категория «${c.n}» удалена`, { undo: async () => { list.splice(i, 0, c); if (lim) limits[c.n] = lim; await saveLimits(); await saveCats(); draw(); } });
    }
    await saveCats(); await load(); draw();
  });
  draw(); document.body.append(r);
}

function creditSheet() {
  const c = credit || { total: '', left: '', pay: '', day: 15 };
  const fld = (id, lab, v) => `<label class="mut">${lab}<input id="${id}" inputmode="decimal" value="${esc(v)}" style="width:100%"></label>`;
  const r = document.createElement('div'); r.className = 'sheet'; trackDirty(r);
  r.innerHTML = `<div class="panel"><div class="ph"><button data-s="close" aria-label="Закрыть">${ICON.close}</button><b>Кредитка</b></div>${fld('ct', 'Общая сумма долга, ₽', c.total)}${fld('cl', 'Осталось выплатить, ₽', c.left)}${fld('cp', 'Платёж в месяц, ₽', c.pay)}${fld('cd', 'День платежа (число)', c.day)}<button class="save" data-s="ok">Сохранить</button>${credit ? '<button class="ghost danger-t" data-s="del">Убрать кредитку</button>' : ''}</div>`;
  r.addEventListener('click', async e => {
    const b = e.target.closest('[data-s]'); if (!b) return; if (b.dataset.s === 'close') return closeSheet(r);
    if (b.dataset.s === 'del') { r.remove(); return removeWithUndo([['settings', { id: 'credit', v: credit }]], 'Кредитка убрана', render); }
    if (b.dataset.s === 'ok') { const n = id => parseFloat(r.querySelector('#' + id).value.replace(/\s/g, '').replace(',', '.')), v = { total: n('ct'), left: n('cl'), pay: n('cp'), day: Math.min(31, Math.max(1, Math.round(n('cd') || 1))) };
      if (!(v.total > 0 && v.left >= 0 && v.pay > 0)) return toast('Заполни все суммы числами');
      if (v.left > v.total) return toast('Остаток не может быть больше общей суммы'); await db.put('settings', { id: 'credit', v }); r.remove(); render(); }
  });
  document.body.append(r);
}
export async function importCsv(text) {
  await load();
  const rows = parseOldExport(text), have = new Set(recs.map(r => r.id)), fresh = rows.filter(r => !have.has(r.id));
  for (const r of fresh) await db.put('money', r);
  cats = mergeCats(cats, rows); await saveCats();
  return { added: fresh.length, total: rows.length };
}
export async function openAdd() { await load(); sheet('exp'); }
let host;
async function render() {
  await load();
  const d = monthOf(st.off);
  host.innerHTML = `<h1>Финансы</h1>${head(host, d)}${st.tab === 'ov' ? overview(d) : history(d)}${recs.length ? `<button class="fab" data-act="add" aria-label="Добавить трату или доход">${ICON.plus}</button>` : ''}`;
}
async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return; const a = b.dataset.act;
  if (a === 'tab') { st.tab = b.dataset.v; if (st.tab === 'ov') st.cat = ''; return render(); }
  if (a === 'prev') { st.off--; return render(); }
  if (a === 'next') { if (st.off < 0) st.off++; return render(); }
  if (a === 'add') return sheet('exp');
  if (a === 'cpay') {
    const p = Math.min(credit.pay, credit.left), before = { ...credit };
    const rec = await db.put('money', { type: 'exp', amount: p, cat: 'Рассрочка/кредит', sub: '', account: 'Карта', comment: 'Платёж по кредитке', ts: Date.now() });
    await db.put('settings', { id: 'credit', v: { ...credit, left: credit.left - p } }); await render();
    return toast(`Платёж ${rub(p)} записан`, { undo: async () => { await db.del('money', rec.id); await db.put('settings', { id: 'credit', v: before }); render(); } });
  }
  if (a === 'credit') return creditSheet();
  if (a === 'showcat') { st.tab = 'hist'; st.f = 'exp'; st.cat = b.dataset.n; return render(); }
  if (a === 'hf') { st.f = b.dataset.v; st.cat = ''; return render(); }
  if (a === 'hcat') { st.cat = ''; return render(); }
  if (a === 'edit') { const rec = recs.find(x => x.id === b.dataset.id); if (rec) sheet(rec.type, {}, rec); return; }
  if (a === 'cats') return catsSheet(b.dataset.v, render);
  if (a === 'backup') {
    const blob = new Blob([JSON.stringify(await db.exportAll())], { type: 'application/json' }), u = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = u; l.download = `dojo-${dayKey(Date.now())}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
  }
}
async function onChange(e) {
  const i = e.target.closest('input[type=file]'); if (!i || !i.files[0]) return; const a = i.dataset.act, text = await i.files[0].text(); i.value = '';
  try {
    if (a === 'import') {
      const { added, total } = await importCsv(text); toast(`Добавлено ${added} из ${total}`);
    } else { await db.importAll(JSON.parse(text)); toast('Копия восстановлена'); }
    render();
  } catch (err) { toast(err.message || 'Не удалось прочитать файл'); }
}
register('money', async el => { host = el; el.onclick = onClick; el.onchange = onChange; await render(); });
