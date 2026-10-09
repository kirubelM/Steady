const {
  app, BrowserWindow, ipcMain, Notification, dialog, screen, globalShortcut,
  powerMonitor, Tray, Menu, nativeImage, clipboard, nativeTheme, shell, net
} = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { spawn, exec } = require('child_process');
const log = require('./logger');
const backup = require('./backup');
const calendar = require('./calendar');
const updater = require('./updater');

app.setAppUserModelId(app.isPackaged ? 'com.steady.focus' : process.execPath);

let mainWindow = null;
let miniWindow = null;
let captureWindow = null;
let recoveredFrom = null;
let tray = null;
let breakWindows = [];
let breakActive = false;
let watcher = null;
let idlePoller = null;
let data = null;
let lastState = { state: 'idle', remaining: 0, total: 1, task: '', start: 0 };
let miniOverride = null;      // null | 'show' | 'hide' — reset whenever a new session starts
let miniOverrideStart = 0;
const liveNotifications = new Set();
const startHidden = process.argv.includes('--hidden');

/* ---------- Storage ---------- */

const DEFAULTS = {
  settings: {
    focusMin: 30,
    shortBreakMin: 5,
    longBreakMin: 15,
    longEvery: 4,
    strictBreaks: false,
    snoozeMin: 5,
    maxSnoozes: 2,
    meetingAware: true,
    eyeBreaks: true,
    eyeEveryMin: 20,
    idleCheckins: true,
    idleCheckinMin: 30,
    idleAutoPause: true,
    idlePauseMin: 5,
    dailyGoalMin: 240,
    reviewEnabled: true,
    reviewTime: '17:30',
    weeklyReview: true,
    weeklyReviewDay: 5,
    miniMode: 'focus',
    theme: 'system',
    compactAuto: false,
    sound: 'off',
    soundVolume: 0.5,
    soundInBreaks: false,
    presetId: 'standard',
    presets: [
      { id: 'classic', name: 'Classic', focusMin: 25, breakMin: 5 },
      { id: 'standard', name: 'Standard', focusMin: 30, breakMin: 5 },
      { id: 'deep', name: 'Deep work', focusMin: 50, breakMin: 10 },
      { id: 'long', name: 'Long block', focusMin: 90, breakMin: 15 }
    ],
    workStart: '09:00',
    workEnd: '17:00',
    calendars: [], // { id, kind: 'outlook' | 'link', name, url }
    accent: 'pine',
    projectTint: true,
    dayTint: true,
    chimes: false,
    backupKeepDays: 30,
    startAtLogin: false,
    startMinimized: true,
    blockSites: false,
    blockedSites: ['youtube.com', 'reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com'],
    distractionKeywords: ['YouTube', 'Reddit', 'Twitter', ' / X', 'Facebook', 'Instagram', 'TikTok', 'Netflix']
  },
  entries: [],
  parking: [],
  tasks: [],
  recurring: [],
  projects: [],
  notes: {},
  meta: {}
};

const dataFile = () => path.join(app.getPath('userData'), 'steady-data.json');

function normalize(raw) {
  const base = structuredClone(DEFAULTS);
  // Older versions had a single focus length; carry it into the "Standard" preset.
  if (raw.settings && !Array.isArray(raw.settings.presets)) {
    raw.settings.presets = structuredClone(base.settings.presets);
    const std = raw.settings.presets.find((p) => p.id === 'standard');
    std.focusMin = raw.settings.focusMin || 30;
    std.breakMin = raw.settings.shortBreakMin || 5;
  }
  // Before 1.3.1 there was a single calendar source; carry it into the list.
  if (raw.settings && !Array.isArray(raw.settings.calendars)) {
    const { calendarSource: src, calendarUrl: url } = raw.settings;
    raw.settings.calendars = src === 'outlook' ? [{ id: 'outlook', kind: 'outlook', name: 'Outlook' }]
      : src === 'link' && url ? [{ id: 'link1', kind: 'link', name: 'Calendar', url }]
        : [];
  }
  if (raw.settings) {
    delete raw.settings.calendarSource;
    delete raw.settings.calendarUrl;
    raw.settings.calendars = raw.settings.calendars
      .filter((c) => c && c.id && (c.kind === 'outlook' || (c.kind === 'link' && c.url)));
  }
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    parking: Array.isArray(raw.parking) ? raw.parking : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    recurring: Array.isArray(raw.recurring) ? raw.recurring : [],
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {}
  };
}

