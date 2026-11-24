type TimerClock = {
  now: () => number;
  schedule: (callback: () => void, delay: number) => number;
  clear: (id: number) => void;
};

export function createSleepTimer(deadline: number, expire: () => void, clock: TimerClock) {
  let handle: number | null = null;
  let finished = false;
  const cancel = () => {
    finished = true;
    if (handle !== null) clock.clear(handle);
    handle = null;
  };
  const check = () => {
    if (finished) return;
    if (handle !== null) clock.clear(handle);
    handle = null;
    const remaining = deadline - clock.now();
    if (remaining <= 0) {
      finished = true;
      expire();
    } else {
      handle = clock.schedule(check, Math.min(remaining, 2_147_483_647));
    }
  };
  check();
  return { check, cancel };
}
