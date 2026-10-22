/* ---------- Tabs ---------- */

const TABS = ['plan', 'day', 'log', 'insights', 'parking', 'settings'];

function showTab(name) {
  document.querySelectorAll('.tab-btn').forEach((b) => {
    b.setAttribute('aria-selected', String(b.dataset.tab === name));
  });
  TABS.forEach((t) => { $(`tab-${t}`).hidden = t !== name; });
  playEnter($(`tab-${name}`));
  $('tip').hidden = true;
  if (name === 'insights') renderInsights();
  if (name === 'plan') { glanceCountUp = true; renderPlan(); }
  if (name === 'day') { dayView.scrolled = ''; renderDay(); scrollDayIntoView(); ensureCalendarFor(planDay); }
  if (name === 'log') renderLog();
  if (name === 'settings') { renderBackups(); renderRecurringSettings(); }
  else applyAppearance(); // drop any look that was previewed but not saved
  document.querySelector('.panel').classList.toggle('scrolled', $(`tab-${name}`).scrollTop > 4);
}

// A soft shadow under the tab bar once a page scrolls, and scrollbars that show while scrolling.
function bindScrollPolish() {
  const panel = document.querySelector('.panel');
  const timers = new Map();
  document.querySelectorAll('.tab, .focus-pane, .review-body').forEach((el) => {
    el.addEventListener('scroll', () => {
      if (el.classList.contains('tab')) panel.classList.toggle('scrolled', el.scrollTop > 4);
      el.classList.add('is-scrolling');
      clearTimeout(timers.get(el));
      timers.set(el, setTimeout(() => el.classList.remove('is-scrolling'), 900));
    }, { passive: true });
  });
}

document.addEventListener('wheel', (event) => {
  if (!event.ctrlKey || !event.deltaY) return;
  event.preventDefault();
  api.zoom(event.deltaY < 0 ? 1 : -1);
}, { passive: false });

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

/* ---------- Hiding the timer panel while you're not in a session ---------- */

let paneCollapsed = false;
try { paneCollapsed = localStorage.getItem('paneCollapsed') === '1'; } catch { /* storage unavailable */ }

