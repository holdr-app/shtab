import { register } from './registry.js';
import * as db from './db.js';
import { esc, pad, dayKey } from './lib.js';
import { shell, toast, ask, removeWithUndo, ICON } from './ui.js';

const st = { tab: 'daily', allHist: false };
let host, timer;
const DAY = 864e5;
const KINDS = [['Курение', 'курения'], ['Алкоголь', 'алкоголя'], ['Порно', 'порно'], ['Сладкое', 'сладкого'], ['Соцсети', 'соцсетей'], ['Энергетики', 'энергетиков'], ['Азартные игры', 'азартных игр'], ['Своя', '']];
const GOALS = [7, 14, 30, 90];
const TRIG = ['Стресс', 'Компания', 'Скука', 'Усталость', 'Другое'];

const addDays = (k, n) => { const [y, m, d] = k.split('-').map(Number); return dayKey(new Date(y, m - 1, d + n).getTime()); };
function streak(done, today) {
  let k = done.has(today) ? today : addDays(today, -1), n = 0;
  while (done.has(k)) { n++; k = addDays(k, -1); }
  return n;
}
export function elapsed(start, now = Date.now()) {
  const ms = Math.max(0, now - start), h = Math.floor(ms / 36e5);
  return { d: Math.floor(h / 24), h: h % 24, days: ms / DAY };
}

// ---------- ежедневные
async function daily() {
  const hs = (await db.all('habits')).sort((a, b) => a.created - b.created), logs = await db.all('habitLog');
  const today = dayKey(Date.now()), byH = {};
  for (const l of logs) (byH[l.habitId] ||= new Set()).add(l.date);
  const doneN = hs.filter(h => byH[h.id]?.has(today)).length;
  const week = Array.from({ length: 7 }, (_, i) => addDays(today, i - 6));
  const rows = hs.map(h => {
    const s = byH[h.id] || new Set(), on = s.has(today), n = streak(s, today);
    return `<div class="hrow"><button class="htog" data-act="tog" data-id="${esc(h.id)}" aria-pressed="${on}" aria-label="${esc(h.name)}: ${on ? 'выполнено, нажми чтобы снять' : 'не выполнено'}"><span class="chk" aria-hidden="true">${on ? ICON.check : ''}</span>
      <span class="hn"><b>${esc(h.name)}</b><span class="dots">${week.map(k => `<i class="${s.has(k) ? 'on' : ''}"></i>`).join('')}</span></span>
      <span class="stk">${n >= 2 ? n + ' дн подряд' : ''}</span></button><button class="more" data-act="hmenu" data-id="${esc(h.id)}" aria-label="Изменить или удалить «${esc(h.name)}»">${ICON.more}</button></div>`;
  }).join('');
  if (!hs.length) return `<div class="empty"><b>Привычек пока нет</b><p>Добавь то, что хочешь делать каждый день: зарядку, чтение, воду.</p><button class="save" data-act="addh">Добавить привычку</button></div>`;
  return `<div class="mut">Сегодня ${doneN} из ${hs.length}${doneN === hs.length ? ' — всё сделано' : ''}. Нажми на привычку, чтобы отметить.</div><div class="card hl">${rows}</div><button class="fab" data-act="addh" aria-label="Добавить привычку">${ICON.plus}</button>`;
}

