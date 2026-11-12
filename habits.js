import { register } from './registry.js';
import * as db from './db.js';
import { esc, pad, dayKey } from './lib.js';

const st = { tab: 'daily' };
let host, timer;
const DAY = 864e5;
const KINDS = [['Курение', 'курения'], ['Алкоголь', 'алкоголя'], ['Порно', 'порно'], ['Сладкое', 'сладкого'], ['Соцсети', 'соцсетей'], ['Энергетики', 'энергетиков'], ['Азартные игры', 'азартных игр'], ['Своя', '']];
const GOALS = [7, 14, 30, 90];
const TRIG = ['Стресс', 'Компания', 'Скука', 'Усталость', 'Другое'];

function toast(t) { const x = document.createElement('div'); x.className = 'toast'; x.textContent = t; document.body.append(x); setTimeout(() => x.remove(), 2200); }
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
    return `<div class="hrow"><button class="chk" data-act="tog" data-id="${esc(h.id)}" aria-pressed="${on}" aria-label="${esc(h.name)}: ${on ? 'выполнено' : 'не выполнено'}">${on ? '✓' : ''}</button>
      <div class="hn"><b>${esc(h.name)}</b><div class="dots">${week.map(k => `<i class="${s.has(k) ? 'on' : ''}"></i>`).join('')}</div></div>
      <span class="stk">${n ? n + ' дн' : '—'}</span><button class="more" data-act="hmenu" data-id="${esc(h.id)}" aria-label="Изменить привычку">⋯</button></div>`;
  }).join('') || '<div class="mut">Привычек пока нет. Нажми «+», чтобы добавить.</div>';
  return `<div class="mut">Сегодня выполнено ${doneN} из ${hs.length}</div><div class="card hl">${rows}</div><button class="fab" data-act="addh" aria-label="Добавить привычку">+</button>`;
}

// ---------- «Без…»
async function quits() {
  const qs = (await db.all('quits')).sort((a, b) => a.start - b.start);
  const cards = qs.map(q => {
    const e = elapsed(q.start), pct = Math.min(100, Math.round(e.days / q.goal * 100));
    return `<div class="card qc" data-id="${esc(q.id)}"><div class="qh"><div><b>Без ${esc(q.name)}</b><small>цель: ${q.goal} дн</small></div><button class="relapse" data-act="relapse" data-id="${esc(q.id)}">Срыв</button></div>
      <div class="big"><span class="qd">${e.d}</span><small>дн</small><span class="qh2">${pad(e.h)}</span><small>ч</small></div>
      <div class="bar"><i style="width:${pct}%;background:var(--acc)"></i></div><div class="qf"><span>до цели ${q.goal} дн</span><span>${pct}%</span></div></div>`;
  }).join('') || '<div class="card mut">Серий пока нет. Нажми «+», чтобы начать отсчёт.</div>';
  const hist = (await db.all('quitHistory')).sort((a, b) => b.end - a.end).slice(0, 5);
  const hh = hist.length ? `<div class="lab" style="margin-top:6px">Прошлые серии</div><div class="card list">${hist.map(h => `<div class="item"><div><b>Без ${esc(h.name)}</b><small>${new Date(h.end).toLocaleDateString('ru-RU')}${h.trigger ? ' · ' + esc(h.trigger) : ''}</small></div><span>${elapsed(h.start, h.end).d} дн</span></div>`).join('')}</div>` : '';
  return cards + hh + '<button class="fab" data-act="addq" aria-label="Новая серия">+</button>';
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
function shell(title, inner, onClick) {
  const r = document.createElement('div'); r.className = 'sheet';
  r.innerHTML = `<div class="panel"><div class="ph"><button data-s="close" aria-label="Закрыть">✕</button><b>${title}</b></div>${inner}</div>`;
  r.addEventListener('click', e => { if (e.target.closest('[data-s=close]')) return r.remove(); onClick(e, r); });
  document.body.append(r); return r;
}
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
  shell(`Срыв: «Без ${esc(q.name)}»`, `<div class="mut" style="font-size:14px;line-height:1.4">Серия ${e.d} дн ${pad(e.h)} ч сохранится в истории, таймер начнётся заново. Это нормально — важно, что ты записываешь.</div>
    <div class="lab">Что случилось?</div><div class="chips">${TRIG.map(t => `<button data-s="t" data-v="${t}" aria-pressed="false">${t}</button>`).join('')}</div>
    <input id="note" placeholder="Заметка (по желанию)"><button class="save danger" data-s="ok">Записать срыв и сбросить</button><button class="ghost" data-s="close">Отмена</button>`,
  async (ev, r) => {
    const b = ev.target.closest('[data-s]'); if (!b) return;
    if (b.dataset.s === 't') { trig = trig === b.dataset.v ? '' : b.dataset.v; r.querySelectorAll('[data-s=t]').forEach(x => x.setAttribute('aria-pressed', x.dataset.v === trig)); }
    if (b.dataset.s === 'ok') {
      const end = Date.now();
      await db.put('quitHistory', { quitId: q.id, name: q.name, start: q.start, end, trigger: trig, comment: r.querySelector('#note').value.trim() });
      await db.put('quits', { ...q, start: end }); r.remove(); render();
    }
  });
}
function newHabit(h) {
  shell(h ? 'Привычка' : 'Новая привычка', `<input id="hn" placeholder="Название, например «Зарядка»" value="${esc(h?.name || '')}" maxlength="40"><button class="save" data-s="ok">Сохранить</button>${h ? '<button class="ghost danger-t" data-s="del">Удалить привычку</button>' : ''}`,
    async (ev, r) => {
      const b = ev.target.closest('[data-s]'); if (!b) return;
      if (b.dataset.s === 'ok') { const n = r.querySelector('#hn').value.trim(); if (!n) return r.querySelector('#hn').focus(); await db.put('habits', { ...(h || { created: Date.now() }), name: n }); r.remove(); render(); }
      if (b.dataset.s === 'del' && confirm('Удалить привычку вместе с отметками?')) {
        for (const l of await db.all('habitLog')) if (l.habitId === h.id) await db.del('habitLog', l.id);
        await db.del('habits', h.id); r.remove(); render();
      }
    });
  setTimeout(() => document.querySelector('#hn')?.focus(), 50);
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
  if (a === 'hmenu') return newHabit(await db.get('habits', b.dataset.id));
  if (a === 'tog') {
    const id = b.dataset.id + '|' + dayKey(Date.now());
    if (await db.get('habitLog', id)) await db.del('habitLog', id); else await db.put('habitLog', { id, habitId: b.dataset.id, date: dayKey(Date.now()) });
    return render();
  }
}
register('habits', async el => { host = el; el.onclick = onClick; el.onchange = null; await render(); });
