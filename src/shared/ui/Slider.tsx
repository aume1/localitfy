// Adapted from tryliner/desktop src/shared/ui/Slider.tsx and
// src/features/player/ui/TimelineSlider.tsx (54eaab9).
// Use a native input to preserve Localtify's pointer, keyboard and clock refs.
import type { ComponentPropsWithRef } from "react";
type SliderProps = Omit<ComponentPropsWithRef<"input">, "type">;
export function Slider({ className = "", ...props }: SliderProps) {
  return <input {...props} className={`ltRange ${className}`.trim()} type="range" />;
}
