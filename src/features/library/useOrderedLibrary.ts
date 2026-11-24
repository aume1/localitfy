import { useCallback, useEffect, useRef, useState } from "react";
import type { SetStateAction } from "react";
import type { Song, LibraryDropSide } from "./song.types";
import { reorderSongList, saveLibraryOrder } from "./library.utils";
import { runLocaltifyIdleTask } from "../../app/runtime/idle";

export function useOrderedLibrary(ready: boolean) {
  const [songs, publish] = useState<Song[]>([]);
  const current = useRef<Song[]>([]);
  const savedOrder = useRef<string[]>([]);
  const setSongs = useCallback((update: SetStateAction<Song[]>) => {
    const next = typeof update === "function" ? update(current.current) : update;
    current.current = next;
    publish(next);
  }, []);
  const getSong = useCallback((id: string, hint?: number) => {
    const list = current.current;
    return hint !== undefined && list[hint]?.id === id ? list[hint] : list.find(song => song.id === id);
  }, []);
  const persist = useCallback((next: Song[]) => {
    saveLibraryOrder(next);
    savedOrder.current = next.map(song => song.id);
  }, []);
  useEffect(() => {
    if (!ready || (savedOrder.current.length === songs.length && songs.every((song, i) => song.id === savedOrder.current[i]))) return;
    let cancelIdle: (() => void) | undefined;
    const timer = window.setTimeout(() => {
      cancelIdle = runLocaltifyIdleTask(() => persist(current.current), 1600);
    }, 520);
    return () => { window.clearTimeout(timer); cancelIdle?.(); };
  }, [ready, songs, persist]);
  const moveSong = useCallback((id: string, target?: string, side: LibraryDropSide = "after") => {
    const previous = current.current;
    const last = previous[previous.length - 1]?.id;
    const next = reorderSongList(previous, id, target ?? last ?? "", side);
    if (next === previous || next.every((song, i) => song.id === previous[i]?.id)) return false;
    setSongs(next);
    persist(next);
    return true;
  }, [persist, setSongs]);
  return {songs, setSongs, getSong, moveSong};
}
