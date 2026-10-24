/** Durable snapshot storage. The previous ciphertext and its replacement commit together. */
let database: Promise<IDBDatabase | null> | null = null;
function open(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === 'undefined') return Promise.resolve(null);
  database ??= new Promise((resolve) => {
    const request = indexedDB.open('dukaanos-vault', 1);
    request.onupgradeneeded = () => request.result.createObjectStore('snapshots');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
    request.onblocked = () => resolve(null);
  });
  return database;
}
export async function readVaultSlot(slot: string, fallback: Storage): Promise<string | null> {
  const db = await open();
  if (!db) return fallback.getItem(slot);
  const result = await new Promise<string | null>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readonly');
    const request = tx.objectStore('snapshots').get(slot);
    request.onsuccess = () => resolve(typeof request.result === 'string' ? request.result : null);
    request.onerror = () => reject(request.error);
  });
  return result ?? fallback.getItem(slot);
}
export async function writeVaultSlot(slot: string, value: string, backup: string, fallback: Storage): Promise<void> {
  const db = await open();
  if (!db) {
    const old = fallback.getItem(slot);
    if (old) fallback.setItem(backup, old);
    fallback.setItem(slot, value);
    return;
  }
  await new Promise<void>((resolve, reject) => {
    const tx = db.transaction('snapshots', 'readwrite'),
      store = tx.objectStore('snapshots');
    const current = store.get(slot);
    current.onsuccess = () => {
      if (current.result) store.put(current.result, backup);
      store.put(value, slot);
    };
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export async function clearVaultSlot(slot: string, backup: string, fallback: Storage): Promise<void> {
  const db = await open();
  if (db)
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction('snapshots', 'readwrite');
      tx.objectStore('snapshots').delete(slot);
      tx.objectStore('snapshots').delete(backup);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  fallback.removeItem(slot);
  fallback.removeItem(backup);
}
const queues = new Map<string, Promise<unknown>>();
export function serializeVaultWrite<T>(key: string, write: () => Promise<T>): Promise<T> {
  const next = (queues.get(key) ?? Promise.resolve()).catch(() => undefined).then(write);
  queues.set(key, next);
  void next
    .finally(() => {
      if (queues.get(key) === next) queues.delete(key);
    })
    .catch(() => undefined);
  return next;
}
