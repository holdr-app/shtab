import { register } from './registry.js';
import * as db from './db.js';
import { esc, dayKey, pad, MONTHS, MONTHS_G } from './lib.js';
import { shell, toast } from './ui.js';

const st = { tab: 'tasks', off: 0, sel: dayKey(Date.now()), showDone: false };
let host;
const num = k => { const [y, m, d] = k.split('-').map(Number); return Date.UTC(y, m - 1, d) / 864e5; };
const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
const fmt = k => { const [, m, d] = k.split('-').map(Number); return `${d} ${MONTHS_G[m - 1]}`; };

// Рабочий ли день по правилу «N через M» и ручным исправлениям.
export function workState(k, rule, over = {}) {
  if (over[k]) return over[k] === 'work';
  if (!rule) return null;
  const c = rule.on + rule.off; return (((num(k) - num(rule.anchor)) % c) + c) % c < rule.on;
}
export async function loadShift() {
  const r = await db.get('settings', 'shift'), o = {};
  for (const x of await db.all('shifts')) o[x.id] = x.status;
  return { rule: r ? r.v : null, over: o };
}

async function tasksView() {
  const ts = await db.all('tasks'), today = dayKey(Date.now());
  const open = ts.filter(t => !t.done).sort((a, b) => (a.due || '9').localeCompare(b.due || '9') || a.created - b.created), done = ts.filter(t => t.done).sort((a, b) => b.doneAt - a.doneAt);
  const groups = [['Просрочено', open.filter(t => t.due && t.due < today)], ['Сегодня', open.filter(t => t.due === today)], ['Позже', open.filter(t => t.due > today)], ['Без даты', open.filter(t => !t.due)]];
  const row = t => `<div class="trow"><button class="chk" data-act="done" data-id="${esc(t.id)}" aria-pressed="${!!t.done}" aria-label="${esc(t.title)}: ${t.done ? 'выполнено' : 'не выполнено'}">${t.done ? '✓' : ''}</button><button class="tt" data-act="edit" data-id="${esc(t.id)}"><b class="${t.done ? 'done' : ''}">${esc(t.title)}</b>${t.due ? `<small style="${t.due < today && !t.done ? 'color:var(--over)' : ''}">${fmt(t.due)}</small>` : ''}</button></div>`;
  const html = groups.filter(([, a]) => a.length).map(([n, a]) => `<div class="dh"><span>${n}</span><span>${a.length}</span></div><div class="card hl">${a.map(row).join('')}</div>`).join('')
    || '<div class="card mut">Открытых задач нет. Нажми «+», чтобы добавить.</div>';
  const dn = done.length ? `<button class="btn" data-act="sd">${st.showDone ? 'Скрыть выполненные' : 'Выполненные: ' + done.length}</button>${st.showDone ? `<div class="card hl">${done.slice(0, 30).map(row).join('')}</div>` : ''}` : '';
  return html + dn;
}
async function schedView() {
  const { rule, over } = await loadShift(), tasks = await db.all('tasks');
  const d = new Date(); d.setDate(1); d.setMonth(d.getMonth() + st.off);
  const y = d.getFullYear(), m = d.getMonth(), days = new Date(y, m + 1, 0).getDate(), lead = (new Date(y, m, 1).getDay() + 6) % 7, today = dayKey(Date.now());
  const withTask = new Set(tasks.filter(t => !t.done && t.due).map(t => t.due));
  let cells = '<span></span>'.repeat(lead);
  for (let i = 1; i <= days; i++) {
    const k = `${y}-${pad(m + 1)}-${pad(i)}`, w = workState(k, rule, over);
    cells += `<button class="day ${w === true ? 'w' : ''} ${k === today ? 't' : ''}" data-act="sel" data-k="${k}" aria-pressed="${k === st.sel}" aria-label="${i} ${MONTHS_G[m]}${w === true ? ', рабочий день' : w === false ? ', выходной' : ''}">${i}${withTask.has(k) ? '<i></i>' : ''}</button>`;
  }
  const w = workState(st.sel, rule, over), dayTasks = tasks.filter(t => t.due === st.sel && !t.done);
  const info = `<div class="card"><div class="lab">${fmt(st.sel)} <span class="mut">${w === null ? 'график не задан' : w ? 'рабочий день' : 'выходной'}</span></div>
    ${rule ? `<button class="btn" data-act="flip">${w ? 'Сделать выходным' : 'Сделать рабочим'}</button>` : ''}
    ${dayTasks.length ? dayTasks.map(t => `<div class="item"><div><b>${esc(t.title)}</b></div></div>`).join('') : '<div class="mut" style="margin-top:8px">Задач на этот день нет.</div>'}</div>`;
  return `<div class="mnav"><button data-act="prev" aria-label="Предыдущий месяц">‹</button><span>${MONTHS[m]} ${y}</span><button data-act="next" aria-label="Следующий месяц">›</button></div>
    <div class="cal"><div class="wd">${['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Вс'].map(x => `<span>${x}</span>`).join('')}</div><div class="cg">${cells}</div></div>${info}
    <button class="btn wide" data-act="rule">${rule ? `График: ${rule.on} через ${rule.off} · изменить` : 'Задать график смен'}</button><div class="mut">Заливкой отмечены рабочие дни, точкой — дни с задачами.</div>`;
}

