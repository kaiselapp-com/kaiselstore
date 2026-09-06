import { initializeApp, type FirebaseApp } from "firebase/app";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signInWithPopup, GoogleAuthProvider, signOut as fbSignOut,
  onAuthStateChanged, updateProfile, type Auth, type User as FbUser,
} from "firebase/auth";
import { getAnalytics, isSupported as analyticsSupported } from "firebase/analytics";

/* Kaisel Store — Firebase configuration (web app) */
const firebaseConfig = {
  apiKey: "AIzaSyDSKHWk8BaRcfuUDEuCbMdfhGL38D7oPuk",
  authDomain: "kaiselstore.firebaseapp.com",
  projectId: "kaiselstore",
  storageBucket: "kaiselstore.firebasestorage.app",
  messagingSenderId: "337004749590",
  appId: "1:337004749590:web:792d0d7a82e9c3147d2637",
  measurementId: "G-XHCB101R6B",
};

let app: FirebaseApp | null = null;
let auth: Auth | null = null;

try {
  app = initializeApp(firebaseConfig);
  auth = getAuth(app);
  analyticsSupported().then((ok) => { if (ok && app) getAnalytics(app); }).catch(() => {});
} catch (e) {
  console.warn("[kaisel] firebase unavailable in this environment", e);
}

export interface AuthResult {
  ok: boolean;
  uid?: string;
  email?: string;
  displayName?: string;
  error?: string;
}

function describeError(e: any): string {
  const code = e?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-email": "That email address looks invalid.",
    "auth/user-not-found": "No account found with that email.",
    "auth/wrong-password": "Incorrect password.",
    "auth/invalid-credential": "Email or password is incorrect.",
    "auth/email-already-in-use": "An account with that email already exists.",
    "auth/weak-password": "Password is too weak (min 6 characters).",
    "auth/network-request-failed": "Network error reaching Firebase.",
    "auth/popup-closed-by-user": "Google popup was closed.",
    "auth/configuration-not-found": "Firebase Auth is not enabled for this project.",
    "auth/operation-not-allowed": "This sign-in provider is not enabled in Firebase.",
    "auth/api-key-not-valid.-please-pass-a-valid-api-key.": "Firebase API key rejected.",
  };
  return map[code] || `Firebase error: ${code || e?.message || "unknown"}`;
}

export async function signUpEmail(email: string, password: string, displayName: string): Promise<AuthResult> {
  if (!auth) return { ok: false, error: "Firebase not initialised." };
  try {
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    if (displayName) await updateProfile(cred.user, { displayName }).catch(() => {});
    return { ok: true, uid: cred.user.uid, email, displayName };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function signInEmail(email: string, password: string): Promise<AuthResult> {
  if (!auth) return { ok: false, error: "Firebase not initialised." };
  try {
    const cred = await signInWithEmailAndPassword(auth, email, password);
    return { ok: true, uid: cred.user.uid, email, displayName: cred.user.displayName ?? undefined };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function signInGoogle(): Promise<AuthResult> {
  if (!auth) return { ok: false, error: "Firebase not initialised." };
  try {
    const provider = new GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    const cred = await signInWithPopup(auth, provider);
    return { ok: true, uid: cred.user.uid, email: cred.user.email ?? undefined, displayName: cred.user.displayName ?? undefined };
  } catch (e) {
    return { ok: false, error: describeError(e) };
  }
}

export async function signOutFirebase(): Promise<void> {
  if (auth) await fbSignOut(auth).catch(() => {});
}

export function onAuthChange(cb: (u: FbUser | null) => void): () => void {
  if (!auth) return () => {};
  return onAuthStateChanged(auth, cb);
}

export function firebaseReady(): boolean {
  return auth !== null;
}
