import { DBState } from '../types';
import { encryptData, decryptData } from '../utils/crypto';
import {
  saveDatabaseStateInIndexedDB,
  getDatabaseStateFromIndexedDB,
  saveFileHandleInIndexedDB,
  getFileHandleFromIndexedDB
} from '../utils/indexedDB';

export type StorageMode = 'browser' | 'local';

class StorageService {
  private mode: StorageMode = 'browser';
  private browserPassword: string = '';
  private fileHandle: any | null = null;
  private isSaving: boolean = false;
  private latestStateToSave: DBState | null = null;
  private saveResolvers: Array<() => void> = [];
  private saveRejecters: Array<(err: any) => void> = [];

  public setStorageMode(mode: StorageMode) {
    this.mode = mode;
  }

  public getStorageMode(): StorageMode {
    return this.mode;
  }

  public setBrowserPassword(password: string) {
    this.browserPassword = password;
  }

  public getBrowserPassword(): string {
    return this.browserPassword;
  }

  public setFileHandle(handle: any) {
    this.fileHandle = handle;
    if (handle) {
      saveFileHandleInIndexedDB(handle).catch(err => {
        console.warn('[StorageService] Error saving handle in IndexedDB:', err);
      });
    }
  }

  public getFileHandle(): any {
    return this.fileHandle;
  }

  public clearSession() {
    this.browserPassword = '';
    this.fileHandle = null;
    this.latestStateToSave = null;
  }

  /**
   * Primary entry point for saving DB state atomically and deterministically.
   * Uses an atomic mutex queue so concurrent writes are cleanly sequenced and never lost.
   */
  public async saveDatabaseState(newDb: DBState): Promise<void> {
    this.latestStateToSave = newDb;

    return new Promise<void>((resolve, reject) => {
      this.saveResolvers.push(resolve);
      this.saveRejecters.push(reject);
      this.processSaveQueue();
    });
  }

  private async processSaveQueue() {
    if (this.isSaving) return;
    this.isSaving = true;

    while (this.latestStateToSave) {
      const stateToExecute = this.latestStateToSave;
      this.latestStateToSave = null;

      const currentResolvers = [...this.saveResolvers];
      const currentRejecters = [...this.saveRejecters];
      this.saveResolvers = [];
      this.saveRejecters = [];

      try {
        await this.executeSave(stateToExecute);
        currentResolvers.forEach(r => r());
      } catch (err) {
        console.error('[StorageService] Critical error executing database save:', err);
        currentRejecters.forEach(rej => rej(err));
      }
    }

    this.isSaving = false;
  }

