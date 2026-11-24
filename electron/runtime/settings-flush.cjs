const { randomUUID } = require("node:crypto");

function createSettingsFlushRuntime({ timeoutMs = 5000 } = {}) {
  const ready = new WeakSet();
  const requests = new WeakMap();
  function settle(contents, id, saved) {
    const pending = requests.get(contents);
    if (!pending || pending.id !== id) return false;
    requests.delete(contents);
    clearTimeout(pending.timer);
    pending.resolve(saved === true);
    return true;
  }
  return {
    ready(contents) { ready.add(contents); },
    hasReady(contents) { return Boolean(contents && ready.has(contents) && !contents.isDestroyed()); },
    forget(contents) {
      ready.delete(contents);
      const pending = requests.get(contents);
      if (pending) settle(contents, pending.id, false);
    },
    request(contents) {
      if (!this.hasReady(contents)) return Promise.resolve(true);
      const existing = requests.get(contents);
      if (existing) return existing.promise;
      const id = randomUUID();
      let resolve;
      const promise = new Promise(done => { resolve = done; });
      const timer = setTimeout(() => settle(contents, id, false), timeoutMs);
      requests.set(contents, { id, promise, resolve, timer });
      try { contents.send("settings:flush-request", id); }
      catch { settle(contents, id, false); }
      return promise;
    },
    complete(contents, id, saved) { return settle(contents, id, saved); }
  };
}
module.exports = { createSettingsFlushRuntime };

function createWindowCloseRuntime({settingsFlush, dialog, quitApproved, quitPending, shouldHideToTray, ensureTray}) {
  const closeFlushApproved = new WeakSet(), closeFlushPending = new WeakSet();
  const flushConfirmations = new WeakMap();
  function confirmSettingsFlush(win) {
    if (!win || win.isDestroyed()) return Promise.resolve(true);
    const existing = flushConfirmations.get(win);
    if (existing) return existing;
    const confirmation = confirmPendingSettings(win).finally(() => flushConfirmations.delete(win));
    flushConfirmations.set(win, confirmation);
    return confirmation;
  }

  async function confirmPendingSettings(win) {
    if (!win || win.isDestroyed() || await settingsFlush.request(win.webContents)) return true;
    if (win.isDestroyed()) return true;
    try {
      const { response } = await dialog.showMessageBox(win, {
        type: "warning", title: "Unsaved changes", message: "Localtify could not finish saving settings, playlists or listening history.",
        detail: "Keep Localtify open to retry, or exit and retain the last saved data.",
        buttons: ["Keep open", "Exit without saving"], defaultId: 0, cancelId: 0
      });
      return response === 1;
    } catch { return false; }
  }

  function attachCloseToTray(win) {
    if (!win || win.__localitfyCloseToTrayAttached) return;
    win.__localitfyCloseToTrayAttached = true;
    win.on("close", (event) => {
      if (win.isDestroyed() || quitApproved() || closeFlushApproved.has(win)) return;
      if (shouldHideToTray()) {
        event.preventDefault();
        win.hide();
        ensureTray();
        return;
      }
      if (!settingsFlush.hasReady(win.webContents)) return;
      event.preventDefault();
      if (closeFlushPending.has(win) || quitPending()) return;
      closeFlushPending.add(win);
      void confirmSettingsFlush(win).then(saved => {
        if (saved && !win.isDestroyed()) {
          closeFlushApproved.add(win);
          win.close();
          closeFlushApproved.delete(win);
        }
      }).finally(() => closeFlushPending.delete(win));
    });
  }


  return {confirmSettingsFlush, attachCloseToTray};
}
module.exports.createWindowCloseRuntime = createWindowCloseRuntime;

function createAppShutdownRuntime({app, getWindow, settingsFlush, confirm, cleanup}) {
  let approved = false, pending = false, started = false, allowQuit = false;
  let startupTimer = null;
  function approveQuit() { approved = true; allowQuit = true; }
  function requestQuit() { allowQuit = true; app.quit(); }
  async function beforeQuit(event) {
    if (started) return;
    const win = getWindow();
    if (!approved && win && !win.isDestroyed() && settingsFlush.hasReady(win.webContents)) {
      event.preventDefault();
      if (pending) return;
      pending = true;
      let saved = false;
      try { saved = await confirm(win); } catch {} finally { pending = false; }
      if (!saved) { allowQuit = false; return; }
      approveQuit();
      app.quit();
      return;
    }
    started = true;
    allowQuit = true;
    clearTimeout(startupTimer);
    startupTimer = null;
    await cleanup();
  }
  return {
    isApproved: () => approved, isPending: () => pending, isStarted: () => started,
    isQuitAllowed: () => allowQuit, setAllowQuit: value => { allowQuit = Boolean(value); },
    approveQuit, requestQuit, beforeQuit,
    scheduleStartup(callback, delay) {
      clearTimeout(startupTimer);
      if (started) return;
      startupTimer = setTimeout(() => { startupTimer = null; if (!started) callback(); }, delay);
    }
  };
}
module.exports.createAppShutdownRuntime = createAppShutdownRuntime;
