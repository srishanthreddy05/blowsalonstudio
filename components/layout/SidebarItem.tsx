"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LucideIcon } from "lucide-react";

interface SidebarItemProps {
  label: string;
  href: string;
  icon: LucideIcon | React.ComponentType<{ size?: number; strokeWidth?: number; className?: string }>;
  collapsed: boolean;
  onClick?: () => void;
}

export function SidebarItem({
  label,
  href,
  icon: Icon,
  collapsed,
  onClick,
}: SidebarItemProps) {
  const pathname = usePathname();
  const isActive = pathname === href;

  return (
    <Link
      href={href}
      onClick={onClick}
      className={`group flex h-11 w-full items-center gap-3 rounded-xl px-3 text-sm font-semibold transition-all duration-200 ${
        isActive
          ? "bg-[#E8ECE5] text-[#2F352F] font-bold shadow-xs"
          : "text-[#747A72] hover:bg-[#F7F7F4] hover:text-[#292D29]"
      } ${collapsed ? "justify-center" : "justify-start"}`}
    >
      <Icon
        size={19}
        strokeWidth={isActive ? 2.3 : 1.9}
        className={isActive ? "text-[#6F776D]" : "transition-colors text-[#747A72] group-hover:text-[#292D29]"}
      />
      {!collapsed && <span className="truncate">{label}</span>}
    </Link>
  );
}
