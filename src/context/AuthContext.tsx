import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import {
  User,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  updateProfile,
} from 'firebase/auth';
import { doc, getDoc, serverTimestamp, setDoc, updateDoc } from 'firebase/firestore';
import { auth, db, googleProvider } from '../firebase';
import { handleFirestoreError, OperationType } from '../utils/firestoreTreeService';
import { logAuth } from '../utils/logger';

export interface UserProfile {
  userId: string;
  email: string;
  displayName?: string;
  photoURL?: string;
  createdAt: string;
  updatedAt: string;
}

interface AuthContextType {
  currentUser: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  authReady: boolean;
  isCloudAuthenticated: boolean;
  signInWithGoogle: () => Promise<User | null>;
  signInAsGuest: () => Promise<void>;
  logOut: () => Promise<void>;
  updateDisplayName: (newName: string) => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  currentUser: null,
  userProfile: null,
  loading: true,
  authReady: false,
  isCloudAuthenticated: false,
  signInWithGoogle: async () => null,
  signInAsGuest: async () => {},
  logOut: async () => {},
  updateDisplayName: async () => {},
});

async function syncUserProfileToFirestore(user: User, displayName: string): Promise<void> {
  if (!user.emailVerified || !user.email) return;
  const path = `users/${user.uid}`;
  const userRef = doc(db, 'users', user.uid);
  const safeName = displayName.trim().slice(0, 100);
  const safePhoto = (user.photoURL || '').trim().slice(0, 1000);
  const safeEmail = user.email.trim().slice(0, 200);

  try {
    const snap = await getDoc(userRef);
    if (snap.exists()) {
      await updateDoc(userRef, {
        displayName: safeName,
        photoURL: safePhoto,
        updatedAt: serverTimestamp(),
      });
    } else {
      await setDoc(userRef, {
        userId: user.uid,
        email: safeEmail,
        displayName: safeName,
        photoURL: safePhoto,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, path);
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        const localCustom = localStorage.getItem('family_tree_display_name');
        const initialName =
          localCustom || user.displayName || user.email?.split('@')[0] || 'Користувач';
        setUserProfile({
          userId: user.uid,
          email: user.email || '',
          displayName: initialName,
          photoURL: user.photoURL || '',
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        });

        try {
          await syncUserProfileToFirestore(user, initialName);
        } catch (err) {
          console.warn('User profile sync skipped:', err);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const signInWithGoogle = async (): Promise<User | null> => {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      logAuth(
        `Виконано вхід через Google (${cred.user.email || cred.user.uid}) для хмарної синхронізації Firebase`,
        { uid: cred.user.uid },
        'success'
      );
      return cred.user;
    } catch (error: any) {
      if (error?.code !== 'auth/popup-closed-by-user' && error?.code !== 'auth/cancelled-popup-request') {
        console.error('Google Sign-In error:', error);
      }
      throw error;
    }
  };

  // Only Google Login is enabled in Firebase Auth; switching to guest simply clears Firebase Auth session if desired
  const signInAsGuest = async () => {
    if (auth.currentUser) {
      await signOut(auth);
    }
  };

  const logOut = async () => {
    try {
      await signOut(auth);
      logAuth('Вихід з облікового запису Google (Firebase)', {}, 'info');
    } catch (error) {
      console.error('Error logging out:', error);
      throw error;
    }
  };

  const updateDisplayName = async (newName: string) => {
    const trimmed = newName.trim().slice(0, 100);
    if (!trimmed) return;

    if (auth.currentUser) {
      try {
        await updateProfile(auth.currentUser, { displayName: trimmed });
        await syncUserProfileToFirestore(auth.currentUser, trimmed);
      } catch (e) {
        console.warn('Failed to update auth displayName:', e);
      }
    }

    setUserProfile((prev) =>
      prev
        ? { ...prev, displayName: trimmed, updatedAt: new Date().toISOString() }
        : {
            userId: auth.currentUser?.uid || 'guest',
            email: auth.currentUser?.email || '',
            displayName: trimmed,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          }
    );

    const parts = trimmed.split(/\s+/);
    const firstName = parts[0] || trimmed;
    const lastName = parts.slice(1).join(' ') || '';
    try {
      localStorage.setItem('family_tree_user_name', JSON.stringify({ firstName, lastName }));
      localStorage.setItem('family_tree_display_name', trimmed);
    } catch {
      /* ignore storage quota/privacy errors */
    }
    window.dispatchEvent(
      new CustomEvent('family_tree_user_name_updated', {
        detail: { firstName, lastName, fullName: trimmed },
      })
    );
  };

  const isCloudAuthenticated = Boolean(currentUser && currentUser.emailVerified);

  return (
    <AuthContext.Provider
      value={{
        currentUser,
        userProfile,
        loading,
        authReady: !loading,
        isCloudAuthenticated,
        signInWithGoogle,
        signInAsGuest,
        logOut,
        updateDisplayName,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => useContext(AuthContext);
