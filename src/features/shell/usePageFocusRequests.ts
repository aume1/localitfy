import { useState } from "react";
import type { View } from "./view.types";

type FocusRequest<K extends string> = Record<K, string> & { nonce: number };

/**
 * One-shot requests that open a specific album, artist or genre drawer after navigating to its page
 * (used by the player bar and song menus). Each page clears its request once handled.
 */
export function usePageFocusRequests(changeView: (view: View, source?: "unknown") => unknown) {
  const [albumFocusRequest, setAlbumFocusRequest] = useState<FocusRequest<"albumId"> | null>(null);
  const [artistFocusRequest, setArtistFocusRequest] = useState<FocusRequest<"artistId"> | null>(null);
  const [genreFocusRequest, setGenreFocusRequest] = useState<FocusRequest<"genreId"> | null>(null);

  return {
    albumFocusRequest,
    artistFocusRequest,
    genreFocusRequest,
    clearAlbumFocusRequest: () => setAlbumFocusRequest(null),
    clearArtistFocusRequest: () => setArtistFocusRequest(null),
    clearGenreFocusRequest: () => setGenreFocusRequest(null),
    openAlbumPage(albumId: string) {
      setAlbumFocusRequest({ albumId, nonce: Date.now() });
      changeView("albums", "unknown");
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
