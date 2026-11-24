import type { usePlayerRuntime } from "./usePlayerRuntime";
import type { Song, PlaybackUrlResult } from "../library/song.types";
import type { Settings } from "../settings/settings.types";
import type { resolveAutoTransitionTarget } from "./resolveAutoTransitionTarget";
import { clamp } from "../../shared/utils/format";
import { prettyTitle } from "../search";

type TransitionTarget = ReturnType<typeof resolveAutoTransitionTarget>;
type Runtime = Pick<ReturnType<typeof usePlayerRuntime>, "audioRef" | "playbackTransitionRef" | "crossfadeHandoffRef" | "crossfadeMainPauseGuardRef" | "pendingPlayRef" | "listeningHistoryRef" | "setCurrentId" | "setCrossfadePreviewSongId" | "setCurrentTime" | "timeRef" | "setCurrentDuration" | "setIsPlaying" | "setPlayerError" | "setStatusText" | "crossfadeIntervalRef" | "clearCrossfadeHandoffSoon" | "crossfadeRecoveryTimerRef" | "songRef" | "crossfadeAutoStartedRef" | "isSeekingRef" | "crossfadeLastStartAtRef" | "nextAudioRef" | "stopFade">;
type CrossfadeOptions = {
  currentSong: Song | null;
  isPlaying: boolean;
  settings: Settings;
  getAutoTransitionTarget: () => TransitionTarget;
  commitAutoTransitionTarget: (target: TransitionTarget) => void;
  setAudioElementVolume: (audio: HTMLAudioElement, volume: number) => void;
  applyPlaybackRateSettings: (audio: HTMLAudioElement) => void;
  armPlayCount: (songId: string, startTime: number) => void;
  pushQueueHistory: (song: Song) => void;
  rememberCurrentSong: (songId: string) => unknown;
  resolvePlaybackUrl: (song: Song) => Promise<PlaybackUrlResult>;
  getTargetAudioVolume: (song: Song) => number;
  markSongCompletedForPlayCount: (song: Song, outcome: "transition") => unknown;
  patchSongLocal: (songId: string, patch: Partial<Song>) => unknown;
  getAutoCrossfadeSeconds: () => number;
};

