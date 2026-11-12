import * as db from './db.js';
import { views } from './registry.js';
import './finance.js';
import './habits.js';
import './diary.js';
import './vault.js';
import './plan.js';
import './today.js';
import './settings.js';
import './reports.js';
import './search.js';
import { initLock } from './lock.js';
import { toast, dismissToast } from './ui.js';
const TABS = [
  ['today', 'Сегодня', '<circle cx="12" cy="12" r="8"/><path d="M12 7v5l3 2"/>'],
  ['diary', 'Дневник', '<path d="M6 3h12v18H6z"/><path d="M9 8h6M9 12h6"/>'],
  ['habits', 'Привычки', '<path d="M5 13l4 4L19 7"/>'],
  ['plan', 'План', '<rect x="4" y="5" width="16" height="15" rx="2"/><path d="M4 10h16M9 3v4M15 3v4"/>'],
  ['money', 'Финансы', '<path d="M4 7a2 2 0 0 1 2-2h12v4"/><rect x="4" y="9" width="16" height="11" rx="2"/><path d="M16 14.5h2"/>'],
  ['vault', 'Склад', '<path d="M4 8h16v11a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V8z"/><path d="M3 4h18v4H3zM10 12h4"/>']
];
const nav = document.getElementById('nav'), view = document.getElementById('view');
const EXTRA = { settings: 'Настройки', reports: 'Отчёты', search: 'Поиск' };
let cur = location.hash.slice(1) || 'today';
addEventListener('hashchange', () => { const n = location.hash.slice(1); if (n !== cur && (TABS.some(t => t[0] === n) || EXTRA[n])) go(n); });
function drawNav() {
  nav.innerHTML = TABS.map(([k, t, p]) => `<button data-t="${k}" ${k === cur ? 'aria-current="page"' : ''}><svg viewBox="0 0 24 24" aria-hidden="true">${p}</svg><span>${t}</span></button>`).join('');
}
async function go(name) {
  if (!/Вышло обновление/.test(document.querySelector('.toast')?.textContent || '')) dismissToast();
  document.querySelectorAll('.sheet,.dlgw').forEach(x => x.remove());
  cur = name; history.replaceState(null, '', '#' + name); drawNav();
  const title = (TABS.find(t => t[0] === name) || [0, EXTRA[name]])[1];
  view.innerHTML = `<h1>${title}</h1>`;
  if (views[name]) await views[name](view);
  else view.insertAdjacentHTML('beforeend', '<div class="card mut">Раздел в разработке.</div>');
  scrollTo(0, 0);
}
// повторное нажатие на текущую вкладку — наверх, как в iOS
nav.addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; if (b.dataset.t === cur) return scrollTo({ top: 0, behavior: 'smooth' }); go(b.dataset.t); });
if ('serviceWorker' in navigator) {
  const had = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').then(r => r.update()).catch(() => {});
  // новая версия уже скачана — предлагаем перезагрузиться, а не перезагружаем сами посреди ввода
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (had) toast('Вышло обновление приложения', { action: () => location.reload(), label: 'Обновить', ms: 15000 }); });
}
window.shtab = { db, go };
go(TABS.some(t => t[0] === cur) || EXTRA[cur] ? cur : 'today');
initLock();
