import { register } from './registry.js';
import * as db from './db.js';
import { esc, rub, dayKey, MONTHS_G } from './lib.js';

let host, q = '';
const fmt = k => { const [y, m, d] = k.split('-').map(Number); return `${d} ${MONTHS_G[m - 1]} ${y}`; };
const snip = (s, t) => { s = String(s || ''); const i = s.toLowerCase().indexOf(t); const a = Math.max(0, i - 30); return esc((a ? '…' : '') + s.slice(a, a + 110)); };
async function results() {
  const raw = q.trim().toLowerCase(); if (raw.length < 2) return '<div class="card mut">Введи хотя бы две буквы. Поиск идёт по дневнику, заметкам, складу, задачам и записям о деньгах.</div>';
  // грубый «стемминг»: отрезаем окончание, чтобы «баня» находила «баню»
  const t = raw.length >= 5 ? raw.slice(0, -2) : raw.length >= 4 ? raw.slice(0, -1) : raw;
  const [diary, notes, vault, tasks, money] = await Promise.all(['diary', 'notes', 'vault', 'tasks', 'money'].map(s => db.all(s)));
  const has = (...a) => a.join(' ').toLowerCase().includes(t);
  const G = [
    ['Дневник', '#diary', diary.filter(e => has(e.text)).sort((a, b) => b.date.localeCompare(a.date)).slice(0, 15).map(e => [fmt(e.date), snip(e.text, t)])],
    ['Заметки', '#diary', notes.filter(n => has(n.title, n.text)).slice(0, 15).map(n => [esc(n.title || 'Без названия'), snip(n.text, t)])],
    ['Склад', '#vault', vault.filter(v => has(v.title, v.url, v.note)).slice(0, 15).map(v => [esc(v.title || v.url), snip(v.note || v.url, t)])],
    ['Задачи', '#plan', tasks.filter(x => has(x.title)).slice(0, 15).map(x => [esc(x.title), x.due ? fmt(x.due) : 'без даты'])],
    ['Деньги', '#money', money.filter(r => has(r.cat, r.sub, r.comment)).sort((a, b) => b.ts - a.ts).slice(0, 15).map(r => [esc(r.sub || r.cat), `${fmt(dayKey(r.ts))} · ${r.type === 'inc' ? '+' : '−'}${rub(r.amount)}${r.comment ? ' · ' + esc(r.comment) : ''}`])]
  ].filter(g => g[2].length);
  return G.map(([n, href, rows]) => `<div class="dh"><span>${n}</span><span>${rows.length}</span></div><a class="card list" href="${href}" style="text-decoration:none;color:inherit">${rows.map(([a, b]) => `<div class="item"><div><b>${a}</b><small>${b}</small></div></div>`).join('')}</a>`).join('') || '<div class="card mut">Ничего не найдено.</div>';
}
register('search', async el => {
  host = el; el.onclick = null; el.onchange = null;
  el.innerHTML = `<a href="#today" class="back">‹ Назад</a><h1>Поиск</h1><input id="q" type="search" placeholder="Что найти?" aria-label="Поиск" value="${esc(q)}" autofocus><div id="res"></div>`;
  const i = el.querySelector('#q'), r = el.querySelector('#res'); r.innerHTML = await results(); i.focus();
  i.oninput = () => { q = i.value; clearTimeout(i.t); i.t = setTimeout(async () => { r.innerHTML = await results(); }, 200); };
});
