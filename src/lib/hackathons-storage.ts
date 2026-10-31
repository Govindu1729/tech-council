import { promises as fs } from 'fs';
import path from 'path';
import { Hackathon, defaultHackathonsData } from './hackathons-data';
import { 
  getCollection, 
  getDocById, 
  setDocData, 
  setAllDocs, 
  deleteDocData, 
  isFirestoreAvailable 
} from './firestore';

const COLLECTION = 'hackathons';
const DATA_DIR = path.join(process.cwd(), 'data');
const HACKATHONS_FILE = path.join(DATA_DIR, 'hackathons.json');

// JSON file fallback helpers
async function ensureDataDir(): Promise<void> {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJsonFile(): Promise<Record<string, Hackathon>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(HACKATHONS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultHackathonsData;
  }
}

async function writeJsonFile(hackathons: Record<string, Hackathon>): Promise<void> {
  await ensureDataDir();
  const tempFile = `${HACKATHONS_FILE}.tmp`;
  await fs.writeFile(tempFile, JSON.stringify(hackathons, null, 2));
  await fs.rename(tempFile, HACKATHONS_FILE);
}

// Firestore-backed operations with JSON fallback

// Get all hackathons
export async function getAllHackathons(): Promise<Record<string, Hackathon>> {
  if (isFirestoreAvailable()) {
    try {
      const docs = await getCollection<Hackathon>(COLLECTION);
      if (docs && Object.keys(docs).length > 0) {
        return docs;
      }
    } catch (error) {
      console.log('Hackathons not found in Firestore, falling back to JSON');
    }
  }
  return readJsonFile();
}

// Get hackathons for public display (array format)
export async function getHackathonsForDisplay(): Promise<Hackathon[]> {
  const hackathons = await getAllHackathons();
  return Object.values(hackathons).sort((a, b) => 
    new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime()
  );
}

// Get hackathon by ID
export async function getHackathonById(id: string): Promise<Hackathon | null> {
  if (isFirestoreAvailable()) {
    try {
      return await getDocById<Hackathon>(COLLECTION, id);
    } catch (error) {
      console.error('Error reading hackathon from Firestore, falling back to JSON:', error);
    }
  }
  const hackathons = await readJsonFile();
  return hackathons[id] || null;
}

// Save all hackathons with atomic write operation
export async function saveAllHackathons(hackathons: Record<string, Hackathon>): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      await setAllDocs<Hackathon>(COLLECTION, hackathons);
      console.log('Hackathons data saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving hackathons to Firestore, falling back to JSON:', error);
    }
  }
  const tempFile = `${HACKATHONS_FILE}.tmp`;
  await ensureDataDir();
  await fs.writeFile(tempFile, JSON.stringify(hackathons, null, 2));
  await fs.rename(tempFile, HACKATHONS_FILE);
  console.log('Hackathons data saved to JSON fallback successfully');
}

// Create new hackathon
export async function createHackathon(hackathon: Omit<Hackathon, 'id' | 'createdAt' | 'updatedAt'>): Promise<Hackathon> {
  const hackathons = await getAllHackathons();
  
  // Generate ID from name
  const id = hackathon.name.toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  // Ensure unique ID
  let uniqueId = id;
  let counter = 1;
  while (hackathons[uniqueId]) {
    uniqueId = `${id}-${counter}`;
    counter++;
  }
  
  const now = new Date().toISOString();
  const newHackathon: Hackathon = {
    ...hackathon,
    id: uniqueId,
    createdAt: now,
    updatedAt: now,
  };
  
  hackathons[uniqueId] = newHackathon;
  await saveAllHackathons(hackathons);
  
  return newHackathon;
}

// Update hackathon
export async function updateHackathon(id: string, updates: Partial<Omit<Hackathon, 'id' | 'createdAt'>>): Promise<Hackathon> {
  const hackathons = await getAllHackathons();
  
  if (!hackathons[id]) {
    throw new Error('Hackathon not found');
  }
  
  const updatedHackathon: Hackathon = {
    ...hackathons[id],
    ...updates,
    updatedAt: new Date().toISOString(),
  };
  
  hackathons[id] = updatedHackathon;
  await saveAllHackathons(hackathons);
  
  return updatedHackathon;
}

// Delete hackathon
export async function deleteHackathon(id: string): Promise<void> {
  const hackathons = await getAllHackathons();
  
  if (!hackathons[id]) {
    throw new Error('Hackathon not found');
  }
  
  if (isFirestoreAvailable()) {
    try {
      await deleteDocData(COLLECTION, id);
      return;
    } catch (error) {
      console.error('Error deleting hackathon from Firestore, falling back to JSON:', error);
    }
  }
  
  delete hackathons[id];
  await writeJsonFile(hackathons);
}

// Get hackathons by status
export async function getHackathonsByStatus(status: Hackathon['status']): Promise<Hackathon[]> {
  const hackathons = await getHackathonsForDisplay();
  return hackathons.filter(hackathon => hackathon.status === status);
}

// Get upcoming hackathons
export async function getUpcomingHackathons(): Promise<Hackathon[]> {
  return getHackathonsByStatus('upcoming');
}

// Get completed hackathons
export async function getCompletedHackathons(): Promise<Hackathon[]> {
  return getHackathonsByStatus('completed');
}

// Search hackathons
export async function searchHackathons(query: string): Promise<Hackathon[]> {
  const hackathons = await getHackathonsForDisplay();
  const lowercaseQuery = query.toLowerCase();
  
  return hackathons.filter(hackathon => 
    hackathon.name.toLowerCase().includes(lowercaseQuery) ||
    hackathon.description.toLowerCase().includes(lowercaseQuery) ||
    hackathon.category.toLowerCase().includes(lowercaseQuery)
  );
}

// Get hackathons by category
export async function getHackathonsByCategory(category: string): Promise<Hackathon[]> {
  const hackathons = await getHackathonsForDisplay();
  return hackathons.filter(hackathon => hackathon.category === category);
}

// Get hackathon statistics
export async function getHackathonStats(): Promise<{
  total: number;
  upcoming: number;
  ongoing: number;
  completed: number;
  totalParticipants: number;
  totalPrizePool: number;
}> {
  const hackathons = await getHackathonsForDisplay();
  
  const stats = {
    total: hackathons.length,
    upcoming: hackathons.filter(h => h.status === 'upcoming').length,
    ongoing: hackathons.filter(h => h.status === 'ongoing').length,
    completed: hackathons.filter(h => h.status === 'completed').length,
    totalParticipants: 0,
    totalPrizePool: 0
  };
  
  hackathons.forEach(hackathon => {
    if (hackathon.currentParticipants) {
      const participants = parseInt(hackathon.currentParticipants.replace(/[^0-9]/g, ''));
      if (!isNaN(participants)) {
        stats.totalParticipants += participants;
      }
    }
    
    hackathon.prizes.forEach(prize => {
      const amount = parseInt(prize.amount.replace(/[^0-9]/g, ''));
      if (!isNaN(amount)) {
        stats.totalPrizePool += amount;
      }
    });
  });
  
  return stats;
}
