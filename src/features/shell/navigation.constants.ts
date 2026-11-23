import type { SolidIconName } from "../../shared/ui/SolidIcon";
import type { View } from "./view.types";
export const navItems: Array<{ id: View; label: string; hint: string; icon: SolidIconName }> = [
  { id:"home", label:"home", hint:"now playing", icon:"home" }, { id:"library", label:"library", hint:"all songs", icon:"library" }, { id:"albums", label:"albums", hint:"browse full albums", icon:"album" }, { id:"discover", label:"discover", hint:"new music", icon:"discover" }, { id:"analytics", label:"analytics", hint:"stats", icon:"analytics" }, { id:"downloads", label:"downloads", hint:"imports", icon:"download" }, { id:"settings", label:"settings", hint:"controls", icon:"settings" }
];
export const sidebarNavGroups: Array<{ id:"library"|"tools"|"app"; label:string; itemIds:View[] }> = [
  { id:"library", label:"library", itemIds:["home","library","albums","discover"] }, { id:"tools", label:"tools", itemIds:["downloads","analytics"] }, { id:"app", label:"app", itemIds:["settings"] }
];

export const DESKTOP_ONLY_VIEWS = new Set<View>(["downloads"]);

export const libraryViews: readonly View[] = ["library", "albums", "artists", "genres", "playlists", "liked"];
export const primaryNavigationView = (view: View): View => view === "albums" ? "albums" : libraryViews.includes(view) ? "library" : view;
