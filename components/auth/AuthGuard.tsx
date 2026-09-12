"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/context/AuthContext";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const { user, loading, isAuthorized } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && (!user || !isAuthorized)) {
      router.replace("/login");
    }
  }, [user, loading, isAuthorized, router]);

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#F7F7F4] text-[#292D29]">
        <div className="flex flex-col items-center gap-4 text-center animate-in fade-in duration-300">
          <div className="grid size-14 place-items-center rounded-2xl bg-[#6F776D] text-white shadow-md">
            <span className="font-serif text-2xl font-extrabold tracking-tight">B</span>
          </div>
          <div className="space-y-1">
            <h1 className="font-serif text-lg font-bold tracking-[0.2em] text-[#2F352F] uppercase">
              BLOW SALON
            </h1>
            <p className="text-xs font-semibold text-[#747A72]">
              Verifying session security...
            </p>
          </div>
          <div className="size-6 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent mt-2" />
        </div>
      </div>
    );
  }

  if (!user || !isAuthorized) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[#F7F7F4]">
        <div className="size-6 animate-spin rounded-full border-2 border-[#6F776D] border-t-transparent" />
      </div>
    );
  }

  return <>{children}</>;
}
