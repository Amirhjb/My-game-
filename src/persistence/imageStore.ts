/**
 * Las imágenes de escena y del álbum pesan demasiado para localStorage
 * (el guardado antiguo reventaba la cuota y fallaba en silencio).
 * Aquí van a IndexedDB como Blob; el estado solo guarda la clave.
 */
const DB_NAME = 'ultimo-relato';
const DB_VERSION = 1;
const STORE = 'images';

let dbPromise: Promise<IDBDatabase | null> | null = null;

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') { resolve(null); return; }
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, fn: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | null> {
  return openDb().then(
    (db) =>
      new Promise<T | null>((resolve) => {
        if (!db) { resolve(null); return; }
        try {
          const t = db.transaction(STORE, mode);
          const req = fn(t.objectStore(STORE));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => resolve(null);
        } catch {
          resolve(null);
        }
      }),
  );
}

export function putImage(key: string, blob: Blob): Promise<unknown> {
  return tx('readwrite', (s) => s.put(blob, key) as IDBRequest<unknown>);
}

export function getImage(key: string): Promise<Blob | null> {
  return tx<Blob>('readonly', (s) => s.get(key) as IDBRequest<Blob>);
}

export function deleteImage(key: string): Promise<unknown> {
  return tx('readwrite', (s) => s.delete(key) as IDBRequest<unknown>);
}

export async function clearImages(): Promise<void> {
  await tx('readwrite', (s) => s.clear() as IDBRequest<unknown>);
  for (const url of urlCache.values()) URL.revokeObjectURL(url);
  urlCache.clear();
}

/** Cache de object URLs para no recrearlos en cada render. */
const urlCache = new Map<string, string>();

export async function imageUrl(key: string): Promise<string | null> {
  if (!key) return null;
  const cached = urlCache.get(key);
  if (cached) return cached;
  const blob = await getImage(key);
  if (!blob) return null;
  const url = URL.createObjectURL(blob);
  urlCache.set(key, url);
  return url;
}

/** Borra de IndexedDB todo lo que ya no referencia la partida. */
export async function pruneImages(keep: Set<string>): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const t = db.transaction(STORE, 'readwrite');
      const store = t.objectStore(STORE);
      const req = store.getAllKeys();
      req.onsuccess = () => {
        for (const k of req.result) {
          const key = String(k);
          if (!keep.has(key)) {
            store.delete(k);
            const url = urlCache.get(key);
            if (url) { URL.revokeObjectURL(url); urlCache.delete(key); }
          }
        }
        resolve();
      };
      req.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}
