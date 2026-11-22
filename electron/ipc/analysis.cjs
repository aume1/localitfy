const path = require("node:path");
const fs = require("node:fs/promises");
const { createSimilarityService } = require("../analysis/similarity-service.cjs");
const { createAnalysisService } = require("../analysis/service.cjs");

function registerAnalysisIpc(router, { app, powerMonitor, repositories, ffmpegPath }) {
  let service;
  const root = path.join(app.getPath("userData"), "experimental-models");
  void fs.readdir(root).then(entries => Promise.allSettled(entries.filter(name =>
    name === "clap-htsat-unfused-text-q8-v1" || /^clap-htsat-unfused-text-q8-v1\.partial-[a-f0-9-]{36}$/i.test(name)
  ).map(name => fs.rm(path.join(root, name), { recursive: true, force: true })))).catch(() => undefined);
  const similarity = createSimilarityService({ getDatabasePath: () => repositories.database.status().path });
  router.handle("analysis:similar-songs", (_event, payload) => similarity.find(payload));
  router.handle("analysis:daily-mixes", (_event, payload) => similarity.dailyMixes(payload));
  const get = () => (service ||= createAnalysisService({
    root, ffmpegPath, repositories, powerMonitor
  }));
  router.handle("analysis:status", () => get().status());
  router.handle("analysis:set-battery", (_event, allowed) => get().setAllowOnBattery(allowed));
  router.handle("analysis:set-enabled", (_event, enabled) => get().setEnabled(enabled));
  router.handle("analysis:download-model", (_event, target) => get().download(target));
  router.handle("analysis:cancel-download", (_event, target) => get().cancelDownload(target));
  router.handle("analysis:remove-model", (_event, target) => get().removeModel(target));
  router.handle("analysis:start", (_event, options) => get().start({ retry: options?.retry === true }));
  router.handle("analysis:pause", () => get().pause());
  router.handle("analysis:clear", () => get().clearAnalysis());
  router.handle("listening:set-enabled", (_event, enabled) => get().setHistoryEnabled(enabled));
  router.handle("listening:clear", () => get().clearHistory());
  router.handle("listening:summary", (_event, payload) => {
    const days = [7, 30, 90].includes(payload?.days) ? payload.days : 30;
    return repositories.listening.summary({ days });
  });
  router.handle("listening:calendar-summary", (_event, payload) => {
    const range = ["week","month","year"].includes(payload?.range) ? payload.range : "month";
    const offset = Number.isSafeInteger(payload?.offset) && payload.offset >= 0 && payload.offset <= 120 ? payload.offset : 0;
    return repositories.listening.calendarSummary({ range, offset });
  });
  app.once("before-quit", () => { similarity.dispose(); void service?.dispose(); });
}
function preserveExperimentalSettings(settings, saved) {
  return { ...settings, experimentalMusicAnalysis: saved.experimentalMusicAnalysis === true,
    analysisOnBattery: saved.analysisOnBattery === true,
    listeningHistoryEnabled: saved.listeningHistoryEnabled !== false,
    listeningHistoryClearedAt: Number(saved.listeningHistoryClearedAt || 0) };
}
module.exports = { registerAnalysisIpc, preserveExperimentalSettings };
