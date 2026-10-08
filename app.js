/* ---------- Tabs ---------- */

const TABS = ['plan', 'log', 'insights', 'parking', 'settings'];

function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === name));
  });
  TABS.forEach((t) => { $(`tab-${t}`).hidden = t !== name; });
  $('tip').hidden = true;
  if (name === 'insights') renderInsights();
  if (name === 'plan') renderPlan();
  if (name === 'log') renderLog();
  if (name === 'settings') { renderBackups(); renderRecurringSettings(); }
}

/* ---------- Compact view ---------- */

let compact = false;
let autoCompacted = false;

function setCompact(on) {
  compact = !!on;
  document.body.classList.toggle('compact', compact);
  $('compactBtn').setAttribute('aria-label', compact ? 'Full view' : 'Compact view');
  $('compactBtn').title = compact ? 'Full view' : 'Compact view';
  api.setCompact(compact);
}

function afterSessionStart() {
  if (settings.compactAuto && !compact) {
    autoCompacted = true;
    setCompact(true);
  }
}

function afterSessionEnd() {
  if (autoCompacted && compact) setCompact(false);
  autoCompacted = false;
}

/* ---------- Commands from the tray and mini timer ---------- */

function onCommand(cmd) {
  switch (cmd) {
    case 'start': {
      if (S.state !== 'idle') return;
      const next = openTodayTasks()[0];
      if (next) startTask(next.id);
      else { api.focusWindow(); $('task').focus(); }
      break;
    }
    case 'pause': pauseFocus(); break;
    case 'resume': resumeFocus(); break;
    case 'toggle':
      if (S.state === 'focus') pauseFocus();
      else if (S.state === 'paused') resumeFocus();
      else if (S.state === 'idle') onCommand('start');
      break;
    case 'end':
      finishFocus(true);
      api.focusWindow();
      break;
    case 'break-now': if (S.state === 'breakPending') launchBreak(); break;
    case 'break-skip': skipPendingBreak(); break;
    case 'review': openReview('day'); break;
    default: break;
  }
}

/* ---------- Events ---------- */

function bind() {
  // Focus pane
  $('startBtn').addEventListener('click', () => startFocus());
  $('pauseBtn').addEventListener('click', pauseFocus);
  $('stopBtn').addEventListener('click', () => finishFocus(true));
  $('breakNowBtn').addEventListener('click', launchBreak);
  $('skipBreakBtn').addEventListener('click', skipPendingBreak);
  $('task').addEventListener('keydown', (e) => { if (e.key === 'Enter') startFocus(); });
  $('task').addEventListener('change', () => {
    // Picking a planned task fills in its project.
    const t = findTask(matchTask($('task').value));
    if (t && t.projectId) $('focusProject').value = t.projectId;
    if (t && t.presetId && presetById(t.presetId)) selectPreset(t.presetId, false);
  });
  $('presetBar').addEventListener('click', (e) => {
    const b = e.target.closest('[data-preset]');
    if (b) selectPreset(b.dataset.preset);
  });
  $('nudgeClose').addEventListener('click', hideNudge);
  $('nudgeAction').addEventListener('click', () => {
    const fn = nudgeActionFn;
    hideNudge();
    if (fn) fn();
  });
  $('miniLink').addEventListener('click', () => api.command('mini-toggle'));
  $('compactBtn').addEventListener('click', () => { autoCompacted = false; setCompact(!compact); });

  // Check-in and away dialogs
  $('checkinPrimary').addEventListener('click', () => saveCheckin(true));
  $('checkinSecondary').addEventListener('click', () => saveCheckin(false));
  $('checkinNote').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveCheckin(true);
  });
  $('checkin').addEventListener('cancel', (e) => {
    e.preventDefault(); // a finished session always needs a decision
    if (S.checkinKind === 'checkin') saveCheckin(false);
  });
  $('awayCount').addEventListener('click', () => handleAway('count'));
  $('awayResume').addEventListener('click', () => handleAway('resume'));
  $('awayEnd').addEventListener('click', () => handleAway('end'));
  $('awayDialog').addEventListener('cancel', (e) => { e.preventDefault(); handleAway('resume'); });

  // Tabs
  document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => showTab(b.dataset.tab)));

  // Work log
  $('prevDay').addEventListener('click', () => shiftDay(-1));
  $('nextDay').addEventListener('click', () => shiftDay(1));
  $('exportBtn').addEventListener('click', exportCsv);
  $('addEntryBtn').addEventListener('click', () => openEntryDialog(null, logView === 'day' ? viewDay : dayKey(Date.now())));
  document.querySelectorAll('[data-logview]').forEach((b) => b.addEventListener('click', () => setLogView(b.dataset.logview)));
  $('datePick').addEventListener('change', (e) => {
    const v = e.target.value;
    if (v && v <= dayKey(Date.now())) { viewDay = v; renderLog(); }
  });
  $('historySearch').addEventListener('input', renderHistory);
  $('historyList').addEventListener('click', (e) => {
    const k = e.target.dataset?.openday;
    if (!k) return;
    viewDay = k;
    setLogView('day');
  });
  $('logList').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.edit) openEntryDialog(b.dataset.edit);
    else if (b.dataset.del) deleteEntry(b.dataset.del);
  });

  // Entry dialog
  $('entrySave').addEventListener('click', saveEntryDialog);
  $('entryCancel').addEventListener('click', () => $('entryDialog').close());
  $('entryDelete').addEventListener('click', async () => {
    if (!editingEntryId) return;
    await deleteEntry(editingEntryId);
    $('entryDialog').close();
  });
  $('entryNote').addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) saveEntryDialog();
  });

  // Parking lot
  $('parkForm').addEventListener('submit', (e) => {
    e.preventDefault();
    const text = $('parkInput').value.trim();
    if (!text) return;
    $('parkInput').value = '';
    addParking(text);
  });
  $('parkList').addEventListener('change', async (e) => {
    const id = e.target.dataset?.toggle;
    if (!id) return;
    const item = data.parking.find((p) => p.id === id);
    if (item) item.done = e.target.checked;
    await persist('parking');
    renderParking();
  });
  $('parkList').addEventListener('click', async (e) => {
    if (e.target.dataset?.parkTask) {
      parkingToTask(e.target.dataset.parkTask);
      return;
    }
    const id = e.target.dataset?.parkDel;
    if (!id) return;
    data.parking = data.parking.filter((p) => p.id !== id);
    await persist('parking');
    renderParking();
  });
  $('clearDone').addEventListener('click', async () => {
    data.parking = data.parking.filter((p) => !p.done);
    await persist('parking');
    renderParking();
  });

  $('settingsForm').addEventListener('submit', saveSettings);
  $('settingsForm').elements.calendarSource.addEventListener('change', updateCalendarFields);
  $('calTestBtn').addEventListener('click', testCalendar);

  bindPlan();
  bindRecurring();
  bindShortcuts();
  bindDataCare();
  bindReview();
  bindInsights();
  bindProjects();
  bindSound();
}

