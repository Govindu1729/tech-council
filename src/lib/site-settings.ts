import fs from 'fs';
import path from 'path';
import { 
  getDocById, 
  setDocData, 
  isFirestoreAvailable 
} from './firestore';

export interface SiteSettings {
  hackathonsVisible: boolean;
  lastModified: string;
  modifiedBy: string;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'site-settings';
const DOC_ID = 'settings';
const DATA_DIR = path.join(process.cwd(), 'data');
const SETTINGS_FILE = path.join(DATA_DIR, 'site-settings.json');

// Default settings
const defaultSettings: SiteSettings = {
  hackathonsVisible: true,
  lastModified: new Date().toISOString(),
  modifiedBy: 'system',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString()
};

// JSON file fallback helpers
function ensureDataDir(): void {
  try {
    fs.accessSync(DATA_DIR);
  } catch {
    fs.mkdirSync(DATA_DIR, { recursive: true });
  }
}

function readJsonFile(): SiteSettings {
  try {
    ensureDataDir();
    const data = fs.readFileSync(SETTINGS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultSettings;
  }
}

function writeJsonFile(settings: SiteSettings): SiteSettings {
  const updatedSettings: SiteSettings = {
    ...settings,
    updatedAt: new Date().toISOString()
  };
  const tempFile = `${SETTINGS_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(updatedSettings, null, 2));
  fs.renameSync(tempFile, SETTINGS_FILE);
  return updatedSettings;
}

// Firestore-backed operations with JSON fallback

// Get site settings
export async function getSiteSettings(): Promise<SiteSettings> {
  if (isFirestoreAvailable()) {
    try {
      const settings = await getDocById<SiteSettings>(COLLECTION, DOC_ID);
      if (settings) {
        return settings;
      }
    } catch (error) {
      console.log('Site settings not found in Firestore, falling back to JSON');
    }
  }
  return readJsonFile();
}

// Save site settings with atomic write operation
export async function saveSiteSettings(settings: SiteSettings): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      const updatedSettings: SiteSettings = {
        ...settings,
        updatedAt: new Date().toISOString()
      };
      await setDocData<SiteSettings>(COLLECTION, DOC_ID, updatedSettings);
      console.log('Site settings saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving site settings to Firestore, falling back to JSON:', error);
    }
  }
  writeJsonFile(settings);
  console.log('Site settings saved to JSON fallback successfully');
}

// Update specific setting
export async function updateSetting(
  key: keyof Omit<SiteSettings, 'lastModified' | 'modifiedBy' | 'createdAt' | 'updatedAt'>,
  value: any,
  modifiedBy: string
): Promise<SiteSettings> {
  const settings = await getSiteSettings();
  
  const updatedSettings: SiteSettings = {
    ...settings,
    [key]: value,
    lastModified: new Date().toISOString(),
    modifiedBy,
    updatedAt: new Date().toISOString()
  };
  
  await saveSiteSettings(updatedSettings);
  return updatedSettings;
}

// Get hackathons visibility status
export async function getHackathonsVisibility(): Promise<boolean> {
  const settings = await getSiteSettings();
  return settings.hackathonsVisible;
}

// Toggle hackathons visibility
export async function toggleHackathonsVisibility(modifiedBy: string): Promise<boolean> {
  const settings = await getSiteSettings();
  const newVisibility = !settings.hackathonsVisible;
  
  await updateSetting('hackathonsVisible', newVisibility, modifiedBy);
  return newVisibility;
}

// Set hackathons visibility
export async function setHackathonsVisibility(visible: boolean, modifiedBy: string): Promise<boolean> {
  await updateSetting('hackathonsVisible', visible, modifiedBy);
  return visible;
}
