import type { Song } from "./song.types";

type Field = keyof Song;
type Lane = {tail: Promise<void>; confirmed: Map<Field, unknown>; latest: Map<Field, number>; version: number};

export function createSongMutationQueue(options: {
  get: (id: string) => Song | undefined;
  apply: (id: string, patch: Partial<Song>) => void;
  write: (id: string, patch: Partial<Song>) => Promise<Song | null>;
  failed: () => void;
}) {
  const lanes = new Map<string, Lane>();
  const patchSong = (id: string, patch: Partial<Song>): Promise<boolean> => {
    const before = options.get(id);
    if (!before) return Promise.resolve(false);
    const keys = Object.keys(patch) as Field[];
    if (!keys.length) return Promise.resolve(true);
    const lane = lanes.get(id) ?? {tail: Promise.resolve(), confirmed: new Map<Field, unknown>(), latest: new Map<Field, number>(), version: 0};
    lanes.set(id, lane);
    const version = ++lane.version;
    for (const key of keys) {
      if (!lane.latest.has(key)) lane.confirmed.set(key, before[key]);
      lane.latest.set(key, version);
    }
    options.apply(id, patch);
    const job = lane.tail.then(async () => {
      let saved: Song | null = null;
      try {
        saved = await options.write(id, patch);
        if (!saved) throw new Error("Song was not saved");
        for (const key of keys) lane.confirmed.set(key, saved[key]);
      } catch { options.failed(); }
      const current = options.get(id);
      const changes: Record<string, unknown> = {};
      for (const key of keys) {
        if (lane.latest.get(key) !== version) continue;
        if (current && Object.is(current[key], patch[key])) changes[key] = lane.confirmed.get(key);
        lane.latest.delete(key);
        lane.confirmed.delete(key);
      }
      if (saved && current) for (const key of Object.keys(saved) as Field[]) {
        if (keys.includes(key) || lane.latest.has(key)) continue;
        if (Object.is(current[key], before[key]) && !Object.is(saved[key], before[key])) changes[key] = saved[key];
      }
      if (current && Object.keys(changes).length) options.apply(id, changes as Partial<Song>);
      if (!lane.latest.size && lane.version === version) lanes.delete(id);
      return Boolean(saved);
    });
    lane.tail = job.then(() => undefined, () => undefined);
    return job;
  };
  async function flush() {
    while (lanes.size) {
      const pending = [...lanes.values()].map(lane => lane.tail);
      await Promise.all(pending);
      if ([...lanes.values()].every(lane => pending.includes(lane.tail))) return lanes.size === 0;
    }
    return true;
  }
  return {patchSong, flush};
}
