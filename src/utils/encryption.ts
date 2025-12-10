// WebCrypto encryption utilities for sensitive data

const ALGORITHM = 'AES-GCM';
const KEY_LENGTH = 256;

let encryptionKey: CryptoKey | null = null;

async function getOrCreateKey(): Promise<CryptoKey> {
  if (encryptionKey) return encryptionKey;

  // In a real implementation, derive key from user password or generate and store securely
  // For MVP, we'll generate a key and store it in chrome.storage.local
  const stored = await chrome.storage.local.get('encryption_key');
  
  if (stored.encryption_key) {
    // Import existing key
    const keyData = Uint8Array.from(atob(stored.encryption_key), c => c.charCodeAt(0));
    encryptionKey = await crypto.subtle.importKey(
      'raw',
      keyData,
      { name: ALGORITHM, length: KEY_LENGTH },
      false,
      ['encrypt', 'decrypt']
    );
    return encryptionKey;
  } else {
    // Generate new key
    encryptionKey = await crypto.subtle.generateKey(
      { name: ALGORITHM, length: KEY_LENGTH },
      true,
      ['encrypt', 'decrypt']
    );
    
    // Export and store
    const exported = await crypto.subtle.exportKey('raw', encryptionKey);
    const keyString = btoa(String.fromCharCode(...new Uint8Array(exported)));
    await chrome.storage.local.set({ encryption_key: keyString });
    
    return encryptionKey;
  }
}

export async function encrypt(data: string): Promise<string> {
  const key = await getOrCreateKey();
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(data);
  
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt(
    { name: ALGORITHM, iv },
    key,
    dataBuffer
  );
  
  const encryptedArray = new Uint8Array(encrypted);
  const combined = new Uint8Array(iv.length + encryptedArray.length);
  combined.set(iv);
  combined.set(encryptedArray, iv.length);
  
  return btoa(String.fromCharCode(...combined));
}

export async function decrypt(encryptedData: string): Promise<string> {
  const key = await getOrCreateKey();
  const combined = Uint8Array.from(atob(encryptedData), c => c.charCodeAt(0));
  
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  
  const decrypted = await crypto.subtle.decrypt(
    { name: ALGORITHM, iv },
    key,
    data
  );
  
  const decoder = new TextDecoder();
  return decoder.decode(decrypted);
}

