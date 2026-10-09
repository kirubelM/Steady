// Checks GitHub Releases for a newer version, downloads it in the background,
// and installs it when Steady quits (or right away from the tray menu).
const { app, powerMonitor } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('./logger');

const CHECK_EVERY = 6 * 3600000;
const RETRY_AFTER_ERROR = 10 * 60000; // e.g. the PC was offline; don't wait six hours
let readyVersion = null;
let retryTimer = null;

const check = () => autoUpdater.checkForUpdates().catch(() => {});

function init({ notify, onReady }) {
  if (!app.isPackaged) return; // nothing to update when running from source

  autoUpdater.logger = {
    info: (m) => log.info('Updater', m),
    warn: (m) => log.warn('Updater', m),
    error: (m) => log.error('Updater', m),
    debug: () => {}
  };
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('update-downloaded', (info) => {
    readyVersion = info.version;
    notify(`Steady ${info.version} is ready`, 'It installs the next time Steady quits, or choose "Restart to update" in the tray menu.');
    onReady();
  });
  autoUpdater.on('error', (err) => {
    log.warn('Update check failed', err && err.message);
    if (!retryTimer) retryTimer = setTimeout(() => { retryTimer = null; check(); }, RETRY_AFTER_ERROR);
  });

  setTimeout(check, 30000); // let startup settle first
  setInterval(check, CHECK_EVERY);
  // After sleep the network takes a moment to come back.
  powerMonitor.on('resume', () => setTimeout(check, 60000));
}

// "Check for updates" in Settings.
async function checkNow() {
  if (!app.isPackaged) return { state: 'dev' };
  if (readyVersion) return { state: 'ready', version: readyVersion };
  try {
    const r = await autoUpdater.checkForUpdates();
    const version = r && r.updateInfo && r.updateInfo.version;
    if (r && r.isUpdateAvailable) return { state: 'downloading', version };
    return { state: 'latest' };
  } catch (e) {
    return { state: 'error', error: e && e.message };
  }
}

function installNow() {
  app.isQuitting = true;
  autoUpdater.quitAndInstall(true, true); // silent install, reopen afterwards
}

module.exports = { init, checkNow, installNow, readyVersion: () => readyVersion };
