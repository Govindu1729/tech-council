import { promises as fs } from 'fs';
import path from 'path';
import { TorqueMagazine, defaultTorqueData, TorqueStats, defaultTorqueStats } from './torque-data';
import { 
  getCollection, 
  getDocById, 
  setDocData, 
  setAllDocs, 
  deleteDocData, 
  isFirestoreAvailable 
} from './firestore';

const COLLECTION = 'torque';
const STATS_COLLECTION = 'torque-stats';
const DATA_DIR = path.join(process.cwd(), 'data');
const TORQUE_FILE = path.join(DATA_DIR, 'torque.json');
const TORQUE_STATS_FILE = path.join(DATA_DIR, 'torque-stats.json');
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'torque', 'magazines');
const COVERS_DIR = path.join(process.cwd(), 'public', 'torque', 'covers');

// JSON file fallback helpers
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJsonFile(): Promise<Record<string, TorqueMagazine>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(TORQUE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultTorqueData;
  }
}

async function writeJsonFile(magazines: Record<string, TorqueMagazine>): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(TORQUE_FILE, JSON.stringify(magazines, null, 2));
}

// Firestore-backed operations with JSON fallback

// Get all magazines
export async function getAllMagazines(): Promise<Record<string, TorqueMagazine>> {
  if (isFirestoreAvailable()) {
    try {
      const docs = await getCollection<TorqueMagazine>(COLLECTION);
      if (docs && Object.keys(docs).length > 0) {
        return docs;
      }
    } catch (error) {
      console.error('Error reading magazines from Firestore, falling back to JSON:', error);
    }
  }
  return readJsonFile();
}

// Get single magazine by ID
export async function getMagazineById(id: string): Promise<TorqueMagazine | null> {
  if (isFirestoreAvailable()) {
    try {
      return await getDocById<TorqueMagazine>(COLLECTION, id);
    } catch (error) {
      console.error('Error reading magazine from Firestore, falling back to JSON:', error);
    }
  }
  const magazines = await readJsonFile();
  return magazines[id] || null;
}

// Get latest magazine
export async function getLatestMagazine(): Promise<TorqueMagazine | null> {
  const magazines = await getAllMagazines();
  const latestMagazine = Object.values(magazines).find(mag => mag.isLatest);
  return latestMagazine || null;
}

// Save all magazines
export async function saveAllMagazines(magazines: Record<string, TorqueMagazine>): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      await setAllDocs<TorqueMagazine>(COLLECTION, magazines);
      console.log('Magazines data saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving magazines to Firestore, falling back to JSON:', error);
    }
  }
  await writeJsonFile(magazines);
  console.log('Magazines data saved to JSON fallback successfully');
}

// Create new magazine
export async function createMagazine(magazine: Omit<TorqueMagazine, 'id' | 'createdAt' | 'updatedAt'>): Promise<TorqueMagazine> {
  const magazines = await getAllMagazines();
  
  const id = generateMagazineId(magazine.year, magazine.title);
  const now = new Date().toISOString();
  
  const newMagazine: TorqueMagazine = {
    ...magazine,
    id,
    createdAt: now,
    updatedAt: now
  };
  
  magazines[id] = newMagazine;
  await saveAllMagazines(magazines);
  
  return newMagazine;
}

