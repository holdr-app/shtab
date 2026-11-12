import { register } from './registry.js';
import * as db from './db.js';
import { esc, dayKey, rub, pad, MONTHS, MONTHS_G } from './lib.js';

const st = { tab: 'ov', per: 'week', off: 0 };
let host;
const pk = (y, m, d) => dayKey(new Date(y, m, d).getTime());
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return pk(y, m - 1, d + n); };
const WD = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'], WDL = ['понедельникам', 'вторникам', 'средам', 'четвергам', 'пятницам', 'субботам', 'воскресеньям'];
const wdIdx = k => { const [y, m, d] = k.split('-').map(Number); return (new Date(y, m - 1, d).getDay() + 6) % 7; };
const fmtD = k => { const [, m, d] = k.split('-').map(Number); return `${d} ${MONTHS_G[m - 1]}`; };

// границы периода и предыдущего периода (включительно, ключи дней)
function range(per, off) {
  const t = new Date();
  if (per === 'week') { const mon = new Date(t.getFullYear(), t.getMonth(), t.getDate() - ((t.getDay() + 6) % 7) + off * 7), a = pk(mon.getFullYear(), mon.getMonth(), mon.getDate()); return { a, b: addDays(a, 6), pa: addDays(a, -7), pb: addDays(a, -1), label: `${fmtD(a)} – ${fmtD(addDays(a, 6))}` }; }
  const f = new Date(t.getFullYear(), t.getMonth() + off, 1), l = new Date(f.getFullYear(), f.getMonth() + 1, 0), p = new Date(f.getFullYear(), f.getMonth() - 1, 1), pl = new Date(f.getFullYear(), f.getMonth(), 0);
  return { a: pk(f.getFullYear(), f.getMonth(), 1), b: pk(l.getFullYear(), l.getMonth(), l.getDate()), pa: pk(p.getFullYear(), p.getMonth(), 1), pb: pk(pl.getFullYear(), pl.getMonth(), pl.getDate()), label: `${MONTHS[f.getMonth()]} ${f.getFullYear()}` };
}
const daysIn = (a, b) => { const o = []; for (let k = a; k <= b; k = addDays(k, 1)) o.push(k); return o; };
const inR = (k, a, b) => k >= a && k <= b;
const pct = (c, p) => p ? Math.round((c - p) / p * 100) : null;
const arrow = (v, goodDown = false) => v === null ? '' : v === 0 ? '0%' : `<b style="color:${(v < 0) === goodDown ? 'var(--acc)' : 'var(--warn)'}">${v > 0 ? '↑' : '↓'} ${Math.abs(v)}%</b>`;
const bars = (vals, labels, fmt = v => v) => { const mx = Math.max(...vals, 1); return `<div class="bars" style="--n:${vals.length}">${vals.map((v, i) => `<div class="bc" title="${labels[i]}: ${fmt(v)}"><i style="height:${Math.max(3, v / mx * 100)}%"></i>${vals.length <= 7 ? `<span>${labels[i]}</span>` : ''}</div>`).join('')}</div>`; };

