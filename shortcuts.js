/* ---------- Keyboard shortcuts and the Ctrl+K command menu ---------- */

const SHORTCUTS = [
  ['Ctrl+K', 'Open the command menu (search anything)'],
  ['Ctrl+Enter', 'Start, pause or resume a focus session'],
  ['Ctrl+E', 'End the current session early'],
  ['Ctrl+N', 'Add a to-do for the day you\'re viewing'],
  ['Ctrl+D', 'Add something you did'],
  ['Ctrl+J', 'Park a thought'],
  ['Ctrl+1 to Ctrl+5', 'Plan, Work log, Insights, Parking lot, Settings'],
  ['Alt+← / Alt+→', 'Previous or next day (Plan and Work log)'],
  ['Ctrl+M', 'Compact view on or off'],
  ['Ctrl+Shift+R', 'Review my day'],
  ['?', 'Show this list'],
  ['Ctrl+Shift+Space', 'Quick capture from any app'],
  ['Ctrl+Alt+Space', 'Start or pause from any app']
];

function isTyping(el) {
  return el && (el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable ||
    (el.tagName === 'INPUT' && !['checkbox', 'radio', 'button', 'range'].includes(el.type)));
}

function toggleSession() {
  if (S.state === 'focus') pauseFocus();
  else if (S.state === 'paused') resumeFocus();
  else if (S.state === 'idle') startFocus();
  else if (S.state === 'breakPending') launchBreak();
}

function goAddTodo() {
  if (compact) setCompact(false);
  showTab('plan');
  $('taskInput').focus();
}
function goAddDone() {
  if (compact) setCompact(false);
  if (planDay > dayKey(Date.now())) planDay = dayKey(Date.now());
  showTab('plan');
  $('doneInput').focus();
}
function goPark() {
  if (compact) setCompact(false);
  showTab('parking');
  $('parkInput').focus();
}

function onKeydown(e) {
  const ctrl = e.ctrlKey || e.metaKey;
  const dialogOpen = [...document.querySelectorAll('dialog')].some((d) => d.open);
  const k = e.key.toLowerCase();

  if (ctrl && k === 'k') {
    e.preventDefault();
    if (!$('palette').open) openPalette();
    return;
  }
  if (dialogOpen) return; // dialogs handle their own keys

  if (ctrl && e.key === 'Enter' && document.activeElement !== $('task')) { e.preventDefault(); toggleSession(); return; }
  if (ctrl && !e.shiftKey && k === 'e') { e.preventDefault(); finishFocus(true); return; }
  if (ctrl && !e.shiftKey && k === 'n') { e.preventDefault(); goAddTodo(); return; }
  if (ctrl && !e.shiftKey && k === 'd') { e.preventDefault(); goAddDone(); return; }
  if (ctrl && !e.shiftKey && k === 'j') { e.preventDefault(); goPark(); return; }
  if (ctrl && !e.shiftKey && k === 'm') { e.preventDefault(); autoCompacted = false; setCompact(!compact); return; }
  if (ctrl && e.shiftKey && k === 'r') { e.preventDefault(); openReview('day'); return; }
  if (ctrl && /^[1-5]$/.test(e.key)) {
    e.preventDefault();
    if (compact) setCompact(false);
    showTab(TABS[Number(e.key) - 1]);
    return;
  }
  if (e.altKey && (e.key === 'ArrowLeft' || e.key === 'ArrowRight') && !isTyping(document.activeElement)) {
    const n = e.key === 'ArrowLeft' ? -1 : 1;
    if (!$('tab-plan').hidden) { e.preventDefault(); planDay = shiftKey(planDay, n); renderPlan(); ensureCalendarFor(planDay); }
    else if (!$('tab-log').hidden) { e.preventDefault(); shiftDay(n); }
    return;
  }
  if ((e.key === '?' || e.key === 'F1') && !isTyping(document.activeElement)) {
    e.preventDefault();
    openShortcuts();
  }
}

function openShortcuts() {
  $('shortcutList').innerHTML = SHORTCUTS.map(([keys, what]) =>
    `<div class="sc-row"><dt>${keys.split(/(\s\/\s|\sto\s)/).map((part) =>
      /\s\/\s|\sto\s/.test(part) ? `<span class="sc-sep">${esc(part.trim())}</span>` : part.split('+').map((x) => `<kbd>${esc(x)}</kbd>`).join('+')).join(' ')}</dt>
      <dd>${esc(what)}</dd></div>`).join('');
  $('shortcutsDialog').showModal();
}

/* ---------- Command menu ---------- */

let paletteItems = [];
let paletteIndex = 0;

