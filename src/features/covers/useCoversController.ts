import { useCallback, useMemo, useRef, useState } from "react";
import type { Song } from "../library/song.types";
import type { AppToastKind } from "../shell/view.types";
import type { RuntimePixelArtAsset } from "./cover.types";
import { PIXEL_ART_CACHE_TTL_MS, PIXEL_COVER_EXCLUDED_STORAGE_KEY, buildRuntimePixelArtAssets, cleanStringList, getCachedRuntimePixelArtAssets, getPixelArtAssetKey, pixelArtUrl } from "./pixelArt";
import { pixelArtForSong, songSignature, stableHash, selectBalancedPixelAsset } from "./cover.runtime";
import { readLocalJson } from "../../shared/storage/localStorage";

export type UseCoversControllerOptions = {
  songs: Song[];
  commitCovers: (updates: Map<string, Partial<Song>>) => void;
  setStatusText: (message: string) => void;
  showAppToast: (message: string, kind?: AppToastKind) => void;
};

export function useCoversController({ songs, commitCovers, setStatusText, showAppToast }: UseCoversControllerOptions) {
  const [pixelArtAssets, setPixelArtAssets] = useState<RuntimePixelArtAsset[]>(() => getCachedRuntimePixelArtAssets());
  const [pixelArtBusy, setPixelArtBusy] = useState(false);
  const busy = useRef(false);
  const excluded = useRef(new Set(cleanStringList(readLocalJson<string[]>(PIXEL_COVER_EXCLUDED_STORAGE_KEY, []))));
  const pixelArtCacheRef = useRef<{
    assets: RuntimePixelArtAsset[];
    loadedAt: number;
    pending: Promise<RuntimePixelArtAsset[]> | null;
  }>({
    assets: getCachedRuntimePixelArtAssets(),
    loadedAt: 0,
    pending: null
  });

  const loadPixelArtAssets = useCallback(async (force = false) => {
    const cache = pixelArtCacheRef.current;
    const nowMs = Date.now();

    if (!force && cache.assets.length && nowMs - cache.loadedAt < PIXEL_ART_CACHE_TTL_MS) {
      return cache.assets;
    }

    if (cache.pending) return cache.pending;

    if (!window.localitfy.listPixelArt) {
      cache.assets = getCachedRuntimePixelArtAssets();
      cache.loadedAt = nowMs;
      return cache.assets;
    }

    let pending: Promise<RuntimePixelArtAsset[]>;
    pending = window.localitfy
      .listPixelArt()
      .then((assets) => {
        const runtimeAssets = buildRuntimePixelArtAssets(assets);
        cache.assets = runtimeAssets;
        cache.loadedAt = Date.now();
        return runtimeAssets;
      })
      .catch(() => {
        if (!cache.assets.length) cache.assets = getCachedRuntimePixelArtAssets();
        cache.loadedAt = Date.now();
        return cache.assets;
      })
      .finally(() => {
        if (cache.pending === pending) cache.pending = null;
      });

    cache.pending = pending;
    return pending;
  }, []);


  const pixelArtPool = useMemo(() => pixelArtAssets.length ? pixelArtAssets : getCachedRuntimePixelArtAssets(), [pixelArtAssets]);
  const getRuntimePixelArtForSong = useCallback((song?: Song | null, salt = "") => {
    const index = stableHash(`${songSignature(song)}::${salt}`) % Math.max(1, pixelArtPool.length);
    return pixelArtPool[index] || pixelArtForSong(song);
  }, [pixelArtPool]);

  async function randomizeAllCovers() {
    if (!songs.length || busy.current) return;
    busy.current = true;
    setPixelArtBusy(true);
    const updates = new Map<string, Partial<Song>>();
    const usage = new Map<string, number>();
    let failed = 0;
    const message = "Rerolling covers…";
    setStatusText(message);
    showAppToast(message, "work");
    try {
      const assets = await loadPixelArtAssets(false);
      setPixelArtAssets(assets);
      const pool = assets.filter(asset => !excluded.current.has(getPixelArtAssetKey(asset)) && Boolean(asset.path || asset.url || asset.file));
      if (!pool.length) {
        setStatusText("No covers available");
        showAppToast("No covers available", "error");
        return;
      }
      const salt = String(Date.now()) + Math.random();
      for (const song of songs) {
        const asset = selectBalancedPixelAsset(pool, song, usage, salt);
        if (!asset) { failed++; continue; }
        try {
          const url = asset.url || pixelArtUrl(asset.file);
          const updated = asset.path && window.localitfy.setSongCover
            ? await window.localitfy.setSongCover(song.id, asset.path)
            : await window.localitfy.patchSong(song.id, { coverPath: asset.path || null, coverUrl: url });
          if (!updated) { failed++; continue; }
          updates.set(song.id, {
            coverPath: updated.coverPath, coverUrl: updated.coverUrl, coverFullUrl: updated.coverFullUrl,
            coverThumbUrl: updated.coverThumbUrl, coverThumbnailUrl: updated.coverThumbnailUrl, thumbnailUrl: updated.thumbnailUrl
          });
          const key = getPixelArtAssetKey(asset);
          usage.set(key, (usage.get(key) || 0) + 1);
        } catch { failed++; }
      }
      const result = `${updates.size} covers updated${failed ? ` · ${failed} failed` : ""}`;
      setStatusText(result);
      showAppToast(result, failed ? "error" : "success");
    } finally {
      if (updates.size) commitCovers(updates);
      busy.current = false;
      setPixelArtBusy(false);
    }
  }

  return { pixelArtAssets, setPixelArtAssets, pixelArtBusy, pixelArtPool, loadPixelArtAssets, getRuntimePixelArtForSong, randomizeAllCovers };
}
