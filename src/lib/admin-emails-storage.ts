import fs from 'fs';
import path from 'path';
import { 
  getDocById, 
  setDocData, 
  isFirestoreAvailable 
} from './firestore';

export interface AdminEmailsData {
  emails: string[];
  lastModified: string;
  modifiedBy: string;
  createdAt: string;
  updatedAt: string;
}

const COLLECTION = 'admin-emails';
const DOC_ID = 'emails';
const DATA_DIR = path.join(process.cwd(), 'data');
const ADMIN_EMAILS_FILE = path.join(DATA_DIR, 'admin-emails.json');

// Default admin emails
const defaultAdminEmails: AdminEmailsData = {
  emails: [
    "mukul.meena@iitgn.ac.in",
    "technical.secretary@iitgn.ac.in",
  ],
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

function readJsonFile(): AdminEmailsData {
  try {
    ensureDataDir();
    const data = fs.readFileSync(ADMIN_EMAILS_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return defaultAdminEmails;
  }
}

function writeJsonFile(adminEmailsData: AdminEmailsData): AdminEmailsData {
  const updatedData: AdminEmailsData = {
    ...adminEmailsData,
    lastModified: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  const tempFile = `${ADMIN_EMAILS_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(updatedData, null, 2));
  fs.renameSync(tempFile, ADMIN_EMAILS_FILE);
  return updatedData;
}

// Firestore-backed operations with JSON fallback

// Get admin emails
export async function getAdminEmails(): Promise<AdminEmailsData> {
  if (isFirestoreAvailable()) {
    try {
      const emails = await getDocById<AdminEmailsData>(COLLECTION, DOC_ID);
      if (emails) {
        return emails;
      }
    } catch (error) {
      console.log('Admin emails not found in Firestore, falling back to JSON');
    }
  }
  return readJsonFile();
}

// Save admin emails with atomic write operation
export async function saveAdminEmails(adminEmailsData: AdminEmailsData): Promise<void> {
  if (isFirestoreAvailable()) {
    try {
      const updatedData: AdminEmailsData = {
        ...adminEmailsData,
        lastModified: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      await setDocData<AdminEmailsData>(COLLECTION, DOC_ID, updatedData);
      console.log('Admin emails saved to Firestore successfully');
      return;
    } catch (error) {
      console.error('Error saving admin emails to Firestore, falling back to JSON:', error);
    }
  }
  writeJsonFile(adminEmailsData);
  console.log('Admin emails saved to JSON fallback successfully');
}

// Add admin email
export async function addAdminEmail(email: string, modifiedBy: string): Promise<AdminEmailsData> {
  const adminEmailsData = await getAdminEmails();
  
  // Check if email already exists
  if (adminEmailsData.emails.includes(email)) {
    throw new Error('Email already exists in admin list');
  }
  
  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    throw new Error('Invalid email format');
  }
  
  const updatedData: AdminEmailsData = {
    ...adminEmailsData,
    emails: [...adminEmailsData.emails, email],
    lastModified: new Date().toISOString(),
    modifiedBy,
    updatedAt: new Date().toISOString()
  };
  
  await saveAdminEmails(updatedData);
  return updatedData;
}

// Remove admin email
export async function removeAdminEmail(email: string, modifiedBy: string): Promise<AdminEmailsData> {
  const adminEmailsData = await getAdminEmails();
  
  // Check if email exists
  if (!adminEmailsData.emails.includes(email)) {
    throw new Error('Email not found in admin list');
  }
  
  // Prevent removing the last admin email
  if (adminEmailsData.emails.length <= 1) {
    throw new Error('Cannot remove the last admin email');
  }
  
  const updatedData: AdminEmailsData = {
    ...adminEmailsData,
    emails: adminEmailsData.emails.filter(e => e !== email),
    lastModified: new Date().toISOString(),
    modifiedBy,
    updatedAt: new Date().toISOString()
  };
  
  await saveAdminEmails(updatedData);
  return updatedData;
}

// Update all admin emails
export async function updateAdminEmails(emails: string[], modifiedBy: string): Promise<AdminEmailsData> {
  // Validate that at least one email is provided
  if (!emails || emails.length === 0) {
    throw new Error('At least one admin email is required');
  }
  
  // Validate email formats
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  for (const email of emails) {
    if (!emailRegex.test(email)) {
      throw new Error(`Invalid email format: ${email}`);
    }
  }
  
  // Remove duplicates
  const uniqueEmails = [...new Set(emails)];
  
  const updatedData: AdminEmailsData = {
    emails: uniqueEmails,
    lastModified: new Date().toISOString(),
    modifiedBy,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  
  await saveAdminEmails(updatedData);
  return updatedData;
}

// Check if email is admin
export async function isAdminEmail(email: string): Promise<boolean> {
  try {
    const adminEmailsData = await getAdminEmails();
    return adminEmailsData.emails.includes(email);
  } catch (error) {
    console.error('Error checking admin email:', error);
    return false;
  }
}
