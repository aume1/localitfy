import { createContext, useContext } from "react";
import { useReducedMotion } from "motion/react";

export const AppReducedMotionContext = createContext(false);

export function useAppReducedMotion() {
  const appReduced = useContext(AppReducedMotionContext);
  const systemReduced = useReducedMotion();
  return appReduced || Boolean(systemReduced);
}
