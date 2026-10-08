// Checks GitHub Releases for a newer version, downloads it in the background,
// and installs it when Steady quits (or right away from the tray menu).
const { app } = require('electron');
const { autoUpdater } = require('electron-updater');
const log = require('./logger');

const CHECK_EVERY = 6 * 3600000;
let readyVersion = null;

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
  autoUpdater.on('error', (err) => log.warn('Update check failed', err && err.message));

  const check = () => autoUpdater.checkForUpdates().catch(() => {});
  setTimeout(check, 30000); // let startup settle first
  setInterval(check, CHECK_EVERY);
}

function installNow() {
  app.isQuitting = true;
  autoUpdater.quitAndInstall(true, true); // silent install, reopen afterwards
}

module.exports = { init, installNow, readyVersion: () => readyVersion };