async function data() {
  const R = range(st.per, st.off), today = dayKey(Date.now());
  const [habits, logs, money, diary, tasks, quits, qh] = await Promise.all([db.all('habits'), db.all('habitLog'), db.all('money'), db.all('diary'), db.all('tasks'), db.all('quits'), db.all('quitHistory')]);
  const moodRecs = (await db.all('settings')).filter(s => s.id.startsWith('mood-'));
  const days = daysIn(R.a, R.b), elapsed = days.filter(k => k <= today), mood = {};
  for (const m of moodRecs) mood[m.id.slice(5)] = m.v;
  for (const e of diary) if (e.mood && !mood[e.date]) mood[e.date] = e.mood;
  return { R, today, habits, logs, money, diary, tasks, quits, qh, days, elapsed, mood };
}
const habitStats = D => {
  const by = {}; for (const l of D.logs) (by[l.habitId] ||= new Set()).add(l.date);
  const rows = D.habits.map(h => { const c = D.elapsed.filter(k => by[h.id]?.has(k)).length; return { h, c, p: D.elapsed.length ? Math.round(c / D.elapsed.length * 100) : 0 }; });
  const perDay = D.days.map(k => D.habits.filter(h => by[h.id]?.has(k)).length);
  const wd = Array(7).fill(0), wn = Array(7).fill(0);
  for (const k of D.elapsed) { wn[wdIdx(k)]++; wd[wdIdx(k)] += D.habits.filter(h => by[h.id]?.has(k)).length; }
  const wp = wd.map((v, i) => wn[i] && D.habits.length ? v / (wn[i] * D.habits.length) : null);
  const valid = wp.map((v, i) => [v, i]).filter(x => x[0] !== null), weak = valid.length > 1 ? valid.sort((a, b) => a[0] - b[0])[0] : null;
  const total = D.habits.length * D.elapsed.length, done = rows.reduce((s, r) => s + r.c, 0);
  return { rows, perDay, weak, overall: total ? Math.round(done / total * 100) : 0, by };
};
const moneyStats = D => {
  const R = D.R, exp = D.money.filter(r => r.type === 'exp'), cur = exp.filter(r => inR(dayKey(r.ts), R.a, R.b)), prev = exp.filter(r => inR(dayKey(r.ts), R.pa, R.pb));
  const s = a => a.reduce((x, r) => x + r.amount, 0), cat = a => { const m = {}; for (const r of a) m[r.cat] = (m[r.cat] || 0) + r.amount; return m; };
  const cc = cat(cur), pc = cat(prev), inc = s(D.money.filter(r => r.type === 'inc' && inR(dayKey(r.ts), R.a, R.b)));
  return { total: s(cur), prev: s(prev), inc, perDay: D.days.map(k => s(cur.filter(r => dayKey(r.ts) === k))), cats: Object.entries(cc).sort((a, b) => b[1] - a[1]).slice(0, 6).map(([n, a]) => ({ n, a, d: pct(a, pc[n] || 0) })), top: [...cur].sort((a, b) => b.amount - a.amount).slice(0, 3), cc, pc };
};

function head() {
  const R = range(st.per, st.off);
  return `<a href="#today" class="back">‹ Назад</a><h1>Отчёты</h1><div class="seg"><button data-act="per" data-v="week" aria-selected="${st.per === 'week'}">Неделя</button><button data-act="per" data-v="month" aria-selected="${st.per === 'month'}">Месяц</button></div>
  <div class="mnav"><button data-act="prev" aria-label="Назад">‹</button><span>${R.label}</span><button data-act="next" aria-label="Вперёд" ${st.off >= 0 ? 'disabled' : ''}>›</button></div>
  <div class="chips tabs">${[['ov', 'Обзор'], ['h', 'Привычки'], ['m', 'Деньги'], ['d', 'Настроение']].map(([k, n]) => `<button data-act="tab" data-v="${k}" aria-pressed="${st.tab === k}">${n}</button>`).join('')}</div>`;
}
const lbls = D => D.days.map(k => D.days.length <= 7 ? WD[wdIdx(k)] : String(+k.slice(8)));