/* ---------- Start ---------- */

async function init() {
  data = await api.load();
  data.tasks = data.tasks || [];
  data.meta = data.meta || {};
  data.projects = data.projects || [];
  data.notes = data.notes || {};
  settings = data.settings;
  selectedPresetId = settings.presetId;

  bind();
  refreshProjectSelects();
  renderProjectsSettings();
  renderPresetBar();
  renderSoundControls();
  fillSettingsForm();
  renderTimer();
  renderLog();
  renderParking();
  await materializeRecurring();
  renderPlan();
  showTab('plan');
  maybeNudgePlan();
  renderRecurringSettings();
  loadCalendar();

  api.onActivity(onActivity);
  api.onBreakEnded(onBreakEnded);
  api.onBreakSnoozed(onBreakSnoozed);
  api.onCommand(onCommand);
  api.onCapture(async (item) => {
    const text = String(item.text || '').trim();
    if (!text) return;
    if (item.kind === 'todo') await addTask(text, 0, dayKey(Date.now()));
    else if (item.kind === 'done') await addDoneItem(text, item.minutes, null, dayKey(Date.now()));
    else await addParking(text);
    const where = { todo: 'today\'s plan', done: 'your done list', park: 'the parking lot' }[item.kind] || 'the parking lot';
    showNudge(`Added "${text}" to ${where}.`, 'info', true);
  });
  api.onRecovered((name) => {
    showNudge(name === 'none'
      ? 'Your data file was damaged and there was no backup to restore, so Steady started fresh. The damaged file was kept in the Steady data folder.'
      : 'Your data file was damaged, so Steady restored your most recent backup. The damaged file was kept in case you need it.', 'warn', false);
  });

  let knownToday = dayKey(Date.now());
  setInterval(() => {
    // Roll everything over to the new day at midnight.
    const today = dayKey(Date.now());
    if (today !== knownToday) {
      if (viewDay === knownToday) viewDay = today;
      if (planDay === knownToday) planDay = today;
      knownToday = today;
      materializeRecurring();
      renderLog();
      renderPlan();
      renderTimer();
      maybeNudgePlan();
    }
  }, 60000);
  setInterval(tick, 1000);
}

init();
