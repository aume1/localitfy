export type PixelArtAsset = { file: string; label: string; discordKey: string };
export type RuntimePixelArtAsset = PixelArtAsset & { path?: string; url?: string; key?: string };
export type PixelArtBridgeAsset = { name?: string; key?: string; path?: string; url?: string };

