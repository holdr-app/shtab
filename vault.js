import { register } from './registry.js';
import * as db from './db.js';
import { esc, dayKey } from './lib.js';
import { shell, toast, readAsDataURL, shrinkImage } from './ui.js';

const st = { f: 'all', q: '' };
let host;
const TYPES = [['link', 'Ссылка'], ['film', 'Фильм'], ['file', 'Файл'], ['idea', 'Идея']];
const TN = Object.fromEntries(TYPES);
const MAX_FILE = 8 * 1024 * 1024;
const isUrl = s => /^https?:\/\/\S+$/i.test(s.trim());
const host_ = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch { return u; } };

async function render() {
  const all = (await db.all('vault')).sort((a, b) => b.ts - a.ts), q = st.q.trim().toLowerCase();
  const list = all.filter(i => (st.f === 'all' || i.type === st.f) && (!q || (i.title + ' ' + (i.url || '') + ' ' + (i.note || '')).toLowerCase().includes(q)));
  const cnt = t => all.filter(i => t === 'all' || i.type === t).length;
  const chips = [['all', 'Все'], ...TYPES].map(([k, n]) => `<button data-act="f" data-v="${k}" aria-pressed="${st.f === k}">${n} ${cnt(k)}</button>`).join('');
  const items = list.map(i => `<button class="card vi" data-act="open" data-id="${esc(i.id)}"><span class="tag">${TN[i.type]}</span><b class="${i.done ? 'done' : ''}">${esc(i.title || host_(i.url || '') || 'Без названия')}</b>${i.url ? `<small>${esc(host_(i.url))}</small>` : ''}${i.note ? `<p>${esc(i.note.slice(0, 120))}</p>` : ''}${i.thumb ? `<img src="${i.thumb}" alt="Вложение">` : ''}</button>`).join('')
    || `<div class="card mut">${all.length ? 'Ничего не найдено.' : 'Склад пуст. Нажми «+» или «Вставить из буфера», чтобы сохранить ссылку, фильм, файл или идею.'}</div>`;
  host.innerHTML = `<h1>Склад</h1><input id="q" type="search" placeholder="Поиск по складу" aria-label="Поиск" value="${esc(st.q)}"><div class="chips tabs">${chips}</div>
    <button class="btn wide" data-act="paste">Вставить из буфера</button>${items}<button class="fab" data-act="add" aria-label="Добавить">+</button>`;
  const qi = host.querySelector('#q'); qi.oninput = () => { st.q = qi.value; clearTimeout(render.t); render.t = setTimeout(async () => { const p = qi.selectionStart; await render(); const n = host.querySelector('#q'); n.focus(); n.setSelectionRange(p, p); }, 250); };
}

function sheet(it = {}) {
  let s = { type: it.type || 'link', title: it.title || '', url: it.url || '', note: it.note || '', done: !!it.done, file: it.file || null, fname: it.fname || '', thumb: it.thumb || '' };
  const sync = r => { for (const [k, id] of [['title', '#ti'], ['url', '#ur'], ['note', '#no']]) { const e = r.querySelector(id); if (e) s[k] = e.value; } };
  const draw = r => {
    r.querySelector('.dyn')?.remove();
    r.querySelector('.panel').insertAdjacentHTML('beforeend', `<div class="dyn"><div class="seg">${TYPES.map(([k, n]) => `<button data-s="type" data-v="${k}" aria-selected="${s.type === k}">${n}</button>`).join('')}</div>
      <input id="ti" placeholder="${s.type === 'film' ? 'Название фильма' : 'Название'}" value="${esc(s.title)}" maxlength="120">
      ${s.type === 'link' ? `<input id="ur" inputmode="url" autocapitalize="off" placeholder="https://…" value="${esc(s.url)}">` : ''}
      ${s.type === 'file' ? `<label class="btn">${s.fname ? esc(s.fname) : 'Выбрать файл или фото'}<input type="file" id="fl" hidden></label>` : ''}
      <textarea id="no" rows="4" placeholder="Заметка">${esc(s.note)}</textarea>
      ${s.type === 'film' && it.id ? `<button class="btn" data-s="done" aria-pressed="${s.done}">${s.done ? 'Просмотрено' : 'Отметить просмотренным'}</button>` : ''}
      ${s.type === 'link' && isUrl(s.url) ? `<a class="btn" href="${esc(s.url)}" target="_blank" rel="noopener noreferrer">Открыть ссылку</a>` : ''}
      ${s.file ? `<a class="btn" href="${s.file}" download="${esc(s.fname || 'файл')}">Скачать файл</a>` : ''}
      <button class="save" data-s="save">Сохранить</button>${it.id ? '<button class="ghost danger-t" data-s="del">Удалить</button>' : ''}</div>`);
    const f = r.querySelector('#fl');
    if (f) f.onchange = async ev => {
      const file = ev.target.files[0]; if (!file) return; sync(r);
      if (file.size > MAX_FILE) return toast('Файл больше 8 МБ — он не поместится в память приложения');
      s.fname = file.name; s.file = await readAsDataURL(file); s.thumb = file.type.startsWith('image/') ? await shrinkImage(file, 400) : '';
      if (!s.title) s.title = file.name; draw(r);
    };
  };
  const r = shell(it.id ? 'Элемент склада' : 'Новый элемент', '', async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return; sync(r); const a = b.dataset.s;
    if (a === 'type') s.type = b.dataset.v;
    if (a === 'done') s.done = !s.done;
    if (a === 'del' && confirm('Удалить из склада?')) { await db.del('vault', it.id); r.remove(); return render(); }
    if (a === 'save') {
      if (!(s.title.trim() || s.url.trim() || s.note.trim() || s.file)) return toast('Добавь хотя бы название');
      await db.put('vault', { id: it.id, type: s.type, title: s.title.trim(), url: s.type === 'link' ? s.url.trim() : '', note: s.note.trim(), done: s.done, file: s.type === 'file' ? s.file : null, fname: s.fname, thumb: s.thumb, ts: it.ts || Date.now() });
      r.remove(); return render();
    }
    draw(r);
  });
  draw(r);
}
async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'f') { st.f = b.dataset.v; return render(); }
  if (a === 'add') return sheet();
  if (a === 'open') return sheet(await db.get('vault', b.dataset.id));
  if (a === 'paste') {
    let t = '';
    try { t = (await navigator.clipboard.readText()).trim(); } catch { return toast('Разреши вставку или нажми «+» и вставь вручную'); }
    if (!t) return toast('Буфер обмена пуст');
    return isUrl(t) ? sheet({ type: 'link', url: t, title: host_(t) }) : sheet({ type: 'idea', note: t });
  }
}
register('vault', async el => { host = el; el.onclick = onClick; el.onchange = null; await render(); });
