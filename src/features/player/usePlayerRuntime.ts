import { useCallback, useEffect, useRef, useState } from "react";
import type { MutableRefObject } from "react";
import { useStableCallback } from "../../shared/hooks/useStableCallback";
import { ListeningHistory, createListeningEventWriter, type PlayEvent, type ListeningOutcome } from "./listeningHistory";
import { AudioEffectRuntime } from "./audio/audioEffectRuntime";
import { PlaybackTransitionCoordinator } from "./engine/playbackTransitionCoordinator";
import { PlaybackUrlCache } from "./playbackUrlCache";
import { HtmlAudioEngine } from "./engine/htmlAudioEngine";
import { createPlayerController, type PlayerController } from "./engine/playerController";
import type { PlaybackUrlResult, Song } from "../library/song.types";
import type { QueueHistoryItem, RepeatMode } from "./player.types";
import { QUEUE_HISTORY_STORAGE_KEY, QUEUE_STORAGE_KEY, REPEAT_PLAYLIST_STORAGE_KEY, SHUFFLE_STORAGE_KEY, REPEAT_MODE_STORAGE_KEY } from "../library/library.constants";
import { clamp } from "../../shared/utils/format";
import { readLocalJson, writeLocalJson } from "../../shared/storage/localStorage";

export type UsePlayerRuntimeOptions = {
  defaultVolume: number;
  setAudioElementVolume: (audio: HTMLAudioElement | null | undefined, volume: number) => void;
};

