import type { ReactNode } from "react";
import type { AppTab } from "../../types";

export interface NavItem {
  id: AppTab;
  label: string;
  icon: ReactNode;
  badge?: number;
  badgeTone?: "brand" | "neutral";
}

interface Props {
  items: NavItem[];
  active: AppTab;
  onChange: (tab: AppTab) => void;
}

/** Sticky horizontal tab strip used on tablet/desktop (≥768px). */
export default function NavTabs({ items, active, onChange }: Props) {
  return (
    <nav className="nav-tabs" aria-label="Primary">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            className={`nav-tab ${isActive ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <span aria-hidden>{item.icon}</span>
            <span>{item.label}</span>
            {item.badge !== undefined && item.badge > 0 && (
              <span className={`badge ${item.badgeTone === "neutral" ? "neutral" : ""}`}>
                {item.badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  );
}