// Update existing magazine
export async function updateMagazine(id: string, updates: Partial<Omit<TorqueMagazine, 'id' | 'createdAt'>>): Promise<TorqueMagazine | null> {
  const magazines = await getAllMagazines();
  
  if (!magazines[id]) {
    return null;
  }
  
  const updatedMagazine: TorqueMagazine = {
    ...magazines[id],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  magazines[id] = updatedMagazine;
  await saveAllMagazines(magazines);
  
  return updatedMagazine;
}

// Set latest magazine (unsets all others)
export async function setLatestMagazine(id: string): Promise<boolean> {
  const magazines = await getAllMagazines();
  
  if (!magazines[id]) {
    return false;
  }
  
  // Unset all other magazines as latest
  Object.keys(magazines).forEach(key => {
    magazines[key].isLatest = false;
  });
  
  // Set the specified magazine as latest
  magazines[id].isLatest = true;
  magazines[id].updatedAt = new Date().toISOString();
  
  await saveAllMagazines(magazines);
  return true;
}

// Delete magazine
export async function deleteMagazine(id: string): Promise<boolean> {
  const magazines = await getAllMagazines();
  
  if (!magazines[id]) {
    return false;
  }
  
  if (isFirestoreAvailable()) {
    try {
      await deleteDocData(COLLECTION, id);
      return true;
    } catch (error) {
      console.error('Error deleting magazine from Firestore, falling back to JSON:', error);
    }
  }
  
  // Delete the file if it exists
  try {
    const filePath = path.join(process.cwd(), 'public', magazines[id].filePath);
    await fs.unlink(filePath);
  } catch (error) {
    console.warn('Could not delete magazine file:', error);
  }
  
  delete magazines[id];
  await writeJsonFile(magazines);
  return true;
}

// Generate magazine ID
function generateMagazineId(year: string, title: string): string {
  const baseId = `torque-${year}-${title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 30)}`;
  
  return baseId;
}

// Get magazines for public display
export async function getMagazinesForDisplay(): Promise<Array<{
  id: string;
  year: string;
  title: string;
  description: string;
  pages: number;
  articles: number;
  featured: string;
  downloadUrl: string;
  viewUrl: string;
  coverPhoto?: string;
}>> {
  const magazines = await getAllMagazines();

  return Object.values(magazines)
    .sort((a, b) => parseInt(b.year) - parseInt(a.year))
    .map(magazine => ({
      id: magazine.id,
      year: magazine.year,
      title: magazine.title,
      description: magazine.description,
      pages: magazine.pages,
      articles: magazine.articles,
      featured: magazine.featured,
      downloadUrl: magazine.filePath,
      viewUrl: magazine.filePath,
      coverPhoto: magazine.coverPhoto
    }));
}

// Get Torque statistics
export async function getTorqueStats(): Promise<TorqueStats> {
  if (isFirestoreAvailable()) {
    try {
      const stats = await getDocById<TorqueStats>(STATS_COLLECTION, 'stats');
      if (stats) {
        return stats;
      }
    } catch (error) {
      console.error('Error reading torque stats from Firestore, falling back to JSON:', error);
    }
  }
  try {
    await ensureDataDir();
    const data = await fs.readFile(TORQUE_STATS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Error reading torque stats:', error);
    return defaultTorqueStats;
  }
}

// Update Torque statistics
export async function updateTorqueStats(stats: TorqueStats): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      await setDocData<TorqueStats>(STATS_COLLECTION, 'stats', stats);
      console.log('Torque stats saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving torque stats to Firestore, falling back to JSON:', error);
    }
  }
  try {
    await ensureDataDir();
    await fs.writeFile(TORQUE_STATS_FILE, JSON.stringify(stats, null, 2));
    console.log('Torque stats saved to JSON fallback successfully');
  } catch (error) {
    console.error('Error saving torque stats:', error);
    throw new Error('Failed to save torque stats');
  }
}

// Save uploaded file
export async function saveUploadedFile(file: File, magazineId: string): Promise<string> {
  await ensureDataDir();
  await ensureUploadsDir();

  const fileName = `${magazineId}.pdf`;
  const filePath = path.join(UPLOADS_DIR, fileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return `/torque/magazines/${fileName}`;
}

// Save uploaded cover photo
export async function saveCoverPhoto(file: File, magazineId: string): Promise<{ filePath: string; fileName: string }> {
  await ensureDataDir();
  await ensureCoversDir();

  const fileExtension = file.name.split('.').pop()?.toLowerCase() || 'jpg';
  const fileName = `${magazineId}-cover.${fileExtension}`;
  const filePath = path.join(COVERS_DIR, fileName);

  const buffer = Buffer.from(await file.arrayBuffer());
  await fs.writeFile(filePath, buffer);

  return {
    filePath: `/torque/covers/${fileName}`,
    fileName: file.name
  };
}

// Delete cover photo
export async function deleteCoverPhoto(magazineId: string): Promise<void> {
  const extensions = ['jpg', 'jpeg', 'png', 'webp'];

  for (const ext of extensions) {
    const fileName = `${magazineId}-cover.${ext}`;
    const filePath = path.join(COVERS_DIR, fileName);

    try {
      await fs.access(filePath);
      await fs.unlink(filePath);
      break; // File found and deleted, exit loop
    } catch {
      // File doesn't exist, continue to next extension
    }
  }
}

// Ensure directories exist
async function ensureUploadsDir() {
  try {
    await fs.access(UPLOADS_DIR);
  } catch {
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  }
}

async function ensureCoversDir() {
  try {
    await fs.access(COVERS_DIR);
  } catch {
    await fs.mkdir(COVERS_DIR, { recursive: true });
  }
}
