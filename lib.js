// Чистые функции: разбор CSV из старого приложения, форматирование, даты.
export const rub = n => new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 0 }).format(Math.round(n)).replace(/ | /g, ' ') + ' ₽';
export const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
export const pad = n => String(n).padStart(2, '0');
export const dayKey = ts => { const d = new Date(ts); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); };
export const MONTHS = ['Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь', 'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь'];
export const MONTHS_G = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

// Разбор CSV с разделителем «;» и кавычками. Возвращает массив строк-массивов.
export function parseCsvRows(text) {
  text = text.replace(/^﻿/, '');
  const rows = []; let row = [], cur = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) { if (c === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else q = false; } else cur += c; }
    else if (c === '"') q = true;
    else if (c === ';') { row.push(cur); cur = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && text[i + 1] === '\n') i++; row.push(cur); cur = ''; if (row.some(x => x !== '')) rows.push(row); row = []; }
    else cur += c;
  }
  row.push(cur); if (row.some(x => x !== '')) rows.push(row);
  return rows;
}

// Формат старого приложения: Дата;Время;Тип;Счет;Категория;Подкатегория;Сумма 1;Валюта 1;Сумма 2;Валюта 2;Комментарий
export function parseOldExport(text) {
  const rows = parseCsvRows(text);
  const head = rows.shift() || [];
  if (head[0] !== 'Дата' || head[2] !== 'Тип' || head[6] !== 'Сумма 1') throw new Error('Не похоже на выгрузку старого приложения');
  const out = [], seen = {};
  for (const r of rows) {
    const m = /^(\d{1,2})\.(\d{1,2})\.(\d{4})$/.exec(r[0].trim()); if (!m) continue;
    const t = /^(\d{1,2}):(\d{2})/.exec((r[1] || '').trim()) || [0, 12, 0];
    const amount = parseFloat(String(r[6]).replace(/\s/g, '').replace(',', '.'));
    const type = r[2].trim() === 'Доход' ? 'inc' : r[2].trim() === 'Расход' ? 'exp' : null;
    if (!type || !isFinite(amount) || amount <= 0) continue;
    const ts = new Date(+m[3], +m[2] - 1, +m[1], +t[1], +t[2]).getTime();
    const cat = r[4].trim() || 'Прочее', sub = (r[5] || '').trim(), account = (r[3] || '').trim() || 'Карта', comment = (r[10] || '').trim();
    // стабильный id: повторный импорт не создаёт дублей
    const key = [ts, type, amount, cat, sub, account, comment].join('|'); seen[key] = (seen[key] || 0) + 1;
    out.push({ id: 'imp-' + key + '#' + seen[key], type, amount, cat, sub, account, comment, ts });
  }
  return out;
}

export const DEFAULT_CATS = {
  exp: [
    { n: 'Продукты', subs: [] }, { n: 'Еда', subs: ['Буфет', 'Шаверма', 'Доставка', 'Мак', 'KFC'] }, { n: 'Такси', subs: [] },
    { n: 'Развлечения', subs: ['Кальян', 'Футбол', 'Свидания'] }, { n: 'Подписки', subs: [] }, { n: 'Университет', subs: [] },
    { n: 'Бытовое', subs: [] }, { n: 'Спортпит', subs: [] }, { n: 'Красота', subs: [] }, { n: 'Квартира', subs: [] },
    { n: 'Рассрочка/кредит', subs: [] }, { n: 'Спорт', subs: [] }, { n: 'Одежда', subs: [] }, { n: 'Налог', subs: [] },
    { n: 'Здоровье', subs: [] }, { n: 'Транспорт', subs: [] }
  ],
  inc: [{ n: 'Репетиторство', subs: [] }, { n: 'СММ', subs: [] }, { n: 'Папа', subs: [] }, { n: 'Мама', subs: [] }]
};
// Добавляет в справочник категории и подкатегории, встреченные в записях.
export function mergeCats(cats, recs) {
  for (const r of recs) {
    const list = cats[r.type], c = list.find(x => x.n === r.cat) || (list.push({ n: r.cat, subs: [] }), list[list.length - 1]);
    if (r.sub && !c.subs.includes(r.sub)) c.subs.push(r.sub);
  }
  return cats;
}
