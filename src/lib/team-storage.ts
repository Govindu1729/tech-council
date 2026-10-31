import { promises as fs } from 'fs';
import path from 'path';
import {
  TeamMember,
  defaultTeamData,
  getCategoryFromPosition,
  isSecretaryPosition,
  isCoordinatorPosition
} from './team-data';
import { 
  getCollection, 
  getDocById, 
  setDocData, 
  setAllDocs, 
  deleteDocData, 
  isFirestoreAvailable 
} from './firestore';

const COLLECTION = 'team';
const DATA_DIR = path.join(process.cwd(), 'data');
const TEAM_FILE = path.join(DATA_DIR, 'team.json');

// JSON file fallback helpers
async function ensureDataDir() {
  try {
    await fs.access(DATA_DIR);
  } catch {
    await fs.mkdir(DATA_DIR, { recursive: true });
  }
}

async function readJsonFile(): Promise<Record<string, TeamMember>> {
  try {
    await ensureDataDir();
    const data = await fs.readFile(TEAM_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultTeamData;
  }
}

async function writeJsonFile(teamMembers: Record<string, TeamMember>): Promise<void> {
  await ensureDataDir();
  await fs.writeFile(TEAM_FILE, JSON.stringify(teamMembers, null, 2));
}

// Migrate team member data to ensure correct category mappings
function migrateTeamMemberData(teamMembers: Record<string, TeamMember>): Record<string, TeamMember> {
  const migratedMembers: Record<string, TeamMember> = {};

  for (const [id, member] of Object.entries(teamMembers)) {
    const correctCategory = getCategoryFromPosition(member.position);
    const isSecretary = isSecretaryPosition(member.position);
    const isCoordinator = isCoordinatorPosition(member.position);

    migratedMembers[id] = {
      ...member,
      category: correctCategory,
      isSecretary,
      isCoordinator,
      updatedAt: new Date().toISOString()
    };
  }

  return migratedMembers;
}

// Firestore-backed operations with JSON fallback

// Get all team members
export async function getAllTeamMembers(): Promise<Record<string, TeamMember>> {
  if (isFirestoreAvailable()) {
    try {
      const docs = await getCollection<TeamMember>(COLLECTION);
      if (docs && Object.keys(docs).length > 0) {
        const migrated = migrateTeamMemberData(docs);
        // Persist migration if changes were made
        const hasChanges = JSON.stringify(docs) !== JSON.stringify(migrated);
        if (hasChanges) {
          try {
            await setAllDocs<TeamMember>(COLLECTION, migrated);
          } catch {
            // ignore persistence errors for migration
          }
        }
        return migrated;
      }
    } catch (error) {
      console.error('Error reading team members from Firestore, falling back to JSON:', error);
    }
  }
  const data = await readJsonFile();
  return migrateTeamMemberData(data);
}

// Get single team member by ID
export async function getTeamMemberById(id: string): Promise<TeamMember | null> {
  if (isFirestoreAvailable()) {
    try {
      return await getDocById<TeamMember>(COLLECTION, id);
    } catch (error) {
      console.error('Error reading team member from Firestore, falling back to JSON:', error);
    }
  }
  const teamMembers = await readJsonFile();
  return teamMembers[id] || null;
}

// Save all team members
export async function saveAllTeamMembers(teamMembers: Record<string, TeamMember>): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      await setAllDocs<TeamMember>(COLLECTION, teamMembers);
      console.log('Team data saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving team members to Firestore, falling back to JSON:', error);
    }
  }
  await writeJsonFile(teamMembers);
  console.log('Team data saved to JSON fallback successfully');
}

// Create new team member
export async function createTeamMember(member: Omit<TeamMember, 'id' | 'createdAt' | 'updatedAt'>): Promise<TeamMember> {
  const teamMembers = await getAllTeamMembers();

  const id = generateMemberId(member.name);
  const now = new Date().toISOString();

  // Ensure correct category mapping based on position
  const correctCategory = getCategoryFromPosition(member.position);
  const isSecretary = isSecretaryPosition(member.position);
  const isCoordinator = isCoordinatorPosition(member.position);

  const newMember: TeamMember = {
    ...member,
    id,
    category: correctCategory,
    isSecretary,
    isCoordinator,
    createdAt: now,
    updatedAt: now
  };

  teamMembers[id] = newMember;
  await saveAllTeamMembers(teamMembers);

  return newMember;
}

// Update existing team member
export async function updateTeamMember(id: string, updates: Partial<Omit<TeamMember, 'id' | 'createdAt'>>): Promise<TeamMember | null> {
  const teamMembers = await getAllTeamMembers();

  if (!teamMembers[id]) {
    return null;
  }

  // If position is being updated, ensure correct category mapping
  const finalUpdates = updates.position ? {
    ...updates,
    category: getCategoryFromPosition(updates.position),
    isSecretary: isSecretaryPosition(updates.position),
    isCoordinator: isCoordinatorPosition(updates.position)
  } : updates;

  const updatedMember: TeamMember = {
    ...teamMembers[id],
    ...finalUpdates,
    updatedAt: new Date().toISOString()
  };

  teamMembers[id] = updatedMember;
  await saveAllTeamMembers(teamMembers);

  return updatedMember;
}

// Delete team member
export async function deleteTeamMember(id: string): Promise<boolean> {
  const teamMembers = await getAllTeamMembers();

  if (!teamMembers[id]) {
    return false;
  }

  if (isFirestoreAvailable()) {
    try {
      await deleteDocData(COLLECTION, id);
      return true;
    } catch (error) {
      console.error('Error deleting team member from Firestore, falling back to JSON:', error);
    }
  }

  delete teamMembers[id];
  await writeJsonFile(teamMembers);
  return true;
}

// Generate member ID from name
function generateMemberId(name: string): string {
  const baseId = name
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, '-')
    .substring(0, 50);

  const timestamp = Date.now().toString().slice(-6);
  return `${baseId}-${timestamp}`;
}

// Get team members by category
export async function getTeamMembersByCategory(category: string): Promise<TeamMember[]> {
  const teamMembers = await getAllTeamMembers();
  return Object.values(teamMembers).filter(member => member.category === category);
}

// Get leadership team (secretary + coordinators)
export async function getLeadershipTeam(): Promise<{
  secretary: TeamMember | null;
  coordinators: TeamMember[];
}> {
  const teamMembers = await getAllTeamMembers();
  const allMembers = Object.values(teamMembers);

  const secretary = allMembers.find(member => member.isSecretary) || null;
  const coordinators = allMembers.filter(member => member.isCoordinator);

  return { secretary, coordinators };
}

// Get team members for public display
export async function getTeamMembersForDisplay(): Promise<Array<{
  id: string;
  name: string;
  position: string;
  email: string;
  initials: string;
  gradientFrom: string;
  gradientTo: string;
  category: string;
  photoPath?: string;
}>> {
  const teamMembers = await getAllTeamMembers();

  return Object.values(teamMembers).map(member => ({
    id: member.id,
    name: member.name,
    position: member.position,
    email: member.email,
    initials: member.initials,
    gradientFrom: member.gradientFrom,
    gradientTo: member.gradientTo,
    category: member.category,
    photoPath: member.photoPath
  }));
}
