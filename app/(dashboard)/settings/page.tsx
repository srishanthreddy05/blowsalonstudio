"use client";

import { useEffect, useState } from "react";
import { getSettings, updateSettings } from "@/services/settings";
import { useAppData } from "@/context/AppDataContext";
import type { Settings } from "@/types/settings";
import { Save, Sparkles, Lock } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "react-hot-toast";

export default function SettingsPage() {
  const { settings: cachedSettings, loadingAppData, refreshSettings } = useAppData();
  const [settings, setSettings] = useState<Settings>({
    salonName: "",
    phoneNumber: "",
    invoicePrefix: "",
    currencyCode: "",
    currencyLocale: "",
    taxRate: 0,
  });

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ type: "success" | "error"; text: string } | null>(null);

  const { user, resetPassword } = useAuth();
  const [resettingPassword, setResettingPassword] = useState(false);

  const handleResetPassword = async () => {
    if (!user?.email) {
      toast.error("No email address found for the current user.");
      return;
    }
    setResettingPassword(true);
    try {
      await resetPassword(user.email);
      toast.success("Password reset email sent. Please check your inbox.");
    } catch (error) {
      console.error("Failed to send reset email:", error);
      toast.error("Failed to send password reset email. Please try again.");
    } finally {
      setResettingPassword(false);
    }
  };

  useEffect(() => {
    if (!loadingAppData) {
      if (cachedSettings) {
        setSettings((prev) => ({
          ...prev,
          ...cachedSettings,
        }));
      }
      setLoading(false);
    }
  }, [cachedSettings, loadingAppData]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await updateSettings({
        salonName: settings.salonName,
        phoneNumber: settings.phoneNumber,
        invoicePrefix: settings.invoicePrefix,
        currencyCode: settings.currencyCode,
        currencyLocale: settings.currencyLocale,
        taxRate: Number(settings.taxRate),
      });
      await refreshSettings();
      setMessage({ type: "success", text: "Configuration saved successfully!" });
    } catch (error) {
      console.error("Failed to save settings:", error);
      setMessage({ type: "error", text: "Failed to save configuration." });
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <div className="size-10 animate-spin rounded-full border-4 border-[#B8962E] border-t-transparent" />
      </div>
    );
  }

  return (
    <div className="w-full text-[#F5F0E8]">
      <div className="mb-6 flex items-center justify-between gap-4">
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#A89F8C]">
            System
          </p>
          <h1 className="mt-2 text-3xl font-extrabold tracking-[-0.03em] text-[#F5F0E8]">
            System Settings
          </h1>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <section className="rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-5 shadow-md sm:p-6">
          <div className="mb-5 flex items-center gap-3 border-b border-[#2E2B24] pb-4 text-[#B8962E]">
            <Sparkles size={20} />
            <h2 className="text-lg font-bold text-[#F5F0E8]">Business Settings</h2>
          </div>

          {message && (
            <div
              className={`mb-5 rounded-2xl border p-4 text-sm font-semibold ${
                message.type === "success"
                  ? "border-[#105E3C] bg-[#0C2E1D] text-[#34D399]"
                  : "border-[#5C2424] bg-[#2E1616] text-[#E57373]"
              }`}
            >
              {message.text}
            </div>
          )}

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Salon Name</span>
              <input
                required
                type="text"
                name="salonName"
                value={settings.salonName}
                onChange={handleChange}
                className="mt-2 h-12 w-full rounded-2xl border border-[#2E2B24] bg-[#131210] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E]"
                placeholder="e.g. Demo Salon"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Phone Number</span>
              <input
                type="text"
                name="phoneNumber"
                value={settings.phoneNumber || ""}
                onChange={handleChange}
                className="mt-2 h-12 w-full rounded-2xl border border-[#2E2B24] bg-[#131210] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E]"
                placeholder="e.g. +91 98765 43210"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Invoice Prefix</span>
              <input
                type="text"
                name="invoicePrefix"
                value={settings.invoicePrefix || ""}
                onChange={handleChange}
                className="mt-2 h-12 w-full rounded-2xl border border-[#2E2B24] bg-[#131210] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E]"
                placeholder="e.g. INV"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Tax Rate (%)</span>
              <input
                type="number"
                min="0"
                step="0.01"
                name="taxRate"
                value={settings.taxRate ?? 0}
                onChange={handleChange}
                className="mt-2 h-12 w-full rounded-2xl border border-[#2E2B24] bg-[#131210] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E]"
                placeholder="e.g. 18"
              />
            </label>
          </div>

          <div className="grid gap-4 sm:grid-cols-2 mt-4">
            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Currency Code</span>
              <input
                type="text"
                name="currencyCode"
                value={settings.currencyCode || ""}
                onChange={handleChange}
                className="mt-2 h-12 w-full rounded-2xl border border-[#2E2B24] bg-[#131210] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E]"
                placeholder="e.g. INR"
              />
            </label>

            <label className="block">
              <span className="text-sm font-semibold text-[#A89F8C]">Currency Locale</span>
              <input
                type="text"
                name="currencyLocale"
                value={settings.currencyLocale || ""}
                onChange={handleChange}
                className="mt-2 h-12 w-full rounded-2xl border border-[#2E2B24] bg-[#131210] px-4 text-sm text-[#F5F0E8] outline-none focus:border-[#B8962E]"
                placeholder="e.g. en-IN"
              />
            </label>
          </div>

          <div className="mt-6 border-t border-[#2E2B24] pt-4 flex justify-end">
            <button
              disabled={saving}
              type="submit"
              className="inline-flex h-12 items-center justify-center gap-2 rounded-2xl bg-[#B8962E] px-6 text-sm font-bold text-[#0E0D0B] shadow-md transition hover:-translate-y-0.5 hover:bg-[#D4A935] disabled:opacity-50"
            >
              <Save size={18} />
              {saving ? "Saving Changes..." : "Save Settings"}
            </button>
          </div>
        </section>
      </form>

      {/* Account Security Section */}
      <section className="mt-6 rounded-2xl border border-[#2E2B24] bg-[#1C1A16] p-5 shadow-md sm:p-6">
        <div className="mb-5 flex items-center gap-3 border-b border-[#2E2B24] pb-4 text-[#B8962E]">
          <Lock size={20} />
          <h2 className="text-lg font-bold text-[#F5F0E8]">Account Security</h2>
        </div>

        <div className="space-y-4 max-w-md">
          <div>
            <span className="text-sm font-semibold text-[#A89F8C] block">Current Email</span>
            <span className="text-base font-medium text-[#F5F0E8] mt-1 block">{user?.email || "—"}</span>
          </div>

          <div className="pt-2">
            <button
              onClick={handleResetPassword}
              disabled={resettingPassword}
              className="inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-[#2E2B24] bg-[#131210] px-5 text-sm font-semibold text-[#A89F8C] hover:bg-[#1C1A16] hover:text-[#F5F0E8] hover:border-[#B8962E] transition shadow-sm disabled:opacity-50"
            >
              Reset Password
            </button>
            <p className="text-xs text-[#6B6358] mt-2">
              A password reset link will be sent to your email address. You will not be logged out.
            </p>
          </div>
        </div>
      </section>
    </div>
  );
}
