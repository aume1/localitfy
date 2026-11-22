import type { RuntimePixelArtAsset } from "./cover.types";
import type { Song } from "../library/song.types";
import { DEFAULT_RUNTIME_PIXEL_ART_ASSETS, getCachedRuntimePixelArtAssets, getPixelArtAssetKey } from "./pixelArt";
export const stableHash=(input:string)=>{let hash=2166136261;for(let i=0;i<input.length;i+=1){hash^=input.charCodeAt(i);hash=Math.imul(hash,16777619);}return hash>>>0;};
export const seededUnit=(seed:number,salt:number)=>{const raw=Math.sin((seed+salt*1009)*12.9898)*43758.5453123;return raw-Math.floor(raw);};
export const songSignature=(song?:Song|null)=>song?[song.id,song.title,song.artist,song.album,song.duration,song.filePath].filter(Boolean).join("::").toLowerCase():"localitfy-idle";
export const pixelArtForSong=(song?:Song|null):RuntimePixelArtAsset=>{const pool=getCachedRuntimePixelArtAssets();return pool[stableHash(songSignature(song))%Math.max(1,pool.length)]||DEFAULT_RUNTIME_PIXEL_ART_ASSETS[0];};
export const nextPixelArtForSong=(song?:Song|null):RuntimePixelArtAsset=>{const pool=getCachedRuntimePixelArtAssets();return pool[(stableHash(`${songSignature(song)}::next`)+7)%Math.max(1,pool.length)]||DEFAULT_RUNTIME_PIXEL_ART_ASSETS[0];};

// Select the same stable-sort winner in O(pool size) without temporary ranked arrays.
export function selectBalancedPixelAsset(pool: RuntimePixelArtAsset[], song: Song, usage: ReadonlyMap<string, number>, randomSalt: string): RuntimePixelArtAsset | null {
  if (!pool.length) return null;
  const currentKeys = new Set([song.coverPath, song.coverUrl].filter(Boolean));
  const signature = songSignature(song);
  let best: RuntimePixelArtAsset | null = null;
  let minUsage = Infinity;
  let minScore = Infinity;
  for (let index = 0; index < pool.length; index += 1) {
    const asset = pool[index];
    if (pool.length > 1 && (currentKeys.has(asset.path || "") || currentKeys.has(asset.url || "") || currentKeys.has(asset.file || ""))) continue;
    const candidateUsage = usage.get(getPixelArtAssetKey(asset)) || 0;
    if (candidateUsage > minUsage) continue;
    const score = stableHash(`${signature}::${randomSalt}::${index}::${asset.file}`);
    if (candidateUsage < minUsage || (candidateUsage === minUsage && score < minScore)) {
      best = asset;
      minUsage = candidateUsage;
      minScore = score;
    }
  }
  return best || pool[0];
}
