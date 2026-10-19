import { useEffect, useState } from "react";
import type { DailyMixesResult } from "../analysis/analysis.types";
import { localDayKey } from "./homeShelfPicks";

// The last result is shown straight away when Home reopens, then replaced by a fresh answer
// (which also picks up a "Refresh mixes" from Playlists).
let lastMixes: DailyMixesResult | null = null;

/** Today's daily mixes for the Home shelf. `result` stays `null` until the first answer arrives. */
export function useHomeDailyMixes() {
  const [result, setResult] = useState<DailyMixesResult | null>(() => (lastMixes?.day === localDayKey(new Date()) ? lastMixes : null));
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    window.localitfy.getDailyMixes({ refresh: false })
      .then((next) => {
        lastMixes = next;
        if (active) { setResult(next); setFailed(false); }
      })
      .catch(() => {
        if (active) setFailed(true);
      });
    return () => { active = false; };
  }, []);

  return { result, failed };
}
