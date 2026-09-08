import { DBState } from '../types';
import { encryptData, decryptData } from '../utils/crypto';
import {
  saveDatabaseStateInIndexedDB,
  getDatabaseStateFromIndexedDB,
  saveFileHandleInIndexedDB,
  getFileHandleFromIndexedDB,
  clearFileHandleFromIndexedDB,
  clearDatabaseStateFromIndexedDB
} from '../utils/indexedDB';

export type StorageMode = 'browser' | 'local';

class StorageService {
  private mode: StorageMode = 'browser';
  private browserPassword: string = '';
  private localAuthToken: string = '';
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

  public setLocalAuthToken(token: string) {
    this.localAuthToken = token;
  }

  public getLocalAuthToken(): string {
    return this.localAuthToken;
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
    this.localAuthToken = '';
    this.fileHandle = null;
    this.latestStateToSave = null;
  }

  /**
   * Completely purges all local storage and IndexedDB caches for database states and handles.
   * Guarantees zero cross-contamination when switching between files or storage modes.
   */
  public async purgeStorageCache(): Promise<void> {
    this.clearSession();
    try {
      await clearFileHandleFromIndexedDB();
      await clearDatabaseStateFromIndexedDB();
    } catch (e) {
      console.warn('[StorageService] Error purging IndexedDB:', e);
    }
    try {
      localStorage.removeItem('gainbusters_db');
      localStorage.removeItem('gainbusters_db_encrypted');
    } catch (e) {
      console.warn('[StorageService] Error purging LocalStorage:', e);
    }
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

      // 1. Primary browser storage: File System Access API handle
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

      // 2. High-capacity IndexedDB snapshot - ALWAYS encrypted if browserPassword is set!
      // In browser mode, we NEVER save unencrypted database copies to prevent bypass
      try {
        if (this.browserPassword) {
          const encryptedText = await encryptData(state, this.browserPassword);
          await saveDatabaseStateInIndexedDB({
            mode: 'browser',
            encrypted: true,
            fileName: this.fileHandle?.name || 'vault',
            data: encryptedText,
            timestamp: Date.now()
          });
        }
      } catch (err) {
        console.warn('[StorageService] IndexedDB state snapshot write failed:', err);
      }

      // 3. Mirror to LocalStorage as additional safety net (strictly encrypted)
      try {
        if (this.browserPassword) {
          const encryptedText = await encryptData(state, this.browserPassword);
          localStorage.setItem('gainbusters_db_encrypted', encryptedText);
          // Never leave plain unencrypted database in localStorage in browser mode!
          localStorage.removeItem('gainbusters_db');
        }
      } catch (err) {
        // Quota exceeded in localStorage is expected when priceCache is large; ignore safely
      }
    } else {
      // Local Mode: Atomic POST to backend (with auto-retry and auth headers)
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.localAuthToken) {
        headers['Authorization'] = `Bearer ${this.localAuthToken}`;
      }

      let attempts = 0;
      let success = false;
      let lastError = null;

      while (attempts < 3 && !success) {
        attempts++;
        try {
          const res = await fetch('/api/db', {
            method: 'POST',
            headers,
            body: JSON.stringify(state)
          });
          if (res.status === 401) {
            throw new Error('UNAUTHORIZED');
          }
          if (!res.ok) {
            throw new Error(`Server returned HTTP ${res.status}`);
          }
          success = true;
          console.log('[StorageService] Successfully persisted database to local server storage.');
        } catch (err: any) {
          lastError = err;
          if (err?.message === 'UNAUTHORIZED') {
            throw err;
          }
          console.warn(`[StorageService] Save attempt ${attempts} failed:`, err);
          if (attempts < 3) {
            await new Promise(res => setTimeout(res, 200 * attempts));
          }
        }
      }

