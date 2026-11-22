import type { ComponentPropsWithRef } from "react";
type SliderProps = Omit<ComponentPropsWithRef<"input">, "type">;
export function Slider({ className = "", ...props }: SliderProps) {
  return <input {...props} className={`ltRange ${className}`.trim()} type="range" />;
}