function taskSheet(t) {
  let s = { title: t?.title || '', due: t?.due || '' };
  const draw = r => {
    r.querySelector('.dyn')?.remove();
    r.querySelector('.panel').insertAdjacentHTML('beforeend', `<div class="dyn"><input id="tt" placeholder="Что нужно сделать?" value="${esc(s.title)}" maxlength="120">
      <div class="chips"><button data-s="d" data-v="${dayKey(Date.now())}" aria-pressed="${s.due === dayKey(Date.now())}">Сегодня</button><button data-s="d" data-v="${addDays(dayKey(Date.now()), 1)}" aria-pressed="${s.due === addDays(dayKey(Date.now()), 1)}">Завтра</button><button data-s="d" data-v="" aria-pressed="${s.due === ''}">Без даты</button></div>
      <input type="date" id="dd" value="${s.due}" aria-label="Срок"><button class="save" data-s="ok">Сохранить</button>${t ? '<button class="ghost danger-t" data-s="del">Удалить задачу</button>' : ''}</div>`);
  };
  const sync = r => { s.title = r.querySelector('#tt').value; s.due = r.querySelector('#dd').value; };
  const r = shell(t ? 'Задача' : 'Новая задача', '', async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return; sync(r); const a = b.dataset.s;
    if (a === 'd') s.due = b.dataset.v;
    if (a === 'del' && confirm('Удалить задачу?')) { await db.del('tasks', t.id); r.remove(); return render(); }
    if (a === 'ok') { if (!s.title.trim()) return r.querySelector('#tt').focus(); await db.put('tasks', { ...(t || { created: Date.now(), done: false }), title: s.title.trim(), due: s.due }); r.remove(); return render(); }
    draw(r);
  });
  draw(r); setTimeout(() => r.querySelector('#tt')?.focus(), 50);
}
async function ruleSheet() {
  const cur = (await db.get('settings', 'shift'))?.v || { on: 2, off: 2, anchor: dayKey(Date.now()) };
  shell('График смен', `<div class="mut" style="line-height:1.4">Укажи, сколько дней подряд работаешь и сколько отдыхаешь, и с какого дня начался любой рабочий период. Остальное посчитается само.</div>
    <div class="row3"><label class="mut">Рабочих дней<input id="on" type="number" min="1" max="14" value="${cur.on}" inputmode="numeric" style="width:100%"></label><label class="mut">Выходных дней<input id="of" type="number" min="1" max="14" value="${cur.off}" inputmode="numeric" style="width:100%"></label></div>
    <label class="mut">Первый рабочий день периода<input id="an" type="date" value="${cur.anchor}" style="width:100%"></label>
    <button class="save" data-s="ok">Сохранить</button><button class="ghost danger-t" data-s="clear">Убрать график</button>`, async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'clear') { await db.del('settings', 'shift'); r.remove(); return render(); }
    if (b.dataset.s === 'ok') {
      const on = +r.querySelector('#on').value, off = +r.querySelector('#of').value, anchor = r.querySelector('#an').value;
      if (!(on >= 1 && off >= 1 && anchor)) return toast('Заполни все поля');
      await db.put('settings', { id: 'shift', v: { on, off, anchor } }); r.remove(); render();
    }
  });
}

async function render() {
  const body = st.tab === 'tasks' ? await tasksView() : await schedView();
  host.innerHTML = `<h1>План</h1><div class="seg"><button data-act="tab" data-v="tasks" aria-selected="${st.tab === 'tasks'}">Задачи</button><button data-act="tab" data-v="sched" aria-selected="${st.tab === 'sched'}">Расписание</button></div>${body}${st.tab === 'tasks' ? '<button class="fab" data-act="add" aria-label="Добавить задачу">+</button>' : ''}`;
}
async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'tab') { st.tab = b.dataset.v; return render(); }
  if (a === 'add') return taskSheet();
  if (a === 'edit') return taskSheet(await db.get('tasks', b.dataset.id));
  if (a === 'sd') { st.showDone = !st.showDone; return render(); }
  if (a === 'done') { const t = await db.get('tasks', b.dataset.id); t.done = !t.done; t.doneAt = t.done ? Date.now() : null; await db.put('tasks', t); return render(); }
  if (a === 'prev') { st.off--; return render(); }
  if (a === 'next') { st.off++; return render(); }
  if (a === 'sel') { st.sel = b.dataset.k; return render(); }
  if (a === 'rule') return ruleSheet();
  if (a === 'flip') {
    const { rule, over } = await loadShift(), cur = workState(st.sel, rule, over), auto = workState(st.sel, rule, {});
    if (!over[st.sel] && cur === auto) await db.put('shifts', { id: st.sel, status: cur ? 'off' : 'work' }); else await db.del('shifts', st.sel);
    return render();
  }
}
register('plan', async el => { host = el; el.onclick = onClick; el.onchange = null; await render(); });
