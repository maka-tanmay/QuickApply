// IndexedDB storage utilities with encryption support

import { UserProfile, FormMapping, ApplicationLog } from '../types.js';

const DB_NAME = 'JobRightAI';
const DB_VERSION = 1;

const STORES = {
  PROFILES: 'profiles',
  MAPPINGS: 'mappings',
  LOGS: 'logs',
  SETTINGS: 'settings'
};

let db: IDBDatabase | null = null;

export async function initDB(): Promise<IDBDatabase> {
  if (db) return db;

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      db = request.result;
      resolve(db);
    };

    request.onupgradeneeded = (event) => {
      const database = (event.target as IDBOpenDBRequest).result;

      // Profiles store
      if (!database.objectStoreNames.contains(STORES.PROFILES)) {
        const profileStore = database.createObjectStore(STORES.PROFILES, { keyPath: 'profile_id' });
        profileStore.createIndex('name', 'name', { unique: false });
      }

      // Mappings store
      if (!database.objectStoreNames.contains(STORES.MAPPINGS)) {
        const mappingStore = database.createObjectStore(STORES.MAPPINGS, { keyPath: 'domain' });
        mappingStore.createIndex('form_hash', 'form_hash', { unique: false });
      }

      // Logs store
      if (!database.objectStoreNames.contains(STORES.LOGS)) {
        const logStore = database.createObjectStore(STORES.LOGS, { keyPath: 'id' });
        logStore.createIndex('domain', 'domain', { unique: false });
        logStore.createIndex('submitted_at', 'submitted_at', { unique: false });
      }

      // Settings store
      if (!database.objectStoreNames.contains(STORES.SETTINGS)) {
        database.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
      }
    };
  });
}

// Profile operations
export async function saveProfile(profile: UserProfile): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PROFILES], 'readwrite');
    const store = transaction.objectStore(STORES.PROFILES);
    const request = store.put(profile);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getProfile(profileId: string): Promise<UserProfile | null> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PROFILES], 'readonly');
    const store = transaction.objectStore(STORES.PROFILES);
    const request = store.get(profileId);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

export async function getAllProfiles(): Promise<UserProfile[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PROFILES], 'readonly');
    const store = transaction.objectStore(STORES.PROFILES);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result || []);
    request.onerror = () => reject(request.error);
  });
}

export async function deleteProfile(profileId: string): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.PROFILES], 'readwrite');
    const store = transaction.objectStore(STORES.PROFILES);
    const request = store.delete(profileId);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

// Mapping operations
export async function saveMapping(mapping: FormMapping): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.MAPPINGS], 'readwrite');
    const store = transaction.objectStore(STORES.MAPPINGS);
    const request = store.put(mapping);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getMapping(domain: string): Promise<FormMapping | null> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.MAPPINGS], 'readonly');
    const store = transaction.objectStore(STORES.MAPPINGS);
    const request = store.get(domain);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error);
  });
}

// Log operations
export async function saveLog(log: ApplicationLog): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.LOGS], 'readwrite');
    const store = transaction.objectStore(STORES.LOGS);
    const request = store.add(log);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

export async function getLogs(limit: number = 50): Promise<ApplicationLog[]> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.LOGS], 'readonly');
    const store = transaction.objectStore(STORES.LOGS);
    const index = store.index('submitted_at');
    const request = index.openCursor(null, 'prev');
    const logs: ApplicationLog[] = [];

    request.onsuccess = (event) => {
      const cursor = (event.target as IDBRequest).result;
      if (cursor && logs.length < limit) {
        logs.push(cursor.value);
        cursor.continue();
      } else {
        resolve(logs);
      }
    };
    request.onerror = () => reject(request.error);
  });
}

// Settings operations
export async function getSetting<T>(key: string, defaultValue: T): Promise<T> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.SETTINGS], 'readonly');
    const store = transaction.objectStore(STORES.SETTINGS);
    const request = store.get(key);
    request.onsuccess = () => {
      const result = request.result;
      resolve(result ? result.value : defaultValue);
    };
    request.onerror = () => reject(request.error);
  });
}

export async function setSetting<T>(key: string, value: T): Promise<void> {
  const database = await initDB();
  return new Promise((resolve, reject) => {
    const transaction = database.transaction([STORES.SETTINGS], 'readwrite');
    const store = transaction.objectStore(STORES.SETTINGS);
    const request = store.put({ key, value });
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
}

