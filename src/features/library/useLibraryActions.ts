import { useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useStableCallback } from "../../shared/hooks/useStableCallback";
import { patchLibrarySong, replaceLibrarySong } from "../search/incrementalLibraryIndex";
import { prettyTitle } from "../search/search.utils";
import type { AppToastKind } from "../shell/view.types";
import type { Song } from "./song.types";
import { createSongMutationQueue } from "./songMutationQueue";

type Options = {
  getSong: (id: string, hint?: number) => Song | undefined;
  songIndexById: ReadonlyMap<string, number>;
  setSongs: Dispatch<SetStateAction<Song[]>>;
  setEditorSong: Dispatch<SetStateAction<Song | null>>;
  invalidateSource: (song: Song | undefined) => void;
  showAppToast: (message: string, kind?: AppToastKind) => void;
};

export function useLibraryActions({getSong, songIndexById, setSongs, setEditorSong, invalidateSource, showAppToast}: Options) {
  const get = useStableCallback((id: string) => getSong(id, songIndexById.get(id)));
  const apply = useStableCallback((id: string, patch: Partial<Song>) => {
    setSongs(items => patchLibrarySong(items, id, patch, songIndexById.get(id)));
    setEditorSong(current => current?.id === id ? {...current, ...patch} : current);
  });
  const failed = useStableCallback(() => showAppToast("Could not save song changes", "error"));
  const [writer] = useState(() => createSongMutationQueue({get, apply, failed, write: (id, patch) => window.localitfy.patchSong(id, patch)}));
  const replaceSong = useStableCallback((updated: Song | null) => {
    if (!updated) return;
    setSongs(items => replaceLibrarySong(items, updated, songIndexById.get(updated.id)));
    setEditorSong(current => current?.id === updated.id ? updated : current);
  });
  const commitCovers = useStableCallback((updates: Map<string, Partial<Song>>) => {
    setSongs(items => items.map(song => updates.has(song.id) ? {...song, ...updates.get(song.id)} : song));
    setEditorSong(current => current && updates.has(current.id) ? {...current, ...updates.get(current.id)} : current);
  });
  const saveSongEdit = useStableCallback(async (id: string, patch: Partial<Song>) => {
    if (Object.hasOwn(patch, "filePath") || Object.hasOwn(patch, "url")) invalidateSource(get(id));
    return writer.patchSong(id, patch);
  });
  const patchSongLocal = useStableCallback(async (id: string, patch: Partial<Song>) => { await saveSongEdit(id, patch); });
  const toggleLike = useStableCallback((id: string) => {
    const target = get(id);
    if (!target) return;
    const liked = !target.liked;
    void writer.patchSong(id, {liked}).then(saved => {
      if (saved && get(id)?.liked === liked) showAppToast(liked ? `added "${prettyTitle(target.title, 5)}" to liked` : `removed "${prettyTitle(target.title, 5)}" from liked`, liked ? "success" : "info");
    });
  });
  return {replaceSong, commitCovers, patchSongLocal, saveSongEdit, toggleLike, flushSongEdits: writer.flush};
}
