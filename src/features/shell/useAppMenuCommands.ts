import { useEffect, useRef } from "react";
import type { View } from "./view.types";

const MENU_VIEWS = new Set<View>(["home", "library", "liked", "artists", "genres", "albums", "playlists", "downloads", "covers", "analytics", "settings"]);
// Page search fields. Playlists reuses the header input for naming a new playlist, so it has no search.
const SEARCH_SELECTOR = ".content :is(.librarySearch, .pageHeaderSearch:not(.playlistCreateForm *), .coverStudioSearchInput, #settings-section-search)";

export type AppMenuActions = {
  changeView: (view: View) => void;
  openSettings: () => void;
  importSongs: () => unknown;
  importAlbumFolder: () => unknown;
  openFeedback: () => void;
  checkForUpdates: () => unknown;
};

/** Focuses the first element matching selector once the next view has rendered. */
function focusWhenReady(selector: string, attempts = 12) {
  const element = document.querySelector<HTMLInputElement>(selector);
  if (element) {
    element.focus();
    element.select?.();
    return;
  }
  if (attempts > 0) window.setTimeout(() => focusWhenReady(selector, attempts - 1), 50);
}

/** Handles commands from the native macOS menu bar (electron/runtime/app-menu.cjs). */
export function useAppMenuCommands(actions: AppMenuActions) {
  const actionsRef = useRef(actions);
  actionsRef.current = actions;

  useEffect(() => window.localitfy.onAppMenuCommand?.((command) => {
    const current = actionsRef.current;
    switch (command?.type) {
      case "navigate":
        if (MENU_VIEWS.has(command.view as View)) current.changeView(command.view as View);
        break;
      case "settings":
        current.openSettings();
        break;
      case "import-music":
        void current.importSongs();
        break;
      case "import-album-folder":
        current.changeView("albums");
        void current.importAlbumFolder();
        break;
      case "new-playlist":
        current.changeView("playlists");
        focusWhenReady(".playlistCreateForm input");
        break;
      case "find":
        if (!document.querySelector(SEARCH_SELECTOR)) current.changeView("library");
        focusWhenReady(SEARCH_SELECTOR);
        break;
      case "feedback":
        current.openFeedback();
        break;
      case "check-updates":
        void current.checkForUpdates();
        break;
    }
  }), []);
}
