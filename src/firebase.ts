import { initializeApp } from 'firebase/app';
import { getAuth, signInAnonymously } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

/** Firebase web config comes from VITE_FIREBASE_* variables (see README). These identify the project and are not secrets. */
const env = import.meta.env;
const config = {
  apiKey: env.VITE_FIREBASE_API_KEY,
  authDomain: env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: env.VITE_FIREBASE_PROJECT_ID,
  appId: env.VITE_FIREBASE_APP_ID,
};

export const firebaseConfigured = Boolean(config.apiKey && config.projectId);

const app = firebaseConfigured ? initializeApp(config) : null;
export const db = app ? getFirestore(app) : null;
const auth = app ? getAuth(app) : null;

/** One anonymous uid per browser profile. Seats and preset ownership are bound to it. */
export async function currentUid(): Promise<string> {
  if (!auth) throw new Error('Firebase is not configured');
  await auth.authStateReady();
  return auth.currentUser?.uid ?? (await signInAnonymously(auth)).user.uid;
}