function overview(D) {
  const H = habitStats(D), M = moneyStats(D), moods = D.elapsed.map(k => D.mood[k]).filter(Boolean), avg = moods.length ? (moods.reduce((a, b) => a + b, 0) / moods.length) : 0;
  const ins = [], cmp = st.per === 'week' ? 'прошлой неделей' : 'прошлым месяцем';
  const d = pct(M.total, M.prev);
  if (M.prev && d !== null && Math.abs(d) >= 5) ins.push(`Расходы ${d > 0 ? 'выросли' : 'снизились'} на ${Math.abs(d)}% по сравнению с ${cmp}.`);
  const big = M.cats.filter(c => c.d !== null && c.d >= 20 && c.a >= 1000).sort((a, b) => b.d - a.d)[0]; if (big) ins.push(`Больше всего выросла категория «${big.n}»: +${big.d}%.`);
  if (H.rows.length) { const best = [...H.rows].sort((a, b) => b.p - a.p)[0]; if (best.c) ins.push(`Лучшая привычка: «${best.h.name}», ${best.p}% дней.`); }
  if (H.weak && H.weak[0] < 0.6) ins.push(`Чаще всего привычки пропускаются по ${WDL[H.weak[1]]}.`);
  const q = D.quits.map(q => ({ q, d: (Date.now() - q.start) / 864e5 })).sort((a, b) => b.d - a.d)[0]; if (q) ins.push(`«Без ${q.q.name}»: ${Math.floor(q.d)} дн подряд.`);
  const rel = D.qh.filter(h => inR(dayKey(h.end), D.R.a, D.R.b)).length; if (rel) ins.push(`Срывов за период: ${rel}.`);
  const wrote = new Set(D.diary.filter(e => inR(e.date, D.R.a, D.R.b)).map(e => e.date)).size;
  const tDone = D.tasks.filter(t => t.done && t.doneAt && inR(dayKey(t.doneAt), D.R.a, D.R.b)).length;
  return `<div class="bento"><div class="card tile"><div class="lab">Привычки</div><b class="bigl">${D.habits.length ? H.overall + '%' : '—'}</b><small class="mut">выполнено</small></div><div class="card tile"><div class="lab">Потрачено</div><b class="bigl">${rub(M.total)}</b><small>${M.prev ? arrow(d, true) + ' к прошлому' : '<span class="mut">нет данных для сравнения</span>'}</small></div></div>
  <div class="bento"><div class="card tile"><div class="lab">Настроение</div><b class="bigl">${avg ? avg.toFixed(1).replace('.', ',') + ' из 5' : '—'}</b><small class="mut">${moods.length} отметок</small></div><div class="card tile"><div class="lab">Дневник и задачи</div><b class="bigl">${wrote} дн</b><small class="mut">записей · задач сделано: ${tDone}</small></div></div>
  <div class="card"><div class="lab">Что заметно</div>${ins.length ? ins.map(t => `<p class="insl">${esc(t)}</p>`).join('') : '<div class="mut">Пока мало данных. Отмечай привычки, траты и настроение, и здесь появятся выводы.</div>'}</div>`;
}
function habitsTab(D) {
  const H = habitStats(D); if (!D.habits.length) return '<div class="card mut">Привычек пока нет.</div>';
  return `<div class="card"><div class="lab">Выполнено <b>${H.overall}%</b></div>${bars(H.perDay, lbls(D), v => v + ' из ' + D.habits.length)}</div>
  <div class="card"><div class="lab">По привычкам</div>${H.rows.sort((a, b) => b.p - a.p).map(r => `<div class="catrow"><div class="l"><span>${esc(r.h.name)}</span><span><b>${r.p}%</b> <span class="mut">${r.c} из ${D.elapsed.length}</span></span></div><div class="bar"><i style="width:${r.p}%;background:var(--acc)"></i></div></div>`).join('')}</div>
  ${H.weak ? `<div class="card"><div class="lab">Слабый день недели</div><p class="insl">Привычки чаще всего пропускаются по ${WDL[H.weak[1]]}: выполнено ${Math.round(H.weak[0] * 100)}%.</p></div>` : ''}`;
}
function moneyTab(D) {
  const M = moneyStats(D), d = pct(M.total, M.prev);
  return `<div class="bal"><div>Потрачено</div><strong>−${rub(M.total)}</strong><div class="two"><div><small>К прошлому периоду</small><b>${M.prev ? (d > 0 ? '↑ ' : d < 0 ? '↓ ' : '') + Math.abs(d) + '%' : '—'}</b></div><div><small>Доходы</small><b>+${rub(M.inc)}</b></div></div></div>
  <div class="card"><div class="lab">По дням <span class="mut">в среднем ${rub(M.total / Math.max(1, D.elapsed.length))} в день</span></div>${bars(M.perDay, lbls(D), rub)}</div>
  <div class="card"><div class="lab">Категории к прошлому периоду</div>${M.cats.map(c => `<div class="srow"><span style="flex:1">${esc(c.n)}</span><b>${rub(c.a)}</b><span style="min-width:60px;text-align:right;font-size:12px">${arrow(c.d, true) || '<span class="mut">нов.</span>'}</span></div>`).join('') || '<div class="mut">Расходов нет.</div>'}</div>
  <div class="card"><div class="lab">Самые крупные траты</div>${M.top.map(r => `<div class="srow"><div style="flex:1"><b>${esc(r.sub || r.cat)}</b><small class="mut">${esc(r.cat)} · ${fmtD(dayKey(r.ts))}</small></div><b>−${rub(r.amount)}</b></div>`).join('') || '<div class="mut">Расходов нет.</div>'}</div>`;
}
function moodTab(D) {
  const vals = D.days.map(k => D.mood[k] || 0), moods = vals.filter(Boolean);
  if (moods.length < 3) return '<div class="card mut">Отметь настроение хотя бы в три дня, и здесь появятся график и закономерности. Отмечать можно на главном экране.</div>';
  const avg = moods.reduce((a, b) => a + b, 0) / moods.length, H = habitStats(D);
  const rate = k => D.habits.length ? D.habits.filter(h => H.by[h.id]?.has(k)).length / D.habits.length : null;
  const good = D.elapsed.filter(k => D.mood[k] >= 4), bad = D.elapsed.filter(k => D.mood[k] && D.mood[k] <= 2);
  const mean = a => { const r = a.map(rate).filter(x => x !== null); return r.length ? r.reduce((x, y) => x + y, 0) / r.length : null; };
  const mg = mean(good), mb = mean(bad), note = [];
  if (mg !== null && mb !== null && good.length >= 2 && bad.length >= 2) note.push(`В дни с хорошим настроением выполнено ${Math.round(mg * 100)}% привычек, с плохим — ${Math.round(mb * 100)}%.`);
  const spend = k => D.money.filter(r => r.type === 'exp' && dayKey(r.ts) === k).reduce((s, r) => s + r.amount, 0), sg = good.length ? good.reduce((s, k) => s + spend(k), 0) / good.length : null, sb = bad.length ? bad.reduce((s, k) => s + spend(k), 0) / bad.length : null;
  if (sg !== null && sb !== null && good.length >= 2 && bad.length >= 2) note.push(`Средние траты в день: ${rub(sg)} при хорошем настроении и ${rub(sb)} при плохом.`);
  return `<div class="card"><div class="lab">Среднее <b>${avg.toFixed(1).replace('.', ',')} из 5</b></div>${bars(vals, lbls(D), v => v ? v + ' из 5' : 'нет отметки')}</div>
  <div class="card"><div class="lab">Что рядом с настроением</div>${note.length ? note.map(t => `<p class="insl">${esc(t)}</p>`).join('') : '<div class="mut">Пока недостаточно дней с высоким и низким настроением для сравнения.</div>'}<p class="mut note">Это совпадения в твоих данных, а не доказанные причины.</p></div>`;
}
async function render() {
  const D = await data();
  host.innerHTML = head() + ({ ov: overview, h: habitsTab, m: moneyTab, d: moodTab }[st.tab])(D);
}
register('reports', async el => { host = el; el.onchange = null; el.onclick = async e => {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'per') { st.per = b.dataset.v; st.off = 0; } if (a === 'tab') st.tab = b.dataset.v;
  if (a === 'prev') st.off--; if (a === 'next' && st.off < 0) st.off++;
  render();
}; await render(); });
