/**
 * Helper to save, load and clear the file handle in IndexedDB
 * so user does not need to choose their database file every time.
 */

export function saveFileHandleInIndexedDB(handle: any): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gainbusters_store', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      const transaction = db.transaction('handles', 'readwrite');
      const store = transaction.objectStore('handles');
      const putReq = store.put(handle, 'active_handle');
      putReq.onsuccess = () => resolve();
      putReq.onerror = (err: any) => reject(err);
    };
    request.onerror = (err: any) => reject(err);
  });
}

export function getFileHandleFromIndexedDB(): Promise<any | null> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gainbusters_store', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      const transaction = db.transaction('handles', 'readonly');
      const store = transaction.objectStore('handles');
      const getReq = store.get('active_handle');
      getReq.onsuccess = () => resolve(getReq.result || null);
      getReq.onerror = (err: any) => reject(err);
    };
    request.onerror = (err: any) => reject(err);
  });
}

export function clearFileHandleFromIndexedDB(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('gainbusters_store', 1);
    request.onupgradeneeded = (e: any) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains('handles')) {
        db.createObjectStore('handles');
      }
    };
    request.onsuccess = (e: any) => {
      const db = e.target.result;
      const transaction = db.transaction('handles', 'readwrite');
      const store = transaction.objectStore('handles');
      const delReq = store.delete('active_handle');
      delReq.onsuccess = () => resolve();
      delReq.onerror = (err: any) => reject(err);
    };
    request.onerror = (err: any) => reject(err);
  });
}
