import fs from 'fs';
import path from 'path';
import { 
  getDocById, 
  setDocData, 
  isFirestoreAvailable 
} from './firestore';

export interface ContactInfo {
  address: {
    street: string;
    city: string;
    state: string;
    postalCode: string;
    country: string;
  };
  phone: string;
  email: string;
  socialMedia: {
    instagram: string;
    youtube: string;
    linkedin: string;
    facebook: string;
  };
  lastModified: string;
  modifiedBy: string;
}

const COLLECTION = 'contact-info';
const DOC_ID = 'contact';
const CONTACT_FILE = path.join(process.cwd(), 'data', 'contact-info.json');

// Default contact information
const DEFAULT_CONTACT: ContactInfo = {
  address: {
    street: "323, Acad Block 4, IIT Gandhinagar",
    city: "Palaj, Gandhinagar",
    state: "Gujarat",
    postalCode: "382355",
    country: "India"
  },
  phone: "+91-79-2395-2001",
  email: "technical.secretary@iitgn.ac.in",
  socialMedia: {
    instagram: "https://www.instagram.com/tech_iitgn?utm_source=ig_web_button_share_sheet&igsh=ZDNlZDc0MzIxNw==",
    youtube: "https://www.youtube.com/@tech_iitgn",
    linkedin: "https://www.linkedin.com/school/tech-council-iitgn/",
    facebook: "https://www.facebook.com/tech.iitgn"
  },
  lastModified: new Date().toISOString(),
  modifiedBy: "System"
};

// Ensure data directory exists
function ensureDataDirectory() {
  const dataDir = path.dirname(CONTACT_FILE);
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }
}

// JSON file fallback helpers
function readJsonFile(): ContactInfo {
  ensureDataDirectory();
  if (!fs.existsSync(CONTACT_FILE)) {
    return DEFAULT_CONTACT;
  }
  const data = fs.readFileSync(CONTACT_FILE, 'utf-8');
  const contactInfo = JSON.parse(data);
  return {
    ...DEFAULT_CONTACT,
    ...contactInfo,
    address: {
      ...DEFAULT_CONTACT.address,
      ...contactInfo.address
    },
    socialMedia: {
      ...DEFAULT_CONTACT.socialMedia,
      ...contactInfo.socialMedia
    }
  };
}

function writeJsonFile(contactInfo: ContactInfo): ContactInfo {
  ensureDataDirectory();
  const updatedContact = {
    ...contactInfo,
    lastModified: new Date().toISOString()
  };
  // Atomic write operation
  const tempFile = `${CONTACT_FILE}.tmp`;
  fs.writeFileSync(tempFile, JSON.stringify(updatedContact, null, 2));
  fs.renameSync(tempFile, CONTACT_FILE);
  return updatedContact;
}

// Firestore-backed operations with JSON fallback

// Get contact information
export async function getContactInfo(): Promise<ContactInfo> {
  if (isFirestoreAvailable()) {
    try {
      const contact = await getDocById<ContactInfo>(COLLECTION, DOC_ID);
      if (contact) {
        return contact;
      }
    } catch (error) {
      console.error('Error reading contact info from Firestore, falling back to JSON:', error);
    }
  }
  return readJsonFile();
}

// Save contact information with atomic write
export async function saveContactInfo(contactInfo: ContactInfo): Promise<ContactInfo> {
  if (isFirestoreAvailable()) {
    try {
      const updatedContact = {
        ...contactInfo,
        lastModified: new Date().toISOString()
      };
      await setDocData<ContactInfo>(COLLECTION, DOC_ID, updatedContact);
      console.log('Contact info saved to Firestore successfully');
      return updatedContact;
    } catch (error) {
      console.error('Error saving contact info to Firestore, falling back to JSON:', error);
    }
  }
  return writeJsonFile(contactInfo);
}

// Update specific contact field
export async function updateContactField(field: string, value: any, modifiedBy: string): Promise<ContactInfo> {
  const currentContact = await getContactInfo();
  
  // Handle nested field updates
  const updatedContact = { ...currentContact };
  
  if (field.includes('.')) {
    const [parent, child] = field.split('.');
    if (parent === 'address' || parent === 'socialMedia') {
      updatedContact[parent as keyof ContactInfo] = {
        ...(updatedContact[parent as keyof ContactInfo] as any),
        [child]: value
      };
    }
  } else {
    (updatedContact as any)[field] = value;
  }
  
  updatedContact.modifiedBy = modifiedBy;
  
  return await saveContactInfo(updatedContact);
}
