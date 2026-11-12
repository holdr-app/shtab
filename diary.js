import { register } from './registry.js';
import * as db from './db.js';
import { esc, dayKey, pad, MONTHS_G } from './lib.js';
import { shell, toast, shrinkImage, removeWithUndo, ICON, relDay } from './ui.js';
import { openViewer } from './viewer.js';
import { MONTHS } from './lib.js';

const st = { tab: 'diary', q: '' };
let host;
const MOOD_T = ['Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'];
const fmtDay = k => { const [y, m, d] = k.split('-').map(Number); return `${d} ${MONTHS_G[m - 1]} ${y}`; };
const hit = (o, q) => !q || (o.text + ' ' + (o.title || '')).toLowerCase().includes(q.toLowerCase());

// сетка фото записи: 1 фото — во всю ширину, 2 — в два столбца, больше — в три (до 6, дальше «+N»)
function photoGrid(e) {
  const ph = e.photos || []; if (!ph.length) return '';
  const cls = ph.length === 1 ? 'one' : ph.length === 2 ? 'two' : 'many', shown = ph.slice(0, 6);
  return `<div class="pgrid ${cls}">${shown.map((p, i) => `<button class="pcell" data-act="photo" data-id="${esc(e.id)}" data-i="${i}" aria-label="Открыть фото ${i + 1} из ${ph.length}"><img src="${p}" alt="" loading="lazy">${i === 5 && ph.length > 6 ? `<span class="pmore">+${ph.length - 6}</span>` : ''}</button>`).join('')}</div>`;
}
// все фото дневника, от новых к старым — для галереи и листания
async function allPhotos() {
  const ents = (await db.all('diary')).filter(e => (e.photos || []).length).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts), out = [];
  for (const e of ents) e.photos.forEach((src, j) => out.push({ src, e, j, caption: relDay(e.date, MONTHS_G) + (e.photos.length > 1 ? ` · ${j + 1} из ${e.photos.length}` : ''), onOpen: () => entrySheet(e) }));
  return out;
}
async function photosView() {
  const ph = await allPhotos();
  if (!ph.length) return `<div class="empty"><b>Фото пока нет</b><p>Добавляй фото в записи дневника, и здесь соберётся галерея по дням.</p></div>`;
  let html = `<div class="mut">${ph.length} фото. Нажми, чтобы открыть; листай свайпом.</div>`, curM = '', curD = '';
  ph.forEach((p, i) => {
    const [y, m] = p.e.date.split('-').map(Number), mk = MONTHS[m - 1] + ' ' + y;
    if (mk !== curM) { if (curM) html += '</div>'; html += `<div class="dh"><span>${mk}</span></div><div class="gal">`; curM = mk; curD = ''; }
    const day = p.e.date !== curD; curD = p.e.date;
    html += `<button class="gcell" data-act="gal" data-i="${i}" aria-label="Фото за ${esc(relDay(p.e.date, MONTHS_G))}"><img src="${p.src}" alt="" loading="lazy">${day ? `<span class="gday">${+p.e.date.slice(8)}</span>` : ''}</button>`;
  });
  return html + '</div>';
}
async function diaryView() {
  const all = (await db.all('diary')).sort((a, b) => b.date.localeCompare(a.date) || b.ts - a.ts), q = st.q.trim();
  const today = dayKey(Date.now()), md = today.slice(5);
  const ago = all.filter(e => e.date.slice(5) === md && e.date < today);
  const otd = !q && ago.length ? `<div class="card"><div class="lab">На этот день</div>${ago.map(e => `<button class="entry" data-act="edit" data-id="${esc(e.id)}"><small>${fmtDay(e.date)}</small><p>${esc(e.text.slice(0, 140))}</p></button>`).join('')}</div>` : '';
  const list = all.filter(e => hit(e, q));
  const g = {}; for (const e of list) (g[e.date] ||= []).push(e);
  const body = Object.entries(g).map(([k, a]) => `<div class="dh"><span>${relDay(k, MONTHS_G)}</span><span>${a[0].mood ? 'Настроение: ' + MOOD_T[a[0].mood - 1] : ''}</span></div>` +
    a.map(e => `<div class="card entry2">${e.text ? `<button class="etext" data-act="edit" data-id="${esc(e.id)}"><p>${esc(e.text)}</p></button>` : ''}${photoGrid(e)}${e.text ? '' : `<button class="etext mut" data-act="edit" data-id="${esc(e.id)}">Изменить запись</button>`}</div>`).join('')).join('') || `<div class="card mut">${q ? 'Ничего не найдено.' : 'Записей пока нет. Нажми «+», чтобы написать первую.'}</div>`;
  return otd + body;
}
async function notesView() {
  const q = st.q.trim(), list = (await db.all('notes')).filter(n => hit(n, q)).sort((a, b) => b.ts - a.ts);
  return list.map(n => `<button class="card entry" data-act="editn" data-id="${esc(n.id)}"><b>${esc(n.title || 'Без названия')}</b><p>${esc(n.text.slice(0, 160))}</p></button>`).join('') || `<div class="card mut">${q ? 'Ничего не найдено.' : 'Заметок пока нет.'}</div>`;
}

