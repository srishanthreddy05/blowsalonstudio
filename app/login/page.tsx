"use client";

import React, { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, ALLOWED_EMAILS } from "@/context/AuthContext";
import { ShieldAlert, Sparkles, CheckCircle2 } from "lucide-react";

export default function LoginPage() {
  const { user, loading, error, isAuthorized, loginWithGoogle, clearError } = useAuth();
  const [signingIn, setSigningIn] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!loading && user && isAuthorized) {
      router.replace("/dashboard");
    }
  }, [user, loading, isAuthorized, router]);

  const handleSignIn = async () => {
    clearError();
    setSigningIn(true);
    try {
      await loginWithGoogle();
      router.replace("/dashboard");
    } catch (err: any) {
      console.warn("Sign in error:", err);
    } finally {
      setSigningIn(false);
    }
  };

  return (
    <div className="flex min-h-screen flex-col justify-between bg-[#F7F7F4] text-[#292D29] px-4 py-8 sm:px-6">
      {/* Top Bar Header */}
      <header className="flex items-center justify-between max-w-6xl w-full mx-auto">
        <div className="flex items-center gap-2.5">
          <div className="grid size-9 place-items-center rounded-xl bg-[#6F776D] text-white shadow-xs">
            <span className="font-serif text-base font-extrabold tracking-tight">B</span>
          </div>
          <span className="font-serif text-base font-bold tracking-[0.2em] text-[#2F352F] uppercase">
            BLOW SALON
          </span>
        </div>
        <div className="hidden sm:flex items-center gap-1.5 rounded-full bg-[#E8ECE5] border border-[#CCD2C8] px-3 py-1 text-[11px] font-semibold text-[#5F7A62]">
          <Sparkles size={13} />
          <span>Management & Billing Suite</span>
        </div>
      </header>

      {/* Center Card */}
      <main className="flex flex-1 items-center justify-center my-8">
        <div className="w-full max-w-md animate-in fade-in zoom-in-95 duration-200">
          <div className="rounded-3xl border border-[#E0E4DD] bg-[#FFFFFF] p-8 sm:p-10 shadow-xl text-center space-y-6">
            {/* Salon Icon */}
            <div className="mx-auto grid size-16 place-items-center rounded-2xl bg-[#6F776D] text-white shadow-md">
              <span className="font-serif text-3xl font-extrabold tracking-tight">B</span>
            </div>

            {/* Title & Description */}
            <div className="space-y-1.5">
              <h1 className="font-serif text-2xl font-bold tracking-tight text-[#2F352F] uppercase">
                BLOW SALON
              </h1>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-[#747A72]">
                Studio Management Portal
              </p>
              <p className="text-xs text-[#747A72] pt-1">
                Sign in with your authorized Google account to access billing, staff, and salon operations.
              </p>
            </div>

            {/* Error / Access Denied Message */}
            {error && (
              <div className="rounded-2xl border border-[#FBEBEB] bg-[#FFF5F5] p-4 text-left flex items-start gap-3 text-[#B55B5B] shadow-2xs animate-in shake duration-300">
                <ShieldAlert className="size-5 shrink-0 mt-0.5 text-[#B55B5B]" />
                <div className="space-y-1 text-xs">
                  <p className="font-bold">Access Denied</p>
                  <p className="leading-relaxed text-[11px]">{error}</p>
                </div>
              </div>
            )}

            {/* Google Sign In Button */}
            <div className="pt-2">
              <button
                type="button"
                disabled={signingIn || loading}
                onClick={handleSignIn}
                className="w-full flex items-center justify-center gap-3.5 rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] px-5 py-3.5 text-xs font-bold text-[#2F352F] shadow-xs transition hover:bg-[#F7F7F4] hover:border-[#6F776D] hover:shadow-md disabled:opacity-60 disabled:pointer-events-none cursor-pointer group"
              >
                {signingIn ? (
                  <div className="size-5 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
                ) : (
                  <svg className="size-5 shrink-0" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                )}
                <span className="text-sm font-semibold tracking-wide">
                  {signingIn ? "Connecting to Google..." : "Sign in with Google"}
                </span>
              </button>
            </div>

            {/* Authorized Personnel Notice */}
            <div className="pt-2 border-t border-[#E0E4DD]/80">
              <p className="text-[11px] text-[#747A72] flex items-center justify-center gap-1.5 font-medium">
                <CheckCircle2 size={12} className="text-[#5F7A62]" />
                Authorized personnel and salon administration only
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="text-center text-xs text-[#747A72]">
        <p>© {new Date().getFullYear()} BLOW SALON. All rights reserved.</p>
      </footer>
    </div>
  );
}
