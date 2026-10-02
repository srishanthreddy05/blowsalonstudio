import { Save, X } from "lucide-react";

function WhatsAppBrandIcon({ size = 16, className = "" }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className}>
      <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0 0 12.04 2m.01 1.67c4.56 0 8.25 3.69 8.25 8.24 0 2.2-.86 4.28-2.42 5.84a8.214 8.214 0 0 1-5.83 2.41c-1.42 0-2.82-.37-4.06-1.07l-.29-.17-3.12.82.83-3.04-.19-.31a8.19 8.19 0 0 1-1.26-4.48c0-4.55 3.7-8.24 8.29-8.24m4.54 11.66c-.25-.13-1.47-.72-1.7-.81-.23-.08-.39-.13-.56.13-.17.25-.64.81-.79.97-.14.17-.29.19-.54.06-.25-.13-1.06-.39-2.02-1.25-.75-.67-1.25-1.5-1.4-1.75-.14-.25-.02-.39.11-.51.11-.11.25-.29.37-.43.13-.15.17-.25.25-.42.08-.17.04-.31-.02-.44-.06-.13-.56-1.35-.77-1.85-.2-.49-.41-.42-.56-.43h-.48c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1 0 1.24.9 2.44 1.03 2.61.13.17 1.78 2.72 4.31 3.81.6.26 1.07.41 1.44.53.61.19 1.16.17 1.6-.1.49-.3 1.47-1.2 1.68-1.77.2-.57.2-1.06.14-1.16-.06-.1-.23-.17-.48-.29" />
    </svg>
  );
}

interface ActionButtonsProps {
  onSave?: () => void;
  onClose?: () => void;
  onWhatsApp?: () => void;
  disabled?: boolean;
  saved?: boolean;
  isEdit?: boolean;
  saving?: boolean;
}

export function ActionButtons({
  onSave,
  onClose,
  onWhatsApp,
  disabled,
  saved,
  isEdit,
  saving,
}: ActionButtonsProps) {
  return (
    <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 shadow-xs text-[#292D29]">
      <div className="grid gap-2.5">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {/* [ Save Bill ] */}
          <button
            id="billing-save-button"
            disabled={disabled}
            type="button"
            onClick={onSave}
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${
              saved
                ? "border-[#5F7A62] bg-[#E8ECE5] text-[#5F7A62]"
                : "border-[#6F776D] bg-[#6F776D] text-[#FFFFFF] hover:bg-[#2F352F] shadow-xs"
            }`}
          >
            <Save size={16} />
            {saving
              ? "Saving..."
              : saved
                ? isEdit
                  ? "Updated ✓"
                  : "Saved ✓"
                : isEdit
                  ? "Update Invoice"
                  : "Save Bill"}
          </button>

          {/* [ 🟢 Open WhatsApp ] */}
          <button
            id="billing-open-whatsapp-button"
            disabled={!saved}
            type="button"
            onClick={onWhatsApp}
            title={
              !saved
                ? "Save the bill first to open WhatsApp"
                : "Open WhatsApp with pre-filled invoice message"
            }
            className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 ${
              saved
                ? "border-[#25D366] bg-[#25D366] text-[#FFFFFF] hover:bg-[#1EBE5D] shadow-xs cursor-pointer active:scale-[0.98]"
                : "border-[#E0E4DD] bg-[#F7F7F4] text-[#8C9389] opacity-50 cursor-not-allowed pointer-events-none"
            }`}
          >
            <span
              className={`inline-block size-2 rounded-full shrink-0 ${
                saved ? "bg-[#FFFFFF] animate-pulse" : "bg-[#8C9389]"
              }`}
            />
            <WhatsAppBrandIcon
              size={16}
              className={saved ? "text-[#FFFFFF]" : "text-[#8C9389]"}
            />
            <span>Open WhatsApp</span>
          </button>
        </div>

        {/* [ Close ] */}
        <button
          id="billing-close-button"
          type="button"
          onClick={onClose}
          className="flex h-11 items-center justify-center gap-2 rounded-xl border border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5] text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 cursor-pointer"
        >
          <X size={16} />
          Close
        </button>
      </div>
    </section>
  );
}
