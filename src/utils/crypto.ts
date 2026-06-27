/**
 * Utility for PBKDF2 + AES-GCM encryption and decryption.
 * Keeps data secure on local PC database file.
 */

async function getEncryptionKey(password: string, salt: Uint8Array): Promise<CryptoKey> {
  const enc = new TextEncoder();
  const rawKey = await window.crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  );
  return window.crypto.subtle.deriveKey(
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
  const enc = new TextEncoder();
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const key = await getEncryptionKey(password, salt);
  const plaintext = enc.encode(JSON.stringify(jsonData));
  const ciphertext = await window.crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    plaintext
  );
  
  // Create payload
  const payload = {
    salt: btoa(String.fromCharCode(...salt)),
    iv: btoa(String.fromCharCode(...iv)),
    ciphertext: btoa(String.fromCharCode(...new Uint8Array(ciphertext)))
  };
  return JSON.stringify(payload);
}

export async function decryptData(encryptedStr: string, password: string): Promise<any> {
  const payload = JSON.parse(encryptedStr);
  if (!payload.salt || !payload.iv || !payload.ciphertext) {
    throw new Error("Formato cifrato non valido");
  }
  
  const salt = Uint8Array.from(atob(payload.salt), c => c.charCodeAt(0));
  const iv = Uint8Array.from(atob(payload.iv), c => c.charCodeAt(0));
  const ciphertext = Uint8Array.from(atob(payload.ciphertext), c => c.charCodeAt(0));
  
  const key = await getEncryptionKey(password, salt);
  const decrypted = await window.crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    ciphertext
  );
  
  const dec = new TextDecoder();
  return JSON.parse(dec.decode(decrypted));
}
