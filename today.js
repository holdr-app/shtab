import { register } from './registry.js';
import * as db from './db.js';
import { esc, dayKey, rub, MONTHS_G } from './lib.js';
import { workState, loadShift } from './plan.js';
import { elapsed } from './habits.js';
import { openAdd } from './finance.js';

let host;
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
const MOOD_T = ['Плохо', 'Так себе', 'Нормально', 'Хорошо', 'Отлично'];
const greet = () => { const h = new Date().getHours(); return h < 5 ? 'Доброй ночи' : h < 12 ? 'Доброе утро' : h < 18 ? 'Добрый день' : 'Добрый вечер'; };
const WD = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];

async function render() {
  const today = dayKey(Date.now()), now = new Date();
  const [habits, logs, tasks, money, quits, diary, moodRec, shift] = await Promise.all([db.all('habits'), db.all('habitLog'), db.all('tasks'), db.all('money'), db.all('quits'), db.all('diary'), db.get('settings', 'mood-' + today), loadShift()]);
  const doneSet = new Set(logs.filter(l => l.date === today).map(l => l.habitId));
  const tToday = tasks.filter(t => t.due === today || (t.due && t.due < today && !t.done));
  const totals = habits.length + tToday.length, doneN = habits.filter(h => doneSet.has(h.id)).length + tToday.filter(t => t.done).length;
  const pct = totals ? Math.round(doneN / totals * 100) : 0;
  // траты за 7 дней
  const days = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6)), spend = days.map(k => money.filter(r => r.type === 'exp' && dayKey(r.ts) === k).reduce((s, r) => s + r.amount, 0));
  const mx = Math.max(...spend, 1), pts = spend.map((v, i) => `${(i * 100 / 6).toFixed(1)},${(30 - v / mx * 28).toFixed(1)}`).join(' ');
  // настроение: ручная отметка или из записи дневника
  const dm = diary.find(e => e.date === today && e.mood)?.mood || 0, mood = moodRec?.v || dm;
  const w = workState(today, shift.rule, shift.over), w2 = workState(addDays(today, 1), shift.rule, shift.over);
  const q = quits.length ? quits.map(q => ({ q, e: elapsed(q.start) })).sort((a, b) => b.e.days - a.e.days)[0] : null;
  const md = today.slice(5), ago = diary.filter(e => e.date.slice(5) === md && e.date < today);
  const C = 2 * Math.PI * 50, R = (pct / 100 * C).toFixed(1);
  host.innerHTML = `<div class="tg"><div><h1>${greet()}</h1><div class="mut">${WD[now.getDay()]}, ${now.getDate()} ${MONTHS_G[now.getMonth()]}</div></div><div class="tgb"><a href="#reports" class="btn">Отчёты</a><a href="#settings" class="gear" aria-label="Настройки">⚙</a></div></div>
  <div class="card ringc"><svg viewBox="0 0 120 120" width="150" height="150" role="img" aria-label="Выполнено ${pct}% на сегодня"><circle cx="60" cy="60" r="50" fill="none" stroke="#2A2A2E" stroke-width="10"/><circle class="rg" cx="60" cy="60" r="50" fill="none" stroke="var(--acc)" stroke-width="10" stroke-linecap="round" stroke-dasharray="${R} ${C}" transform="rotate(-90 60 60)" style="filter:drop-shadow(0 0 6px rgba(198,255,61,.55))"/></svg>
    <div class="rt"><b>${totals ? doneN + ' из ' + totals : '—'}</b><span class="mut">дел на сегодня</span>${w === null ? '' : `<span class="pill ${w ? 'on' : ''}">${w ? 'Рабочий день' : 'Выходной'}</span>`}</div></div>
  <div class="bento">
    <a class="card tile" href="#money"><div class="lab">Потрачено сегодня</div><b class="bigl">${rub(spend[6])}</b><svg viewBox="0 0 100 32" preserveAspectRatio="none" height="32" aria-hidden="true"><polyline points="${pts}" fill="none" stroke="var(--acc)" stroke-width="2" vector-effect="non-scaling-stroke"/></svg><small class="mut">за 7 дней: ${rub(spend.reduce((a, b) => a + b, 0))}</small></a>
    <div class="card tile"><div class="lab">Завтра</div><b class="bigl">${w2 === null ? '—' : w2 ? 'Работа' : 'Выходной'}</b><small class="mut">${w2 === null ? 'график не задан' : 'по графику смен'}</small></div>
  </div>
  <div class="card"><div class="lab">Настроение дня <span class="mut">${mood ? MOOD_T[mood - 1] : 'не отмечено'}</span></div><div class="moods">${MOOD_T.map((t, i) => `<button data-act="mood" data-v="${i + 1}" aria-pressed="${mood === i + 1}" aria-label="${t}">${i + 1}</button>`).join('')}</div></div>
  ${q ? `<a class="card tile qt" href="#habits"><div class="lab">Без ${esc(q.q.name)}</div><b class="bigl">${q.e.d} дн ${String(q.e.h).padStart(2, '0')} ч</b></a>` : ''}
  <div class="card"><div class="lab">Привычки <a href="#habits" class="mut">все ›</a></div>${habits.length ? habits.map(h => `<div class="trow"><button class="chk" data-act="hab" data-id="${esc(h.id)}" aria-pressed="${doneSet.has(h.id)}" aria-label="${esc(h.name)}">${doneSet.has(h.id) ? '✓' : ''}</button><b class="${doneSet.has(h.id) ? 'done' : ''}">${esc(h.name)}</b></div>`).join('') : '<div class="mut">Привычек пока нет — добавь их во вкладке «Привычки».</div>'}</div>
  <div class="card"><div class="lab">Задачи на сегодня <a href="#plan" class="mut">все ›</a></div>${tToday.length ? tToday.map(t => `<div class="trow"><button class="chk" data-act="task" data-id="${esc(t.id)}" aria-pressed="${!!t.done}" aria-label="${esc(t.title)}">${t.done ? '✓' : ''}</button><b class="${t.done ? 'done' : ''}">${esc(t.title)}</b></div>`).join('') : '<div class="mut">На сегодня задач нет.</div>'}</div>
  ${ago.length ? `<div class="card"><div class="lab">На этот день</div>${ago.slice(0, 2).map(e => `<p class="mut" style="margin:4px 0"><b style="color:var(--ink)">${e.date.slice(0, 4)}:</b> ${esc(e.text.slice(0, 120))}</p>`).join('')}</div>` : ''}
  <button class="fab" data-act="exp" aria-label="Быстрая трата">+</button>`;
}
async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act, today = dayKey(Date.now());
  if (a === 'exp') return openAdd();
  if (a === 'mood') { const cur = (await db.get('settings', 'mood-' + today))?.v; if (cur === +b.dataset.v) await db.del('settings', 'mood-' + today); else await db.put('settings', { id: 'mood-' + today, v: +b.dataset.v }); }
  if (a === 'hab') { const id = b.dataset.id + '|' + today; if (await db.get('habitLog', id)) await db.del('habitLog', id); else await db.put('habitLog', { id, habitId: b.dataset.id, date: today }); }
  if (a === 'task') { const t = await db.get('tasks', b.dataset.id); t.done = !t.done; t.doneAt = t.done ? Date.now() : null; await db.put('tasks', t); }
  render();
}
register('today', async el => { host = el; el.onclick = onClick; el.onchange = null; await render(); });
