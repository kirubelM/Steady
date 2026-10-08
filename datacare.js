/* ---------- Backups, restore, import/export and problem reports ---------- */

function fmtBackupName(b) {
  const m = /^steady-data-(\d{4}-\d{2}-\d{2})(?:-(\d{2})(\d{2})(\d{2})-(.+))?\.json$/.exec(b.name);
  const when = new Date(b.time).toLocaleString([], { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  const kind = !m || !m[5] ? 'Daily backup'
    : { manual: 'Saved by you', 'before-restore': 'Before a restore', 'before-import': 'Before an import' }[m[5]] || 'Backup';
  return `${kind}, ${when} (${Math.max(1, Math.round(b.size / 1024))} KB)`;
}

async function renderBackups() {
  let list = [];
  try { list = await api.listBackups(); } catch { /* ignore */ }
  $('backupSelect').innerHTML = list.length
    ? list.map((b) => `<option value="${esc(b.name)}">${esc(fmtBackupName(b))}</option>`).join('')
    : '<option value="">No backups yet</option>';
  $('restoreBtn').disabled = !list.length;
  $('backupKeepDays').value = settings.backupKeepDays || 30;
  $('backupInfo').textContent = list.length
    ? `${plural(list.length, 'backup')} saved. The newest is from ${new Date(list[0].time).toLocaleString([], { weekday: 'long', hour: 'numeric', minute: '2-digit' })}.`
    : 'Steady makes a backup once a day. The first one appears tomorrow, or save one now.';
}

async function backupNow() {
  const name = await api.createBackup();
  $('dataCareMsg').textContent = name ? 'Backup saved.' : 'Nothing to back up yet.';
  renderBackups();
}

async function restoreSelected() {
  const name = $('backupSelect').value;
  if (!name) return;
  const label = $('backupSelect').selectedOptions[0]?.textContent || name;
  if (!confirm(`Restore this backup?\n\n${label}\n\nYour current data is backed up first, so you can undo this from the same list.`)) return;
  const r = await api.restoreBackup(name);
  if (!r.ok) $('dataCareMsg').textContent = `Couldn't restore: ${r.error}`;
  // On success the window reloads with the restored data.
}

async function exportAll() {
  const r = await api.exportData();
  if (r.ok) $('dataCareMsg').textContent = `Saved to ${r.filePath}`;
}

async function importAll() {
  const r = await api.importData();
  if (r && r.error) $('dataCareMsg').textContent = r.error;
}

async function copyDiagnostics() {
  const d = await api.diagnostics();
  const counts = `entries ${data.entries.length}, tasks ${data.tasks.length}, projects ${(data.projects || []).length}, recurring ${(data.recurring || []).length}`;
  const report = [
    `Steady ${d.version} (Electron ${d.electron})`,
    `System: ${d.os}`,
    `Data: ${counts}`,
    `Calendar: ${settings.calendarSource}`,
    '',
    'Recent log:',
    d.log || '(empty)'
  ].join('\n');
  await api.copyText(report);
  $('diagMsg').textContent = 'Copied. Paste it into a message to whoever is helping you. It has no task names or notes in it.';
}

// Send unexpected errors in this window to the log file.
window.addEventListener('error', (e) => {
  try { api.log('error', e.message || 'Window error', `${e.filename || ''}:${e.lineno || ''} ${e.error && e.error.stack ? e.error.stack : ''}`); } catch { /* ignore */ }
});
window.addEventListener('unhandledrejection', (e) => {
  try { api.log('error', 'Unhandled promise rejection', String(e.reason && (e.reason.stack || e.reason))); } catch { /* ignore */ }
});

function bindDataCare() {
  $('backupNowBtn').addEventListener('click', backupNow);
  $('restoreBtn').addEventListener('click', restoreSelected);
  $('openBackupsBtn').addEventListener('click', () => api.openBackups());
  $('exportAllBtn').addEventListener('click', exportAll);
  $('importAllBtn').addEventListener('click', importAll);
  $('copyDiagBtn').addEventListener('click', copyDiagnostics);
  $('openLogsBtn').addEventListener('click', () => api.openLogs());
  $('backupKeepDays').addEventListener('change', async (e) => {
    settings.backupKeepDays = Math.max(3, Math.min(365, Math.round(Number(e.target.value) || 30)));
    e.target.value = settings.backupKeepDays;
    await persist('settings');
    $('dataCareMsg').textContent = `Backups older than ${settings.backupKeepDays} days will be removed.`;
  });
}
