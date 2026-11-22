import { useRef, type ReactNode, type MouseEvent, type PointerEvent } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "motion/react";
import { useModalFocus } from "../hooks/useModalFocus";

type Props = {
  open: boolean; onClose: () => void; children: ReactNode;
  className: string; backdropClassName: string;
  label?: string; labelledBy?: string; describedBy?: string;
  role?: "dialog" | "alertdialog"; portal?: boolean; dismissible?: boolean;
  animated?: boolean;
};

export default function Dialog({ open, onClose, children, className, backdropClassName,
  label, labelledBy, describedBy, role = "dialog", portal = true,
  dismissible = true, animated = true }: Props) {
  const dialogRef = useModalFocus<HTMLDivElement>(open);
  const reduced = useReducedMotion();
  const pointerStart = useRef<{ x: number; y: number; target: EventTarget | null } | null>(null);
  if (!open) return null;
  const isTop = () => Array.from(document.querySelectorAll('[aria-modal="true"]')).at(-1) === dialogRef.current;
  const onPointerDown = (event: PointerEvent<HTMLDivElement>) => {
    pointerStart.current = { x: event.clientX, y: event.clientY, target: event.target };
  };
  const onBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    const start = pointerStart.current;
    pointerStart.current = null;
    if (!dismissible || !isTop() || event.target !== event.currentTarget ||
        !start || start.target !== event.currentTarget ||
        Math.hypot(event.clientX - start.x, event.clientY - start.y) > 6) return;
    onClose();
  };
  const body = <div className={backdropClassName} onPointerDown={onPointerDown} onClick={onBackdropClick}>
    <motion.div ref={dialogRef} tabIndex={-1} role={role} aria-modal="true" aria-label={label}
      aria-labelledby={labelledBy} aria-describedby={describedBy} className={className}
      initial={reduced || !animated ? false : { opacity: 0, scale: .97, y: 10 }}
      animate={animated && !reduced ? { opacity: 1, scale: 1, y: 0 } : undefined}
      transition={{ duration: reduced || !animated ? 0 : .2, ease: [0.22, 1, 0.36, 1] }}
      onClick={event => event.stopPropagation()}
      onKeyDown={event => { if (event.key === "Escape" && !event.defaultPrevented && dismissible && isTop()) {
        event.preventDefault(); event.stopPropagation(); onClose();
      } }}>
      {children}
    </motion.div>
  </div>;
  return portal ? createPortal(body, document.querySelector(".app") || document.body) : body;
}
