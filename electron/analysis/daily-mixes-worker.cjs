const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const { getDailyMixes } = require("./daily-mixes.cjs");

(async () => {
  let database;
  let response;
  try {
    database = new Database(workerData.databasePath, { fileMustExist: true });
    database.pragma("busy_timeout = 5000");
    response = { result: await getDailyMixes(database, workerData.request) };
  } catch {
    response = { error: "Could not generate daily mixes. Please retry or rerun library analysis." };
  } finally {
    database?.close();
    parentPort.postMessage(response);
    parentPort.close();
  }
})();
