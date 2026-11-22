// Adapted from tryliner/desktop src/shared/ui/ScrollableRow.tsx and
// src/shared/hooks/useHorizontalScroll.ts (54eaab9).
// Copyright (c) 2024-2026 Liner Project Contributors & feralbureau.
// Reused under the separate authorization reported by Localtify's maintainer.
import { useRef, type ComponentPropsWithoutRef, type PointerEvent } from "react";

/** Keep native touch/wheel scrolling. Capture mouse drags only after a
 * threshold so card clicks, keyboard activation and context menus work. */
export function ScrollableRow({ className = "", children, ...props }: ComponentPropsWithoutRef<"div">) {
  const drag = useRef<{ id: number; x: number; left: number; moved: boolean } | null>(null);
  const suppressClick = useRef(false);
  function start(event: PointerEvent<HTMLDivElement>) {
    const el = event.currentTarget;
    suppressClick.current = false;
    if (event.pointerType !== "mouse" || event.button !== 0 || el.scrollWidth <= el.clientWidth ||
        (event.target as Element).closest("input,textarea,select,[contenteditable],a")) return;
    drag.current = { id: event.pointerId, x: event.clientX, left: el.scrollLeft, moved: false };
  }
  function finish(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    suppressClick.current = current.moved;
    drag.current = null;
    delete event.currentTarget.dataset.dragging;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function move(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current || current.id !== event.pointerId) return;
    if (event.buttons === 0) { finish(event); return; }
    const delta = event.clientX - current.x;
    if (!current.moved && Math.abs(delta) <= 6) return;
    if (!current.moved) {
      current.moved = true;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.currentTarget.dataset.dragging = "true";
    }
    event.preventDefault();
    event.currentTarget.scrollLeft = current.left - delta;
  }
  return <div {...props} className={className} onPointerDown={start} onPointerMove={move}
    onPointerUp={finish} onPointerCancel={finish} onLostPointerCapture={finish}
    onPointerLeave={event => { if (!drag.current?.moved) finish(event); }}
    onDragStart={event => event.preventDefault()}
    onClickCapture={event => { if (suppressClick.current && event.detail !== 0) {
      suppressClick.current = false; event.preventDefault(); event.stopPropagation();
    } }}>
    {children}
  </div>;
}