// Loads the data file. If it's damaged, keeps a copy and recovers from the newest good backup
// instead of silently starting over.
function loadData() {
  const file = dataFile();
  if (!fs.existsSync(file)) return normalize({});
  try {
    return normalize(JSON.parse(fs.readFileSync(file, 'utf8')));
  } catch (e) {
    log.error('Data file could not be read', e.message);
    const damaged = file.replace(/\.json$/, `.damaged-${Date.now()}.json`);
    try { fs.copyFileSync(file, damaged); } catch { /* ignore */ }
    const good = backup.newestValid();
    if (good) {
      recoveredFrom = good.name;
      log.warn('Recovered data from backup', good.name);
      return normalize(good.data);
    }
    recoveredFrom = 'none';
    return normalize({});
  }
}

function saveData() {
  const file = dataFile();
  const tmp = file + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, file);
}

function notify(title, body) {
  if (!Notification.isSupported()) return;
  const n = new Notification({ title, body });
  liveNotifications.add(n);
  n.on('click', showMain);
  n.on('close', () => liveNotifications.delete(n));
  setTimeout(() => liveNotifications.delete(n), 60000);
  n.show();
}

/* ---------- Main window ---------- */

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1140,
    height: 780,
    minWidth: 900,
    minHeight: 640,
    title: 'Steady',
    show: !startHidden,
    backgroundColor: nativeTheme.shouldUseDarkColors ? '#151D1F' : '#E8EDEC',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required' // focus sounds start without a click
    }
  });
  mainWindow.loadFile('index.html');
  mainWindow.webContents.on('did-finish-load', () => { miniShownSent = null; updateMini(); });
  // Keep the tray's Show/Hide Steady label in step with the window.
  for (const ev of ['show', 'hide', 'minimize', 'restore']) mainWindow.on(ev, updateTray);

  // Closing the window keeps Steady running in the tray; "Quit Steady" in the tray menu exits.
  mainWindow.on('close', (e) => {
    if (app.isQuitting) return;
    e.preventDefault();
    mainWindow.hide();
    if (!data.trayHintShown) {
      data.trayHintShown = true;
      saveData();
      notify('Steady is still running', 'It lives in the system tray now. Right-click the icon to quit.');
    }
  });
  mainWindow.on('focus', updateMini);
  mainWindow.on('blur', updateMini);
  mainWindow.on('show', updateMini);
  mainWindow.on('hide', updateMini);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function showMain() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.show();
  // Windows blocks background apps from stealing focus; briefly pinning on top gets around it.
  mainWindow.setAlwaysOnTop(true);
  mainWindow.focus();
  mainWindow.setAlwaysOnTop(false);
}

const mainVisible = () => !!(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && !mainWindow.isMinimized());

function toggleMain() {
  if (mainVisible()) mainWindow.hide();
  else showMain();
}

function sendToMain(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

/* ---------- Theme and compact window ---------- */

function applyTheme() {
  const t = data.settings.theme;
  nativeTheme.themeSource = ['light', 'dark'].includes(t) ? t : 'system';
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.setBackgroundColor(nativeTheme.shouldUseDarkColors ? '#151D1F' : '#E8EDEC');
  }
}

let normalBounds = null;

function setCompact(on) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (on) {
    if (!normalBounds) normalBounds = mainWindow.getBounds();
    if (mainWindow.isMaximized()) mainWindow.unmaximize();
    mainWindow.setMinimumSize(380, 560);
    const b = mainWindow.getBounds();
    const wa = screen.getDisplayMatching(b).workArea;
    const height = Math.min(780, wa.height - 20);
    mainWindow.setBounds({
      x: Math.min(b.x + b.width - 430, wa.x + wa.width - 430),
      y: Math.max(wa.y, Math.min(b.y, wa.y + wa.height - height)),
      width: 430,
      height
    });
  } else {
    mainWindow.setMinimumSize(900, 640);
    if (normalBounds) mainWindow.setBounds(normalBounds);
    normalBounds = null;
  }
}

/* ---------- Tray ---------- */

const iconCache = new Map();

// Draws a small ring icon in code, so the app needs no image files.
function ringIcon(progress, color, track = [128, 140, 145, 110]) {
  const steps = Math.round(Math.max(0, Math.min(1, progress)) * 40);
  const key = `${steps}|${color.join(',')}|${track.join(',')}`;
  if (iconCache.has(key)) return iconCache.get(key);

  const size = 32;
  const buf = Buffer.alloc(size * size * 4);
  const c = (size - 1) / 2;
  const rMid = 11.5;
  const half = 3;
  const p = steps / 40;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const dx = x - c;
      const dy = y - c;
      const d = Math.sqrt(dx * dx + dy * dy);
      let ang = Math.atan2(dx, -dy);
      if (ang < 0) ang += Math.PI * 2;
      const cover = Math.max(0, Math.min(1, half + 0.5 - Math.abs(d - rMid)));
      if (!cover) continue;
      const [r, g, b, a] = ang / (Math.PI * 2) <= p ? [...color, 255] : track;
      const alpha = (a / 255) * cover;
      const i = (y * size + x) * 4;
      buf[i] = Math.round(b * alpha);
      buf[i + 1] = Math.round(g * alpha);
      buf[i + 2] = Math.round(r * alpha);
      buf[i + 3] = Math.round(alpha * 255);
    }
  }
  const img = nativeImage.createFromBitmap(buf, { width: size, height: size, scaleFactor: 2 });
  iconCache.set(key, img);
  return img;
}

