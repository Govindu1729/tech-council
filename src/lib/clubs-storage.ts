import { promises as fs } from 'fs';
import path from 'path';
import { Club, defaultClubsData } from './clubs-data';
import { 
  getCollection, 
  getDocById, 
  setDocData, 
  setAllDocs, 
  deleteDocData, 
  isFirestoreAvailable 
} from './firestore';

const COLLECTION = 'clubs';
const DATA_DIR = path.join(process.cwd(), 'data');
const CLUBS_FILE = path.join(DATA_DIR, 'clubs.json');

// JSON file fallback helpers
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJsonFile(): Promise<Record<string, Club>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(CLUBS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultClubsData;
  }
}

async function writeJsonFile(clubs: Record<string, Club>): Promise<void> {
  await ensureDataDir();
  const tempFile = `${CLUBS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(clubs, null, 2));
  await fs.rename(tempFile, CLUBS_FILE);
}

// Firestore-backed operations with JSON fallback

// Get all clubs
export async function getAllClubs(): Promise<Record<string, Club>> {
  if (isFirestoreAvailable()) {
    try {
      const docs = await getCollection<Club>(COLLECTION);
      if (docs && Object.keys(docs).length > 0) {
        return docs;
      }
    } catch (error) {
      console.error('Error reading clubs from Firestore, falling back to JSON:', error);
    }
  }
  return readJsonFile();
}

// Get single club by ID
export async function getClubById(id: string): Promise<Club | null> {
  if (isFirestoreAvailable()) {
    try {
      return await getDocById<Club>(COLLECTION, id);
    } catch (error) {
      console.error('Error reading club from Firestore, falling back to JSON:', error);
    }
  }
  const clubs = await readJsonFile();
  return clubs[id] || null;
}

// Save all clubs (replace entire collection)
export async function saveAllClubs(clubs: Record<string, Club>): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      await setAllDocs<Club>(COLLECTION, clubs);
      console.log('Clubs data saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving clubs to Firestore, falling back to JSON:', error);
    }
  }
  await writeJsonFile(clubs);
  console.log('Clubs data saved to JSON fallback successfully');
}

// Create new club
export async function createClub(club: Omit<Club, 'id' | 'createdAt' | 'updatedAt'>): Promise<Club> {
  const clubs = await getAllClubs();
  
  const id = generateClubId(club.name);
  const now = new Date().toISOString();
  
  const newClub: Club = {
    ...club,
    id,
    createdAt: now,
    updatedAt: now
  };
  
  clubs[id] = newClub;
  await saveAllClubs(clubs);
  
  return newClub;
}

// Update existing club
export async function updateClub(id: string, updates: Partial<Omit<Club, 'id' | 'createdAt'>>): Promise<Club | null> {
  const clubs = await getAllClubs();
  
  if (!clubs[id]) {
    return null;
  }
  
  const updatedClub: Club = {
    ...clubs[id],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  clubs[id] = updatedClub;
  await saveAllClubs(clubs);
  
  return updatedClub;
}

// Delete club
export async function deleteClub(id: string): Promise<boolean> {
  const clubs = await getAllClubs();
  
  if (!clubs[id]) {
    return false;
  }
  
  if (isFirestoreAvailable()) {
    try {
      await deleteDocData(COLLECTION, id);
      return true;
    } catch (error) {
      console.error('Error deleting club from Firestore, falling back to JSON:', error);
    }
  }
  
  delete clubs[id];
  await writeJsonFile(clubs);
  return true;
}

// Generate club ID from name
function generateClubId(name: string): string {
  const baseId = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  const timestamp = Date.now().toString().slice(-6);
  return `${baseId}-${timestamp}`;
}

// Get clubs for public display (simplified format)
export async function getClubsForDisplay(): Promise<Array<{
  id: string;
  name: string;
  description: string;
  type: "club" | "hobby-group" | "technical-council-group";
  category: string;
  logoPath?: string;
}>> {
  const clubs = await getAllClubs();
  
  return Object.values(clubs).map(club => ({
    id: club.id,
    name: club.name,
    description: club.description,
    type: club.type,
    category: club.category,
    logoPath: club.logoPath
  }));
}

// Get clubs by type
export async function getClubsByType(type: "club" | "hobby-group" | "technical-council-group"): Promise<Club[]> {
  const clubs = await getAllClubs();
  return Object.values(clubs).filter(club => club.type === type);
}
