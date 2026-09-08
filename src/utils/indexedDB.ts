/**
 * Helper to save, load and clear the file handle and entire database state snapshots in IndexedDB
 * ensuring limitless, reliable persistence across sessions without localStorage 5MB quota errors.
 */

const DB_NAME = 'gainbusters_store';
const DB_VERSION = 2;

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      return reject(new Error('IndexedDB is not supported in this environment'));
    }
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = (e: any) => {
      const db: IDBDatabase = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
      if (!db.objectStoreNames.contains('snapshots')) {
        db.createObjectStore('snapshots');
      }
    };
    request.onsuccess = (e: any) => resolve(e.target.result);
    request.onerror = (err: any) => reject(err);
  });
}

// ================= FILE HANDLES =================

export async function saveFileHandleInIndexedDB(handle: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('handles', 'readwrite');
      const store = transaction.objectStore('handles');
      const putReq = store.put(handle, 'active_handle');
      putReq.onsuccess = () => resolve();
      putReq.onerror = (err: any) => reject(err);
    });
  } catch (e) {
    console.warn('[IndexedDB] Could not save file handle:', e);
  }
}

export async function getFileHandleFromIndexedDB(): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('handles', 'readonly');
      const store = transaction.objectStore('handles');
      const getReq = store.get('active_handle');
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = (err: any) => reject(err);
    });
  } catch (e) {
    console.warn('[IndexedDB] Could not get file handle:', e);
    return null;
  }
}

export async function clearFileHandleFromIndexedDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('handles', 'readwrite');
      const store = transaction.objectStore('handles');
      const delReq = store.delete('active_handle');
      delReq.onsuccess = () => resolve();
      delReq.onerror = (err: any) => reject(err);
    });
  } catch (e) {
    console.warn('[IndexedDB] Could not clear file handle:', e);
  }
}

// ================= DATABASE STATE SNAPSHOTS =================

export async function saveDatabaseStateInIndexedDB(data: any): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readwrite');
      const store = transaction.objectStore('snapshots');
      const putReq = store.put(data, 'active_state');
      putReq.onsuccess = () => resolve();
      putReq.onerror = (err: any) => reject(err);
    });
  } catch (e) {
    console.warn('[IndexedDB] Could not save database state snapshot:', e);
  }
}

export async function getDatabaseStateFromIndexedDB(): Promise<any | null> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readonly');
      const store = transaction.objectStore('snapshots');
      const getReq = store.get('active_state');
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = (err: any) => reject(err);
    });
  } catch (e) {
    console.warn('[IndexedDB] Could not get database state snapshot:', e);
    return null;
  }
}

export async function clearDatabaseStateFromIndexedDB(): Promise<void> {
  try {
    const db = await openDB();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('snapshots', 'readwrite');
      const store = transaction.objectStore('snapshots');
      const delReq = store.delete('active_state');
      delReq.onsuccess = () => resolve();
      delReq.onerror = (err: any) => reject(err);
    });
  } catch (e) {
    console.warn('[IndexedDB] Could not clear database state snapshot:', e);
  }
}