const PINE = [63, 163, 144];
const AMBER = [210, 154, 46];

function trayIconFor(st) {
  if (st.state === 'focus') return ringIcon(1 - st.remaining / st.total, PINE);
  if (st.state === 'paused') return ringIcon(1 - st.remaining / st.total, [150, 160, 165]);
  if (st.state === 'break' || st.state === 'breakPending' || st.state === 'checkin') return ringIcon(1, AMBER);
  return ringIcon(1, PINE);
}

function fmtClock(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

let lastMenuKey = '';

function updateTray() {
  if (!tray) return;
  const st = lastState;
  tray.setImage(trayIconFor(st));

  const tip = {
    focus: `${fmtClock(st.remaining)} left: ${st.task}`,
    paused: `Paused: ${st.task}`,
    checkin: 'Session done. Log what you did.',
    break: 'On a break',
    breakPending: 'Break waiting'
  }[st.state] || 'Ready to focus';
  tray.setToolTip(`Steady\n${tip}`.slice(0, 127));

  const menuKey = `${st.state}|${st.task}|${miniWindow && miniWindow.isVisible()}|${mainVisible()}|${updater.readyVersion()}`;
  if (menuKey === lastMenuKey) return;
  lastMenuKey = menuKey;

  const cmd = (c) => () => sendToMain('command', c);
  const items = [];
  const statusLabel = {
    focus: `Focusing on ${st.task}`,
    paused: `Paused: ${st.task}`,
    checkin: 'Waiting for your check-in',
    break: 'On a break',
    breakPending: 'Break waiting'
  }[st.state] || 'Ready to focus';
  items.push({ label: statusLabel.slice(0, 60), enabled: false });
  items.push({ type: 'separator' });

  if (st.state === 'idle') items.push({ label: 'Start focus', click: cmd('start') });
  if (st.state === 'focus') items.push({ label: 'Pause', click: cmd('pause') });
  if (st.state === 'paused') items.push({ label: 'Resume', click: cmd('resume') });
  if (st.state === 'focus' || st.state === 'paused') items.push({ label: 'End session', click: cmd('end') });
  if (st.state === 'breakPending') {
    items.push({ label: 'Take break now', click: cmd('break-now') });
    items.push({ label: 'Skip break', click: cmd('break-skip') });
  }
  if (st.state === 'checkin') items.push({ label: 'Log session', click: showMain });

  items.push({ type: 'separator' });
  items.push({ label: mainVisible() ? 'Hide Steady' : 'Show Steady', click: toggleMain });
  items.push({ label: miniWindow && miniWindow.isVisible() ? 'Hide mini timer' : 'Show mini timer', click: toggleMini });
  items.push({ label: 'Review my day', click: () => { showMain(); sendToMain('command', 'review'); } });
  items.push({ type: 'separator' });
  if (updater.readyVersion()) {
    items.push({ label: `Restart to update (${updater.readyVersion()})`, click: updater.installNow });
  }
  items.push({ label: 'Quit Steady', click: () => { app.isQuitting = true; app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  tray = new Tray(ringIcon(1, PINE));
  tray.on('click', showMain);
  updateTray();
}

/* ---------- Mini timer ---------- */

function miniWanted() {
  const st = lastState;
  if (st.start !== miniOverrideStart) { miniOverride = null; }
  if (miniOverride === 'show') return true;
  if (miniOverride === 'hide') return false;
  const mode = data.settings.miniMode;
  if (mode === 'off') return false;
  const mainInFront = mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible() && mainWindow.isFocused();
  if (mainInFront) return false;
  if (mode === 'always') return true;
  return ['focus', 'paused', 'breakPending'].includes(st.state);
}

function createMiniWindow() {
  const wa = screen.getPrimaryDisplay().workArea;
  const W = 290;
  const H = 72;
  let { x, y } = data.miniPos || { x: wa.x + wa.width - W - 16, y: wa.y + wa.height - H - 16 };
  // Keep it on a screen that still exists.
  const onScreen = screen.getAllDisplays().some((d) =>
    x >= d.workArea.x - 10 && y >= d.workArea.y - 10 &&
    x + W <= d.workArea.x + d.workArea.width + 10 && y + H <= d.workArea.y + d.workArea.height + 10);
  if (!onScreen) { x = wa.x + wa.width - W - 16; y = wa.y + wa.height - H - 16; }

  miniWindow = new BrowserWindow({
    x, y, width: W, height: H,
    frame: false,
    transparent: true,
    resizable: false,
    maximizable: false,
    minimizable: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    show: false,
    hasShadow: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });
  miniWindow.setAlwaysOnTop(true, 'floating');
  miniWindow.loadFile('mini.html');
  miniWindow.webContents.on('did-finish-load', () => miniWindow.webContents.send('mini:state', lastState));
  let saveTimer = null;
  miniWindow.on('moved', () => {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      if (!miniWindow) return;
      const [mx, my] = miniWindow.getPosition();
      data.miniPos = { x: mx, y: my };
      saveData();
    }, 500);
  });
  miniWindow.on('closed', () => { miniWindow = null; });
}

let miniShownSent = null;

function updateMini() {
  if (!data) return;
  const want = miniWanted();
  // Lets the main window label its link "Show mini timer" or "Hide mini timer".
  if (want !== miniShownSent) { miniShownSent = want; sendToMain('mini:visible', want); }
  if (want) {
    if (!miniWindow) createMiniWindow();
    if (!miniWindow.isVisible()) miniWindow.showInactive();
    miniWindow.webContents.send('mini:state', lastState);
  } else if (miniWindow && miniWindow.isVisible()) {
    miniWindow.hide();
  }
  updateTray();
}

function toggleMini() {
  miniOverrideStart = lastState.start;
  miniOverride = miniWindow && miniWindow.isVisible() ? 'hide' : 'show';
  updateMini();
}

/* ---------- Active window, call and presentation watcher (Windows) ---------- */

// Reports the foreground app and window title every 2 seconds. Every 10 seconds it also
// checks whether any app is using the microphone (a call) and whether Windows is in
// presentation mode, so breaks can wait until you're done.
const PS_SCRIPT = String.raw`
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
Add-Type @"
using System;
using System.Runtime.InteropServices;
using System.Text;
public static class SteadyWin {
  [DllImport("user32.dll")] public static extern IntPtr GetForegroundWindow();
  [DllImport("user32.dll", CharSet = CharSet.Unicode)] public static extern int GetWindowText(IntPtr hWnd, StringBuilder text, int count);
  [DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
  [DllImport("shell32.dll")] public static extern int SHQueryUserNotificationState(out int state);
}
"@
function Test-Mic {
  $base = 'HKCU:\Software\Microsoft\Windows\CurrentVersion\CapabilityAccessManager\ConsentStore\microphone'
  foreach ($p in @($base, "$base\NonPackaged")) {
    if (-not (Test-Path $p)) { continue }
    foreach ($k in (Get-ChildItem $p -ErrorAction SilentlyContinue)) {
      $v = Get-ItemProperty $k.PSPath -ErrorAction SilentlyContinue
      if ($v -and $v.LastUsedTimeStart -gt 0 -and $v.LastUsedTimeStop -eq 0) { return $true }
    }
  }
  return $false
}
$mic = $false
$i = 0
while ($true) {
  if ($i % 5 -eq 0) { try { $mic = Test-Mic } catch { $mic = $false } }
  $i++
  $h = [SteadyWin]::GetForegroundWindow()
  $sb = New-Object System.Text.StringBuilder 512
  [void][SteadyWin]::GetWindowText($h, $sb, 512)
  [uint32]$procId = 0
  [void][SteadyWin]::GetWindowThreadProcessId($h, [ref]$procId)
  $name = ''
  try { $name = (Get-Process -Id $procId -ErrorAction Stop).ProcessName } catch {}
  [int]$qs = 0
  try { [void][SteadyWin]::SHQueryUserNotificationState([ref]$qs) } catch {}
  $json = @{ app = $name; title = $sb.ToString(); mic = $mic; qs = $qs } | ConvertTo-Json -Compress
  [Console]::Out.WriteLine($json)
  [Console]::Out.Flush()
  Start-Sleep -Seconds 2
}
`;

function sendActivity(info) {
  sendToMain('activity', {
    app: info.app || '',
    title: info.title || '',
    mic: !!info.mic,
    presenting: info.qs === 4, // QUNS_PRESENTATION_MODE
    idle: powerMonitor.getSystemIdleTime()
  });
}

function startWatcher() {
  if (process.platform !== 'win32') {
    idlePoller = setInterval(() => sendActivity({}), 2000);
    return;
  }
  const encoded = Buffer.from(PS_SCRIPT, 'utf16le').toString('base64');
  watcher = spawn('powershell.exe',
    ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
    { windowsHide: true });

  let buffer = '';
  watcher.stdout.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let i;
    while ((i = buffer.indexOf('\n')) >= 0) {
      const line = buffer.slice(0, i).trim();
      buffer = buffer.slice(i + 1);
      if (!line) continue;
      try { sendActivity(JSON.parse(line)); } catch { /* ignore malformed line */ }
    }
  });
  watcher.on('exit', () => {
    watcher = null;
    if (!app.isQuitting) setTimeout(startWatcher, 5000);
  });
}

