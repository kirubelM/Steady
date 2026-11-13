/* ---------- Blocked tasks: waiting on another task, or on someone or something else ---------- */

// A task can wait on other tasks (t.blockedBy holds their ids) and on something that isn't a task
// (t.waitingOn, like "Dana's pricing"). A finished task stops blocking by itself, so nothing needs clearing.
const blockersOf = (t) => ((t && t.blockedBy) || []).map(findTask).filter((b) => b && !b.done);
const waitingOn = (t) => String((t && t.waitingOn) || '').trim();
const isBlocked = (t) => !!t && !t.done && (blockersOf(t).length > 0 || !!waitingOn(t));
const dependentsOf = (id) => data.tasks.filter((x) => !x.done && (x.blockedBy || []).includes(id));

// True when making `taskId` wait on `blockerId` would loop: a task can't wait on itself, or on something that waits on it.
function wouldCycle(taskId, blockerId) {
  const seen = new Set();
  const stack = [blockerId];
  while (stack.length) {
    const id = stack.pop();
    if (id === taskId) return true;
    if (seen.has(id)) continue;
    seen.add(id);
    const t = findTask(id);
    ((t && t.blockedBy) || []).forEach((b) => stack.push(b));
  }
  return false;
}

// Takes tasks that are going away out of everyone's "blocked by" lists. Returns a function that puts the links back.
function unlinkBlockers(removedIds) {
  const changed = [];
  data.tasks.forEach((t) => {
    if (t.blockedBy && t.blockedBy.some((i) => removedIds.includes(i))) {
      changed.push([t, t.blockedBy]);
      t.blockedBy = t.blockedBy.filter((i) => !removedIds.includes(i));
      if (!t.blockedBy.length) delete t.blockedBy;
    }
  });
  return () => changed.forEach(([t, ids]) => { t.blockedBy = ids; });
}

/* ---------- Changing blocks (each one can be undone) ---------- */

