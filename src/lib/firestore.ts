// Firestore-backed data store with JSON-file fallback for local development.
//
// The tech-council app deploys to Vercel serverless, whose filesystem is
// ephemeral: every admin write to /data/*.json is lost on cold start or
// redeploy. Firebase Admin was already initialized (auth + storage) but
// Firestore was never wired up. This module provides typed CRUD against
// Firestore collections, falling back to the existing JSON files when
// Firestore is not configured (local dev without credentials).
//
// Usage:
//   import { getCollection, setDocData, setAllDocs, deleteDocData,
//            getDocById, isFirestoreAvailable } from './firestore';
//
// Each storage module should prefer Firestore when available and fall back
// to its JSON file otherwise, so the app keeps working locally and in
// preview deploys without Firebase credentials.

import { getFirestore } from 'firebase-admin/firestore';
import { firestore as db } from './firebase-admin';

export const isFirestoreAvailable = (): boolean => db != null;

/** Get the Firestore instance, or null if not configured. */
function firestore(): FirebaseFirestore.Firestore | null {
  if (!db) return null;
  return db as unknown as FirebaseFirestore.Firestore;
}

/** Read every document in a collection as an id-keyed record. */
export async function getCollection<T = any>(
  name: string
): Promise<Record<string, T>> {
  const fir = firestore();
  if (!fir) return {};
  const snap = await fir.collection(name).get();
  const out: Record<string, T> = {};
  snap.forEach((d) => {
    out[d.id] = d.data() as T;
  });
  return out;
}

/** Read a single document by id. */
export async function getDocById<T = any>(
  name: string,
  id: string
): Promise<T | null> {
  const fir = firestore();
  if (!fir) return null;
  const d = await fir.collection(name).doc(id).get();
  if (!d.exists) return null;
  return d.data() as T;
}

/** Create or update a single document. */
export async function setDocData<T = any>(
  name: string,
  id: string,
  data: T
): Promise<void> {
  const fir = firestore();
  if (!fir) throw new Error('Firestore is not configured');
  await fir.collection(name).doc(id).set(data as FirebaseFirestore.DocumentData);
}

/** Replace the entire collection with the provided id-keyed records. */
export async function setAllDocs<T = any>(
  name: string,
  docs: Record<string, T>
): Promise<void> {
  const fir = firestore();
  if (!fir) throw new Error('Firestore is not configured');
  const batch = fir.batch();
  Object.entries(docs).forEach(([id, data]) => {
    batch.set(fir.collection(name).doc(id), data as FirebaseFirestore.DocumentData);
  });
  await batch.commit();
}

/** Delete a single document by id. */
export async function deleteDocData(name: string, id: string): Promise<void> {
  const fir = firestore();
  if (!fir) throw new Error('Firestore is not configured');
  await fir.collection(name).doc(id).delete();
}

/** Remove every document in a collection. */
export async function clearCollection(name: string): Promise<void> {
  const fir = firestore();
  if (!fir) throw new Error('Firestore is not configured');
  const snap = await fir.collection(name).get();
  const batch = fir.batch();
  snap.forEach((d) => batch.delete(d.ref));
  await batch.commit();
}
