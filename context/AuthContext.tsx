"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import {
  User,
  GoogleAuthProvider,
  signInWithPopup,
  signOut,
  onAuthStateChanged,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import { auth } from "@/lib/firebase";

export const ALLOWED_EMAILS = [
  "theblowstudiosalon@gmail.com",
  "srishanthreddyy05@gmail.com",
].map((e) => e.toLowerCase().trim());

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  isAuthorized: boolean;
  loginWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  error: null,
  isAuthorized: false,
  loginWithGoogle: async () => {},
  logout: async () => {},
  clearError: () => {},
});

export const useAuth = () => useContext(AuthContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthorized, setIsAuthorized] = useState<boolean>(false);

  const clearError = () => setError(null);

  useEffect(() => {
    // Ensure persistent login across page refreshes
    if (typeof window !== "undefined" && auth) {
      setPersistence(auth, browserLocalPersistence).catch((err) => {
        console.warn("Failed to set Firebase Auth persistence:", err);
      });
    }

    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      if (firebaseUser) {
        const userEmail = (firebaseUser.email || "").toLowerCase().trim();
        const authorized = ALLOWED_EMAILS.includes(userEmail);

        if (authorized) {
          setUser(firebaseUser);
          setIsAuthorized(true);
          setError(null);
        } else {
          // Immediately sign out unauthorized accounts
          try {
            await signOut(auth);
          } catch (signOutErr) {
            console.error("Error signing out unauthorized user:", signOutErr);
          }
          setUser(null);
          setIsAuthorized(false);
          setError("Access denied. This account is not authorized to use BLOW SALON.");
        }
      } else {
        setUser(null);
        setIsAuthorized(false);
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  const loginWithGoogle = async () => {
    setError(null);
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      provider.setCustomParameters({
        prompt: "select_account",
      });

      const result = await signInWithPopup(auth, provider);
      const userEmail = (result.user.email || "").toLowerCase().trim();

      if (!ALLOWED_EMAILS.includes(userEmail)) {
        await signOut(auth);
        setUser(null);
        setIsAuthorized(false);
        const deniedMsg = "Access denied. This account is not authorized to use BLOW SALON.";
        setError(deniedMsg);
        setLoading(false);
        throw new Error(deniedMsg);
      }

      setUser(result.user);
      setIsAuthorized(true);
      setError(null);
      setLoading(false);
    } catch (err: any) {
      setLoading(false);
      // If the user closed the popup, don't show an unauthorized error
      if (err.code === "auth/popup-closed-by-user") {
        return;
      }
      if (!error) {
        setError(err.message || "Failed to sign in with Google.");
      }
      throw err;
    }
  };

  const logout = async () => {
    try {
      await signOut(auth);
      setUser(null);
      setIsAuthorized(false);
      setError(null);
    } catch (err) {
      console.error("Failed to sign out:", err);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        loading,
        error,
        isAuthorized,
        loginWithGoogle,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
