const path = require("node:path");
const { createSimilarityService } = require("../analysis/similarity-service.cjs");
const { createAnalysisService } = require("../analysis/service.cjs");

function registerAnalysisIpc(router, { app, powerMonitor, repositories, ffmpegPath }) {
  let service;
  const similarity = createSimilarityService({ getDatabasePath: () => repositories.database.status().path });
  router.handle("analysis:similar-songs", (_event, payload) => similarity.find(payload));
  router.handle("analysis:daily-mixes", (_event, payload) => similarity.dailyMixes(payload));
  const get = () => (service ||= createAnalysisService({
    root: path.join(app.getPath("userData"), "experimental-models"), ffmpegPath, repositories, powerMonitor
  }));
  router.handle("analysis:status", () => get().status());
  router.handle("analysis:set-battery", (_event, allowed) => get().setAllowOnBattery(allowed));
  router.handle("analysis:set-enabled", (_event, enabled) => get().setEnabled(enabled));
  router.handle("analysis:download-model", () => get().download());
  router.handle("analysis:cancel-download", () => get().cancelDownload());
  router.handle("analysis:remove-model", () => get().removeModel());
  router.handle("analysis:start", (_event, options) => get().start({ retry: options?.retry === true }));
  router.handle("analysis:pause", () => get().pause());
  router.handle("analysis:clear", () => get().clearAnalysis());
  router.handle("listening:set-enabled", (_event, enabled) => get().setHistoryEnabled(enabled));
  router.handle("listening:clear", () => get().clearHistory());
  app.once("before-quit", () => { similarity.dispose(); void service?.dispose(); });
}
function preserveExperimentalSettings(settings, saved) {
  return { ...settings, experimentalMusicAnalysis: saved.experimentalMusicAnalysis === true,
    analysisOnBattery: saved.analysisOnBattery === true,
    listeningHistoryEnabled: saved.listeningHistoryEnabled !== false,
    listeningHistoryClearedAt: Number(saved.listeningHistoryClearedAt || 0) };
}
module.exports = { registerAnalysisIpc, preserveExperimentalSettings };
