import { Save, X } from "lucide-react";

interface ActionButtonsProps {
  onSave?: () => void;
  onClose?: () => void;
  onWhatsApp?: () => void;
  disabled?: boolean;
  saved?: boolean;
  isEdit?: boolean;
}

export function ActionButtons({
  onSave,
  onClose,
  onWhatsApp,
  disabled,
  saved,
  isEdit,
}: ActionButtonsProps) {
  const handleActionClick = (label: string) => {
    if (
      (label === "Save Bill" ||
        label === "Saved ✓" ||
        label === "Update Invoice" ||
        label === "Updated ✓") &&
      onSave
    ) {
      onSave();
    } else if (label === "Close" && onClose) {
      onClose();
    }
  };

  const actions = [
    {
      label: saved
        ? isEdit
          ? "Updated ✓"
          : "Saved ✓"
        : isEdit
          ? "Update Invoice"
          : "Save Bill",
      icon: Save,
      tone: "primary",
    },
    { label: "Close", icon: X, tone: "neutral" },
  ] as const;

  return (
    <section className="rounded-2xl border border-[#E0E4DD] bg-[#FFFFFF] p-4 shadow-xs text-[#292D29]">
      <div className="grid gap-2.5">
        {actions.map((action) => {
          const Icon = action.icon;
          const isPrimary = action.tone === "primary";
          const className =
            action.tone === "primary"
              ? "border-[#6F776D] bg-[#6F776D] text-[#FFFFFF] hover:bg-[#2F352F] shadow-xs"
              : "border-[#E0E4DD] bg-[#F7F7F4] text-[#747A72] hover:border-[#6F776D] hover:text-[#2F352F] hover:bg-[#E8ECE5]";

          return (
            <button
              key={action.label}
              disabled={isPrimary && disabled}
              type="button"
              onClick={() => handleActionClick(action.label)}
              className={`flex h-11 items-center justify-center gap-2 rounded-xl border text-xs font-bold uppercase tracking-wider transition hover:-translate-y-0.5 cursor-pointer disabled:opacity-50 disabled:pointer-events-none ${className}`}
            >
              <Icon size={16} />
              {action.label}
            </button>
          );
        })}
      </div>
    </section>
  );
}
