# Music analysis and recommendations

## Agreed scope (2026-10-16)

Build local audio analysis, recommendations and playlist generation, suitable for future upstream PRs. The user approved Tier 1 first: listening events, background analysis, track insights, radio, and autoplay. A pretrained convolutional neural network (CNN) should provide robust music similarity; hand-crafted FFT descriptors alone are not the final similarity engine. Text prompts are deferred.

The neural model must be optional, disabled by default, and downloaded explicitly from an **Experimental features** section in Settings. Target a maximum 150 MB model download; display exact download and installed sizes, runtime overhead, license and source before downloading. No audio, embeddings or listening history leave the device. Do not silently install a model during import or launch.

## Approach

Decode local files using the existing ffmpeg dependency. Spectral processing (FFT / log-mel spectrograms) is model preprocessing, not a recommendation algorithm on its own. Use a pretrained music embedding network for similarity; use separately measured BPM, key, loudness and energy for explanations and playlist flow. Avoid claiming accurate mood, valence or danceability from simple proxies. Metadata and personal listening history supplement the audio signal; cross-user collaborative filtering is unavailable in a single-user local player.

The initial experimental choice is CLAP HTSAT unfused, using only its audio encoder and projection. This is a pretrained hierarchical audio transformer, rather than a pure CNN; it provides useful embedding infrastructure within the size limit without requiring text prompts. Treat recommendation quality as an evaluation milestone: compare it with musicnn and Discogs-EffNet against a small, varied reference library; measure nearest-neighbour quality, memory, throughput, input preprocessing parity, and download size. Check **code, model weights and conversion/redistribution permissions separately**. An optional download does not resolve a restrictive model license.

Primary references checked 2026-10-16:

