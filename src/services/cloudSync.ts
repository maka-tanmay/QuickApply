// Cloud sync service (optional, encrypted)

import { UserProfile } from '../types.js';
import { encrypt, decrypt } from '../utils/encryption.js';

interface SyncConfig {
  enabled: boolean;
  endpoint?: string;
  apiKey?: string;
  userId?: string;
}

export async function isCloudSyncEnabled(): Promise<boolean> {
  try {
    const config = await chrome.storage.local.get('cloudSyncConfig');
    return config.cloudSyncConfig?.enabled === true;
  } catch {
    return false;
  }
}

export async function getSyncConfig(): Promise<SyncConfig> {
  try {
    const config = await chrome.storage.local.get('cloudSyncConfig');
    return config.cloudSyncConfig || { enabled: false };
  } catch {
    return { enabled: false };
  }
}

export async function setSyncConfig(config: SyncConfig): Promise<void> {
  await chrome.storage.local.set({ cloudSyncConfig: config });
}

// Sync profile to cloud (encrypted)
export async function syncProfileToCloud(profile: UserProfile): Promise<void> {
  const config = await getSyncConfig();
  if (!config.enabled || !config.endpoint || !config.apiKey) {
    throw new Error('Cloud sync not configured');
  }

  // Encrypt sensitive data
  const encryptedProfile = {
    ...profile,
    email: await encrypt(profile.email),
    phone: profile.phone ? await encrypt(profile.phone) : undefined,
    fields: await encryptFields(profile.fields)
  };

  const response = await fetch(`${config.endpoint}/profiles`, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      profile_id: profile.profile_id,
      encrypted_data: encryptedProfile
    })
  });

  if (!response.ok) {
    throw new Error(`Sync failed: ${response.statusText}`);
  }
}

// Sync profile from cloud (decrypted)
export async function syncProfileFromCloud(profileId: string): Promise<UserProfile | null> {
  const config = await getSyncConfig();
  if (!config.enabled || !config.endpoint || !config.apiKey) {
    return null;
  }

  const response = await fetch(`${config.endpoint}/profiles/${profileId}`, {
    method: 'GET',
    headers: {
      'Authorization': `Bearer ${config.apiKey}`
    }
  });

  if (!response.ok) {
    return null;
  }

  const data = await response.json();
  const encryptedProfile = data.encrypted_data;

  // Decrypt sensitive data
  return {
    ...encryptedProfile,
    email: await decrypt(encryptedProfile.email),
    phone: encryptedProfile.phone ? await decrypt(encryptedProfile.phone) : undefined,
    fields: await decryptFields(encryptedProfile.fields)
  };
}

async function encryptFields(fields: Record<string, string>): Promise<string> {
  const json = JSON.stringify(fields);
  return await encrypt(json);
}

async function decryptFields(encrypted: string): Promise<Record<string, string>> {
  const decrypted = await decrypt(encrypted);
  return JSON.parse(decrypted);
}

// Auto-sync on changes (optional)
export async function enableAutoSync(): Promise<void> {
  // This would set up listeners to sync on profile changes
  // Implementation depends on your backend API
}