export function usePlayerRuntime({ defaultVolume, setAudioElementVolume }: UsePlayerRuntimeOptions) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackTransition] = useState(() => new PlaybackTransitionCoordinator());
  const playbackTransitionRef = useRef(playbackTransition);
  const [listeningWriter] = useState(() => createListeningEventWriter(
    event => window.localitfy.recordPlayEvent(event),
    pending => writeLocalJson("localitfy.pending-listening-events-v1", pending),
    readLocalJson<PlayEvent[]>("localitfy.pending-listening-events-v1", [])
  ));
  const listeningHistoryRef = useRef<ListeningHistory | null>(null);
  if (!listeningHistoryRef.current) {
    listeningHistoryRef.current = new ListeningHistory((event) => {
      listeningWriter.enqueue(event);
    });
  }

  useEffect(() => {
    const finish = () => listeningHistoryRef.current?.finish("interrupted");
    const retry = () => { void listeningWriter.flush(); };
    retry();
    window.addEventListener("focus", retry);
    window.addEventListener("pagehide", finish);
    return () => {
      window.removeEventListener("focus", retry);
      window.removeEventListener("pagehide", finish);
      finish();
    };
  }, [listeningWriter]);
  const flushListeningEvents = useCallback(() => listeningWriter.flush(), [listeningWriter]);

  const playerEngineRef = useRef<HtmlAudioEngine | null>(null);
  const playerControllerRef = useRef<PlayerController | null>(null);
  const crossfadeIntervalRef = useRef<number | null>(null);
  const crossfadeAutoStartedRef = useRef(false);
  const crossfadeMainPauseGuardRef = useRef(false);
  const crossfadeLastStartAtRef = useRef(0);
  const crossfadeHandoffClearTimerRef = useRef<number | null>(null);
  const crossfadeRecoveryTimerRef = useRef<number | null>(null);
  const crossfadeHandoffRef = useRef<{ songId: string; url: string; time: number; volume: number } | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const progressLoopTimeoutRef = useRef<number | null>(null);
  const pendingPlayRef = useRef(false);
  const countPlayRef = useRef(false);
  const playCountSongIdRef = useRef("");
  const playCountListenedRef = useRef(0);
  const playCountLastTimeRef = useRef(0);
  const positionSaveRef = useRef(0);
  const nextAudioRef = useRef<HTMLAudioElement | null>(null);
  const [playbackUrlCache] = useState(() => new PlaybackUrlCache());
  const [playbackUrlPending] = useState(() => new Map<string, Promise<PlaybackUrlResult>>());
  const playbackUrlCacheRef = useRef(playbackUrlCache);
  const playbackUrlPendingRef = useRef(playbackUrlPending);
  const lastQueueHistoryRef = useRef("");
  const songRef = useRef<Song | null>(null);
  const timeRef = useRef(0);
  const durationRef = useRef(0);
  const playingRef = useRef(false);
  // Master/user volume must stay separate from the currently rendered element
  // volume, which may include normalization, per-song memory, fades, or crossfade.
  const volumeRef = useRef(defaultVolume);
  const effectiveVolumeRef = useRef(defaultVolume);
  const lastNonZeroVolumeRef = useRef(defaultVolume);
  const beatFrameRef = useRef<number | null>(null);
  const beatFrameTimerRef = useRef<number | null>(null);
  const audioEffectRuntimeRef = useRef<AudioEffectRuntime | null>(null);
  const audioEffectMountGenerationRef = useRef(0);
  if (audioEffectRuntimeRef.current === null) {
    audioEffectRuntimeRef.current = new AudioEffectRuntime();
  }
  const beatSmoothRef = useRef({ bass: 0, mid: 0, energy: 0, phase: 0 });
  const beatReactiveTargetCacheRef = useRef<{ nodes: HTMLElement[]; refreshedAt: number; songId: string }>({ nodes: [], refreshedAt: 0, songId: "" });
  const beatLastPaintSignatureRef = useRef("");
  const progressDomSignatureRef = useRef("");

  const [isVolumeDragging, setIsVolumeDragging] = useState(false);
  const [volumeDraft, setVolumeDraft] = useState(() => Math.round(defaultVolume * 100));
  const volumeDraftRef = useRef(Math.round(defaultVolume * 100));
  const volumeDraftFrameRef = useRef<number | null>(null);
  const liveVolumeFrameRef = useRef<number | null>(null);
  const liveVolumePendingPercentRef = useRef(Math.round(defaultVolume * 100));
  const fadeFrameRef = useRef<number | null>(null);
  const [currentId, setCurrentId] = useState("");
  const [isPlaying, setIsPlaying] = useState(false);
  const [isShuffle, setIsShuffle] = useState(() => readLocalJson<boolean>(SHUFFLE_STORAGE_KEY, false) === true);
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    const saved = readLocalJson<RepeatMode>(REPEAT_MODE_STORAGE_KEY, "all");
    return saved === "all" || saved === "one" || saved === "off" ? saved : "all";
  });
  const [currentTime, setCurrentTimeSnapshot] = useState(0);
  // Explicit seeks, selection resets and pauses update the live clock immediately;
  // unrelated renders must not copy an older React snapshot back into that clock.
  const setCurrentTime = useCallback((time: number) => {
    timeRef.current = time;
    setCurrentTimeSnapshot(time);
  }, []);
  const [currentDuration, setCurrentDuration] = useState(0);
  const [isSeeking, setIsSeeking] = useState(false);
  const [seekDraftPercent, setSeekDraftPercent] = useState(0);
  const seekDraftPercentRef = useRef(0);
  const isSeekingRef = useRef(false);
  const seekDraftFrameRef = useRef(0);
  const progressInputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const progressTimeLabelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const progressDurationLabelRefs = useRef<Array<HTMLSpanElement | null>>([]);
  const lastProgressUiPaintRef = useRef(0);
  const [statusText, setStatusText] = useState("ready to play");
  const [playerError, setPlayerError] = useState("");
  const [crossfadePreviewSongId, setCrossfadePreviewSongId] = useState("");
  const [nowPlayingTransitionKey, setNowPlayingTransitionKey] = useState("empty:0");
  const [playQueue, setPlayQueue] = useState<string[]>(() => readLocalJson<string[]>(QUEUE_STORAGE_KEY, []));
  const [queueHistory, setQueueHistory] = useState<QueueHistoryItem[]>(() => readLocalJson<QueueHistoryItem[]>(QUEUE_HISTORY_STORAGE_KEY, []));
  const [repeatPlaylist, setRepeatPlaylist] = useState(() => readLocalJson<boolean>(REPEAT_PLAYLIST_STORAGE_KEY, false));
  const [queueDropHot, setQueueDropHot] = useState(false);
  const queueDropHotRef = useRef(false);

  useEffect(() => { writeLocalJson(QUEUE_STORAGE_KEY, playQueue); }, [playQueue]);
  useEffect(() => { writeLocalJson(QUEUE_HISTORY_STORAGE_KEY, queueHistory); }, [queueHistory]);
  useEffect(() => { writeLocalJson(REPEAT_PLAYLIST_STORAGE_KEY, repeatPlaylist); }, [repeatPlaylist]);
  useEffect(() => { writeLocalJson(SHUFFLE_STORAGE_KEY, isShuffle); }, [isShuffle]);
  useEffect(() => { writeLocalJson(REPEAT_MODE_STORAGE_KEY, repeatMode); }, [repeatMode]);
  useEffect(() => { queueDropHotRef.current = queueDropHot; }, [queueDropHot]);

  useEffect(() => {
    let retryTimer: number | null = null;
    const mountGeneration = ++audioEffectMountGenerationRef.current;

    const resumeEffects = () => {
      void audioEffectRuntimeRef.current?.resume();
    };

    const resumeEffectsWithRetry = () => {
      resumeEffects();
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      retryTimer = window.setTimeout(() => {
        retryTimer = null;
        resumeEffects();
      }, 140);
    };

    const handleVisibility = () => {
      if (!document.hidden) resumeEffectsWithRetry();
    };

    window.addEventListener("focus", resumeEffectsWithRetry);
    window.addEventListener("pageshow", resumeEffectsWithRetry);
    window.addEventListener("pointerdown", resumeEffects, { passive: true });
    window.addEventListener("keydown", resumeEffects);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      if (retryTimer !== null) window.clearTimeout(retryTimer);
      window.removeEventListener("focus", resumeEffectsWithRetry);
      window.removeEventListener("pageshow", resumeEffectsWithRetry);
      window.removeEventListener("pointerdown", resumeEffects);
      window.removeEventListener("keydown", resumeEffects);
      document.removeEventListener("visibilitychange", handleVisibility);
      // StrictMode replays effects: only dispose if no new mount replaced this one.
      queueMicrotask(() => {
        if (audioEffectMountGenerationRef.current !== mountGeneration) return;
        audioEffectRuntimeRef.current?.dispose();
        audioEffectRuntimeRef.current = null;
      });
    };
  }, []);

  function resetPlayCountTracker(outcome: Exclude<ListeningOutcome, "active"> = "interrupted") {
    listeningHistoryRef.current?.finish(outcome);
    countPlayRef.current = false;
    playCountSongIdRef.current = "";
    playCountListenedRef.current = 0;
    playCountLastTimeRef.current = 0;
  }

  function armPlayCount(songId: string, startTime = 0) {
    countPlayRef.current = true;
    playCountSongIdRef.current = songId;
    playCountListenedRef.current = 0;
    playCountLastTimeRef.current = Math.max(0, Number.isFinite(startTime) ? startTime : 0);
  }

  function tickPlayCountTracker(nextTime: number) {
    if (audioRef.current) listeningHistoryRef.current?.sample(audioRef.current);
    const song = songRef.current;
    if (!song || !countPlayRef.current || playCountSongIdRef.current !== song.id) return;

    const safeNextTime = Math.max(0, Number.isFinite(nextTime) ? nextTime : 0);
    const delta = safeNextTime - playCountLastTimeRef.current;

    // Count real listening progress only. Big jumps are usually seeking, not listening.
    if (delta > 0 && delta < 3) {
      playCountListenedRef.current += delta;
    }

    playCountLastTimeRef.current = safeNextTime;
  }

  function finishCountedPlay(song: Song | null, outcome: "ended" | "transition" = "ended") {
    if (audioRef.current) listeningHistoryRef.current?.sample(audioRef.current);
    listeningHistoryRef.current?.finish(outcome);
    if (!song || !countPlayRef.current || playCountSongIdRef.current !== song.id) return false;

    const duration = Math.max(0, Number(durationRef.current || song.duration || 0));
    const listened = playCountListenedRef.current;
    const required = duration > 0 ? Math.max(8, duration * 0.82) : 8;

    resetPlayCountTracker();

    if (listened + 1 < required) return false;

    return true;
  }

  function hasActivePlayCount() { return countPlayRef.current; }

  function stopProgressLoop() {
    if (animationFrameRef.current !== null) {
      window.cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }

    if (progressLoopTimeoutRef.current !== null) {
      window.clearTimeout(progressLoopTimeoutRef.current);
      progressLoopTimeoutRef.current = null;
    }
  }

  function stopFade() {
    if (fadeFrameRef.current !== null) {
      window.cancelAnimationFrame(fadeFrameRef.current);
      fadeFrameRef.current = null;
    }
  }

  function fadeAudio(target: number, duration: number, onDone?: () => void) {
    const audio = audioRef.current;
    if (!audio) return;

    stopFade();

    const safeTarget = clamp(Number(target) || 0, 0, 1);
    const safeDuration = Math.max(0, Number(duration) || 0);
    const startVolume = clamp(Number(audio.volume) || 0, 0, 1);
    const delta = safeTarget - startVolume;

    // No animation frames while hidden
    if (safeDuration <= 0 || Math.abs(delta) < 0.002 || document.hidden) {
      setAudioElementVolume(audio, safeTarget);
      effectiveVolumeRef.current = safeTarget;
      if (onDone) onDone();
      return;
    }

    const startTime = performance.now();

    const step = () => {
      const progressValue = clamp((performance.now() - startTime) / safeDuration, 0, 1);
      const eased = 1 - Math.pow(1 - progressValue, 2.2);
      const nextVolume = clamp(startVolume + delta * eased, 0, 1);

      setAudioElementVolume(audio, nextVolume);
      effectiveVolumeRef.current = nextVolume;

      if (progressValue >= 1) {
        fadeFrameRef.current = null;
        if (onDone) onDone();
        return;
      }

      fadeFrameRef.current = window.requestAnimationFrame(step);
    };

    fadeFrameRef.current = window.requestAnimationFrame(step);
  }

  function clearCrossfadeHandoffSoon(songId: string, delayMs = 1400) {
    if (crossfadeHandoffClearTimerRef.current !== null) {
      window.clearTimeout(crossfadeHandoffClearTimerRef.current);
      crossfadeHandoffClearTimerRef.current = null;
    }

    crossfadeHandoffClearTimerRef.current = window.setTimeout(() => {
      if (crossfadeHandoffRef.current?.songId === songId) {
        crossfadeHandoffRef.current = null;
      }

      crossfadeHandoffClearTimerRef.current = null;
    }, delayMs);
  }

  function stopCrossfadeAuto() {
    playbackTransitionRef.current.crossfadeCancelled();
    if (crossfadeIntervalRef.current !== null) {
      window.clearInterval(crossfadeIntervalRef.current);
      crossfadeIntervalRef.current = null;
    }

    if (crossfadeHandoffClearTimerRef.current !== null) {
      window.clearTimeout(crossfadeHandoffClearTimerRef.current);
      crossfadeHandoffClearTimerRef.current = null;
    }

    if (crossfadeRecoveryTimerRef.current !== null) {
      window.clearTimeout(crossfadeRecoveryTimerRef.current);
      crossfadeRecoveryTimerRef.current = null;
    }
    crossfadeAutoStartedRef.current = false;
    crossfadeMainPauseGuardRef.current = false;
    crossfadeHandoffRef.current = null;
    setCrossfadePreviewSongId("");

    const nextAudio = nextAudioRef.current;
    if (nextAudio) {
      try {
        nextAudio.pause();
        nextAudio.currentTime = 0;
        setAudioElementVolume(nextAudio, 0);
      } catch {
      }
    }
  }

  function ensurePlayerController() {
    const audio = audioRef.current;
    if (!audio) return null;

    if (!playerEngineRef.current || playerEngineRef.current.element !== audio) {
      playerControllerRef.current?.destroy();

      const engine = new HtmlAudioEngine(audio);
      playerEngineRef.current = engine;
      playerControllerRef.current = createPlayerController(engine);
    }

    return playerControllerRef.current;
  }

  return {
    ensurePlayerController, flushListeningEvents, listeningHistoryRef, audioRef, playbackTransitionRef,
    crossfadeIntervalRef, crossfadeAutoStartedRef, crossfadeMainPauseGuardRef,
    crossfadeLastStartAtRef, crossfadeRecoveryTimerRef, crossfadeHandoffRef,
    animationFrameRef, progressLoopTimeoutRef,
    pendingPlayRef, resetPlayCountTracker, armPlayCount, tickPlayCountTracker, finishCountedPlay, hasActivePlayCount, stopProgressLoop, positionSaveRef, nextAudioRef, playbackUrlCacheRef,
    playbackUrlPendingRef, lastQueueHistoryRef, songRef, timeRef, durationRef, playingRef,
    volumeRef, effectiveVolumeRef, lastNonZeroVolumeRef, beatFrameRef, beatFrameTimerRef,
    audioEffectRuntimeRef, beatSmoothRef, beatReactiveTargetCacheRef, beatLastPaintSignatureRef,
    progressDomSignatureRef, isVolumeDragging, setIsVolumeDragging, volumeDraft, setVolumeDraft,
    volumeDraftRef, volumeDraftFrameRef, liveVolumeFrameRef, liveVolumePendingPercentRef,
    stopFade, fadeAudio, stopCrossfadeAuto, clearCrossfadeHandoffSoon,
    currentId, setCurrentId, isPlaying, setIsPlaying, isShuffle, setIsShuffle,
    repeatMode, setRepeatMode, currentTime, setCurrentTime, currentDuration, setCurrentDuration,
    isSeeking, setIsSeeking, seekDraftPercent, setSeekDraftPercent, seekDraftPercentRef,
    isSeekingRef, seekDraftFrameRef, progressInputRefs, progressTimeLabelRefs,
    progressDurationLabelRefs, lastProgressUiPaintRef,
    statusText, setStatusText, playerError, setPlayerError,
    crossfadePreviewSongId, setCrossfadePreviewSongId,
    nowPlayingTransitionKey, setNowPlayingTransitionKey,
    playQueue, setPlayQueue, queueHistory, setQueueHistory, repeatPlaylist, setRepeatPlaylist,
    queueDropHot, setQueueDropHot, queueDropHotRef
  };
}

