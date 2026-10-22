import { useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { isPlayableSong } from "../library/library.utils";
import type { Song } from "../library/song.types";

const RADIO_BATCH = 10;
const RADIO_SEEDS = 5;
const RADIO_HISTORY = 100;
const RADIO_TAGGED = 500;
/** Recent radio picks are not offered again straight away, even if they were skipped over unplayed. */
const RADIO_RECENT_PICKS = 30;

export type RadioCheck = {
  enabled: boolean;
  isPlaying: boolean;
  currentSongId: string;
  hasQueued: boolean;
  /** The current song is the last one that was queued, so the queue has just run out. */
  atQueueEnd: boolean;
  /** Normal playback has somewhere to go next (the next library song, the rest of a playlist). */
  continues: boolean;
  alreadyRequested: boolean;
};

/** Radio tops up the queue once it has run out, or when playback would otherwise stop. */
export function shouldStartRadio(check: RadioCheck) {
  if (!check.enabled || !check.isPlaying || !check.currentSongId || check.hasQueued || check.alreadyRequested) return false;
  return check.atQueueEnd || !check.continues;
}

function artistKey(song: Song | undefined) {
  return String(song?.artist || "").split(/\s+(?:feat\.?|ft\.?|with|x)\s+|,|&/i)[0].trim().toLowerCase();
}

/**
 * Best matches first, skipping songs heard this session, songs already queued, and anything unplayable.
 * At most `perArtist` songs from one artist, unless there aren't enough other matches to fill the batch.
 */
export function pickRadioSongs(matchIds: readonly string[], exclude: ReadonlySet<string>, songsById: Map<string, Song>, count = RADIO_BATCH, perArtist = 2) {
  const candidates = matchIds.filter((id, index) => !exclude.has(id) && matchIds.indexOf(id) === index && isPlayableSong(songsById.get(id)));
  const picked: string[] = [];
  const perArtistCount = new Map<string, number>();
  for (const id of candidates) {
    if (picked.length >= count) break;
    const artist = artistKey(songsById.get(id));
    if (artist && (perArtistCount.get(artist) || 0) >= perArtist) continue;
    picked.push(id);
    if (artist) perArtistCount.set(artist, (perArtistCount.get(artist) || 0) + 1);
  }
  for (const id of candidates) {
    if (picked.length >= count) break;
    if (!picked.includes(id)) picked.push(id);
  }
  return picked;
}

/** A radio search only counts for the song it was started for, while radio is still on and the hook is mounted. */
export function radioResultApplies(result: { status: string; seedId: string }, songId: string, live: { active: boolean; currentSongId: string }) {
  return live.active && live.currentSongId === songId && result.status === "ready" && result.seedId === `radio:${songId}`;
}

/** Queue update for a refill: whatever the user queued while the search ran stays as it is. */
export function fillEmptyQueue(ids: string[], songsById: Map<string, Song>) {
  return (current: string[]) => current.some((id) => isPlayableSong(songsById.get(id))) ? current : ids;
}

/** The last few distinct songs heard, most recent last. */
export function radioSeeds(history: readonly string[], count = RADIO_SEEDS) {
  const seeds: string[] = [];
  for (let index = history.length - 1; index >= 0 && seeds.length < count; index -= 1) {
    if (!seeds.includes(history[index])) seeds.unshift(history[index]);
  }
  return seeds;
}

type SongRadioOptions = {
  enabled: boolean;
  isPlaying: boolean;
  currentSongId: string;
  queue: string[];
  setQueue: Dispatch<SetStateAction<string[]>>;
  songsById: Map<string, Song>;
  continues: boolean;
  onRefill?: (count: number) => unknown;
};

/**
 * Song radio: when the queue runs out, queue songs that sound like the last few you heard.
 * Returns the IDs radio added so the queue can label them.
 */
export function useSongRadio({ enabled, isPlaying, currentSongId, queue, setQueue, songsById, continues, onRefill }: SongRadioOptions) {
  const queueTailRef = useRef("");
  const historyRef = useRef<string[]>([]);
  const requestedRef = useRef("");
  const requestVersionRef = useRef(0);
  const recentPicksRef = useRef<string[]>([]);
  const onRefillRef = useRef(onRefill);
  onRefillRef.current = onRefill;
  const queueRef = useRef(queue);
  queueRef.current = queue;
  const mountedRef = useRef(false);
  const liveRef = useRef({ enabled, currentSongId });
  liveRef.current = { enabled, currentSongId };
  const [radioSongIds, setRadioSongIds] = useState<ReadonlySet<string>>(() => new Set());

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  useEffect(() => {
    if (queue.length) queueTailRef.current = queue[queue.length - 1];
  }, [queue]);

  // Toggling radio off invalidates pending lookups; re-enabling may retry this song.
  useEffect(() => {
    if (!enabled) { requestedRef.current = ""; requestVersionRef.current += 1; }
  }, [enabled]);

  useEffect(() => {
    if (!currentSongId || historyRef.current.at(-1) === currentSongId) return;
    historyRef.current = [...historyRef.current, currentSongId].slice(-RADIO_HISTORY);
  }, [currentSongId]);

  const hasQueued = queue.some((id) => isPlayableSong(songsById.get(id)));
  const start = shouldStartRadio({ enabled, isPlaying, currentSongId, hasQueued, continues,
    atQueueEnd: currentSongId === queueTailRef.current, alreadyRequested: requestedRef.current === currentSongId });

  useEffect(() => {
    if (!start) return;
    requestedRef.current = currentSongId;
    const requestVersion = ++requestVersionRef.current;
    const seeds = radioSeeds(historyRef.current);
    const songId = currentSongId;
    void window.localitfy.findSimilarSongs({ songIds: seeds, seedKey: `radio:${songId}`, limit: 50 }).then((result) => {
      // The song may have changed, or radio been switched off by repeat or shuffle, while the search ran.
      const live = liveRef.current;
      if (requestVersionRef.current !== requestVersion || !radioResultApplies(result, songId, { active: mountedRef.current && live.enabled, currentSongId: live.currentSongId })) return;
      const ids = pickRadioSongs(result.matches.map((match) => match.songId), new Set([...historyRef.current, ...recentPicksRef.current]), songsById);
      if (!ids.length) return;
      // Never replace something the user queued while the search ran.
      if (queueRef.current.some((id) => isPlayableSong(songsById.get(id)))) return;
      setQueue(fillEmptyQueue(ids, songsById));
      recentPicksRef.current = [...recentPicksRef.current, ...ids].slice(-RADIO_RECENT_PICKS);
      setRadioSongIds((previous) => new Set([...previous, ...ids].slice(-RADIO_TAGGED)));
      onRefillRef.current?.(ids.length);
    }).catch(() => undefined);
  }, [start, currentSongId, songsById, setQueue]);

  return radioSongIds;
}
