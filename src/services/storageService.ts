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
  private fileName: string = 'gainbusters_db.json';
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

  public setFileHandle(handle: any, name?: string) {
    this.fileHandle = handle;
    if (name) {
      this.fileName = name;
    } else if (handle && handle.name) {
      this.fileName = handle.name;
    }
    if (handle) {
      saveFileHandleInIndexedDB(handle).catch(err => {
        console.warn('[StorageService] Error saving handle in IndexedDB:', err);
      });
    }
  }

  public getFileHandle(): any {
    return this.fileHandle;
  }

  public setFileName(name: string) {
    this.fileName = name;
  }

  public getFileName(): string {
    return this.fileName;
  }

  public clearSession() {
    this.browserPassword = '';
    this.localAuthToken = '';
    this.fileHandle = null;
    this.fileName = 'gainbusters_db.json';
    this.latestStateToSave = null;
  }

  public hasActiveSession(): boolean {
    if (this.mode === 'browser') {
      return !!this.browserPassword;
    }
    return !!this.localAuthToken;
  }

  public async flushPendingSaves(): Promise<void> {
    if (this.isSaving || this.latestStateToSave) {
      await new Promise<void>((resolve) => {
        const check = () => {
          if (!this.isSaving && !this.latestStateToSave) {
            resolve();
          } else {
            setTimeout(check, 40);
          }
        };
        check();
      });
    }
  }

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
      if (!this.browserPassword) {
        throw new Error('Master password non impostata.');
      }

      const encryptedText = await encryptData(state, this.browserPassword);

      // 1. If we have a File System Access handle (Chromium), write directly to the local file
      if (this.fileHandle) {
        try {
          if (typeof this.fileHandle.queryPermission === 'function') {
            const perm = await this.fileHandle.queryPermission({ mode: 'readwrite' });
            if (perm !== 'granted' && typeof this.fileHandle.requestPermission === 'function') {
              await this.fileHandle.requestPermission({ mode: 'readwrite' });
            }
          }
          const writable = await this.fileHandle.createWritable();
          await writable.write(encryptedText);
          await writable.close();
          console.log('[StorageService] Successfully wrote database to local file handle.');
        } catch (err) {
          console.warn('[StorageService] File handle write failed, falling back to IndexedDB snapshot:', err);
        }
      }

      // 2. Always persist encrypted snapshot in IndexedDB for session recovery
      try {
        await saveDatabaseStateInIndexedDB({
          mode: 'browser',
          encrypted: true,
          fileName: this.fileName,
          data: encryptedText,
          timestamp: Date.now()
        });
      } catch (err) {
        console.warn('[StorageService] IndexedDB state snapshot write failed:', err);
      }

      // 3. Mirror encrypted fallback in localStorage
      try {
        localStorage.setItem('gainbusters_db_encrypted', encryptedText);
        localStorage.removeItem('gainbusters_db');
      } catch (err) {
        // Ignore quota limits
      }
    } else {
      // Local server mode
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
        } catch (err: any) {
          lastError = err;
          if (err?.message === 'UNAUTHORIZED') {
            throw err;
          }
          if (attempts < 3) {
            await new Promise(res => setTimeout(res, 200 * attempts));
          }
        }
      }

      if (!success && lastError) {
        throw lastError;
      }
    }
  }

  public async loadDatabaseState(passwordOverride?: string): Promise<DBState | null> {
    const passwordToUse = passwordOverride || this.browserPassword;

    if (this.mode === 'browser') {
      let rawText = '';
      let isEncrypted = false;

      // 1. Try reading from File System Access handle if available
      if (this.fileHandle) {
        try {
          if (typeof this.fileHandle.queryPermission === 'function') {
            const perm = await this.fileHandle.queryPermission({ mode: 'read' });
            if (perm !== 'granted' && typeof this.fileHandle.requestPermission === 'function') {
              await this.fileHandle.requestPermission({ mode: 'read' });
            }
          }
          const file = await this.fileHandle.getFile();
          rawText = await file.text();
          if (rawText && rawText.trim().length > 0) {
            const parsed = JSON.parse(rawText);
            if (parsed && parsed.salt && parsed.iv && parsed.ciphertext) {
              isEncrypted = true;
            }
          }
        } catch (fileErr) {
          console.warn('[StorageService] Failed to read from file handle:', fileErr);
        }
      }

      // 2. If file handle read failed or wasn't used, try IndexedDB snapshot
      if (!rawText || rawText.trim().length === 0) {
        try {
          const idbSnapshot = await getDatabaseStateFromIndexedDB();
          if (idbSnapshot && idbSnapshot.data) {
            rawText = idbSnapshot.data;
            isEncrypted = !!idbSnapshot.encrypted;
            if (idbSnapshot.fileName) {
              this.fileName = idbSnapshot.fileName;
            }
          }
        } catch (idbErr) {
          console.warn('[StorageService] IndexedDB snapshot read failed:', idbErr);
        }
      }

      // 3. Try LocalStorage encrypted fallback
      if (!rawText || rawText.trim().length === 0) {
        try {
          const encFallback = localStorage.getItem('gainbusters_db_encrypted');
          if (encFallback) {
            rawText = encFallback;
            isEncrypted = true;
          }
        } catch (e) {
          // ignore
        }
      }

      if (!rawText || rawText.trim().length === 0) {
        return null;
      }

      if (isEncrypted) {
        if (!passwordToUse) {
          throw new Error('Master password richiesta per decrittografare il database.');
        }
        const decrypted = await decryptData(rawText, passwordToUse);
        if (!decrypted || typeof decrypted !== 'object' || !decrypted.settings) {
          throw new Error('Password non corretta o archivio corrotto.');
        }
        return decrypted as DBState;
      } else {
        try {
          const parsed = JSON.parse(rawText);
          if (parsed && typeof parsed === 'object' && parsed.settings) {
            return parsed as DBState;
          }
          throw new Error('Formato database non valido.');
        } catch (e: any) {
          throw new Error(e.message || 'Formato file non valido.');
        }
      }
    } else {
      // Local server mode
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

  public async exportEncryptedFileBlob(state: DBState): Promise<Blob> {
    if (!this.browserPassword) {
      throw new Error('Master password richiesta per esportare il database cifrato.');
    }
    const encryptedText = await encryptData(state, this.browserPassword);
    return new Blob([encryptedText], { type: 'application/json' });
  }
}

export const storageService = new StorageService();
