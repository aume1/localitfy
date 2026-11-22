export type CoverMood = "all" | "favorites" | "leastUsed" | "cute" | "space" | "dark" | "cozy" | "energy";
export type PixelArtAsset = { file: string; label: string; discordKey: string };
export type RuntimePixelArtAsset = PixelArtAsset & { path?: string; url?: string; key?: string };
export type PixelArtBridgeAsset = { name?: string; key?: string; path?: string; url?: string };

export type CoverSong = {
  id: string;
  title?: string;
  artist?: string;
  album?: string;
  filePath?: string;
  coverUrl?: string | null;
  coverPath?: string | null;
  [key: string]: unknown;
};

export type CoverGalleryEntry = {
  key: string;
  asset: RuntimePixelArtAsset;
  tags: CoverMood[];
  usage: number;
  favorite: boolean;
  excluded: boolean;
};

export type CoverStats = {
  usableCount?: number;
  usedCount?: number;
  favoriteCount?: number;
  excludedCount?: number;
  least?: CoverGalleryEntry | null;
  most?: CoverGalleryEntry | null;
};