type ProgressLoopOptions = {
  enabled: boolean;
  songId: string;
  animationFrameRef: MutableRefObject<number | null>;
  progressLoopTimeoutRef: MutableRefObject<number | null>;
  isBackgrounded: () => boolean;
  stopProgressLoop: () => void;
  onInactive: () => void;
  onVisible: () => void;
  onTick: (clock: number) => number;
};

/** One timer/frame owner per playback session. Metadata/seek/UI changes update
 * callbacks, rather than continually tearing down and restarting the loop. */
export function usePlaybackProgressLoop(options: ProgressLoopOptions) {
  const { enabled, songId, animationFrameRef, progressLoopTimeoutRef } = options;
  const isBackgrounded = useStableCallback(options.isBackgrounded);
  const stopProgressLoop = useStableCallback(options.stopProgressLoop);
  const onInactive = useStableCallback(options.onInactive);
  const onVisible = useStableCallback(options.onVisible);
  const onTick = useStableCallback(options.onTick);
  useEffect(() => {
    if (!enabled || !songId) {
      stopProgressLoop();
      onInactive();
      return;
    }
    let active = true;
    const scheduleProgressTick = (delay: number) => {
      if (!active) return;
      if (progressLoopTimeoutRef.current !== null) window.clearTimeout(progressLoopTimeoutRef.current);
      progressLoopTimeoutRef.current = window.setTimeout(() => {
        progressLoopTimeoutRef.current = null;
        if (!active) return;
        if (document.hidden || isBackgrounded()) tick(performance.now());
        else animationFrameRef.current = window.requestAnimationFrame(tick);
      }, delay);
    };
    const tick = (clock: number) => {
      animationFrameRef.current = null;
      if (active) scheduleProgressTick(onTick(clock));
    };
    const handleProgressVisibility = () => {
      stopProgressLoop();
      if (!document.hidden) onVisible();
      scheduleProgressTick(document.hidden ? 1800 : 0);
    };
    document.addEventListener("visibilitychange", handleProgressVisibility);
    scheduleProgressTick(140);
    return () => {
      active = false;
      document.removeEventListener("visibilitychange", handleProgressVisibility);
      stopProgressLoop();
    };
  }, [enabled, songId, animationFrameRef, progressLoopTimeoutRef, isBackgrounded, stopProgressLoop, onInactive, onVisible, onTick]);
}
