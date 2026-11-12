import { esc } from './lib.js';
export function toast(t) { const x = document.createElement('div'); x.className = 'toast'; x.textContent = t; document.body.append(x); setTimeout(() => x.remove(), 2200); }
// Полноэкранная шторка: inner — HTML, onClick(e, root) — обработчик нажатий по data-s.
export function shell(title, inner, onClick) {
  const r = document.createElement('div'); r.className = 'sheet';
  r.innerHTML = `<div class="panel"><div class="ph"><button data-s="close" aria-label="Закрыть">✕</button><b>${esc(title)}</b></div>${inner}</div>`;
  r.addEventListener('click', e => { if (e.target.closest('[data-s=close]')) return r.remove(); onClick(e, r); });
  document.body.append(r); return r;
}
// Уменьшает фото до 1280 px по длинной стороне и возвращает JPEG dataURL — иначе фото с iPhone по 5 МБ забьют хранилище.
export function shrinkImage(file, max = 1280, q = 0.72) {
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => { const k = Math.min(1, max / Math.max(img.width, img.height)), c = document.createElement('canvas'); c.width = Math.round(img.width * k); c.height = Math.round(img.height * k); c.getContext('2d').drawImage(img, 0, 0, c.width, c.height); URL.revokeObjectURL(url); res(c.toDataURL('image/jpeg', q)); };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Не удалось открыть фото')); };
    img.src = url;
  });
}
export const readAsDataURL = f => new Promise((res, rej) => { const r = new FileReader(); r.onload = () => res(r.result); r.onerror = () => rej(r.error); r.readAsDataURL(f); });