/* ---------- Site blocking via the hosts file ---------- */

const HOSTS = path.join(process.env.SystemRoot || 'C:\\Windows', 'System32', 'drivers', 'etc', 'hosts');
const BLOCK_START = '# >>> Steady focus block (removed automatically after each session)';
const BLOCK_END = '# <<< Steady focus block';

function stripBlock(text) {
  const out = [];
  let inside = false;
  for (const line of text.split(/\r?\n/)) {
    if (line.startsWith('# >>> Steady')) { inside = true; continue; }
    if (line.startsWith('# <<< Steady')) { inside = false; continue; }
    if (!inside) out.push(line);
  }
  while (out.length && out[out.length - 1].trim() === '') out.pop();
  return out.join('\r\n') + '\r\n';
}

function normalizeHost(s) {
  return String(s).trim().toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/\/.*$/, '')
    .replace(/[^a-z0-9.-]/g, '');
}

function flushDns() {
  exec('ipconfig /flushdns', { windowsHide: true }, () => {});
}

function permissionMessage(e) {
  return (e.code === 'EPERM' || e.code === 'EACCES')
    ? 'Site blocking needs permission to edit the hosts file. Go to Settings, then Distractions, and click "Allow site blocking".'
    : `Couldn't update the hosts file: ${e.message}`;
}