// ---------- «Без…»
async function quits() {
  const qs = (await db.all('quits')).sort((a, b) => a.start - b.start);
  const cards = qs.map(q => {
    const e = elapsed(q.start), pct = Math.min(100, Math.round(e.days / q.goal * 100));
    return `<div class="card qc" data-id="${esc(q.id)}"><div class="qh"><div><b>Без ${esc(q.name)}</b><small>цель: ${q.goal} дн</small></div><div class="qa"><button class="more" data-act="qmenu" data-id="${esc(q.id)}" aria-label="Изменить или удалить серию">${ICON.more}</button><button class="relapse" data-act="relapse" data-id="${esc(q.id)}">Срыв</button></div></div>
      <div class="big"><span class="qd">${e.d}</span><small>дн</small><span class="qh2">${pad(e.h)}</span><small>ч</small></div>
      <div class="bar"><i style="width:${pct}%;background:var(--acc)"></i></div><div class="qf"><span>до цели ${q.goal} дн</span><span>${pct}%</span></div></div>`;
  }).join('') || `<div class="empty"><b>Серий пока нет</b><p>Выбери, от чего отказываешься, и таймер начнёт считать дни и часы.</p><button class="save" data-act="addq">Начать серию</button></div>`;
  const all = (await db.all('quitHistory')).sort((a, b) => b.end - a.end), hist = st.allHist ? all : all.slice(0, 5);
  const hh = all.length ? `<div class="lab" style="margin-top:6px">Прошлые серии <span class="mut">нажми, чтобы изменить или удалить</span></div><div class="card list">${hist.map(h => `<button class="item" data-act="hist" data-id="${esc(h.id)}"><div><b>Без ${esc(h.name)}</b><small>${new Date(h.end).toLocaleDateString('ru-RU')}${h.trigger ? ' · ' + esc(h.trigger) : ''}${h.comment ? ' · ' + esc(h.comment) : ''}</small></div><span>${elapsed(h.start, h.end).d} дн</span></button>`).join('')}</div>${all.length > 5 ? `<button class="btn" data-act="allhist">${st.allHist ? 'Свернуть' : 'Показать все ' + all.length}</button>` : ''}` : '';
  return cards + hh + (qs.length ? `<button class="fab" data-act="addq" aria-label="Новая серия">${ICON.plus}</button>` : '');
}
// живой таймер: раз в минуту обновляем цифры без перерисовки
function tick() {
  clearInterval(timer);
  timer = setInterval(async () => {
    if (!host?.isConnected || st.tab !== 'quit' || document.querySelector('.sheet')) return;
    const qs = await db.all('quits');
    for (const q of qs) {
      const c = host.querySelector(`.qc[data-id="${CSS.escape(q.id)}"]`); if (!c) continue;
      const e = elapsed(q.start); c.querySelector('.qd').textContent = e.d; c.querySelector('.qh2').textContent = pad(e.h);
    }
  }, 60000);
}

