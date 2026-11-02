/* ---------- Quick capture: where it went, and moving it somewhere else ---------- */

// Every quick capture is remembered for a while (what you typed, which list it went to and the item it made),
// so a to-do that landed in Done can be moved with one click, now or later from "Recent captures".
const CAPTURE_KEEP = 15;
const CAPTURE_LABELS = { todo: 'To do', done: 'Done', park: 'Parking lot' };
const CAPTURE_PLACE = { todo: 'your plan', done: 'your done list', park: 'the parking lot' };

const recentCaptures = () => {
  if (!Array.isArray(data.meta.captures)) data.meta.captures = [];
  return data.meta.captures;
};

async function recordCapture(kind, text, ref) {
  const rec = { id: uid(), kind, text, ref, at: Date.now() };
  data.meta.captures = [rec, ...recentCaptures()].slice(0, CAPTURE_KEEP);
  await persist('meta');
  return rec;
}

// The item a capture made, or null when it has been deleted since.
function captureItem(rec) {
  const id = rec.ref && rec.ref.id;
  if (!id) return null;
  if (rec.ref.type === 'task') return findTask(id);
  if (rec.ref.type === 'entry') return data.entries.find((e) => e.id === id) || null;
  if (rec.ref.type === 'parking') return data.parking.find((p) => p.id === id) || null;
  return null;
}
const captureText = (rec, item) => (rec.ref.type === 'entry' ? item.note : item.text) || rec.text;
// A task or parked thought that's been ticked off is finished, not misplaced, so it stays where it is.
const captureMovable = (rec, item) => !!item && !(item.done && rec.ref.type !== 'entry');

// Moves a capture to another list: makes the new item first (so nothing is lost if that fails), then removes the old one.
async function moveCapture(id, to, { tell = true } = {}) {
  const rec = recentCaptures().find((r) => r.id === id);
  if (!rec || rec.kind === to || !CAPTURE_LABELS[to]) return null;
  const item = captureItem(rec);
  if (!captureMovable(rec, item)) return null;
  const text = captureText(rec, item);
  const projectId = item.projectId || null;

  let ref;
  if (to === 'todo') {
    const added = await addQuickTask(text, { projectId }); // so "Call Sam fri 2pm" typed into Done still gets its day and time
    if (!added) return null;
    ref = { type: 'task', id: added.task.id };
  } else if (to === 'done') {
    const entry = await addDoneItem(text, 0, projectId, todayKey());
    ref = { type: 'entry', id: entry.id };
  } else {
    const parked = await addParking(text, projectId);
    ref = { type: 'parking', id: parked.id };
  }

  if (rec.ref.type === 'task') {
    if (item.recurId) await stopRecurring(item.recurId, item.id); // a "every week" typed with it goes too
    await deleteTask(item.id);
  } else if (rec.ref.type === 'entry') {
    await deleteEntry(item.id);
  } else {
    data.parking = data.parking.filter((p) => p.id !== item.id);
    await persist('parking');
    renderParking();
  }

  rec.kind = to;
  rec.ref = ref;
  await persist('meta');
  if (tell) showNudge(`Moved "${text}" to ${CAPTURE_PLACE[to]}.`, 'info', true);
  return rec;
}

// The button on the "Added…" message: one click to fix the likeliest slip, or the list for a to-do.
function captureFixAction(rec) {
  if (rec.kind === 'todo') return { label: 'Not a to-do?', fn: openCaptures };
  return { label: 'Move to To do', fn: () => moveCapture(rec.id, 'todo') };
}

/* ---------- Recent captures ---------- */

function capturedAgo(at) {
  const min = Math.floor((Date.now() - at) / 60000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  if (min < 24 * 60) return `${Math.floor(min / 60)} h ago`;
  return new Date(at).toLocaleDateString([], { month: 'short', day: 'numeric' });
}

function renderCaptures() {
  const recs = recentCaptures();
  $('capturesList').innerHTML = recs.length
    ? recs.map((rec) => {
      const item = captureItem(rec);
      const movable = captureMovable(rec, item);
      const text = item ? captureText(rec, item) : rec.text;
      const state = movable ? '' : `${item ? 'Finished' : 'Removed'} · `;
      return `<li class="capture-row${movable ? '' : ' gone'}">
        <div class="capture-main"><span class="capture-text">${esc(text)}</span><span class="capture-meta">${state}${capturedAgo(rec.at)}</span></div>
        <div class="range" role="group" aria-label="Where &quot;${esc(text)}&quot; is">${Object.keys(CAPTURE_LABELS).map((k) =>
    `<button type="button" data-capture="${rec.id}" data-to="${k}" aria-pressed="${rec.kind === k}"${movable ? '' : ' disabled'}>${CAPTURE_LABELS[k]}</button>`).join('')}</div>
      </li>`;
    }).join('')
    : emptyState('note', 'Nothing captured yet', 'Things you add with Ctrl+Shift+Space will show up here.');
}

function openCaptures() {
  renderCaptures();
  if (!$('capturesDialog').open) $('capturesDialog').showModal();
}

function bindCaptures() {
  $('capturesList').addEventListener('click', async (e) => {
    const b = e.target.closest('[data-capture]');
    if (!b || b.disabled) return;
    await moveCapture(b.dataset.capture, b.dataset.to, { tell: false });
    renderCaptures();
  });
  $('capturesClose').addEventListener('click', () => $('capturesDialog').close());
}
