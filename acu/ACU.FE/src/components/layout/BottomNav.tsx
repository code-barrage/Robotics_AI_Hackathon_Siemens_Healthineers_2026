import type { AppTab } from "../../types";
import type { NavItem } from "./NavTabs";

interface Props {
  items: NavItem[];
  active: AppTab;
  onChange: (tab: AppTab) => void;
}

/** Fixed bottom tab bar used on phones (<768px). */
export default function BottomNav({ items, active, onChange }: Props) {
  return (
    <nav className="bottom-nav" aria-label="Primary mobile">
      {items.map((item) => {
        const isActive = item.id === active;
        return (
          <button
            key={item.id}
            type="button"
            aria-current={isActive ? "page" : undefined}
            className={`bottom-nav-item ${isActive ? "active" : ""}`}
            onClick={() => onChange(item.id)}
          >
            <span className="icon" aria-hidden>{item.icon}</span>
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
