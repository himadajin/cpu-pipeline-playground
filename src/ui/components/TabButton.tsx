import clsx from "clsx";
import type { ReactNode } from "react";

export function TabButton<T extends string>({
  id,
  active,
  onSelect,
  children,
}: {
  id: T;
  active: boolean;
  onSelect: (id: T) => void;
  children: ReactNode;
}) {
  return (
    <button
      className={clsx("tab-button", active && "active")}
      type="button"
      onClick={() => onSelect(id)}
      aria-pressed={active}
    >
      {children}
    </button>
  );
}