function entrySheet(e) {
  let s = { id: e?.id, date: e?.date || dayKey(Date.now()), text: e?.text || '', mood: e?.mood || 0, photos: [...(e?.photos || [])], ts: e?.ts };
  const draw = r => {
    r.querySelector('.dyn')?.remove();
    r.querySelector('.panel').insertAdjacentHTML('beforeend', `<div class="dyn">
      <div class="lab">Настроение дня</div><div class="moods">${MOOD_T.map((t, i) => `<button data-s="mood" data-v="${i + 1}" aria-pressed="${s.mood === i + 1}">${i + 1}<small>${t}</small></button>`).join('')}</div>
      <textarea id="tx" placeholder="Как прошёл день? Диктовать можно значком микрофона на клавиатуре." rows="8">${esc(s.text)}</textarea>
      ${s.photos.length ? `<div class="ph3 big">${s.photos.map((p, i) => `<div class="pw"><button class="pcell" data-s="view" data-i="${i}" aria-label="Открыть фото ${i + 1}"><img src="${p}" alt=""></button><button class="rm" data-s="rmph" data-i="${i}" aria-label="Убрать фото ${i + 1}">${ICON.close}</button></div>`).join('')}</div>` : ''}
      <div class="row3"><label class="btn">Добавить фото<input type="file" id="ph" accept="image/*" multiple hidden></label><input type="date" id="dt" value="${s.date}" aria-label="Дата"></div>
      <button class="save" data-s="save">Сохранить</button>${e ? '<button class="ghost danger-t" data-s="del">Удалить запись</button>' : ''}</div>`);
    r.querySelector('#ph').onchange = async ev => { sync(r); r.dataset.dirty = '1'; for (const f of ev.target.files) { try { s.photos.push(await shrinkImage(f)); } catch (x) { toast(x.message); } } draw(r); };
  };
  const sync = r => { s.text = r.querySelector('#tx').value; s.date = r.querySelector('#dt').value || s.date; };
  const r = shell(e ? 'Запись' : 'Новая запись', '', async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return; sync(r); const a = b.dataset.s;
    if (a === 'view') return openViewer(s.photos.map((src, j) => ({ src, caption: `Фото ${j + 1} из ${s.photos.length}` })), +b.dataset.i);
    if (a === 'mood' || a === 'rmph') r.dataset.dirty = '1';
    if (a === 'mood') s.mood = s.mood === +b.dataset.v ? 0 : +b.dataset.v;
    if (a === 'rmph') s.photos.splice(+b.dataset.i, 1);
    if (a === 'del') { r.remove(); return removeWithUndo([['diary', e]], 'Запись удалена', render); }
    if (a === 'save') {
      if (!s.text.trim() && !s.photos.length) return toast('Напиши что-нибудь или добавь фото');
      await db.put('diary', { id: s.id, date: s.date, text: s.text.trim(), mood: s.mood, photos: s.photos, ts: s.ts || Date.now() }); r.remove(); return render();
    }
    if (['mood', 'rmph'].includes(a)) draw(r);
  });
  draw(r);
}
function noteSheet(n) {
  shell(n ? 'Заметка' : 'Новая заметка', `<input id="nt" placeholder="Название" value="${esc(n?.title || '')}" maxlength="80"><textarea id="nx" rows="12" placeholder="Текст заметки">${esc(n?.text || '')}</textarea><button class="save" data-s="ok">Сохранить</button>${n ? '<button class="ghost danger-t" data-s="del">Удалить заметку</button>' : ''}`, async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'ok') { const t = r.querySelector('#nt').value.trim(), x = r.querySelector('#nx').value.trim(); if (!t && !x) return toast('Заметка пустая'); await db.put('notes', { id: n?.id, title: t, text: x, ts: n?.ts || Date.now() }); r.remove(); render(); }
    if (b.dataset.s === 'del') { r.remove(); return removeWithUndo([['notes', n]], 'Заметка удалена', render); }
  });
}

async function render() {
  const body = st.tab === 'diary' ? await diaryView() : st.tab === 'photos' ? await photosView() : await notesView();
  const T = [['diary', 'Записи'], ['photos', 'Фото'], ['notes', 'Заметки']];
  host.innerHTML = `<h1>Дневник</h1><div class="seg">${T.map(([k, n]) => `<button data-act="tab" data-v="${k}" aria-selected="${st.tab === k}">${n}</button>`).join('')}</div>
    ${st.tab === 'photos' ? '' : `<input id="q" type="search" placeholder="Поиск" aria-label="Поиск" value="${esc(st.q)}">`}${body}<button class="fab" data-act="add" aria-label="${st.tab === 'notes' ? 'Новая заметка' : 'Новая запись'}">${ICON.plus}</button>`;
  const q = host.querySelector('#q'); if (q) q.oninput = () => { st.q = q.value; clearTimeout(render.t); render.t = setTimeout(async () => { const pos = q.selectionStart; await render(); const n = host.querySelector('#q'); n.focus(); n.setSelectionRange(pos, pos); }, 250); };
}
async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'tab') { st.tab = b.dataset.v; st.q = ''; return render(); }
  if (a === 'add') return st.tab === 'notes' ? noteSheet() : entrySheet();
  if (a === 'photo') { const e = await db.get('diary', b.dataset.id); return openViewer(e.photos.map((src, j) => ({ src, caption: relDay(e.date, MONTHS_G) + (e.photos.length > 1 ? ` · ${j + 1} из ${e.photos.length}` : ''), onOpen: () => entrySheet(e) })), +b.dataset.i); }
  if (a === 'gal') return openViewer(await allPhotos(), +b.dataset.i);
  if (a === 'edit') return entrySheet(await db.get('diary', b.dataset.id));
  if (a === 'editn') return noteSheet(await db.get('notes', b.dataset.id));
}
register('diary', async el => { host = el; el.onclick = onClick; el.onchange = null; await render(); });
