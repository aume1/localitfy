import type { PointerEvent as ReactPointerEvent } from "react";

type SessionCallbacks = {
  move: (x: number, y: number) => void;
  finish: (apply: boolean, x: number, y: number) => void;
};

export function startTrackPointerSession(event: ReactPointerEvent<HTMLElement>, callbacks: SessionCallbacks) {
  const id = event.pointerId;
  const startX = event.clientX, startY = event.clientY;
  let x = startX, y = startY, active = false, ended = false, frame = 0;
  let lastX = NaN, lastY = NaN, lastScroll = NaN;
  const scroller = event.currentTarget.closest<HTMLElement>(".content");
  const capture = scroller ?? event.currentTarget;
  const tick = () => {
    frame = 0;
    if (ended || !active) return;
    if (!capture.isConnected) { finish(false); return; }
    if (scroller) {
      const rect = scroller.getBoundingClientRect();
      const edge = Math.min(56, rect.height / 4);
      const velocity = y < rect.top + edge ? -Math.min(18, (rect.top + edge - y) / 3) : y > rect.bottom - edge ? Math.min(18, (y - rect.bottom + edge) / 3) : 0;
      if (velocity && x >= rect.left && x <= rect.right) scroller.scrollTop += velocity;
    }
    const scroll = scroller?.scrollTop ?? 0;
    if (lastX !== x || lastY !== y || lastScroll !== scroll) {
      lastX = x; lastY = y; lastScroll = scroll;
      callbacks.move(x, y);
    }
    frame = requestAnimationFrame(tick);
  };
  const onMove = (next: PointerEvent) => {
    if (next.pointerId !== id) return;
    x = next.clientX; y = next.clientY;
    if (!active && Math.hypot(x - startX, y - startY) < 7) return;
    active = true;
    next.preventDefault();
    if (!frame) frame = requestAnimationFrame(tick);
  };
  const onUp = (next: PointerEvent) => {
    if (next.pointerId !== id) return;
    x = next.clientX; y = next.clientY;
    finish(active || Math.hypot(x - startX, y - startY) >= 7);
  };
  const onCancel = (next: PointerEvent) => { if (next.pointerId === id) finish(false); };
  const onLostCapture = (next: PointerEvent) => { if (next.target === capture) onCancel(next); };
  const onKey = (next: KeyboardEvent) => { if (next.key === "Escape") { next.preventDefault(); finish(false); } };
  const cancel = () => finish(false);
  function finish(apply: boolean) {
    if (ended) return;
    ended = true;
    cancelAnimationFrame(frame);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    window.removeEventListener("keydown", onKey);
    window.removeEventListener("blur", cancel);
    capture.removeEventListener("lostpointercapture", onLostCapture);
    if (capture.hasPointerCapture(id)) capture.releasePointerCapture(id);
    callbacks.finish(apply, x, y);
  }
  window.addEventListener("pointermove", onMove, { passive: false });
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  window.addEventListener("keydown", onKey);
  window.addEventListener("blur", cancel);
  capture.addEventListener("lostpointercapture", onLostCapture);
  try { capture.setPointerCapture(id); } catch { /* Window listeners still own the gesture. */ }
  return cancel;
}

export function trackReorderDirection(event: Pick<KeyboardEvent, "key" | "altKey" | "ctrlKey" | "metaKey">): -1 | 1 | null {
  if (!event.altKey || event.ctrlKey || event.metaKey) return null;
  return event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : null;
}
