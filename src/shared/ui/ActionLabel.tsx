import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/** Icon + text content for view action buttons (play, shuffle, queue, delete…). */
export function ActionLabel({ icon: Icon, children }: { icon: LucideIcon; children: ReactNode }) {
  return (
    <>
      <Icon className="actionLabelIcon" size={15} strokeWidth={2.4} aria-hidden="true" />
      <span className="actionLabelText">{children}</span>
    </>
  );
}
