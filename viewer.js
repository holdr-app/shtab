// Полноэкранный просмотр фото: листание свайпом, увеличение двумя пальцами и двойным тапом, свайп вниз — закрыть.
import { esc } from './lib.js';
import { ICON, toast } from './ui.js';

// items: [{ src, caption, onOpen? }], start — индекс
export function openViewer(items, start = 0, { openLabel = 'К записи' } = {}) {
  if (!items.length) return;
  let i = Math.max(0, Math.min(start, items.length - 1)), s = 1, tx = 0, ty = 0;
  const v = document.createElement('div'); v.className = 'viewer'; v.setAttribute('role', 'dialog'); v.setAttribute('aria-modal', 'true'); v.setAttribute('aria-label', 'Просмотр фото');
  v.innerHTML = `<div class="vtop"><button data-v="close" aria-label="Закрыть">${ICON.close}</button><span class="vcount" aria-live="polite"></span><button data-v="save" aria-label="Сохранить фото">${ICON.share}</button></div>
    <div class="vstage"><img class="vimg" alt=""></div>
    <button class="vnav vprev" data-v="prev" aria-label="Предыдущее фото">‹</button><button class="vnav vnext" data-v="next" aria-label="Следующее фото">›</button>
    <div class="vbot"><span class="vcap"></span><button class="vopen" data-v="open"></button></div>`;
  const img = v.querySelector('.vimg'), stage = v.querySelector('.vstage');
  const apply = (anim = false) => { img.style.transition = anim ? 'transform .2s ease-out' : 'none'; img.style.transform = `translate(${tx}px,${ty}px) scale(${s})`; };
  const reset = () => { s = 1; tx = 0; ty = 0; apply(true); };
  const show = () => {
    const it = items[i]; img.src = it.src; img.alt = it.caption ? 'Фото, ' + it.caption : 'Фото';
    v.querySelector('.vcount').textContent = items.length > 1 ? `${i + 1} из ${items.length}` : '';
    v.querySelector('.vcap').textContent = it.caption || '';
    const o = v.querySelector('.vopen'); o.hidden = !it.onOpen; o.textContent = openLabel;
    v.querySelector('.vprev').hidden = i === 0; v.querySelector('.vnext').hidden = i === items.length - 1;
    s = 1; tx = 0; ty = 0; apply(); v.style.background = '';
  };
  const go = d => { const n = i + d; if (n < 0 || n >= items.length) return reset(); i = n; show(); };
  const close = () => { v.remove(); document.removeEventListener('keydown', key); };
  const key = e => { if (e.key === 'Escape') close(); if (e.key === 'ArrowLeft') go(-1); if (e.key === 'ArrowRight') go(1); };
  document.addEventListener('keydown', key);

  async function save() {
    try {
      const blob = await (await fetch(items[i].src)).blob(), file = new File([blob], `dojo-photo-${i + 1}.jpg`, { type: blob.type || 'image/jpeg' });
      if (navigator.canShare?.({ files: [file] })) return await navigator.share({ files: [file] });
      const a = document.createElement('a'), u = URL.createObjectURL(blob); a.href = u; a.download = file.name; a.click(); setTimeout(() => URL.revokeObjectURL(u), 4000);
    } catch (e) { if (e.name !== 'AbortError') toast('Не получилось сохранить фото'); }
  }
  v.addEventListener('click', e => {
    const b = e.target.closest('[data-v]'); if (!b) return; const a = b.dataset.v;
    if (a === 'close') close(); if (a === 'prev') go(-1); if (a === 'next') go(1); if (a === 'save') save();
    if (a === 'open') { const f = items[i].onOpen; close(); f?.(); }
  });

  // ---- жесты
  const pts = new Map(); let g = null, lastTap = 0;
  const dist = () => { const [a, b] = [...pts.values()]; return Math.hypot(a.x - b.x, a.y - b.y); };
  const mid = () => { const [a, b] = [...pts.values()]; return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }; };
  stage.addEventListener('pointerdown', e => {
    stage.setPointerCapture(e.pointerId); pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (pts.size === 2) { const m = mid(); g = { type: 'pinch', d0: dist(), s0: s, tx0: tx, ty0: ty, m0: m }; }
    else if (pts.size === 1) g = { type: 'pan', x0: e.clientX, y0: e.clientY, tx0: tx, ty0: ty, t: Date.now() };
  });
  stage.addEventListener('pointermove', e => {
    if (!pts.has(e.pointerId) || !g) return; pts.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (g.type === 'pinch' && pts.size === 2) {
      const m = mid(); s = Math.min(5, Math.max(1, g.s0 * dist() / g.d0));
      tx = g.tx0 + (m.x - g.m0.x); ty = g.ty0 + (m.y - g.m0.y); apply();
    } else if (g.type === 'pan' && pts.size === 1) {
      const dx = e.clientX - g.x0, dy = e.clientY - g.y0;
      if (s > 1) { tx = g.tx0 + dx; ty = g.ty0 + dy; apply(); }
      else if (Math.abs(dy) > Math.abs(dx)) { ty = Math.max(0, dy); tx = 0; apply(); v.style.background = `rgba(0,0,0,${Math.max(.3, 1 - ty / 400)})`; }   // тянем вниз — закрыть
      else { tx = dx; ty = 0; apply(); }                                                                                                  // тянем вбок — листать
    }
  });
  const up = e => {
    if (!pts.has(e.pointerId)) return; pts.delete(e.pointerId);
    if (g?.type === 'pinch') { if (pts.size === 0) { if (s <= 1.05) reset(); g = null; } else { const [p] = [...pts.values()]; g = { type: 'pan', x0: p.x, y0: p.y, tx0: tx, ty0: ty, t: 0 }; } return; }
    if (g?.type !== 'pan' || pts.size) return;
    const dx = e.clientX - g.x0, dy = e.clientY - g.y0, quick = Date.now() - g.t < 250 && Math.abs(dx) < 10 && Math.abs(dy) < 10;
    g = null;
    if (quick) {   // двойной тап — приблизить к точке или вернуть
      const now = Date.now();
      if (now - lastTap < 300) { lastTap = 0; if (s > 1) reset(); else { const r = stage.getBoundingClientRect(); s = 2.5; tx = (r.width / 2 - (e.clientX - r.left)) * 1.5; ty = (r.height / 2 - (e.clientY - r.top)) * 1.5; apply(true); } }
      else lastTap = now;
      return;
    }
    if (s > 1) return;
    if (ty > 110) return close();
    if (dx < -60) return go(1); if (dx > 60) return go(-1);
    reset(); v.style.background = '';
  };
  stage.addEventListener('pointerup', up); stage.addEventListener('pointercancel', up);
  show(); document.body.append(v); v.querySelector('[data-v=close]').focus();
}