/* One-time permission: let this Windows account edit the hosts file, so blocking works
   without running Steady as administrator (which is lost after every update or restart). */

function canEditHosts() {
  if (process.platform !== 'win32') return false;
  try {
    fs.closeSync(fs.openSync(HOSTS, 'r+')); // opens for writing without changing anything
    return true;
  } catch {
    return false;
  }
}

function currentUserSid() {
  return new Promise((resolve) => {
    exec('whoami /user /fo csv /nh', { windowsHide: true }, (err, out) => {
      const m = !err && String(out).match(/"(S-1-[\d-]+)"/);
      resolve(m ? m[1] : null);
    });
  });
}

// Runs icacls on the hosts file through a single Windows admin (UAC) prompt.
async function changeHostsAccess(grant) {
  if (process.platform !== 'win32') return { ok: false, error: 'Site blocking only works on Windows.' };
  const sid = await currentUserSid();
  if (!sid) return { ok: false, error: "Couldn't identify your Windows account." };
  const args = grant ? `"${HOSTS}" /grant *${sid}:(M)` : `"${HOSTS}" /remove:g *${sid}`;
  const ps = `try { $p = Start-Process -FilePath icacls.exe -ArgumentList '${args.replace(/'/g, "''")}' -Verb RunAs -WindowStyle Hidden -Wait -PassThru; exit $p.ExitCode } catch { exit 1223 }`;
  return new Promise((resolve) => {
    const child = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', ps], { windowsHide: true });
    child.on('close', (code) => {
      const allowed = canEditHosts();
      if (code === 1223) resolve({ ok: false, allowed, error: 'Permission was not given.' });
      else if (grant && !allowed) resolve({ ok: false, allowed, error: "Windows didn't allow the change. Try again, or run Steady as administrator." });
      else {
        log.info(grant ? 'Site blocking allowed for this account' : 'Site blocking permission removed');
        resolve({ ok: true, allowed });
      }
    });
  });
}

function applyBlock(sites) {
  if (process.platform !== 'win32') return { ok: false, error: 'Site blocking only works on Windows.' };
  try {
    const clean = stripBlock(fs.readFileSync(HOSTS, 'utf8'));
    const hosts = new Set();
    for (const s of sites || []) {
      const h = normalizeHost(s);
      if (!h || !h.includes('.')) continue;
      hosts.add(h);
      if (!h.startsWith('www.')) hosts.add('www.' + h);
    }
    if (!hosts.size) return { ok: true };
    const block = [BLOCK_START, ...[...hosts].map((h) => `0.0.0.0 ${h}`), BLOCK_END];
    fs.writeFileSync(HOSTS, clean + block.join('\r\n') + '\r\n');
    flushDns();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permissionMessage(e) };
  }
}

