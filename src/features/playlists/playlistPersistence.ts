import type { Playlist } from "./playlist.types";
import { rebasePlaylists } from "./playlistMerge";

export const samePlaylists = (a: Playlist[], b: Playlist[]) => JSON.stringify(a) === JSON.stringify(b);

export function createPlaylistPersistence({ read, save, publish, journal, failed }: {
  read: () => Promise<Playlist[]>;
  save: (next: Playlist[], expected: Playlist[]) => Promise<Playlist[]>;
  publish: (next: Playlist[]) => void;
  journal: (base: Playlist[], draft: Playlist[]) => void;
  failed: (error: unknown) => void;
}) {
  let base: Playlist[] = [], draft: Playlist[] = [], initialized = false, remoteChanged = false;
  let pending: Promise<boolean> | null = null;
  const persistDraft = () => journal(base, draft);
  const adopt = (remote: Playlist[]) => {
    draft = rebasePlaylists(base, draft, remote).playlists;
    base = remote;
    persistDraft();
    publish(draft);
  };
  async function drain() {
    try {
      for (let retry = 0; retry < 8; retry++) {
        remoteChanged = false;
        const remote = await read();
        if (!samePlaylists(base, remote)) adopt(remote);
        if (samePlaylists(base, draft)) {
          if (remoteChanged) continue;
          persistDraft();
          return true;
        }
        const sent = draft;
        let saved: Playlist[];
        try { saved = await save(sent, base); }
        catch (error) {
          if (/playlist conflict/i.test(String(error))) continue;
          throw error;
        }
        draft = rebasePlaylists(sent, draft, saved).playlists;
        base = saved;
        persistDraft();
        publish(draft);
        if (!remoteChanged && samePlaylists(base, draft)) return true;
      }
      throw new Error("Playlist changes are still pending. Retry to save.");
    } catch (error) {
      persistDraft();
      failed(error);
      return false;
    }
  }
  function flush() {
    if (!initialized) return Promise.resolve(true);
    if (pending) return pending;
    pending = drain().finally(() => { pending = null; });
    return pending;
  }
  return {
    initialize(remote: Playlist[], recovery?: { base: Playlist[]; draft: Playlist[] }) {
      base = remote;
      draft = recovery ? rebasePlaylists(recovery.base, recovery.draft, remote).playlists : remote;
      initialized = true;
      persistDraft();
      publish(draft);
    },
    current: () => draft,
    set(next: Playlist[]) {
      if (samePlaylists(draft, next)) return;
      draft = next;
      persistDraft();
      publish(draft);
      if (initialized) void flush();
    },
    remote(next: Playlist[]) {
      if (!initialized) return;
      if (pending) { remoteChanged = true; return; }
      adopt(next);
      if (!samePlaylists(base, draft)) void flush();
    },
    flush
  };
}