function paletteCommands() {
  const cmds = [];
  const add = (label, run, hint = '') => cmds.push({ label, run, hint });

  if (S.state === 'idle') add('Start focus', () => startFocus(), 'Ctrl+Enter');
  if (S.state === 'focus') add('Pause session', pauseFocus, 'Ctrl+Enter');
  if (S.state === 'paused') add('Resume session', resumeFocus, 'Ctrl+Enter');
  if (S.state === 'focus' || S.state === 'paused') add('End session early', () => finishFocus(true), 'Ctrl+E');
  if (S.state === 'breakPending') { add('Take break now', launchBreak); add('Skip break', skipPendingBreak); }

  if (S.state === 'idle' || S.state === 'breakPending') {
    [...openTodayTasks(), ...leftoverTasks()].forEach((t) => add(`Focus on: ${t.text}`, () => startTask(t.id)));
  }

  add('Add a to-do', goAddTodo, 'Ctrl+N');
  add('Add something I did', goAddDone, 'Ctrl+D');
  add('Park a thought', goPark, 'Ctrl+J');
  add('Quick capture window', () => api.openCapture(), 'Ctrl+Shift+Space');
  add('Go to Plan', () => showTab('plan'), 'Ctrl+1');
  add('Plan tomorrow', () => { planDay = shiftKey(dayKey(Date.now()), 1); showTab('plan'); ensureCalendarFor(planDay); });
  add('Go to Work log', () => showTab('log'), 'Ctrl+2');
  add('Add an entry to the work log', () => { showTab('log'); openEntryDialog(null, viewDay); });
  add('Go to Insights', () => showTab('insights'), 'Ctrl+3');
  add('Go to Parking lot', () => showTab('parking'), 'Ctrl+4');
  add('Go to Settings', () => showTab('settings'), 'Ctrl+5');
  add('Review my day', () => openReview('day'), 'Ctrl+Shift+R');
  add('Review my week', () => openReview('week'));
  add(compact ? 'Turn off compact view' : 'Turn on compact view', () => { autoCompacted = false; setCompact(!compact); }, 'Ctrl+M');
  add('Show or hide the mini timer', () => api.command('mini-toggle'));
  settings.presets.forEach((p) => add(`Session length: ${p.name} (${p.focusMin} min)`, () => selectPreset(p.id)));
  SOUND_OPTIONS.forEach((o) => add(`Focus sound: ${o.name}`, async () => {
    settings.sound = o.id;
    renderSoundControls();
    await persist('settings');
    if (o.id === 'off') Sound.stop(); else if (wanted()) Sound.play(o.id, settings.soundVolume);
  }));
  [['system', 'Match Windows'], ['light', 'Light'], ['dark', 'Dark']].forEach(([id, name]) =>
    add(`Theme: ${name}`, async () => { settings.theme = id; await persist('settings'); api.setTheme(); fillSettingsForm(); }));
  if (settings.calendarSource !== 'off') add('Refresh calendar', () => loadCalendar(true, planDay));
  add('Back up my data now', backupNow);
  add('Export work log as CSV', exportCsv);
  add('Show keyboard shortcuts', openShortcuts, '?');
  return cmds;
}

function renderPalette() {
  const q = $('paletteInput').value.trim().toLowerCase();
  const words = q.split(/\s+/).filter(Boolean);
  const all = paletteCommands();
  paletteItems = words.length
    ? all
      .filter((c) => words.every((w) => c.label.toLowerCase().includes(w)))
      .sort((a, b) => (b.label.toLowerCase().startsWith(q) - a.label.toLowerCase().startsWith(q)))
    : all;
  paletteIndex = Math.min(paletteIndex, Math.max(0, paletteItems.length - 1));
  $('paletteList').innerHTML = paletteItems.length
    ? paletteItems.slice(0, 50).map((c, i) => `<li role="option" id="pal-${i}" aria-selected="${i === paletteIndex}" data-pal="${i}">
        <span>${esc(c.label)}</span>${c.hint ? `<kbd>${esc(c.hint)}</kbd>` : ''}</li>`).join('')
    : '<li class="empty">No matching commands.</li>';
  $('paletteInput').setAttribute('aria-activedescendant', paletteItems.length ? `pal-${paletteIndex}` : '');
  $(`pal-${paletteIndex}`)?.scrollIntoView({ block: 'nearest' });
}

function openPalette() {
  $('paletteInput').value = '';
  paletteIndex = 0;
  renderPalette();
  $('palette').showModal();
  $('paletteInput').focus();
}

function runPalette(i) {
  const c = paletteItems[i];
  $('palette').close();
  if (c) setTimeout(() => c.run(), 0);
}

function bindShortcuts() {
  document.addEventListener('keydown', onKeydown);
  $('paletteInput').addEventListener('input', () => { paletteIndex = 0; renderPalette(); });
  $('paletteInput').addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); paletteIndex = Math.min(paletteItems.length - 1, paletteIndex + 1); renderPalette(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); paletteIndex = Math.max(0, paletteIndex - 1); renderPalette(); }
    else if (e.key === 'Enter') { e.preventDefault(); runPalette(paletteIndex); }
  });
  $('paletteList').addEventListener('click', (e) => {
    const li = e.target.closest('[data-pal]');
    if (li) runPalette(Number(li.dataset.pal));
  });
  $('shortcutsClose').addEventListener('click', () => $('shortcutsDialog').close());
  $('shortcutsBtn').addEventListener('click', openShortcuts);
}