function clearBlock() {
  if (process.platform !== 'win32') return { ok: true };
  try {
    const text = fs.readFileSync(HOSTS, 'utf8');
    if (!text.includes('# >>> Steady')) return { ok: true };
    fs.writeFileSync(HOSTS, stripBlock(text));
    flushDns();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: permissionMessage(e) };
  }
}

/* ---------- Start at sign-in ---------- */

const startupSupported = () => app.isPackaged && (process.platform === 'win32' || process.platform === 'darwin');

function applyStartup() {
  if (!startupSupported()) return;
  app.setLoginItemSettings({
    openAtLogin: !!data.settings.startAtLogin,
    path: process.execPath,
    args: data.settings.startMinimized ? ['--hidden'] : []
  });
}

/* ---------- Break screens ---------- */

function startBreak({ kind, minutes, strict, snoozesLeft, snoozeMin }) {
  closeBreakWindows();
  breakActive = true;
  const primaryId = screen.getPrimaryDisplay().id;
  for (const d of screen.getAllDisplays()) {
    const w = new BrowserWindow({
      x: d.bounds.x,
      y: d.bounds.y,
      width: d.bounds.width,
      height: d.bounds.height,
      frame: false,
      resizable: false,
      movable: false,
      minimizable: false,
      skipTaskbar: true,
      alwaysOnTop: true,
      backgroundColor: '#1D2826',
      webPreferences: {
        preload: path.join(__dirname, 'preload.js'),
        contextIsolation: true,
        nodeIntegration: false
      }
    });
    w.setAlwaysOnTop(true, 'screen-saver');
    w.loadFile('break.html', {
      query: {
        kind,
        minutes: String(minutes),
        strict: strict ? '1' : '0',
        primary: d.id === primaryId ? '1' : '0',
        snoozes: String(Math.max(0, snoozesLeft || 0)),
        snoozeMin: String(snoozeMin || 5)
      }
    });
    w.on('closed', () => {
      breakWindows = breakWindows.filter((x) => x !== w);
      if (breakActive && breakWindows.length === 0) endBreak(true);
    });
    breakWindows.push(w);
  }
  if (miniWindow && miniWindow.isVisible()) miniWindow.hide();
}

function closeBreakWindows() {
  const ws = breakWindows;
  breakWindows = [];
  ws.forEach((w) => { if (!w.isDestroyed()) w.destroy(); });
}

function endBreak(skipped) {
  if (!breakActive) return;
  breakActive = false;
  closeBreakWindows();
  sendToMain('break:ended', { skipped: !!skipped });
  showMain();
}

function snoozeBreak() {
  if (!breakActive) return;
  breakActive = false;
  closeBreakWindows();
  sendToMain('break:snoozed');
}

/* ---------- IPC ---------- */

ipcMain.handle('data:load', () => data);

ipcMain.handle('data:save', (_e, patch) => {
  Object.assign(data, patch);
  saveData();
  if (patch.settings) updateMini();
  return true;
});

ipcMain.on('notify', (_e, { title, body }) => notify(title, body));
ipcMain.on('window:focus', showMain);
ipcMain.on('break:start', (_e, opts) => startBreak(opts));
ipcMain.on('break:done', (_e, { skipped }) => endBreak(skipped));
ipcMain.on('break:snooze', () => snoozeBreak());
ipcMain.handle('block:apply', (_e, sites) => applyBlock(sites));
ipcMain.handle('block:status', () => ({ supported: process.platform === 'win32', allowed: canEditHosts() }));
ipcMain.handle('block:grant', () => changeHostsAccess(true));
ipcMain.handle('block:revoke', () => { clearBlock(); return changeHostsAccess(false); });
ipcMain.handle('block:clear', () => clearBlock());
ipcMain.handle('startup:supported', () => startupSupported());
ipcMain.handle('startup:apply', () => { applyStartup(); return startupSupported(); });
ipcMain.on('theme:set', () => applyTheme());
ipcMain.on('window:compact', (_e, on) => setCompact(!!on));
ipcMain.handle('clipboard:write', (_e, text) => { clipboard.writeText(String(text)); return true; });

ipcMain.on('state:publish', (_e, st) => {
  lastState = st;
  updateTray();
  if (miniWindow && !miniWindow.isDestroyed() && miniWindow.isVisible()) {
    miniWindow.webContents.send('mini:state', st);
  }
  updateMini();
});

// Commands from the mini timer (and the focus pane's mini timer link).
ipcMain.on('command', (_e, cmd) => {
  if (cmd === 'open') return showMain();
  if (cmd === 'mini-toggle') return toggleMini();
  if (cmd === 'mini-hide') {
    miniOverrideStart = lastState.start;
    miniOverride = 'hide';
    return updateMini();
  }
  sendToMain('command', cmd);
});

