const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const { findSimilarSongs } = require("./similarity.cjs");

(async () => {
  let database;
  let response;
  try {
    database = new Database(workerData.databasePath, { readonly: true, fileMustExist: true });
    database.pragma("query_only = ON");
    database.pragma("busy_timeout = 5000");
    response = { result: await findSimilarSongs(database, workerData.request) };
  } catch {
    response = { error: "Could not compare audio profiles. Please retry or rerun library analysis." };
  } finally {
    database?.close();
    parentPort.postMessage(response);
    parentPort.close();
  }
})();