- [musicnn repository](https://github.com/jordipons/musicnn) and [paper](https://arxiv.org/abs/1909.06654).
- [Essentia model catalogue](https://essentia.upf.edu/models.html) and [Discogs-EffNet artifacts](https://essentia.upf.edu/models/feature-extractors/discogs-effnet/).
- [ONNX Runtime Node API](https://onnxruntime.ai/docs/get-started/with-javascript/node.html), a candidate inference backend, pending packaging and numerical validation.

Do not add a Python/TensorFlow runtime to the shipped app. Prefer a validated ONNX export with onnxruntime-node, or another supported inference backend if export parity cannot be established. The history slice added no inference dependency. The subsequent experimental slice uses Transformers.js 4.3.1 and ONNX Runtime 1.30.0 in a dedicated worker.

## Architecture

1. Renderer player emits bounded, idempotent listening snapshots over the existing trusted preload IPC router.
2. SQLite `play_events` records event/session IDs, song, start/update/end times, listened milliseconds, outcome and playback context. Maintain existing aggregate playCount behavior independently.
3. A separate worker owns bounded ffmpeg decode and neural inference. Never block Electron main or the renderer. Start with one job, low priority, bounded sample windows and memory; pause/cancel, suspend/battery policy, crash recovery and progress are required.
4. Versioned `song_analysis` stores file identity (path, size, mtime), preprocessing/analyzer version, scalar features/confidences, model ID/version/checksum, embedding dimension and Float32 vector. Never mix incompatible embeddings; invalidate when file/model/preprocessing changes.
5. Main-process similarity initially scans normalized vectors using cosine similarity. Benchmark before adding an index. Blend audio, metadata, playlist co-occurrence and session evidence; avoid amplifying accidental skips or labeling errors as dislikes.
6. Generate candidates, then sequence with artist spacing, album diversity, repeats/exclusions, BPM/key transitions and optional energy curves. Explanations must reflect actual scoring evidence.

Model download lifecycle: application-owned pinned HTTPS manifest with known SHA-256 and size, strict byte limit and path ownership, temporary download plus checksum and atomic rename, progress/cancel/retry, deletion control and offline status. Do not accept arbitrary renderer-provided model URLs/paths. Keep runtime/model licensing notices and asar/native packaging explicit. Disabled means no inference jobs or downloads; allow deleting analysis/history independently of deleting music.

## Phased delivery / possible PR boundaries

### 1. Listening history (first implementation)

- Additive migration with pre-migration verified backup; no invented historical events from aggregate counts.
- One event per actual playback attempt, stable ID for repeated checkpoints. Pause/resume retains the event; repeats/restarts create new events.
- Count observed playback progress constrained by elapsed time, excluding seeks, pauses and stalls. Track wall listening time so playback speed does not inflate affinity.
- Natural end, user replacement, crossfade transition, error and interruption have distinct outcomes. Persist an active heartbeat so abrupt shutdown loses only the latest interval; unfinished records are not skips.
- Playlist context and a per-app-run session ID support later session affinity. Do not infer source context from the visible page.
- Delete a song / clear library removes associated history. Add UI history enable/clear controls before exposing behavioral recommendations broadly.

### 2. Experimental model and analysis

- Evaluate/select model and license; record benchmark and decision here before adding weights.
- Settings Experimental features: enable, explicit download, size/license/source, progress, cancel/remove; analysis start/pause/resume/retry/reanalyse and status.
- Worker queue with durable pending/version state; automatically enqueue imports only while enabled and model-ready. Validate missing, corrupt, changed and unsupported files.
- Compare exported inference and log-mel preprocessing against the reference implementation with real fixture outputs. Synthetic sine/click checks are useful for DSP, not evidence of neural recommendation quality.

### 3. Track insights

- BPM/confidence, key/mode/Camelot/confidence, energy and measured loudness in song details. Explain uncertainty; hide unavailable features. Avoid subjective labels that have not been validated.

### 4. Radio and autoplay

- Song/artist/album radio context action and opt-in queue continuation. Exclude missing files, current/recent songs, with clear stop/disable behavior. Metadata fallback when analysis/history is sparse, identified in explanations.

### 5. Playlist intelligence

- Extend playlist recommendations; 1–5 seed generator with length/BPM/energy/novelty controls; preview before saving.
- Reorder for harmonic/BPM flow and warm-up/peak/cool-down energy curves, preserving the original until accepted.
- Library mixes, rediscovery and on-repeat after history is useful; score explanations and skip-rate evaluation.

Deferred: text prompts/CLAP, library maps, fingerprint duplicate detection, ReplayGain integration, cloud/cross-user recommendations and recommending music outside the local library.

## Validation and continuation

Use isolated temporary databases and generated audio for tests; never test repair/reset against the user's actual profile. Test legacy migration, backup/restore, idempotent snapshots, malformed IPC input, seek/pause/rate/end/repeat/error/crossfade behavior, deletion and restart persistence. Keep IPC trust/sandbox invariants. Run `npm run release:check` before any upstream PR. A draft upstream PR is being prepared; no installed application has been replaced. A disposable development package was built for runtime validation.

Implementation branch: `feature/music-analysis`, based on upstream `654f8ea`. Implementation status and exact checks are recorded below as work progresses.

## Model decision and measured results (2026-10-16)

| Candidate | Findings | Decision |
| --- | --- | --- |
| Discogs-EffNet from Essentia | Music-specific representation; the published Essentia model policy states CC BY-NC-ND 4.0 / proprietary licensing. | Do not ship this artifact as the upstream default without appropriate permission. [Published policy](https://essentia.upf.edu/licensing_information.html). |
| Original musicnn | Repository has ISC software licensing and original TensorFlow checkpoints; needs separate weight-provenance review, reproducible export and preprocessing parity. | Keep as a comparison candidate; do not assume the Essentia conversion inherits this repository license. [Source/license](https://github.com/jordipons/musicnn). |
| CLAP HTSAT unfused, audio encoder only | LAION base model card declares Apache-2.0. Xenova supplies an ONNX conversion; the conversion card names the base model but does not declare a separate license. Quantized audio encoder is 34,301,667 bytes. | Initial experimental encoder, with provenance/notices recorded and release review still required. No text model, tokenizer or prompts are downloaded. [Base card](https://huggingface.co/laion/clap-htsat-unfused), [conversion card](https://huggingface.co/Xenova/clap-htsat-unfused). |

Pinned conversion revision: `c28f2883575e590e04d3146ff0713c2448d691ba`. `electron/analysis/model.cjs` pins file sizes and SHA-256 hashes for the ONNX model plus its two configurations: **34,302,907 bytes total**. All files must verify before installation. Config/model files have the same disk payload size as the download. The runtime is bundled separately; it is not loaded while analysis is disabled. Model notices and Apache-2.0 text live under `electron/analysis/`.

Measured on this developer's Apple silicon machine: the initial single 10-second synthetic-window probe with Transformers.js 3.8.1 took about 732 ms to load, 123 ms for inference, and 266 MB process RSS. The shipped implementation pins 4.3.1 to avoid older transitive advisories; the full decode/inference/determinism/error smoke test takes roughly 2–5 seconds, including cold startup and several windows. These are engineering smoke measurements, **not music recommendation-quality benchmarks or model accuracy claims**. Python/ONNX numerical parity and listening-based neighbour evaluation remain open.

## Implementation status

- **Listening history:** additive `play_events` schema; trusted IPC/preload/types; player-owned tracker for actual playing, pause/resume, seeking, end/repeat, replacement, crossfade handoff, errors and page exit. Existing aggregate play counts are preserved. Idempotent snapshots reject stale/finalized/identity-changing updates. Clearing history saves a cutoff so an in-flight session cannot recreate cleared data. Disabling history is enforced natively; after enabling again, history resumes with a new playback session. Older verified database backups can retain cleared data, as stated in the UI.
- **Experimental settings:** new searchable section; analysis disabled by default. Enabling does not download or start inference. Explicit model download, progress, cancel, retry via download button, removal, manual analysis, pause, retry failed tracks, saved-analysis clearing, history enable/clear and confirmation controls. “Allow analysis on battery power” is persisted, defaults off, and permits manual start and continued queue processing on battery. Revoking it on battery pauses active work; changing it never automatically starts analysis. Sleep always pauses analysis. Ordinary settings saves preserve the native experimental/privacy state; resetting all settings explicitly resets these preferences too.
- **Download lifecycle:** pinned HTTPS URLs, per-file SHA-256/size checks, 150 MB hard catalog cap, bounded streamed writes, timeout/abort, temporary directory and atomic final rename, startup cleanup of interrupted downloads, offline verification and deletion. No renderer-supplied URLs/paths. A live development-only download through this manager successfully installed and verified all 34,302,907 bytes in a temporary directory; nothing was installed into the user's application profile.
- **Analysis worker:** CPU-only ONNX inference with one intra/inter-op thread, 256 MB JavaScript heap limit (native allocations are additional), bounded 10-second ffmpeg windows at beginning/middle/end, equal-weight normalized 512-dimensional embeddings and measured sample RMS. Decode and job timeouts, pause/disable cancellation, suspension pause, battery pause unless explicitly allowed, and release of the worker after the queue drains. No raw audio upload or remote inference; the worker explicitly disallows remote model loading.
- **Analysis storage:** schema **16** adds `song_analysis` with path/size/mtime, analyzer/model version, normalized Float32 embedding, RMS, status and error. Modified files, paths or versions are reanalysed on the next scan. Results for deleted/repointed/changed files are discarded. Song deletion/library clearing remove related analysis/history. Failed unchanged tracks are skipped until retry is requested.
- **Queue scope:** analysis starts manually from Experimental settings. Pause/restart resumes by scanning and skipping valid cached results; there is no persistent in-flight task record. Automatic import enqueue and automatic restart/resume are still to be implemented. OS priority adjustment is not implemented; CPU use is constrained by one inference thread and a short gap between tracks.
- **Packaging:** native ONNX runtime is unpacked from asar. The build strips other OS/architecture binaries and unused browser runtime assets. A macOS arm64 development package successfully ran the worker against a local model with networking disabled. Current ONNX 1.30.0 has no Intel macOS binary: analysis is explicitly unavailable there; listening history is available. Windows/Linux packaging and runtime execution still need platform QA. The macOS build reported existing missing icon assets and used the Electron icon; this is a development package, not an installed/release-ready bundle.
- **Validation:** the full release gate passed **129 tests**, including new model lifecycle, settings-state, queue/cache/cancellation and packaging tests. Real SQLite legacy migration and verified backup/restore now cover history and embeddings, malformed vectors, privacy clearing, deletion and late updates. `scripts/test-music-analysis.cjs <local-model-directory>` is an optional offline Electron/Node integration check using generated audio; it checks decode, 512-D finite/unit-normalized embeddings, repeated inference stability and missing-file errors, and never downloads a model. Packaged-worker inference also passed. Re-run the full gate after subsequent edits.
- **UI QA:** T3 preview exercised a clearly labeled simulated-status page for disabled/enabled/download progress/cancel and history-clearing controls with no horizontal overflow at desktop width. Snapshot/screenshot tooling returned an automation error, so there is no screenshot artifact. The temporary preview files were removed. Full native UI playback/recommendation QA is outstanding.
- **Accounting limits:** observation gaps above five seconds are conservatively excluded. Abrupt exit may lose progress since the last 15-second history checkpoint. Unfinished events are not skips. Incoming crossfade preview is excluded until handoff. Playback provenance currently distinguishes playlist and library only.

## Next work

1. Evaluate audio neighbours on varied, explicitly chosen music fixtures; compare against a reference implementation, including quantization and preprocessing parity. Recheck conversion licensing/notices before an upstream release.
2. Add durable automatic enqueue for imports and restart/resume policy while enabled/model-ready; validate cross-platform runtime packaging and an Intel macOS strategy. The current CPU-only `.npmrc` flag suppresses optional CUDA downloads during npm install; npm currently warns that arbitrary project configuration keys are deprecated, so document/use `ONNXRUNTIME_NODE_INSTALL=skip` explicitly if a future npm release stops forwarding it.
3. Add scalar BPM/key/confidence/loudness analysis and track insights; RMS alone must not be presented as perceptual energy or ReplayGain loudness.
4. The first audio-only Similar songs engine is implemented below. Next evaluate its neighbours, add metadata/history blending and explanations where useful, and build song/artist/album radio plus opt-in autoplay.
5. Implement playlist extension, seeded generation, sequencing, smart reorder and mixes in the earlier phased order.

The implementation was prepared on branch `feature/music-analysis`. No installed application or personal music library/profile was modified. Generated model/development package artifacts are untracked/ignored and must not be committed.

## Battery inference follow-up

Added `analysisOnBattery` as a native-owned persisted preference, exposed via trusted `analysis:set-battery` IPC and the typed preload bridge. Regular settings saves preserve this preference; Reset all settings turns it off. The Experimental library-analysis card has the toggle, and its start/retry buttons and battery message reflect the preference. Tests cover default blocking, explicit opt-in with no automatic start, unplugging, continued queue processing, revoking permission, invalid input, and sleep behavior. Validation: `npm run release:check` passed with **133 tests**, bridge/type checks, production build, database recovery and performance budgets.

## Similar songs (2026-10-16)

Implemented the first user-facing recommendation feature: right-click a library or playlist song and choose **Similar songs**. A native modal dialog displays up to 30 matches in descending cosine similarity of saved CLAP audio profiles. Play/queue a single match or the complete list using the existing player/queue actions. Playing the list replaces the queue; queuing it retains unrelated queued tracks and avoids duplicates through the existing album queue helper. The seed itself is excluded.

Search runs in a short-lived worker using a readonly SQLite connection, streamed vector rows and bounded parallel file checks. No ML inference or network is involved; saved profiles work even after removing the model or disabling new analysis, and comparisons can run on battery independently of inference policy. Only current model/analyzer versions, valid nonzero finite 512-D profiles, existing files and matching path/size/mtime are eligible. Non-positive cosine scores are excluded; tie-breaking is deterministic by song ID. The UI describes audio matching and does not label raw cosine values as confidence percentages. Metadata/history blending and subjective quality claims remain deferred.

The seed has explicit missing-file, unavailable, unanalyzed and stale-profile states, with a shortcut to Experimental analysis settings. Retry/error/loading and no-match states are handled. Results from a closed/replaced dialog are ignored. Queries have a 45-second deadline and a maximum of two concurrent workers, and app exit stops pending searches. No vectors or privileged paths cross the renderer bridge.

The dialog has keyboard focus wrapping, Escape/backdrop dismissal, focus restoration, responsive layout and feature-owned styles. Native top-layer rendering avoids clipping while retaining the app's theme variables. The existing song menu had no component-owned positioning/style rules in this checkout; a small scoped stylesheet makes its new Similar songs entry visible and usable. Its menu height reservation was adjusted for the extra action.

Validation: the full `npm run release:check` gate passed **136 tests**, bridge/type checks, build, database recovery, CSS checks and performance budgets. Three new tests include a real Electron/SQLite worker fixture for ranking, normalization, deterministic limits, model/analyzer mismatches, malformed/zero/nonfinite vectors, missing/repointed/size- or mtime-changed files, seed states and a seed changing during comparison. Worker request validation, concurrent-query limits and shutdown are covered. T3 preview used a labeled simulated library to verify the actual components, individual/bulk action payloads, analysis-settings navigation, error/retry and unanalyzed states, focus/Escape/backdrop behavior, and no horizontal overflow at 1280px and 390px. Temporary preview files are removed; this is component UI QA, not a listening-quality evaluation.

Packaged macOS arm64 validation also passed: a readonly SQLite similarity worker loaded from `app.asar` correctly ranked temporary saved profiles. An isolated-profile Electron/Vite startup loaded the full renderer without feature errors. No installed application or personal library was changed. Development package icon/signing caveats from the earlier phase still apply.

Preview screenshot: [Similar songs with simulated fixtures](../screenshots/similar-songs-preview.png). Listening-based evaluation remains open; automated fixtures establish ranking correctness and file/profile eligibility, not subjective musical taste.

## Daily mixes (implemented 2026-10-16)

Open **Playlists → Your daily mixes**. With at least five current, playable audio profiles, the app creates up to three mixes of up to 25 tracks. Use **Play mix** to start a new queue, **Queue** to append the selection, or **View & save** to inspect the ordered tracks, play/queue individual songs, edit a playlist name and save. Saving uses the ordinary playlist controller/persistence path, making an editable playlist snapshot. Existing playlists are preserved; name collisions receive a numbered suffix, and an identical named snapshot is reused. No new download or inference is needed. Saved profiles remain usable when analysis is paused, on battery, or after removing the downloaded model.

Generation runs in a short-lived worker through `analysis:daily-mixes` / `getDailyMixes({ refresh?: boolean })`, sharing the recommendation service's maximum of two workers and 45-second timeout. The renderer receives only a local day, edition, generation timestamp, eligible count, mix labels and ordered song IDs. File paths and vectors stay native. SQLite schema **17** adds `daily_mixes`, covered by the existing verified pre-migration backup and recovery mechanism.

Algorithm version 1:

- Normalize only compatible, finite, nonzero 512-dimensional profiles; verify model/analyzer versions, song path, on-disk size and mtime. Exclude missing/changed files and duplicate file paths.
- Choose up to `min(3, max(1, floor(eligible / 10)))` centers with deterministic daily initialization and farthest-first seeding. Avoid an additional center when its cosine distance is below 0.025. Refine spherical clusters twice, then assign disjoint groups. Groups with fewer than five tracks join their closest viable group, so smaller or homogeneous libraries get fewer mixes.
- Select and sequence up to 25 tracks per group using centroid similarity, deterministic daily variation, small liked/play-count bonuses, continuity with the previous track, an artist-count penalty and a stronger penalty for artists in the preceding two positions. Artist spacing is a preference and relaxes when variety is unavailable. There is no skip-as-dislike rule and no use of detailed listening events yet.
- Labels are “Daily mix 1/2/3” with artists from the actual selection. These are sound-based groups, with no claims about BPM, key, mood or harmonic sequencing. Similarity explains grouping; daily variation and mild familiarity bonuses explain selection within a group.

The cache is keyed by local calendar day and fingerprints the generator/model/analyzer version plus eligible song IDs and file/profile identity. It keeps seven days, survives restarts and freezes affinity changes for the current edition. Changed profile/file eligibility regenerates it when requested. **Refresh mixes** advances the edition; it can change order and, with enough candidates, membership. Very small libraries necessarily repeat tracks across editions. No track appears in two simultaneous mixes. Cache generation and clustering do not hold a SQLite write lock; a short immediate transaction validates current profile identity and commits the result, handling concurrent requests without overwriting a newer edition. Selected files are checked again after generation. Clearing analysis or the whole library also clears cached mixes; saved playlists remain independent.

The Playlists shelf loads today's cache on entry and checks day rollover at local midnight and window focus. Newly analyzed tracks are picked up by Refresh mixes or by reopening the page. Loading, insufficient-analysis, retry/error and empty states have a route to Experimental settings. Preview lists expand inline with native buttons and labeled inputs, avoiding a second modal. Component styles live in `src/features/analysis/daily-mixes.css`.

Validation includes synthetic fixtures for determinism, separated groups, disjointness, caps, artist spacing and homogeneous/small libraries; real Electron/SQLite workers for persistence across worker restarts, refresh editions, day changes, invalid/missing files, profile clearing, selected files changing during generation and saved-playlist independence; playlist-name/ID filtering tests; and cache migration/verified-backup restoration. A development smoke on 1,500 synthetic profiles generated three mixes in about 319 ms (algorithm only, no disk scan; not a recommendation-quality benchmark). T3 component preview used explicitly simulated tracks to verify bulk play/queue/save payloads, a 25-track inline preview, save feedback, retry and insufficient-analysis settings navigation, and no horizontal overflow at 1280px or 390px. Temporary preview files were removed. Listening-based quality evaluation remains open.

Next playlist work, intentionally separate from this slice: seed-driven generator controls, playlist extension, user-adjustable familiarity/length, detailed listening/session affinity, rediscovery mixes and smart reordering. Collect listening feedback before tuning clustering thresholds or claiming musical quality.

Final validation for this slice: `npm run release:check` passed **140 tests**, bridge/type checks, CSS ownership/hygiene, build, schema-17 database recovery and performance budgets. An unsigned macOS arm64 development package built successfully; its actual `app.asar` daily-mixes worker generated five-track fixtures, reused the persistent cache and advanced an explicit refresh edition. Existing development icon/signing caveats apply. No personal library or installed application was changed. Restart Electron to register the new native IPC handler before testing this change; renderer hot reload alone does not register it.

## Draft review status (2026-10-17)

This draft covers experimental analysis, local listening events, Similar songs and Daily mixes. A reported crossfade playback issue remains unresolved; the current workaround is disabling crossfade. Attempts to fix crossfade timing/audio-graph behavior are excluded from this change and deferred for separate investigation. Listening-event integration retains transition accounting but does not claim to fix crossfade playback.

Before merge/release: review model-conversion provenance and notices, validate Windows/Linux native packaging/inference, evaluate recommendations by listening, and collect maintainer feedback on feature scope and bundled runtime cost. Only macOS arm64 packaging/runtime has been exercised locally.

[Daily mixes on a narrow viewport, simulated tracks](../screenshots/daily-mixes-preview.png). Screenshots demonstrate component UI, not personal library data or recommendation quality.
