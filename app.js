import * as db from './db.js';
import { views } from './registry.js';
import './finance.js';
import './habits.js';
import './diary.js';
import './vault.js';
import './plan.js';
import './today.js';
import './settings.js';
import { initLock } from './lock.js';
const TABS = [
  ['today', 'Сегодня', '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'],
  ['diary', 'Дневник', '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6"/>'],
  ['habits', 'Привычки', '<path d="M5 13l4 4L19 7"/>'],
  ['plan', 'План', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'],
  ['money', 'Финансы', '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><rect x="4" y="9" width="16" height="11" rx="2"/><path d="M16 14.5h2"/>'],
  ['vault', 'Склад', '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z"/><path d="M3 4h18v4H3zM10 12h4"/>']
];
const nav = document.getElementById('nav'), view = document.getElementById('view');
const EXTRA = { settings: 'Настройки' };
let cur = location.hash.slice(1) || 'today';
addEventListener('hashchange', () => { const n = location.hash.slice(1); if (n !== cur && (TABS.some(t => t[0] === n) || EXTRA[n])) go(n); });
function drawNav() {
  nav.innerHTML = TABS.map(([k, t, p]) => `<button data-t="${k}" aria-label="${t}" ${k === cur ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg></button>`).join('');
}
async function go(name) {
  cur = name; history.replaceState(null, '', '#' + name); drawNav();
  const title = (TABS.find(t => t[0] === name) || [0, EXTRA[name]])[1];
  view.innerHTML = `<h1>${title}</h1>`;
  if (views[name]) await views[name](view);
  else view.insertAdjacentHTML('beforeend', '<div class="card mut">Раздел в разработке.</div>');
  scrollTo(0, 0);
}
nav.addEventListener('click', e => { const b = e.target.closest('button'); if (b) go(b.dataset.t); });
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js');
window.shtab = { db, go };
go(TABS.some(t => t[0] === cur) || EXTRA[cur] ? cur : 'today');
initLock();
