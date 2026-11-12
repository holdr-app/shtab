import { esc } from './lib.js';
import * as db from './db.js';

// ---------- уведомление снизу; с кнопкой «Вернуть», если передан undo
let toastEl, toastT;
export const dismissToast = () => { toastEl?.remove(); clearTimeout(toastT); };
export function toast(text, { undo, action, label, ms } = {}) {
  toastEl?.remove(); clearTimeout(toastT);
  const fn = undo || action, x = toastEl = document.createElement('div'); x.className = 'toast'; x.setAttribute('role', 'status');
  x.innerHTML = `<span>${esc(text)}</span>${fn ? `<button>${esc(label || 'Вернуть')}</button>` : ''}`;
  if (fn) x.querySelector('button').onclick = async () => { x.remove(); await fn(); };
  document.body.append(x); toastT = setTimeout(() => x.remove(), ms || (fn ? 5000 : 2200));
}
// Удаление с возможностью вернуть: items — [[store, объект], ...]
export async function removeWithUndo(items, text, rerender) {
  for (const [s, o] of items) await db.del(s, o.id);
  await rerender?.();
  toast(text, { undo: async () => { for (const [s, o] of items) await db.put(s, o); await rerender?.(); } });
}

// ---------- свои диалоги вместо системных confirm/prompt
function dialog(html, onMount) {
  return new Promise(res => {
    const prev = document.activeElement, w = document.createElement('div'); w.className = 'dlgw';
    w.innerHTML = `<div class="dlg" role="dialog" aria-modal="true">${html}</div>`;
    const done = v => { w.remove(); prev?.focus?.(); res(v); };
    w.addEventListener('click', e => { if (e.target === w) done(null); const b = e.target.closest('[data-d]'); if (b) done(b.dataset.d === 'ok' ? (onMount.value ? onMount.value() : true) : null); });
    w.addEventListener('keydown', e => { if (e.key === 'Escape') done(null); if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); done(onMount.value ? onMount.value() : true); } });
    document.body.append(w); onMount(w);
  });
}
// Подтверждение. Возвращает true/false.
export async function ask(title, { text = '', ok = 'Да', cancel = 'Отмена', danger = false } = {}) {
  const m = w => w.querySelector('[data-d=ok]').focus();
  return !!(await dialog(`<b class="dt">${esc(title)}</b>${text ? `<p>${esc(text)}</p>` : ''}<div class="db"><button data-d="no">${esc(cancel)}</button><button data-d="ok" class="${danger ? 'dd' : 'do'}">${esc(ok)}</button></div>`, m));
}
// Ввод строки. Возвращает текст или null.
export function askText(title, { value = '', placeholder = '', ok = 'Готово', inputmode = 'text', hint = '' } = {}) {
  let inp; const m = w => { inp = w.querySelector('input'); inp.focus(); inp.select(); };
  m.value = () => inp.value.trim();
  return dialog(`<b class="dt">${esc(title)}</b>${hint ? `<p>${esc(hint)}</p>` : ''}<input value="${esc(value)}" placeholder="${esc(placeholder)}" inputmode="${inputmode}" aria-label="${esc(title)}" enterkeyhint="done"><div class="db"><button data-d="no">Отмена</button><button data-d="ok" class="do">${esc(ok)}</button></div>`, m);
}

// ---------- полноэкранная шторка. Если в ней что-то ввели и не сохранили — спросит при закрытии.
export function shell(title, inner, onClick) {
  const r = document.createElement('div'); r.className = 'sheet'; r.dataset.dirty = '';
  r.innerHTML = `<div class="panel"><div class="ph"><button data-s="close" aria-label="Закрыть">${ICON.close}</button><b>${esc(title)}</b></div>${inner}</div>`;
  r.addEventListener('input', () => { r.dataset.dirty = '1'; });
  r.addEventListener('click', async e => {
    if (e.target.closest('[data-s=close]')) { if (await closeSheet(r)) return; return; }
    onClick(e, r);
  });
  document.body.append(r); requestAnimationFrame(() => r.classList.add('in')); return r;
}
export async function closeSheet(r) {
  if (r.dataset.dirty && !(await ask('Закрыть без сохранения?', { text: 'Введённое пропадёт.', ok: 'Закрыть', cancel: 'Остаться', danger: true }))) return false;
  r.remove(); return true;
}
// шторка без shell (например, в финансах) тоже должна помнить о несохранённом
export function trackDirty(r) { r.dataset.dirty = ''; r.addEventListener('input', () => { r.dataset.dirty = '1'; }); requestAnimationFrame(() => r.classList.add('in')); }

export const ICON = {
  close: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>',
  gear: '<svg viewBox="0 0 24 24" width="24" height="24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3h0a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8v0a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/></svg>',
  search: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/></svg>',
  chart: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 20V11M12 20V5M19 20v-6"/></svg>',
  check: '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  more: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="currentColor"><circle cx="5" cy="12" r="1.8"/><circle cx="12" cy="12" r="1.8"/><circle cx="19" cy="12" r="1.8"/></svg>',
  share: '<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M8 7l4-4 4 4"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>',
  plus: '<svg viewBox="0 0 24 24" width="28" height="28" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>'
};

export function shrinkImage(file, max = 1600, q = 0.78) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось открыть фото')); };
    img.src = url;
  });
}
export const readAsDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
// «Сегодня», «Вчера» или «12 ноября»
export function relDay(k, MONTHS_G) {
  const t = new Date(), key = d => d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  const y = new Date(t); y.setDate(t.getDate() - 1);
  if (k === key(t)) return 'Сегодня'; if (k === key(y)) return 'Вчера';
  const [yy, m, d] = k.split('-').map(Number); return `${d} ${MONTHS_G[m - 1]}${yy !== t.getFullYear() ? ' ' + yy : ''}`;
}
