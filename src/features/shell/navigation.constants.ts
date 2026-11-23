import { BarChart3, Compass, Disc3, Download, Home, LibraryBig, Settings as SettingsIcon } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import type { View } from "./view.types";
export const navItems: Array<{ id: View; label: string; hint: string; icon: LucideIcon }> = [
  { id:"home", label:"home", hint:"now playing", icon:Home }, { id:"library", label:"library", hint:"all songs", icon:LibraryBig }, { id:"albums", label:"albums", hint:"browse full albums", icon:Disc3 }, { id:"discover", label:"discover", hint:"new music", icon:Compass }, { id:"analytics", label:"analytics", hint:"stats", icon:BarChart3 }, { id:"downloads", label:"downloads", hint:"imports", icon:Download }, { id:"settings", label:"settings", hint:"controls", icon:SettingsIcon }
];
export const sidebarNavGroups: Array<{ id:"library"|"tools"|"app"; label:string; itemIds:View[] }> = [
  { id:"library", label:"library", itemIds:["home","library","albums","discover"] }, { id:"tools", label:"tools", itemIds:["downloads","analytics"] }, { id:"app", label:"app", itemIds:["settings"] }
];

export const DESKTOP_ONLY_VIEWS = new Set<View>(["downloads"]);

export const libraryViews: readonly View[] = ["library", "albums", "artists", "genres", "playlists", "liked"];
export const primaryNavigationView = (view: View): View => view === "albums" ? "albums" : libraryViews.includes(view) ? "library" : view;
