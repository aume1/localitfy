import { memo } from "react";
import { motion as Motion } from "motion/react";
import { useAppReducedMotion } from "../../shared/hooks/useAppReducedMotion";

const PAUSE = { left: "M5 5L9 5L9 19L5 19Z", right: "M15 5L19 5L19 19L15 19Z" } as const;
const PLAY = { left: "M7 5L13 8.5L13 15.5L7 19Z", right: "M13 8.5L19 12L19 12L13 15.5Z" } as const;
const SPRING = { type: "spring", stiffness: 260, damping: 26, mass: 0.9 } as const;

type Props = { playing: boolean; className?: string };
const MemoIcon = memo(function PlayerMorphIcon({ playing, className = "" }: Props) {
  const target = playing ? PAUSE : PLAY;
  const reducedMotion = useAppReducedMotion();
  return (
    <svg className={`playerMorphIcon ${className}`.trim()} width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
      <Motion.path animate={{ d: target.left }} transition={reducedMotion ? { duration: 0 } : SPRING} initial={false} />
      <Motion.path animate={{ d: target.right }} transition={reducedMotion ? { duration: 0 } : SPRING} initial={false} />
    </svg>
  );
});

export function PlayerPlayPauseMorphIcon(props: Props) {
  return <MemoIcon {...props} />;
}
