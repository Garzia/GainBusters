/**
 * Utility for PBKDF2 + AES-GCM encryption and decryption.
 * Keeps data secure on local PC database file.
 */

function getCrypto(): Crypto {
  if (typeof window !== 'undefined' && window.crypto) {
    return window.crypto;
  }
  if (typeof globalThis !== 'undefined' && (globalThis as any).crypto) {
    return (globalThis as any).crypto;
  }
  throw new Error("Web Crypto API non disponibile in questo ambiente.");
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.length;
  const CHUNK_SIZE = 16384;
  for (let i = 0; i < len; i += CHUNK_SIZE) {
    const chunk = bytes.subarray(i, Math.min(i + CHUNK_SIZE, len));
    binary += String.fromCharCode.apply(null, chunk as unknown as number[]);
  }
  return btoa(binary);
}

function base64ToBytes(base64: string): Uint8Array {
  const binary = atob(base64);
  const len = binary.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function getEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const crypto = getCrypto();
  const enc = new TextEncoder();
  const rawKey = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: salt,
      iterations: 100000,
      hash: "SHA-256"
    },
    rawKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"]
  );
}

export async function encryptData(jsonData: any, password: string): Promise<string> {
  const crypto = getCrypto();
  const enc = new TextEncoder();
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(password, salt);
  const plaintext = enc.encode(JSON.stringify(jsonData));
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    plaintext
  );
  
  // Create payload safely without Maximum call stack size exceeded
  const payload = {
    salt: bytesToBase64(salt),
    iv: bytesToBase64(iv),
    ciphertext: bytesToBase64(new Uint8Array(ciphertext))
  };
  return JSON.stringify(payload);
}

export async function decryptData(encryptedStr: string, password: string): Promise<any> {
  let payload: any;
  try {
    payload = JSON.parse(encryptedStr);
  } catch (e) {
    throw new Error("Formato file non valido (JSON non corretto).");
  }

  if (!payload || !payload.salt || !payload.iv || !payload.ciphertext) {
    throw new Error("Formato cifrato non valido o file non protetto da GainBusters.");
  }
  
  try {
    const salt = base64ToBytes(payload.salt);
    const iv = base64ToBytes(payload.iv);
    const ciphertext = base64ToBytes(payload.ciphertext);
    
    const key = await getEncryptionKey(password, salt);
    const crypto = getCrypto();
    const decrypted = await crypto.subtle.decrypt(
      { name: "AES-GCM", iv: iv },
      key,
      ciphertext
    );
    
    const dec = new TextDecoder();
    return JSON.parse(dec.decode(decrypted));
  } catch (err: any) {
    throw new Error("Password non corretta o archivio cifrato corrotto.");
  }
}
