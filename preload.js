const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('steady', {
  platform: process.platform,
  load: () => ipcRenderer.invoke('data:load'),
  save: (patch) => ipcRenderer.invoke('data:save', patch),
  notify: (title, body) => ipcRenderer.send('notify', { title, body }),
  focusWindow: () => ipcRenderer.send('window:focus'),
  startupSupported: () => ipcRenderer.invoke('startup:supported'),
  applyStartup: () => ipcRenderer.invoke('startup:apply'),
  startBreak: (opts) => ipcRenderer.send('break:start', opts),
  endBreak: (skipped) => ipcRenderer.send('break:done', { skipped }),
  snoozeBreak: () => ipcRenderer.send('break:snooze'),
  applyBlock: (sites) => ipcRenderer.invoke('block:apply', sites),
  clearBlock: () => ipcRenderer.invoke('block:clear'),
  exportCsv: (csv) => ipcRenderer.invoke('export:csv', csv),
  copyText: (text) => ipcRenderer.invoke('clipboard:write', text),
  setTheme: () => ipcRenderer.send('theme:set'),
  setCompact: (on) => ipcRenderer.send('window:compact', on),
  publishState: (st) => ipcRenderer.send('state:publish', st),
  command: (cmd) => ipcRenderer.send('command', cmd),
  onCommand: (cb) => ipcRenderer.on('command', (_e, c) => cb(c)),
  onActivity: (cb) => ipcRenderer.on('activity', (_e, d) => cb(d)),
  onBreakEnded: (cb) => ipcRenderer.on('break:ended', (_e, d) => cb(d)),
  onBreakSnoozed: (cb) => ipcRenderer.on('break:snoozed', () => cb()),
  onQuickPark: (cb) => ipcRenderer.on('quick-park', () => cb()),
  onMiniState: (cb) => ipcRenderer.on('mini:state', (_e, st) => cb(st)),
  onMiniVisible: (cb) => ipcRenderer.on('mini:visible', (_e, shown) => cb(shown)),

  // Backups, import/export and diagnostics
  listBackups: () => ipcRenderer.invoke('backups:list'),
  createBackup: () => ipcRenderer.invoke('backups:create'),
  restoreBackup: (name) => ipcRenderer.invoke('backups:restore', name),
  openBackups: () => ipcRenderer.send('backups:open'),
  exportData: () => ipcRenderer.invoke('data:export'),
  importData: () => ipcRenderer.invoke('data:import'),
  log: (level, msg, detail) => ipcRenderer.send('log:write', { level, msg, detail }),
  diagnostics: () => ipcRenderer.invoke('diag:get'),
  openLogs: () => ipcRenderer.send('diag:open-logs'),
  onRecovered: (cb) => ipcRenderer.on('recovered', (_e, name) => cb(name)),

  // Calendar
  fetchCalendar: (start, end, force) => ipcRenderer.invoke('calendar:fetch', { start, end, force }),
  testCalendar: (cal, start, end) => ipcRenderer.invoke('calendar:test', { cal, start, end }),

  // Quick capture
  openCapture: () => ipcRenderer.send('capture:open'),
  submitCapture: (item) => ipcRenderer.send('capture:submit', item),
  closeCapture: () => ipcRenderer.send('capture:close'),
  onCapture: (cb) => ipcRenderer.on('capture', (_e, item) => cb(item)),
  onCaptureReset: (cb) => ipcRenderer.on('capture:reset', () => cb())
});