export function createCrossfadePlayback(runtime: Runtime, options: CrossfadeOptions) {
  const {audioRef, playbackTransitionRef, crossfadeHandoffRef, crossfadeMainPauseGuardRef, pendingPlayRef, listeningHistoryRef, setCurrentId, setCrossfadePreviewSongId, setCurrentTime, timeRef, setCurrentDuration, setIsPlaying, setPlayerError, setStatusText, crossfadeIntervalRef, clearCrossfadeHandoffSoon, crossfadeRecoveryTimerRef, songRef, crossfadeAutoStartedRef, isSeekingRef, crossfadeLastStartAtRef, nextAudioRef, stopFade} = runtime;
  const {currentSong, isPlaying, settings, getAutoTransitionTarget, commitAutoTransitionTarget, setAudioElementVolume, applyPlaybackRateSettings, armPlayCount, pushQueueHistory, rememberCurrentSong, resolvePlaybackUrl, getTargetAudioVolume, markSongCompletedForPlayCount, patchSongLocal, getAutoCrossfadeSeconds} = options;
  async function takeOverMainAudioFromCrossfade(target: TransitionTarget, nextAudio: HTMLAudioElement, safeVolume: number, version: number) {
    const audio = audioRef.current;
    if (!audio || !target?.song || !playbackTransitionRef.current.isCurrentCrossfade(target.song.id, version)) return;
    const ownsHandoff = () => playbackTransitionRef.current.isCurrentCrossfade(target.song.id, version);

    const handoffTime = Number.isFinite(nextAudio.currentTime) ? nextAudio.currentTime : 0;
    const handoffUrl = nextAudio.src;

    crossfadeHandoffRef.current = {
      songId: target.song.id,
      url: handoffUrl,
      time: handoffTime,
      volume: safeVolume
    };

    crossfadeMainPauseGuardRef.current = true;

    try {
      if (audio.src !== handoffUrl) {
        audio.src = handoffUrl;
      }

      audio.currentTime = Math.max(0, handoffTime);
      setAudioElementVolume(audio, 0);
      applyPlaybackRateSettings(audio);
      audio.preload = settings.gaplessPlayback ? "auto" : "metadata";

      await audio.play();
      if (!ownsHandoff()) return;

      commitAutoTransitionTarget(target);

      pendingPlayRef.current = false;
      armPlayCount(target.song.id, Math.max(0, handoffTime));
      listeningHistoryRef.current?.play(target.song.id, handoffTime, target.playlistId ?? null);
      pushQueueHistory(target.song);
      setCurrentId(target.song.id);
      setCrossfadePreviewSongId("");
      void rememberCurrentSong(target.song.id);
      setCurrentTime(Math.max(0, handoffTime));
      timeRef.current = Math.max(0, handoffTime);
      setCurrentDuration(target.song.duration || nextAudio.duration || 0);
      setIsPlaying(true);
      setPlayerError("");
      setStatusText(`crossfading into ${prettyTitle(target.song.title, 5)}`);
      playbackTransitionRef.current.crossfadeFinished(target.song.id);

      const blendMs = 420;
      const blendStart = performance.now();
      const blendGeneration = playbackTransitionRef.current.snapshot().generation;

      const blendTimer = window.setInterval(() => {
          if (!playbackTransitionRef.current.isCurrent(blendGeneration, target.song.id)) {
            window.clearInterval(blendTimer);
            if (crossfadeIntervalRef.current === blendTimer) crossfadeIntervalRef.current = null;
            return;
          }
          const progressValue = clamp((performance.now() - blendStart) / blendMs, 0, 1);
          const eased = 1 - Math.pow(1 - progressValue, 2.6);

          setAudioElementVolume(audio, safeVolume * eased);
          setAudioElementVolume(nextAudio, safeVolume * (1 - eased));

          if (progressValue >= 1) {
            window.clearInterval(blendTimer);
            if (crossfadeIntervalRef.current === blendTimer) crossfadeIntervalRef.current = null;
            setAudioElementVolume(audio, safeVolume);

            try {
              nextAudio.pause();
              nextAudio.currentTime = 0;
              setAudioElementVolume(nextAudio, 0);
            } catch {
            }

            crossfadeMainPauseGuardRef.current = false;
            clearCrossfadeHandoffSoon(target.song.id, 450);
          }
        }, 16);
      crossfadeIntervalRef.current = blendTimer;
    } catch {
      if (!ownsHandoff()) return;
      // Keep the already-playing hidden audio alive briefly so users do not hear a hard stop,
      // then let the normal playback state-sync recover.
      commitAutoTransitionTarget(target);
      setCurrentId(target.song.id);
      setCrossfadePreviewSongId("");
      void rememberCurrentSong(target.song.id);
      setIsPlaying(true);
      crossfadeMainPauseGuardRef.current = false;
      playbackTransitionRef.current.crossfadeFinished(target.song.id);

      const recoveryGeneration = playbackTransitionRef.current.snapshot().generation;
      crossfadeRecoveryTimerRef.current = window.setTimeout(() => {
        crossfadeRecoveryTimerRef.current = null;
        if (!playbackTransitionRef.current.isCurrent(recoveryGeneration, target.song.id)) return;
        try {
          nextAudio.pause();
          nextAudio.currentTime = 0;
          setAudioElementVolume(nextAudio, 0);
        } catch {
        }
        clearCrossfadeHandoffSoon(target.song.id);
      }, 950);
    }
  }

  async function startAutoCrossfadeToNext() {
    const audio = audioRef.current;
    const current = songRef.current || currentSong;

    if (
      !audio ||
      !current ||
      !isPlaying ||
      isSeekingRef.current ||
      crossfadeAutoStartedRef.current ||
      performance.now() - crossfadeLastStartAtRef.current < 900 ||
      settings.reducedMotion ||
      !settings.crossfadeEnabled
    ) {
      return;
    }

    const target = getAutoTransitionTarget();
    if (!target?.song || target.song.id === current.id) return;

    if (!playbackTransitionRef.current.crossfadeStarted(target.song.id)) return;
    crossfadeAutoStartedRef.current = true;
    crossfadeLastStartAtRef.current = performance.now();

    const version = playbackTransitionRef.current.snapshot().generation;
    const playbackUrl = await resolvePlaybackUrl(target.song).catch(() => null);
    if (!crossfadeAutoStartedRef.current || !playbackTransitionRef.current.isCurrentCrossfade(target.song.id, version)) return;

    if (!playbackUrl?.ok || !playbackUrl.url || playbackUrl.fileExists === false) {
      crossfadeAutoStartedRef.current = false;
      playbackTransitionRef.current.crossfadeCancelled();
      setCrossfadePreviewSongId("");
      try {
        setAudioElementVolume(audio, getTargetAudioVolume(current));
      } catch {
      }
      return;
    }

    if (!nextAudioRef.current) {
      nextAudioRef.current = new Audio();
      nextAudioRef.current.preload = "auto";
      nextAudioRef.current.crossOrigin = "anonymous";
    }

    const nextAudio = nextAudioRef.current;
    // This element may have been created earlier by the preloader. Enforce
    // CORS before loading any URL or reusing it for a crossfade.
    nextAudio.crossOrigin = "anonymous";
    const safeVolume = getTargetAudioVolume(target.song);
    const crossfadeMs = getAutoCrossfadeSeconds() * 1000;
    const startVolume = audio.volume || getTargetAudioVolume(current);

    try {
      if (nextAudio.src !== playbackUrl.url) {
        nextAudio.src = playbackUrl.url;
        nextAudio.load();
      }

      setAudioElementVolume(nextAudio, 0);
      applyPlaybackRateSettings(nextAudio);

      await nextAudio.play();
      if (!crossfadeAutoStartedRef.current || !playbackTransitionRef.current.isCurrentCrossfade(target.song.id, version)) return;

      setCrossfadePreviewSongId(target.song.id);
      stopFade();

      const startTime = performance.now();

      if (crossfadeIntervalRef.current !== null) {
        window.clearInterval(crossfadeIntervalRef.current);
      }

      crossfadeIntervalRef.current = window.setInterval(() => {
        const elapsed = performance.now() - startTime;
        const rawProgress = clamp(elapsed / crossfadeMs, 0, 1);

        const outgoingHold = 0.16;
        const outgoingProgress = rawProgress <= outgoingHold
          ? 0
          : clamp((rawProgress - outgoingHold) / (1 - outgoingHold), 0, 1);
        const outgoingFactor = 1 - Math.pow(outgoingProgress, 0.72);
        const incomingFactor = Math.pow(rawProgress, 1.48);

        setAudioElementVolume(audio, startVolume * outgoingFactor);
        setAudioElementVolume(nextAudio, safeVolume * incomingFactor);

        if (rawProgress >= 1) {
          if (crossfadeIntervalRef.current !== null) {
            window.clearInterval(crossfadeIntervalRef.current);
            crossfadeIntervalRef.current = null;
          }

          setAudioElementVolume(audio, 0);
          setAudioElementVolume(nextAudio, safeVolume);

          markSongCompletedForPlayCount(current, "transition");
          if (current.id) void patchSongLocal(current.id, { playbackPosition: 0 });

          crossfadeAutoStartedRef.current = false;

          void takeOverMainAudioFromCrossfade(target, nextAudio, safeVolume, version);
        }
      }, 16);
    } catch {
      if (!playbackTransitionRef.current.isCurrentCrossfade(target.song.id, version)) return;
      playbackTransitionRef.current.crossfadeCancelled();
      crossfadeAutoStartedRef.current = false;
      crossfadeMainPauseGuardRef.current = false;
      setCrossfadePreviewSongId("");
      try {
        setAudioElementVolume(audio, getTargetAudioVolume(current));
      } catch {
      }
      try {
        nextAudio.pause();
        setAudioElementVolume(nextAudio, 0);
      } catch {
      }
    }
  }

  return {startAutoCrossfadeToNext};
}