// ---------- шторки
function newQuit() {
  let s = { kind: 0, custom: '', when: 'now', at: '', goal: 14 };
  const draw = r => {
    const now = new Date(); now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    r.querySelector('.panel').querySelectorAll('.dyn').forEach(x => x.remove());
    r.querySelector('.panel').insertAdjacentHTML('beforeend', `<div class="dyn"><div class="lab">Без чего?</div><div class="grid g4">${KINDS.map((k, i) => `<button data-s="kind" data-i="${i}" aria-pressed="${s.kind === i}">${k[0]}</button>`).join('')}</div>
      ${s.kind === KINDS.length - 1 ? `<input id="cust" placeholder="Без чего? Например, фастфуда" value="${esc(s.custom)}" style="width:100%;margin-top:8px">` : ''}
      <div class="lab" style="margin-top:14px">С какого момента</div><div class="seg"><button data-s="when" data-v="now" aria-selected="${s.when === 'now'}">Прямо сейчас</button><button data-s="when" data-v="date" aria-selected="${s.when === 'date'}">Указать дату</button></div>
      ${s.when === 'date' ? `<input type="datetime-local" id="at" value="${s.at || now.toISOString().slice(0, 16)}" max="${now.toISOString().slice(0, 16)}" style="width:100%;margin-top:8px">` : ''}
      <div class="lab" style="margin-top:14px">Цель</div><div class="chips">${GOALS.map(g => `<button data-s="goal" data-v="${g}" aria-pressed="${s.goal === g}">${g} дней</button>`).join('')}</div>
      <button class="save" data-s="save" style="width:100%;margin-top:18px">Начать отсчёт</button></div>`);
  };
  const r = shell('Новая серия', '', async (e, r) => {
    const c = r.querySelector('#cust'); if (c) s.custom = c.value; const a = r.querySelector('#at'); if (a) s.at = a.value;
    const b = e.target.closest('[data-s]'); if (!b) return; const k = b.dataset.s;
    if (k === 'kind') s.kind = +b.dataset.i; if (k === 'when') s.when = b.dataset.v; if (k === 'goal') s.goal = +b.dataset.v;
    if (k === 'save') {
      const name = s.kind === KINDS.length - 1 ? s.custom.trim().toLowerCase() : KINDS[s.kind][1];
      if (!name) return toast('Напиши, без чего');
      const start = s.when === 'date' && s.at ? new Date(s.at).getTime() : Date.now();
      if (!(start <= Date.now())) return toast('Дата не может быть в будущем');
      await db.put('quits', { name, goal: s.goal, start }); r.remove(); return render();
    }
    draw(r);
  });
  draw(r);
}
async function relapse(id) {
  const q = await db.get('quits', id); if (!q) return; const e = elapsed(q.start);
  let trig = '';
  shell(`Срыв: «Без ${q.name}»`, `<div class="mut" style="font-size:14px;line-height:1.4">Серия ${e.d} дн ${pad(e.h)} ч сохранится в истории, таймер начнётся заново. Это нормально — важно, что ты записываешь.</div>
    <div class="lab">Что случилось?</div><div class="chips">${TRIG.map(t => `<button data-s="t" data-v="${t}" aria-pressed="false">${t}</button>`).join('')}</div>
    <input id="note" placeholder="Заметка (по желанию)"><button class="save danger" data-s="ok">Записать срыв и сбросить</button><button class="ghost" data-s="close">Отмена</button>`,
  async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 't') { trig = trig === b.dataset.v ? '' : b.dataset.v; r.querySelectorAll('[data-s=t]').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === trig)); }
    if (b.dataset.s === 'ok') {
      const end = Date.now(), h = await db.put('quitHistory', { quitId: q.id, name: q.name, start: q.start, end, trigger: trig, comment: r.querySelector('#note').value.trim() });
      await db.put('quits', { ...q, start: end }); r.remove(); render();
      toast('Срыв записан, отсчёт заново', { undo: async () => { await db.del('quitHistory', h.id); await db.put('quits', q); render(); } });
    }
  });
}
const toLocal = ts => { const d = new Date(ts); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
async function editQuit(id) {
  const q = await db.get('quits', id); if (!q) return;
  const hist = (await db.all('quitHistory')).filter(h => h.quitId === q.id);
  shell('Изменить серию', `<label class="mut">Без чего (продолжи фразу «Без …»)<input id="qn" value="${esc(q.name)}" maxlength="40" style="width:100%"></label>
    <label class="mut">Цель, дней<input id="qg" type="number" min="1" max="3650" inputmode="numeric" value="${q.goal}" style="width:100%"></label>
    <label class="mut">Начало отсчёта<input id="qs" type="datetime-local" value="${toLocal(q.start)}" max="${toLocal(Date.now())}" style="width:100%"></label>
    <button class="save" data-s="ok">Сохранить</button>
    <button class="ghost danger-t" data-s="del">Удалить серию${hist.length ? ' и её историю (' + hist.length + ')' : ''}</button>`, async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 'ok') {
      const name = r.querySelector('#qn').value.trim(), goal = Math.round(+r.querySelector('#qg').value), start = new Date(r.querySelector('#qs').value).getTime();
      if (!name) return toast('Напиши, без чего'); if (!(goal >= 1)) return toast('Цель — хотя бы 1 день');
      if (!(start <= Date.now())) return toast('Начало не может быть в будущем');
      await db.put('quits', { ...q, name, goal, start }); r.remove(); return render();
    }
    if (b.dataset.s === 'del' && await ask(`Удалить «Без ${q.name}»?`, { text: hist.length ? `Вместе с ней удалятся прошлые серии: ${hist.length}.` : '', ok: 'Удалить', danger: true })) {
      r.remove(); await removeWithUndo([['quits', q], ...hist.map(h => ['quitHistory', h])], 'Серия удалена', render);
    }
  });
}
async function editHist(id) {
  const h = await db.get('quitHistory', id); if (!h) return; const e = elapsed(h.start, h.end);
  shell('Прошлая серия', `<div class="card"><b>Без ${esc(h.name)}</b><div class="mut">${e.d} дн ${pad(e.h)} ч · с ${new Date(h.start).toLocaleDateString('ru-RU')} по ${new Date(h.end).toLocaleDateString('ru-RU')}</div></div>
    <div class="lab">Что случилось?</div><div class="chips">${TRIG.map(t => `<button data-s="t" data-v="${t}" aria-pressed="${h.trigger === t}">${t}</button>`).join('')}</div>
    <input id="note" placeholder="Заметка" value="${esc(h.comment || '')}"><button class="save" data-s="ok">Сохранить</button><button class="ghost danger-t" data-s="del">Удалить из истории</button>`, async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 't') { h.trigger = h.trigger === b.dataset.v ? '' : b.dataset.v; r.querySelectorAll('[data-s=t]').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === h.trigger)); }
    if (b.dataset.s === 'ok') { await db.put('quitHistory', { ...h, comment: r.querySelector('#note').value.trim() }); r.remove(); render(); }
    if (b.dataset.s === 'del') { r.remove(); await removeWithUndo([['quitHistory', h]], 'Серия удалена из истории', render); }
  });
}
async function newHabit(h) {
  const today = dayKey(Date.now()), days = Array.from({ length: 14 }, (_, i) => addDays(today, i - 13));
  const done = new Set(h ? (await db.all('habitLog')).filter(l => l.habitId === h.id).map(l => l.date) : []);
  const past = h ? `<div class="lab">Отметки за 2 недели <span class="mut">нажми день, чтобы поставить или снять</span></div><div class="hdays">${days.map(k => { const [, m, d] = k.split('-'); return `<button data-s="day" data-k="${k}" aria-pressed="${done.has(k)}" aria-label="${+d}.${m}">${+d}</button>`; }).join('')}</div>` : '';
  shell(h ? 'Привычка' : 'Новая привычка', `<input id="hn" placeholder="Название, например «Зарядка»" value="${esc(h?.name || '')}" maxlength="40">${past}<button class="save" data-s="ok">Сохранить</button>${h ? '<button class="ghost danger-t" data-s="del">Удалить привычку</button>' : ''}`,
    async (ev, r) => {
      const b = ev.target.closest('[data-s]'); if (!b) return;
      if (b.dataset.s === 'day') { const k = b.dataset.k, id = h.id + '|' + k; if (done.has(k)) { done.delete(k); await db.del('habitLog', id); } else { done.add(k); await db.put('habitLog', { id, habitId: h.id, date: k }); } b.setAttribute('aria-pressed', done.has(k)); return; }
      if (b.dataset.s === 'ok') { const n = r.querySelector('#hn').value.trim(); if (!n) return r.querySelector('#hn').focus(); await db.put('habits', { ...(h || { created: Date.now() }), name: n }); r.remove(); render(); }
      if (b.dataset.s === 'del') {
        const logs = (await db.all('habitLog')).filter(l => l.habitId === h.id);
        r.remove(); await removeWithUndo([['habits', h], ...logs.map(l => ['habitLog', l])], `Привычка «${h.name}» удалена`, render);
      }
    });
  if (!h) setTimeout(() => document.querySelector('#hn')?.focus(), 50);
}
async function render() {
  const body = st.tab === 'daily' ? await daily() : await quits();
  host.innerHTML = `<h1>Привычки</h1><div class="seg"><button data-act="tab" data-v="daily" aria-selected="${st.tab === 'daily'}">Ежедневные</button><button data-act="tab" data-v="quit" aria-selected="${st.tab === 'quit'}">Без…</button></div>${body}`;
  tick();
}
async function onClick(e) {
  const b = e.target.closest('[data-act]'); if (!b) return; const a = b.dataset.act;
  if (a === 'tab') { st.tab = b.dataset.v; return render(); }
  if (a === 'addh') return newHabit();
  if (a === 'addq') return newQuit();
  if (a === 'relapse') return relapse(b.dataset.id);
  if (a === 'qmenu') return editQuit(b.dataset.id);
  if (a === 'hist') return editHist(b.dataset.id);
  if (a === 'allhist') { st.allHist = !st.allHist; return render(); }
  if (a === 'hmenu') return newHabit(await db.get('habits', b.dataset.id));
  if (a === 'tog') {
    const id = b.dataset.id + '|' + dayKey(Date.now());
    if (await db.get('habitLog', id)) await db.del('habitLog', id); else await db.put('habitLog', { id, habitId: b.dataset.id, date: dayKey(Date.now()) });
    return render();
  }
}
register('habits', async el => { host = el; el.onclick = onClick; el.onchange = null; await render(); });
