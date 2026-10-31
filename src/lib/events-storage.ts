import { promises as fs } from 'fs';
import path from 'path';
import { Event, defaultEventsData } from './events-data';
import { 
  getCollection, 
  getDocById, 
  setDocData, 
  setAllDocs, 
  deleteDocData, 
  isFirestoreAvailable 
} from './firestore';

const COLLECTION = 'events';
const DATA_DIR = path.join(process.cwd(), 'data');
const EVENTS_FILE = path.join(DATA_DIR, 'events.json');

// JSON file fallback helpers
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJsonFile(): Promise<Record<string, Event>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(EVENTS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultEventsData;
  }
}

async function writeJsonFile(events: Record<string, Event>): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(EVENTS_FILE, JSON.stringify(events, null, 2));
}

// Firestore-backed operations with JSON fallback

// Get all events
export async function getAllEvents(): Promise<Record<string, Event>> {
  if (isFirestoreAvailable()) {
    try {
      const docs = await getCollection<Event>(COLLECTION);
      if (docs && Object.keys(docs).length > 0) {
        return docs;
      }
    } catch (error) {
      console.error('Error reading events from Firestore, falling back to JSON:', error);
    }
  }
  return readJsonFile();
}

// Get single event by ID
export async function getEventById(id: string): Promise<Event | null> {
  if (isFirestoreAvailable()) {
    try {
      return await getDocById<Event>(COLLECTION, id);
    } catch (error) {
      console.error('Error reading event from Firestore, falling back to JSON:', error);
    }
  }
  const events = await readJsonFile();
  return events[id] || null;
}

// Save all events
export async function saveAllEvents(events: Record<string, Event>): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      await setAllDocs<Event>(COLLECTION, events);
      console.log('Events data saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving events to Firestore, falling back to JSON:', error);
    }
  }
  await writeJsonFile(events);
  console.log('Events data saved to JSON fallback successfully');
}

// Create new event
export async function createEvent(event: Omit<Event, 'id' | 'createdAt' | 'updatedAt'>): Promise<Event> {
  const events = await getAllEvents();
  
  const id = generateEventId(event.title);
  const now = new Date().toISOString();
  
  const newEvent: Event = {
    ...event,
    id,
    createdAt: now,
    updatedAt: now
  };
  
  events[id] = newEvent;
  await saveAllEvents(events);
  
  return newEvent;
}

// Update existing event
export async function updateEvent(id: string, updates: Partial<Omit<Event, 'id' | 'createdAt'>>): Promise<Event | null> {
  const events = await getAllEvents();
  
  if (!events[id]) {
    return null;
  }
  
  const updatedEvent: Event = {
    ...events[id],
    ...updates,
    updatedAt: new Date().toISOString()
  };
  
  events[id] = updatedEvent;
  await saveAllEvents(events);
  
  return updatedEvent;
}

// Delete event
export async function deleteEvent(id: string): Promise<boolean> {
  const events = await getAllEvents();
  
  if (!events[id]) {
    return false;
  }
  
  if (isFirestoreAvailable()) {
    try {
      await deleteDocData(COLLECTION, id);
      return true;
    } catch (error) {
      console.error('Error deleting event from Firestore, falling back to JSON:', error);
    }
  }
  
  delete events[id];
  await writeJsonFile(events);
  return true;
}

// Generate event ID from title
function generateEventId(title: string): string {
  const baseId = title
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);
  
  const timestamp = Date.now().toString().slice(-6);
  return `${baseId}-${timestamp}`;
}

// Get events for public display (simplified format)
export async function getEventsForDisplay(): Promise<Array<{
  id: string;
  title: string;
  description: string;
  organizer: string;
  date: string;
  image: string;
  category: string;
}>> {
  const events = await getAllEvents();
  
  return Object.values(events).map(event => ({
    id: event.id,
    title: event.title,
    description: event.description,
    organizer: event.organizer,
    date: event.date,
    image: event.gallery[0]?.url || '/events/placeholder-1.svg',
    category: event.category
  }));
}