// The panel folds to a slim bar only while nothing is running; a session (or a break) always brings it back.
function applyPaneCollapse() {
  const folded = paneCollapsed && S.state === 'idle' && !compact;
  document.body.classList.toggle('pane-collapsed', folded);
  $('paneRail').hidden = !folded;
  if (folded) $('railToday').textContent = fmtMins(todayFocusSec());
}
function setPaneCollapsed(on) {
  paneCollapsed = !!on;
  try { localStorage.setItem('paneCollapsed', paneCollapsed ? '1' : '0'); } catch { /* storage unavailable */ }
  applyPaneCollapse();
  (paneCollapsed ? $('paneExpandBtn') : $('paneCollapseBtn')).focus();
  if (paneCollapsed && S.state !== 'idle') showNudge('The timer panel will fold away once this session is over.', 'info', true);
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
  $('paneCollapseBtn').innerHTML = icon('panel');
  $('paneExpandBtn').innerHTML = icon('panel');
  $('railStart').innerHTML = icon('play');
  $('paneCollapseBtn').addEventListener('click', () => setPaneCollapsed(true));
  $('paneExpandBtn').addEventListener('click', () => setPaneCollapsed(false));
  $('railStart').addEventListener('click', () => startFocus());
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
  $('shortcutsLink').addEventListener('click', openShortcuts);
  api.onMiniVisible((shown) => {
    miniShown = shown;
    $('miniLink').textContent = shown ? 'Hide mini timer' : 'Show mini timer';
  });
  $('compactBtn').addEventListener('click', () => { autoCompacted = false; setCompact(!compact); });

  // Check-in and away dialogs
  $('checkinTask').addEventListener('change', () => {
    const task = findTask($('checkinTask').value);
    $('checkinDoneRow').hidden = !task || task.done;
    $('checkinDone').checked = false;
    if (task) {
      $('checkinNote').value = task.text;
      $('checkinProject').value = task.projectId || '';
      $('checkinDoneLabel').textContent = 'Mark "' + task.text + '" as done in my plan';
    }
  });
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
  $('missedCheckinBtn').addEventListener('click', () => openEntryDialog(null, logView === 'day' ? viewDay : dayKey(Date.now())));
  $('entryDate').addEventListener('change', fillEntryTasks);
  $('entryTask').addEventListener('change', () => {
    const task = findTask($('entryTask').value);
    if (task) { $('entryNote').value = task.text; $('entryProject').value = task.projectId || ''; }
  });
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
  $('parkForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const typed = $('parkInput').value.trim();
    if (!typed) return;
    const chosen = $('parkProject').value || null;
    $('parkInput').value = '';
    const { text, projectId } = await takeProjectTag(typed, chosen);
    addParking(text, projectId);
  });
  $('parkFilter').addEventListener('change', (e) => {
    parkFilter = e.target.value;
    try { localStorage.setItem('parkFilter', parkFilter); } catch { /* storage unavailable */ }
    renderParking();
  });
  $('parkSort').addEventListener('change', (e) => {
    parkSort = e.target.value;
    try { localStorage.setItem('parkSort', parkSort); } catch { /* storage unavailable */ }
    renderParking();
  });
  $('parkList').addEventListener('change', async (e) => {
    const id = e.target.dataset?.toggle;
    if (!id) return;
    await setParkingDone(id, e.target.checked);
  });
  $('parkList').addEventListener('click', async (e) => {
    if (e.target.dataset?.parkTask) {
      parkingToTask(e.target.dataset.parkTask);
      return;
    }
    if (e.target.dataset?.parkEdit) { openParkDialog(e.target.dataset.parkEdit); return; }
    if (e.target.dataset?.parkReset !== undefined) {
      parkFilter = 'all';
      try { localStorage.setItem('parkFilter', 'all'); } catch { /* storage unavailable */ }
      renderParking();
      return;
    }
    const id = e.target.dataset?.parkDel;
    if (!id) return;
    data.parking = data.parking.filter((p) => p.id !== id);
    await persist('parking');
    renderParking();
  });
  $('parkCompleted').addEventListener('click', (e) => {
    const button = e.target.closest('button');
    if (button?.dataset.parkReopen) reopenParking(button.dataset.parkReopen);
    else if (button?.dataset.parkEdit) openParkDialog(button.dataset.parkEdit);
  });
  $('parkEditSave').addEventListener('click', saveParkDialog);
  $('parkEditCancel').addEventListener('click', () => $('parkDialog').close());
  $('parkEditDone').addEventListener('change', () => {
    const done = $('parkEditDone').checked;
    $('parkEditWhen').hidden = !done;
    $('parkEditPlan').hidden = done;
    if (done) {
      $('parkEditDate').value = todayKey();
      $('parkEditTime').value = toTimeInput(Date.now());
    }
  });
  $('parkEditPlan').addEventListener('click', async () => {
    const id = editingParkId;
    $('parkDialog').close();
    await parkingToTask(id);
  });
  $('parkEditText').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); saveParkDialog(); } });

  document.addEventListener('click', (e) => { if (e.target.closest?.('[data-cal-refresh]')) refreshCalendar(); });
  $('settingsForm').addEventListener('submit', saveSettings);
  $('settingsForm').addEventListener('change', (e) => {
    if (['accent', 'palette', 'look', 'corners', 'density', 'font', 'ringStyle'].includes(e.target.name)) previewAppearance();
  });
  bindCalendars();

  bindScrollPolish();
  bindPlanning();
  bindDay();
  bindRowMenus();
  bindLogFilter();
  if (typeof checkMilestones === 'function') checkMilestones();
  bindSettingsNav();
  bindWhatsNew();
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
  if (shouldWelcome()) { openWelcome(); markWhatsNewSeen(); }
  else {
    await maybeShowWhatsNew();
    if (!anyDialogOpen()) maybeNudgePlan();
  }
  renderRecurringSettings();
  loadCalendar();

  api.onActivity(onActivity);
  api.onBreakEnded(onBreakEnded);
  api.onBreakSnoozed(onBreakSnoozed);
  api.onCommand(onCommand);
  api.onCapture(async (item) => {
    const typed = String(item.text || '').trim();
    if (!typed) return;
    if (item.kind === 'todo') {
      const added = await addQuickTask(typed);
      const q = added && added.parsed;
      const extra = q && quickAddSummary(q, todayKey());
      showNudge(`Added "${q ? q.text : typed}" to ${q && q.day !== todayKey() ? 'your plan' : "today's plan"}${extra ? `: ${extra}` : ''}.`, 'info', true);
      return;
    }
    const { text, projectId } = await takeProjectTag(typed);
    if (item.kind === 'done') await addDoneItem(text, item.minutes, projectId, dayKey(Date.now()));
    else await addParking(text, projectId);
    const where = { done: 'your done list', park: 'the parking lot' }[item.kind] || 'the parking lot';
    showNudge(`Added "${text}" to ${where}${projectId ? ` (${projectName(projectId)})` : ''}.`, 'info', true);
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