  private async executeSave(state: DBState): Promise<void> {
    if (this.mode === 'browser') {
      let savedToFile = false;

      // 1. Primary browser storage: File System Access API handle if user selected a file
      if (this.fileHandle && this.browserPassword) {
        try {
          const encryptedText = await encryptData(state, this.browserPassword);

          if (typeof this.fileHandle.queryPermission === 'function') {
            let perm = await this.fileHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted' && typeof this.fileHandle.requestPermission === 'function') {
              perm = await this.fileHandle.requestPermission({ mode: 'readwrite' });
            }
          }

          const writable = await this.fileHandle.createWritable();
          await writable.write(encryptedText);
          await writable.close();
          savedToFile = true;
          console.log('[StorageService] Successfully saved database to local encrypted file.');
        } catch (err) {
          console.warn('[StorageService] File system handle write failed, falling back to IndexedDB:', err);
        }
      }

      // 2. High-capacity IndexedDB snapshot (Never suffers from 5MB localStorage quota)
      try {
        if (this.browserPassword) {
          const encryptedText = await encryptData(state, this.browserPassword);
          await saveDatabaseStateInIndexedDB({
            encrypted: true,
            data: encryptedText,
            timestamp: Date.now()
          });
        } else {
          await saveDatabaseStateInIndexedDB({
            encrypted: false,
            data: state,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.warn('[StorageService] IndexedDB state snapshot write failed:', err);
      }

      // 3. Mirror to LocalStorage as additional safety net if space permits
      try {
        if (this.browserPassword) {
          const encryptedText = await encryptData(state, this.browserPassword);
          localStorage.setItem('gainbusters_db_encrypted', encryptedText);
        } else {
          localStorage.setItem('gainbusters_db', JSON.stringify(state));
        }
      } catch (err) {
        // Quota exceeded in localStorage is expected when priceCache is large; ignore safely
      }
    } else {
      // Local Mode: Atomic POST to backend (with auto-retry)
      let attempts = 0;
      let success = false;
      let lastError = null;

      while (attempts < 3 && !success) {
        attempts++;
        try {
          const res = await fetch('/api/db', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(state)
          });
          if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
          success = true;
          console.log('[StorageService] Successfully persisted database to local server storage.');
        } catch (err) {
          lastError = err;
          console.warn(`[StorageService] Save attempt ${attempts} failed:`, err);
          if (attempts < 3) {
            await new Promise(res => setTimeout(res, 200 * attempts));
          }
        }
      }

      // Shadow snapshot in IndexedDB as a client-side backup guarantee
      let idbSaved = false;
      try {
        await saveDatabaseStateInIndexedDB({
          encrypted: false,
          data: state,
          timestamp: Date.now()
        });
        idbSaved = true;
      } catch (e) {
        // Ignore IndexedDB shadow copy error
      }

      if (!success && lastError) {
        if (idbSaved) {
          console.warn('[StorageService] Server backend unreachable, but data was preserved securely in client IndexedDB shadow store.');
        } else {
          console.error('[StorageService] Failed all attempts to save database to server backend.');
          throw lastError;
        }
      }
    }
  }

  /**
   * Primary entry point for loading DB state atomically.
   */
  public async loadDatabaseState(passwordOverride?: string): Promise<DBState | null> {
    const passwordToUse = passwordOverride || this.browserPassword;

    if (this.mode === 'browser') {
      // 1. Try fileHandle if available
      if (this.fileHandle) {
        try {
          if (typeof this.fileHandle.queryPermission === 'function') {
            let perm = await this.fileHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted' && typeof this.fileHandle.requestPermission === 'function') {
              perm = await this.fileHandle.requestPermission({ mode: 'readwrite' });
            }
          }

          const file = await this.fileHandle.getFile();
          const encryptedText = await file.text();
          if (encryptedText && encryptedText.trim().length > 0) {
            const decrypted = await decryptData(encryptedText, passwordToUse);
            if (decrypted && typeof decrypted === 'object') {
              // Update IndexedDB snapshot with the fresh data from file
              saveDatabaseStateInIndexedDB({
                encrypted: true,
                data: encryptedText,
                timestamp: Date.now()
              }).catch(() => {});
              return decrypted as DBState;
            }
          }
        } catch (err) {
          console.warn('[StorageService] Failed reading/decrypting fileHandle, attempting IndexedDB:', err);
        }
      }

      // 2. Try IndexedDB state snapshot (full capacity, primary browser backup)
      try {
        const idbSnapshot = await getDatabaseStateFromIndexedDB();
        if (idbSnapshot) {
          if (idbSnapshot.encrypted && idbSnapshot.data && passwordToUse) {
            const decrypted = await decryptData(idbSnapshot.data, passwordToUse);
            if (decrypted && typeof decrypted === 'object') {
              return decrypted as DBState;
            }
          } else if (idbSnapshot.data && typeof idbSnapshot.data === 'object' && !idbSnapshot.encrypted) {
            return idbSnapshot.data as DBState;
          } else if (typeof idbSnapshot === 'object' && idbSnapshot.settings && idbSnapshot.transactions) {
            return idbSnapshot as DBState;
          }
        }
      } catch (err) {
        console.warn('[StorageService] Failed reading IndexedDB snapshot:', err);
      }

      // 3. Try encrypted LocalStorage fallback
      try {
        const encFallback = localStorage.getItem('gainbusters_db_encrypted');
        if (encFallback && passwordToUse) {
          const decrypted = await decryptData(encFallback, passwordToUse);
          if (decrypted && typeof decrypted === 'object') {
            return decrypted as DBState;
          }
        }
      } catch (err) {
        console.warn('[StorageService] Failed decrypting encrypted LocalStorage fallback:', err);
      }

      // 4. Try plain LocalStorage fallback
      try {
        const plainFallback = localStorage.getItem('gainbusters_db');
        if (plainFallback) {
          const parsed = JSON.parse(plainFallback);
          if (parsed && typeof parsed === 'object') {
            return parsed as DBState;
          }
        }
      } catch (err) {
        console.warn('[StorageService] Failed reading plain LocalStorage fallback:', err);
      }

      return null;
    } else {
      // Local mode: Fetch from /api/db
      try {
        const res = await fetch('/api/db');
        if (!res.ok) throw new Error(`Server returned HTTP ${res.status}`);
        const data = await res.json();
        return data as DBState;
      } catch (err) {
        console.error('[StorageService] Failed loading database from backend, attempting offline IndexedDB snapshot:', err);
        try {
          const idbSnapshot = await getDatabaseStateFromIndexedDB();
          if (idbSnapshot && idbSnapshot.data && typeof idbSnapshot.data === 'object') {
            return idbSnapshot.data as DBState;
          }
        } catch (e) {
          // Ignore
        }
        return null;
      }
    }
  }
}

export const storageService = new StorageService();
