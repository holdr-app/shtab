import { register } from './registry.js';
import * as db from './db.js';
import { toast, shell, ask } from './ui.js';
import { dayKey } from './lib.js';
import { importCsv } from './finance.js';
import { getLock, setPin, clearPin, setAuto } from './lock.js';

let host;
const AUTO = [[0, 'сразу'], [60, 'через 1 минуту'], [300, 'через 5 минут'], [-1, 'только при запуске']];
async function render() {
  const l = await getLock(), last = (await db.get('settings', 'lastBackup'))?.v;
  host.innerHTML = `<a href="#today" class="back" aria-label="Назад">‹ Назад</a><h1>Настройки</h1>
  <div class="card"><div class="lab">Безопасность</div>
    <div class="srow"><div><b>Код-пароль</b><small class="mut">4 цифры при входе</small></div><button class="tgl" data-act="pin" role="switch" aria-checked="${!!l}" aria-label="Код-пароль"><i></i></button></div>
    ${l ? `<div class="srow"><div><b>Автоблокировка</b></div><select data-act="auto" aria-label="Автоблокировка">${AUTO.map(([v, n]) => `<option value="${v}" ${l.auto === v ? 'selected' : ''}>${n}</option>`).join('')}</select></div>` : ''}
    <p class="mut note">Код закрывает вход в приложение, но не шифрует данные на телефоне.</p></div>
  <div class="card"><div class="lab">Данные</div>
    <div class="srow"><div><b>Резервная копия</b><small class="mut">${last ? 'Последняя: ' + new Date(last).toLocaleDateString('ru-RU') : 'Ещё не делалась'}</small></div><button class="btn" data-act="backup">Сохранить</button></div>
    <div class="srow"><div><b>Восстановить из копии</b></div><label class="btn">Файл<input type="file" accept=".json,application/json" data-act="restore" hidden></label></div>
    <div class="srow"><div><b>Импорт из старого приложения</b><small class="mut">Файл CSV с тратами и доходами</small></div><label class="btn">Файл<input type="file" accept=".csv,text/csv" data-act="csv" hidden></label></div></div>
  <div class="card"><div class="lab">Хранение</div><p class="mut note" style="margin:0">Все данные лежат только на этом телефоне. Если удалить приложение или очистить данные Safari, они пропадут, поэтому делай резервную копию раз в неделю-две.</p></div>`;
}
function pinSheet() {
  let a = '', step = 1;
  const draw = (r, msg = '') => { r.querySelector('.dyn')?.remove(); r.querySelector('.panel').insertAdjacentHTML('beforeend', `<div class="dyn"><div class="mut" role="status">${msg || (step === 1 ? 'Придумай код из 4 цифр' : 'Повтори код')}</div><input id="pn" inputmode="numeric" pattern="[0-9]*" maxlength="4" type="password" autocomplete="off" aria-label="Код" style="text-align:center;font-size:28px;letter-spacing:.5em"><button class="save" data-s="ok">${step === 1 ? 'Дальше' : 'Включить код'}</button></div>`); r.querySelector('#pn').focus(); };
  const r = shell('Код-пароль', '', async (ev, r) => {
    if (!ev.target.closest('[data-s=ok]')) return; const v = r.querySelector('#pn').value;
    if (!/^\d{4}$/.test(v)) return toast('Нужно ровно 4 цифры');
    if (step === 1) { a = v; step = 2; return draw(r); }
    if (v !== a) { step = 1; a = ''; return draw(r, 'Коды не совпали. Попробуй ещё раз'); }
    await setPin(v); r.remove(); render(); toast('Код включён');
  });
  draw(r);
}
register('settings', async el => { host = el; el.onclick = async e => {
  const b = e.target.closest('[data-act]'); if (!b || b.tagName === 'INPUT') return; const a = b.dataset.act;
  if (a === 'pin') { if (await getLock()) { if (await ask('Отключить код-пароль?', { text: 'Приложение будет открываться без кода.', ok: 'Отключить', danger: true })) { await clearPin(); render(); } } else pinSheet(); }
  if (a === 'backup') {
    const blob = new Blob([JSON.stringify(await db.exportAll())], { type: 'application/json' }), u = URL.createObjectURL(blob), l = document.createElement('a');
    l.href = u; l.download = `shtab-${dayKey(Date.now())}.json`; l.click(); setTimeout(() => URL.revokeObjectURL(u), 5000);
    await db.put('settings', { id: 'lastBackup', v: Date.now() }); render();
  }
};
el.onchange = async e => {
  const i = e.target; if (i.dataset.act === 'auto') { await setAuto(+i.value); return; }
  if (i.type !== 'file' || !i.files[0]) return; const text = await i.files[0].text(), a = i.dataset.act; i.value = '';
  try {
    if (a === 'csv') { const { added, total } = await importCsv(text); toast(`Добавлено ${added} из ${total}`); }
    if (a === 'restore') { const o = JSON.parse(text); if (!await ask('Восстановить из копии?', { text: `Копия от ${o.at ? new Date(o.at).toLocaleDateString('ru-RU') : '?'}. Записи из неё добавятся к текущим, совпадающие заменятся.`, ok: 'Восстановить' })) return; await db.importAll(o); toast('Копия восстановлена'); render(); }
  } catch (err) { toast(err.message || 'Не удалось прочитать файл'); }
}; await render(); });
