// Хранилище: IndexedDB. Один объектный склад на тип данных.
const DB_NAME = 'shtab', DB_VER = 1;
const STORES = ['diary', 'notes', 'habits', 'habitLog', 'quits', 'quitHistory', 'tasks', 'shifts', 'money', 'categories', 'vault', 'settings'];
let _db;
function open() {
  if (_db) return Promise.resolve(_db);
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB_NAME, DB_VER);
    r.onupgradeneeded = () => { for (const s of STORES) if (!r.result.objectStoreNames.contains(s)) r.result.createObjectStore(s, { keyPath: 'id' }); };
    r.onsuccess = () => { _db = r.result; res(_db); };
    r.onerror = () => rej(r.error);
  });
}
const tx = async (s, mode, fn) => { const db = await open(); return new Promise((res, rej) => { const t = db.transaction(s, mode); const out = fn(t.objectStore(s)); t.oncomplete = () => res(out && out.result !== undefined ? out.result : out); t.onerror = () => rej(t.error); }); };
export const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
export const all = s => tx(s, 'readonly', st => st.getAll());
export const get = (s, id) => tx(s, 'readonly', st => st.get(id));
export const put = (s, o) => { o.id = o.id || uid(); return tx(s, 'readwrite', st => { st.put(o); return { result: o }; }); };
export const del = (s, id) => tx(s, 'readwrite', st => st.delete(id));
export const exportAll = async () => { const o = { app: 'shtab', v: 1, at: new Date().toISOString() }; for (const s of STORES) o[s] = await all(s); return o; };
export const importAll = async o => { if (o.app !== 'shtab') throw new Error('Это не копия Штаба'); for (const s of STORES) for (const r of (o[s] || [])) await put(s, r); };