async function blockTasks(ids, blockerId) {
  const blocker = findTask(blockerId);
  if (!blocker) return 0;
  const first = findTask(ids[0]);
  let skipped = 0;
  const n = await editTasks(ids, (t) => {
    if (wouldCycle(t.id, blockerId)) { skipped++; return false; }
    if ((t.blockedBy || []).includes(blockerId)) return false;
    t.blockedBy = [...(t.blockedBy || []), blockerId];
  }, (count) => `${count === 1 && first ? `"${first.text}" is` : `${plural(count, 'task')} are`} now blocked by "${blocker.text}".${skipped ? ` ${plural(skipped, 'task')} can't wait on itself.` : ''}`);
  if (!n && skipped) showNudge("A task can't wait on itself, or on something that's waiting on it.", 'warn', true);
  return n;
}

function unblockFrom(taskId, blockerId) {
  const t = findTask(taskId);
  const b = findTask(blockerId);
  return editTasks([taskId], (x) => {
    x.blockedBy = (x.blockedBy || []).filter((i) => i !== blockerId);
    if (!x.blockedBy.length) delete x.blockedBy;
  }, `"${t ? t.text : 'Task'}" no longer waits on "${b ? b.text : 'that task'}".`);
}

function setWaiting(ids, text) {
  const clean = String(text || '').trim().slice(0, 140);
  return editTasks(ids, (t) => {
    if (waitingOn(t) === clean) return false;
    if (clean) t.waitingOn = clean; else delete t.waitingOn;
  }, (n) => (clean ? `${plural(n, 'task')} now waiting on ${clean}.` : `${plural(n, 'task')} no longer waiting.`));
}

function clearBlocks(ids) {
  return editTasks(ids, (t) => {
    if (!t.blockedBy && !t.waitingOn) return false;
    delete t.blockedBy;
    delete t.waitingOn;
  }, (n) => `Cleared what ${plural(n, 'task')} waited on.`);
}

// Tasks that stopped being blocked now that `finishedIds` are done.
const unblockedTasks = (finishedIds) => data.tasks.filter((t) => !t.done && (t.blockedBy || []).some((i) => finishedIds.includes(i)) && !isBlocked(t));

function unblockedText(finishedIds) {
  const freed = unblockedTasks(finishedIds);
  if (!freed.length) return '';
  return freed.length === 1
    ? ` "${freed[0].text}" is no longer blocked.`
    : ` ${freed.length} tasks are no longer blocked: ${freed.slice(0, 3).map((t) => `"${t.text}"`).join(', ')}${freed.length > 3 ? '…' : ''}.`;
}

// After a task is finished: say what it freed up, with a way to start the one task that's now free.
function announceUnblocked(finishedIds) {
  const freed = unblockedTasks(finishedIds);
  if (!freed.length) return;
  const one = freed.length === 1 ? freed[0] : null;
  const canStart = one && one.day <= todayKey() && (S.state === 'idle' || S.state === 'breakPending');
  showNudge(unblockedText(finishedIds).trim(), 'info', true, canStart ? { label: 'Focus on it', fn: () => startTask(one.id) } : undefined);
}

/* ---------- What a row shows ---------- */

const shortTitle = (s, n = 26) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

// Chips for the row's meta line: what it's blocked by, what it's waiting on, and how many tasks wait on it.
function blockChips(t) {
  if (t.done) return '';
  const open = blockersOf(t);
  const wait = waitingOn(t);
  const out = [];
  if (open.length) {
    out.push(`<span class="blk-chip" data-block-chip="${t.id}" title="${esc(`Blocked by ${open.map((b) => `"${b.text}"`).join(', ')}. Click to change.`)}">${icon('lock')}<span>Blocked by ${esc(shortTitle(open[0].text))}${open.length > 1 ? ` +${open.length - 1}` : ''}</span></span>`);
  }
  if (wait) out.push(`<span class="blk-chip waiting" data-block-chip="${t.id}" title="${esc(`Waiting on ${wait}. Click to change.`)}">${icon('clock')}<span>Waiting on ${esc(shortTitle(wait, 30))}</span></span>`);
  const dep = dependentsOf(t.id);
  if (dep.length) out.push(`<span class="blk-chip blocking" data-block-dependents="${t.id}" title="${esc(`Waiting for this: ${dep.map((d) => `"${d.text}"`).join(', ')}`)}"><span>Blocking ${dep.length}</span></span>`);
  return out.join('');
}

/* ---------- The picker: choose a task, or type what you're waiting on ---------- */

let blockPicker = null; // { opts, hi: highlighted row, rows: what each row does }

// `opts`: ids (the task or tasks being blocked), subtitle, get() -> { tasks, waiting }, add(id), remove(id),
// setWaiting(text), clear(), and once (close after one pick, for several tasks at once).
function openBlockPicker(opts) {
  blockPicker = { opts, hi: 0, rows: [] };
  $('blockFor').textContent = opts.subtitle || '';
  $('blockSearch').value = '';
  renderBlockPicker();
  if (!$('blockDialog').open) $('blockDialog').showModal();
  $('blockSearch').focus();
}

// One task, or several: what they wait on is chosen here, and each pick is a change that can be undone.
function openBlocksFor(ids) {
  const targets = ids.filter((id) => findTask(id));
  if (!targets.length) return;
  const one = targets.length === 1 ? findTask(targets[0]) : null;
  openBlockPicker({
    ids: targets,
    subtitle: one ? `What does "${one.text}" have to wait for?` : `What do these ${targets.length} tasks have to wait for?`,
    get: () => (one ? { tasks: one.blockedBy || [], waiting: waitingOn(one) } : { tasks: [], waiting: '' }),
    add: (id) => blockTasks(targets, id),
    remove: (id) => unblockFrom(targets[0], id),
    setWaiting: (text) => setWaiting(targets, text),
    clear: () => clearBlocks(targets),
    once: !one
  });
}

function dayHeading(day) {
  const today = todayKey();
  if (day === today) return 'Today';
  if (day === shiftKey(today, 1)) return 'Tomorrow';
  if (day < today) return `Earlier: ${new Date(day + 'T12:00').toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
  return new Date(day + 'T12:00').toLocaleDateString([], { weekday: 'long', month: 'short', day: 'numeric' });
}

// Open tasks that could block these ones, soonest day first, filtered by what's typed.
function blockCandidates(ids, query) {
  const q = String(query || '').trim().toLowerCase();
  const today = todayKey();
  return data.tasks
    .filter((t) => !t.done && !ids.includes(t.id) && ids.every((id) => !wouldCycle(id, t.id)))
    .filter((t) => !q || t.text.toLowerCase().includes(q) || projectName(t.projectId).toLowerCase().includes(q))
    .sort((a, b) => {
      const rank = (t) => (t.day === today ? 0 : t.day > today ? 1 : 2); // today, then coming days, then older leftovers
      if (rank(a) !== rank(b)) return rank(a) - rank(b);
      if (a.day !== b.day) return rank(a) === 2 ? (a.day < b.day ? 1 : -1) : (a.day < b.day ? -1 : 1);
      return a.order - b.order;
    })
    .slice(0, 60);
}

function renderBlockPicker() {
  const { opts } = blockPicker;
  const cur = opts.get();
  const query = $('blockSearch').value.trim();
  const chips = cur.tasks.map(findTask).filter(Boolean).map((b) => `<span class="blk-chip big${b.done ? ' met' : ''}">${icon('lock')}<span>${esc(b.text)}</span><button type="button" data-block-remove="${b.id}" aria-label="Remove ${esc(b.text)}">${icon('close')}</button></span>`);
  if (cur.waiting) chips.push(`<span class="blk-chip big waiting">${icon('clock')}<span>Waiting on ${esc(cur.waiting)}</span><button type="button" data-block-unwait aria-label="Stop waiting">${icon('close')}</button></span>`);
  $('blockCurrent').innerHTML = chips.join('');
  $('blockCurrent').hidden = !chips.length;
  $('blockClear').hidden = !opts.clear || !(cur.tasks.length || cur.waiting);

  const found = blockCandidates(opts.ids, query);
  const rows = found.map((t) => ({ type: 'task', id: t.id }));
  if (query) rows.push({ type: 'waiting', text: query });
  blockPicker.rows = rows;
  blockPicker.hi = Math.max(0, Math.min(blockPicker.hi, rows.length - 1));

  let html = '';
  let lastDay = null;
  found.forEach((t, i) => {
    if (t.day !== lastDay) { html += `<li class="block-day" role="presentation">${esc(dayHeading(t.day))}</li>`; lastDay = t.day; }
    const on = cur.tasks.includes(t.id);
    const project = projectById(t.projectId);
    html += `<li role="option" aria-selected="${on}"><button type="button" class="block-row${i === blockPicker.hi ? ' hi' : ''}${on ? ' on' : ''}" data-block-row="${i}">
      <span class="block-check" aria-hidden="true">${on ? icon('check') : ''}</span><span class="block-text">${esc(t.text)}</span>${project ? `<span class="pchip" style="--pc:${project.color}">${esc(project.name)}</span>` : ''}</button></li>`;
  });
  if (query) {
    const i = found.length;
    html += `<li class="block-day" role="presentation">Not a task?</li><li role="option"><button type="button" class="block-row waiting${i === blockPicker.hi ? ' hi' : ''}" data-block-row="${i}">
      <span class="block-check" aria-hidden="true">${icon('clock')}</span><span class="block-text">Waiting on <strong>${esc(query)}</strong></span></button></li>`;
  } else if (!found.length) {
    html += '<li class="empty">There are no other open tasks. Type who or what you\'re waiting on, like "Dana\'s pricing".</li>';
  }
  $('blockList').innerHTML = html;
  $('blockList').querySelector('.hi')?.scrollIntoView({ block: 'nearest' });
}

async function chooseBlockRow(i) {
  const row = blockPicker && blockPicker.rows[i];
  if (!row) return;
  const { opts } = blockPicker;
  if (row.type === 'waiting') {
    await opts.setWaiting(row.text);
    $('blockSearch').value = '';
  } else if (opts.get().tasks.includes(row.id) && opts.remove) {
    await opts.remove(row.id);
  } else {
    await opts.add(row.id);
  }
  if (opts.once) { $('blockDialog').close(); return; }
  blockPicker.hi = 0;
  renderBlockPicker();
}

/* ---------- The task editor's "Blocked by" field (changes are saved with the task) ---------- */

let editingBlocks = { ids: [], waiting: '' };

function loadEditBlocks(t) {
  editingBlocks = { ids: (t.blockedBy || []).filter((id) => findTask(id)), waiting: waitingOn(t) };
  renderEditBlocks();
}

function renderEditBlocks() {
  const chips = editingBlocks.ids.map(findTask).filter(Boolean).map((b) => `<span class="blk-chip big${b.done ? ' met' : ''}">${icon('lock')}<span>${esc(b.text)}</span><button type="button" data-eblock-remove="${b.id}" aria-label="Remove ${esc(b.text)}">${icon('close')}</button></span>`);
  if (editingBlocks.waiting) chips.push(`<span class="blk-chip big waiting">${icon('clock')}<span>Waiting on ${esc(editingBlocks.waiting)}</span><button type="button" data-eblock-unwait aria-label="Stop waiting">${icon('close')}</button></span>`);
  $('taskEditBlocks').innerHTML = chips.join('') || '<span class="muted-note">Nothing is holding this task up.</span>';
}

function pickEditBlocks() {
  const t = findTask(editingTaskId);
  if (!t) return;
  openBlockPicker({
    ids: [t.id],
    subtitle: `What does "${t.text}" have to wait for?`,
    get: () => ({ tasks: editingBlocks.ids, waiting: editingBlocks.waiting }),
    add: (id) => { if (!editingBlocks.ids.includes(id)) editingBlocks.ids.push(id); renderEditBlocks(); },
    remove: (id) => { editingBlocks.ids = editingBlocks.ids.filter((x) => x !== id); renderEditBlocks(); },
    setWaiting: (text) => { editingBlocks.waiting = String(text || '').trim().slice(0, 140); renderEditBlocks(); },
    clear: () => { editingBlocks = { ids: [], waiting: '' }; renderEditBlocks(); }
  });
}

// Writes what the editor shows onto the task when it's saved.
function saveEditBlocks(t) {
  const ids = editingBlocks.ids.filter((id) => id !== t.id && findTask(id) && !wouldCycle(t.id, id));
  const wait = String(editingBlocks.waiting || '').trim().slice(0, 140);
  if (ids.length) t.blockedBy = ids; else delete t.blockedBy;
  if (wait) t.waitingOn = wait; else delete t.waitingOn;
}

function bindBlocks() {
  const dlg = $('blockDialog');
  $('blockSearch').addEventListener('input', () => { blockPicker.hi = 0; renderBlockPicker(); });
  $('blockSearch').addEventListener('keydown', (e) => {
    if (!blockPicker) return;
    const n = blockPicker.rows.length;
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (n) { blockPicker.hi = (blockPicker.hi + (e.key === 'ArrowDown' ? 1 : n - 1)) % n; renderBlockPicker(); }
    } else if (e.key === 'Enter') {
      e.preventDefault();
      chooseBlockRow(blockPicker.hi);
    }
  });
  $('blockList').addEventListener('click', (e) => {
    const b = e.target.closest('[data-block-row]');
    if (b) chooseBlockRow(Number(b.dataset.blockRow));
  });
  $('blockCurrent').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b || !blockPicker) return;
    if (b.dataset.blockRemove) await blockPicker.opts.remove(b.dataset.blockRemove);
    else if (b.dataset.blockUnwait !== undefined) await blockPicker.opts.setWaiting('');
    renderBlockPicker();
  });
  $('blockClear').addEventListener('click', async () => {
    if (!blockPicker || !blockPicker.opts.clear) return;
    await blockPicker.opts.clear();
    renderBlockPicker();
  });
  $('blockDone').addEventListener('click', () => dlg.close());
  dlg.addEventListener('close', () => { blockPicker = null; });

  $('taskEditBlockAdd').addEventListener('click', pickEditBlocks);
  $('taskEditBlocks').addEventListener('click', (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.eblockRemove) editingBlocks.ids = editingBlocks.ids.filter((x) => x !== b.dataset.eblockRemove);
    else if (b.dataset.eblockUnwait !== undefined) editingBlocks.waiting = '';
    renderEditBlocks();
  });
}