      if (!success && lastError) {
        console.error('[StorageService] Failed all attempts to save database to server backend.');
        throw lastError;
      }
    }
  }

  /**
   * Primary entry point for loading DB state atomically.
   * Strictly verifies password on encrypted sources and prevents cross-file/unencrypted data leakage.
   */
  public async loadDatabaseState(passwordOverride?: string): Promise<DBState | null> {
    const passwordToUse = passwordOverride || this.browserPassword;

    if (this.mode === 'browser') {
      // 1. Authoritative source: File System Access API handle
      if (this.fileHandle) {
        if (typeof this.fileHandle.queryPermission === 'function') {
          let perm = await this.fileHandle.queryPermission({ mode: 'readwrite' });
          if (perm !== 'granted' && typeof this.fileHandle.requestPermission === 'function') {
            perm = await this.fileHandle.requestPermission({ mode: 'readwrite' });
          }
        }

        const file = await this.fileHandle.getFile();
        const rawText = await file.text();
        if (!rawText || rawText.trim().length === 0) {
          throw new Error('Il file del database è vuoto.');
        }

        let isEncrypted = false;
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) {
            isEncrypted = true;
          }
        } catch (e) {
          throw new Error('Formato file non valido (JSON corrotto).');
        }

        if (isEncrypted) {
          if (!passwordToUse) {
            throw new Error('Master password richiesta per decrittografare il file.');
          }
          // Attempt decryption. CRITICAL: DO NOT CATCH AND FALL BACK TO PREVIOUS SNAPSHOT!
          // If decryption fails, it MUST throw so wrong password is rejected!
          const decrypted = await decryptData(rawText, passwordToUse);
          if (!decrypted || typeof decrypted !== 'object' || !decrypted.settings) {
            throw new Error('Password non corretta o archivio corrotto.');
          }

          // Cache ONLY encrypted data tagged with fileName
          saveDatabaseStateInIndexedDB({
            mode: 'browser',
            encrypted: true,
            fileName: this.fileHandle.name,
            data: rawText,
            timestamp: Date.now()
          }).catch(() => {});

          return decrypted as DBState;
        } else {
          // Plain JSON file
          try {
            const parsed = JSON.parse(rawText);
            if (parsed && typeof parsed === 'object' && parsed.settings) {
              return parsed as DBState;
            }
            throw new Error('Struttura database non valida.');
          } catch (e: any) {
            throw new Error(e.message || 'Formato file non valido.');
          }
        }
      }

      // 2. Pure browser mode without fileHandle: Check IndexedDB snapshot
      try {
        const idbSnapshot = await getDatabaseStateFromIndexedDB();
        if (idbSnapshot) {
          // If snapshot was saved by local mode or marked unencrypted while password is required, ignore it!
          if (idbSnapshot.encrypted && idbSnapshot.data) {
            if (!passwordToUse) {
              throw new Error('Master password richiesta per sbloccare l\'archivio.');
            }
            const decrypted = await decryptData(idbSnapshot.data, passwordToUse);
            if (decrypted && typeof decrypted === 'object' && decrypted.settings) {
              return decrypted as DBState;
            }
            throw new Error('Password non corretta.');
          } else if (idbSnapshot.mode === 'browser' && !idbSnapshot.encrypted && idbSnapshot.data) {
            // Plain unencrypted snapshot in browser mode (only if not encrypted)
            if (!passwordToUse) {
              return idbSnapshot.data as DBState;
            }
          }
        }
      } catch (err) {
        console.warn('[StorageService] Failed reading IndexedDB snapshot:', err);
        throw err;
      }

      // 3. Encrypted LocalStorage fallback
      try {
        const encFallback = localStorage.getItem('gainbusters_db_encrypted');
        if (encFallback) {
          if (!passwordToUse) {
            throw new Error('Master password richiesta per sbloccare l\'archivio.');
          }
          const decrypted = await decryptData(encFallback, passwordToUse);
          if (decrypted && typeof decrypted === 'object' && decrypted.settings) {
            return decrypted as DBState;
          }
          throw new Error('Password non corretta.');
        }
      } catch (err) {
        console.warn('[StorageService] Failed decrypting encrypted LocalStorage fallback:', err);
        throw err;
      }

      return null;
    } else {
      // Local mode: Fetch from /api/db with local auth token
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (this.localAuthToken) {
        headers['Authorization'] = `Bearer ${this.localAuthToken}`;
      }

      const res = await fetch('/api/db', { headers });
      if (res.status === 401) {
        throw new Error('UNAUTHORIZED');
      }
      if (!res.ok) {
        throw new Error(`Server returned HTTP ${res.status}`);
      }
      const data = await res.json();
      return data as DBState;
    }
  }
}

export const storageService = new StorageService();