ipcMain.handle('export:csv', async (_e, csv) => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export work log',
    defaultPath: `steady-log-${new Date().toISOString().slice(0, 10)}.csv`,
    filters: [{ name: 'CSV', extensions: ['csv'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, '\ufeff' + csv); // BOM so Excel reads UTF-8 correctly
  return { ok: true, filePath };
});

/* ---------- Backups and import/export ---------- */

function runDailyBackup() {
  try {
    if (backup.ensureToday()) log.info('Daily backup created');
    backup.prune(data?.settings?.backupKeepDays || 30);
  } catch (e) { log.error('Backup failed', e.message); }
}

function replaceData(next, label) {
  saveData(); // make sure the current state is on disk first
  backup.create(label);
  data = normalize(next);
  saveData();
  log.info('Data replaced', label);
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.reload();
}

ipcMain.handle('backups:list', () => backup.list());
ipcMain.handle('backups:create', () => {
  saveData();
  return backup.create('manual');
});
ipcMain.handle('backups:restore', (_e, name) => {
  try {
    const next = backup.read(name);
    if (!Array.isArray(next.entries)) throw new Error('This backup doesn\'t look like Steady data.');
    replaceData(next, 'before-restore');
    return { ok: true };
  } catch (e) {
    log.error('Restore failed', e.message);
    return { ok: false, error: e.message };
  }
});
ipcMain.on('backups:open', () => shell.openPath(backup.dir()));

ipcMain.handle('data:export', async () => {
  const { canceled, filePath } = await dialog.showSaveDialog(mainWindow, {
    title: 'Export all Steady data',
    defaultPath: `steady-backup-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'Steady data', extensions: ['json'] }]
  });
  if (canceled || !filePath) return { ok: false };
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
  return { ok: true, filePath };
});

ipcMain.handle('data:import', async () => {
  const { canceled, filePaths } = await dialog.showOpenDialog(mainWindow, {
    title: 'Import Steady data',
    filters: [{ name: 'Steady data', extensions: ['json'] }],
    properties: ['openFile']
  });
  if (canceled || !filePaths.length) return { ok: false };
  try {
    const next = JSON.parse(fs.readFileSync(filePaths[0], 'utf8'));
    if (!Array.isArray(next.entries) || !next.settings) throw new Error('That file isn\'t a Steady data export.');
    const answer = await dialog.showMessageBox(mainWindow, {
      type: 'warning',
      buttons: ['Replace my data', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      title: 'Replace your data?',
      message: 'Importing replaces everything currently in Steady with the contents of this file.',
      detail: 'A backup of your current data is saved first, so you can restore it from Settings.'
    });
    if (answer.response !== 0) return { ok: false };
    replaceData(next, 'before-import');
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message };
  }
});

/* ---------- Diagnostics ---------- */

ipcMain.on('log:write', (_e, { level, msg, detail }) => {
  (log[level] || log.info)(`[window] ${msg}`, detail);
});
ipcMain.handle('diag:get', () => ({
  version: app.getVersion(),
  electron: process.versions.electron,
  os: `${os.type()} ${os.release()} (${os.arch()})`,
  log: log.tail(80)
}));
ipcMain.on('diag:open-logs', () => shell.openPath(log.dir()));
ipcMain.handle('app:version', () => app.getVersion());
ipcMain.handle('update:check', () => updater.checkNow());
ipcMain.on('update:install', () => { if (updater.readyVersion()) updater.installNow(); });

/* ---------- Calendar ---------- */

const calendarCache = new Map();

async function fetchSource(cal, start, end, force) {
  const key = `${cal.kind}|${cal.url || ''}|${start}|${end}`;
  const cached = calendarCache.get(key);
  if (!force && cached && Date.now() - cached.at < 10 * 60000) return cached.result;
  const result = cal.kind === 'outlook'
    ? await calendar.fromOutlook(start, end)
    : await calendar.fromLink(cal.url, start, end, (u, o) => net.fetch(u, o));
  if (!result.ok) log.warn('Calendar fetch failed', `${cal.kind} ${result.error} ${result.detail || ''}`);
  calendarCache.set(key, { at: Date.now(), result });
  return result;
}

// Fetches every connected calendar and merges their meetings. A meeting that shows up
// in two calendars (for example Google subscribed inside Outlook) is listed once.
ipcMain.handle('calendar:fetch', async (_e, { start, end, force }) => {
  const cals = data.settings.calendars || [];
  if (!cals.length) return { ok: true, events: [], off: true };
  const results = await Promise.all(cals.map((c) => fetchSource(c, start, end, force)));
  const failed = cals
    .map((c, i) => ({ name: c.name, error: results[i].error }))
    .filter((_f, i) => !results[i].ok);
  if (failed.length === cals.length) {
    return { ok: false, error: cals.length > 1 ? `${failed[0].name}: ${failed[0].error}` : failed[0].error };
  }
  const merged = new Map();
  results.forEach((r, i) => {
    if (!r.ok) return;
    for (const ev of r.events) {
      const key = `${ev.title}|${ev.start}|${ev.end}`;
      const seen = merged.get(key);
      if (seen) seen.busy = seen.busy || ev.busy;
      else merged.set(key, { ...ev, cal: cals[i].name });
    }
  });
  const events = [...merged.values()].sort((a, b) => a.start - b.start);
  return { ok: true, events, failed };
});

// Checks one calendar before it's added, without touching the saved list.
ipcMain.handle('calendar:test', (_e, { cal, start, end }) => fetchSource(cal, start, end, true));

/* ---------- Quick capture ---------- */

function openCapture() {
  const cursor = screen.getCursorScreenPoint();
  const wa = screen.getDisplayNearestPoint(cursor).workArea;
  const W = 560;
  const H = 168;
  const x = Math.round(wa.x + (wa.width - W) / 2);
  const y = Math.round(wa.y + wa.height * 0.22);
  if (!captureWindow) {
    captureWindow = new BrowserWindow({
      x, y, width: W, height: H,
      frame: false, transparent: true, resizable: false, movable: true,
      minimizable: false, maximizable: false, skipTaskbar: true, alwaysOnTop: true, show: false,
      webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false }
    });
    captureWindow.setAlwaysOnTop(true, 'pop-up-menu');
    captureWindow.loadFile('capture.html');
    captureWindow.on('blur', () => { if (captureWindow) captureWindow.hide(); });
    captureWindow.on('closed', () => { captureWindow = null; });
    captureWindow.once('ready-to-show', () => { captureWindow.show(); captureWindow.focus(); });
  } else {
    captureWindow.setBounds({ x, y, width: W, height: H });
    captureWindow.webContents.send('capture:reset');
    captureWindow.show();
    captureWindow.focus();
  }
}

ipcMain.on('capture:submit', (_e, item) => {
  sendToMain('capture', item);
  if (captureWindow) captureWindow.hide();
});
ipcMain.on('capture:close', () => { if (captureWindow) captureWindow.hide(); });
ipcMain.on('capture:open', () => openCapture());

/* ---------- App lifecycle ---------- */

process.on('uncaughtException', (e) => log.error('Uncaught error in main process', e && e.stack));
process.on('unhandledRejection', (e) => log.error('Unhandled promise rejection in main process', e && (e.stack || e)));

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', showMain);

  app.whenReady().then(() => {
    log.init(path.join(app.getPath('userData'), 'logs'));
    backup.init(path.join(app.getPath('userData'), 'backups'), dataFile());
    log.info(`Steady ${app.getVersion()} starting`, `${os.type()} ${os.release()}`);
    data = loadData();
    if (!recoveredFrom) runDailyBackup();
    else saveData();
    setInterval(runDailyBackup, 6 * 3600000);
    clearBlock(); // in case a previous run crashed mid-session
    applyStartup(); // keeps the sign-in entry pointing at the current install
    applyTheme();
    createMainWindow();
    createTray();
    startWatcher();
    updater.init({ notify, onReady: updateTray });
    const shortcuts = [
      ['CommandOrControl+Shift+Space', openCapture],
      ['CommandOrControl+Alt+Space', () => sendToMain('command', 'toggle')]
    ];
    for (const [accel, fn] of shortcuts) {
      if (!globalShortcut.register(accel, fn)) log.warn('Shortcut is taken by another app', accel);
    }

    mainWindow.webContents.on('did-finish-load', () => {
      if (recoveredFrom) {
        sendToMain('recovered', recoveredFrom);
        recoveredFrom = null;
      }
    });
    mainWindow.webContents.on('render-process-gone', (_e, details) => {
      log.error('Window crashed, reloading', details.reason);
      if (details.reason !== 'clean-exit') setTimeout(() => mainWindow && mainWindow.reload(), 500);
    });
    mainWindow.on('unresponsive', () => log.warn('Window stopped responding'));
  });

  app.on('before-quit', () => {
    app.isQuitting = true;
    log.info('Quitting');
    clearBlock();
    if (watcher) watcher.kill();
    if (idlePoller) clearInterval(idlePoller);
  });

  app.on('will-quit', () => globalShortcut.unregisterAll());
  // Keep running in the tray when windows close.
  app.on('window-all-closed', () => {});
}
