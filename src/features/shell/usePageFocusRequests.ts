import { useState } from "react";
import type { View } from "./view.types";
import type { NowPlayingContext } from "../player/playbackSource";

type FocusRequest<K extends string> = Record<K, string> & { nonce: number };

/**
 * One-shot requests that open a specific album, artist or genre drawer after navigating to its page
 * (used by the player bar and song menus). Each page clears its request once handled.
 */
export function usePageFocusRequests(changeView: (view: View, source?: "unknown") => unknown) {
  const [albumFocusRequest, setAlbumFocusRequest] = useState<FocusRequest<"albumId"> | null>(null);
  const [artistFocusRequest, setArtistFocusRequest] = useState<FocusRequest<"artistId"> | null>(null);
  const [genreFocusRequest, setGenreFocusRequest] = useState<FocusRequest<"genreId"> | null>(null);

  const openAlbumPage = (albumId: string) => {
    setAlbumFocusRequest({ albumId, nonce: Date.now() });
    changeView("albums", "unknown");
  };

  return {
    albumFocusRequest,
    artistFocusRequest,
    genreFocusRequest,
    clearAlbumFocusRequest: () => setAlbumFocusRequest(null),
    clearArtistFocusRequest: () => setArtistFocusRequest(null),
    clearGenreFocusRequest: () => setGenreFocusRequest(null),
    openAlbumPage,
    goToSongAlbum(songId: string, albumIds: Map<string, string>, onMissing: () => void) {
      const albumId = albumIds.get(songId);
      if (albumId) openAlbumPage(albumId);
      else onMissing();
    },
    revealNowPlaying(context: NowPlayingContext, selectPlaylist: (id: string) => unknown) {
      if (context.kind === "playlist") {
        selectPlaylist(context.id);
        changeView("playlists", "unknown");
      } else if (context.kind === "album") openAlbumPage(context.id);
      else if (context.kind === "artist") {
        setArtistFocusRequest({ artistId: context.id.trim().toLocaleLowerCase(), nonce: Date.now() });
        changeView("artists", "unknown");
      } else if (context.kind === "genre") {
        setGenreFocusRequest({ genreId: context.id, nonce: Date.now() });
        changeView("genres", "unknown");
      } else changeView("library", "unknown");
    },
    openArtistPage(artistName: string) {
      const artistId = artistName.trim().toLocaleLowerCase();
      if (!artistId) return;
      setArtistFocusRequest({ artistId, nonce: Date.now() });
      changeView("artists", "unknown");
    },
    openGenrePage(genreId: string) {
      setGenreFocusRequest({ genreId, nonce: Date.now() });
      changeView("genres", "unknown");
    }
  };
}
