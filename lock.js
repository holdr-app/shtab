import * as db from './db.js';
// Код-пароль: SHA-256(соль + код) хранится в IndexedDB. Это защита от случайного взгляда, а не шифрование данных.
const hex = b => [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
export const hashPin = async (pin, salt) => hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + pin)));
export const getLock = async () => (await db.get('settings', 'lock'))?.v || null;
export async function setPin(pin, auto = 60) { const salt = hex(crypto.getRandomValues(new Uint8Array(8))); await db.put('settings', { id: 'lock', v: { salt, hash: await hashPin(pin, salt), auto } }); }
export const clearPin = () => db.del('settings', 'lock');
export async function setAuto(auto) { const l = await getLock(); if (l) await db.put('settings', { id: 'lock', v: { ...l, auto } }); }

let overlay, hiddenAt = 0;
export async function showLock() {
  const l = await getLock(); if (!l || overlay) return;
  overlay = document.createElement('div'); overlay.className = 'lockscr'; let pin = '';
  const draw = (msg = '') => {
    overlay.innerHTML = `<div class="lk"><b>Штаб</b><div class="mut" role="status">${msg || 'Введи код'}</div><div class="dots4" aria-hidden="true">${[0, 1, 2, 3].map(i => `<i class="${i < pin.length ? 'on' : ''}"></i>`).join('')}</div>
    <div class="pad">${[1, 2, 3, 4, 5, 6, 7, 8, 9, '', 0, '⌫'].map(k => k === '' ? '<span></span>' : `<button data-k="${k}" aria-label="${k === '⌫' ? 'Стереть' : k}">${k}</button>`).join('')}</div></div>`;
  };
  overlay.addEventListener('click', async e => {
    const k = e.target.closest('[data-k]')?.dataset.k; if (!k) return;
    pin = k === '⌫' ? pin.slice(0, -1) : (pin + k).slice(0, 4); draw();
    if (pin.length === 4) {
      if (await hashPin(pin, l.salt) === l.hash) { overlay.remove(); overlay = null; } else { pin = ''; draw('Неверный код'); }
    }
  });
  draw(); document.body.append(overlay);
}
export async function initLock() {
  await showLock();
  document.addEventListener('visibilitychange', async () => {
    if (document.hidden) { hiddenAt = Date.now(); return; }
    const l = await getLock(); if (l && l.auto >= 0 && hiddenAt && Date.now() - hiddenAt >= l.auto * 1000) showLock();
  });
}
