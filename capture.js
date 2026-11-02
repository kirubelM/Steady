const $ = (id) => document.getElementById(id);
const KINDS = ['todo', 'done', 'park'];
const PLACEHOLDERS = {
  todo: 'Something to do, e.g. Call Sam fri 2pm #project !',
  done: 'Something you just finished, e.g. Called the vendor 20m #project',
  park: 'A stray thought to deal with later #project'
};
const LABELS = CaptureKind.LABELS;
let kind = 'todo';
let cfg = { opensOn: 'todo', hints: true }; // from Settings, fetched each time the window opens
let chosen = false; // the type was picked for this capture (Tab, a click or a prefix), so a late setting mustn't undo it
let suggested = null; // the type the text sounds like, when it isn't the one selected

// The type to start on: the one chosen in Settings, or the one used last.
function startingKind() {
  if (cfg.opensOn !== 'last') return KINDS.includes(cfg.opensOn) ? cfg.opensOn : 'todo';
  try { const k = localStorage.getItem('captureKind'); return KINDS.includes(k) ? k : 'todo'; } catch { return 'todo'; }
}

// `remember` is only for a type picked by hand, so a prefix typed for one capture doesn't carry over to the next.
function setKind(k, { remember = false, pick: picked = remember } = {}) {
  kind = k;
  if (picked) chosen = true;
  if (remember) {
    try { localStorage.setItem('captureKind', k); } catch { /* ignore */ }
  }
  document.querySelector('.card').dataset.type = k;
  $('savingTo').textContent = LABELS[k];
  document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
  $('text').placeholder = PLACEHOLDERS[k];
  $('minutes').hidden = k !== 'done';
  const to = `<kbd>Enter</kbd> saves to ${LABELS[k]}, <kbd>Tab</kbd> switches type.`;
  $('hint').innerHTML = k === 'done'
    ? `${to} Add time like "20m" and a project like "#Acme".`
    : k === 'todo'
      ? `${to} Type a day, a time, "every week", a #project or ! to star.`
      : `${to} Add a project with "#Acme".`;
  renderSuggest();
  $('text').focus();
}

/* ---------- Typing # suggests a project ---------- */

let projects = [];
let picks = []; // the projects shown for the # being typed
let pick = 0;
const flat = (name) => name.replace(/\s+/g, '');

// The "#cli" right before the cursor, if any.
function hashAtCaret() {
  const el = $('text');
  const before = el.value.slice(0, el.selectionStart);
  const m = before.match(/(^|\s)#([^\s#]*)$/);
  return m ? { query: m[2].toLowerCase(), start: before.length - m[2].length - 1, end: el.selectionStart } : null;
}

function renderSuggest() {
  const box = $('suggest');
  const at = hashAtCaret();
  picks = at ? projects.filter((p) => flat(p.name).toLowerCase().startsWith(at.query) || p.name.toLowerCase().includes(at.query)).slice(0, 6) : [];
  pick = Math.min(pick, Math.max(0, picks.length - 1));
  const open = !!at;
  box.hidden = !open;
  renderKindHint(open);
  if (!open) return;
  box.innerHTML = picks.length
    ? picks.map((p, i) => `<button type="button" role="option" data-pick="${i}" aria-selected="${i === pick}" style="--pc:${p.color}"><i></i>${esc(p.name)}</button>`).join('')
      + '<span><kbd>Tab</kbd> picks</span>'
    : `<span>${projects.length ? 'No project matches.' : 'No projects yet. Add them in Steady under Settings > Projects and tasks.'}</span>`;
}

function acceptPick(i = pick) {
  const at = hashAtCaret();
  const p = picks[i];
  if (!at || !p) return false;
  const el = $('text');
  const tag = `#${flat(p.name)} `;
  el.value = el.value.slice(0, at.start) + tag + el.value.slice(at.end).replace(/^\s+/, '');
  const caret = at.start + tag.length;
  el.setSelectionRange(caret, caret);
  pick = 0;
  renderSuggest();
  el.focus();
  return true;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// Under the box: the project list while a # is being typed, else a nudge when the text sounds like another type, else the keys.
function renderKindHint(projectsOpen = !$('suggest').hidden) {
  suggested = cfg.hints !== false ? CaptureKind.suggestKind(kind, $('text').value) : null;
  $('kindHint').hidden = projectsOpen || !suggested;
  $('hint').hidden = projectsOpen || !!suggested;
  if (!suggested) return;
  const now = LABELS[kind];
  $('kindHint').innerHTML = `Sounds like ${suggested === 'todo' ? 'something still to do' : 'something you already did'}, not ${now === 'Done' ? 'Done' : 'a to-do'}. `
    + `<kbd>Ctrl</kbd>+<kbd>Enter</kbd> saves it as <b>${LABELS[suggested]}</b>.`;
}

function reset() {
  pick = 0;
  chosen = false;
  $('text').value = '';
  $('minutes').value = '';
  setKind(startingKind());
  const asked = window.steady.captureConfig ? window.steady.captureConfig() : Promise.resolve(null);
  asked.then((c) => {
    if (!c) return;
    cfg = { opensOn: c.opensOn, hints: c.hints };
    projects = c.projects || [];
    if (!chosen && !$('text').value) setKind(startingKind()); // the setting arrived after the window drew
    else renderSuggest();
  }).catch(() => {});
}

function submit(as) {
  const type = as || kind; // saved as this type, which isn't always the one selected (Ctrl+Enter takes the suggestion)
  let text = $('text').value.trim();
  if (!text) return;
  let minutes = Number($('minutes').value) || 0;
  // "Called the vendor 20m" also works, so you never have to leave the keyboard.
  // A "#project" tag may come before or after the time, so set it aside while reading the time.
  const tag = /(^|\s)#[^\s#]+/.exec(text);
  const tagText = tag ? tag[0].trim() : '';
  if (tag && type === 'done') text = (text.slice(0, tag.index) + ' ' + text.slice(tag.index + tag[0].length)).trim();
  const m = /\s(\d{1,3})\s*(m|min|mins|minutes)$/i.exec(text);
  if (type === 'done' && m && !minutes) {
    minutes = Number(m[1]);
    text = text.slice(0, m.index).trim();
  }
  if (tag && type === 'done') text = `${text} ${tagText}`.trim();
  window.steady.submitCapture({ kind: type, text, minutes });
  reset();
}

document.addEventListener('keydown', (e) => {
  // While projects are suggested, the arrows move through them and Tab or Enter picks one.
  if (picks.length && !$('suggest').hidden) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      pick = (pick + (e.key === 'ArrowDown' ? 1 : picks.length - 1)) % picks.length;
      renderSuggest();
      return;
    }
    if ((e.key === 'Tab' && !e.shiftKey) || e.key === 'Enter') { e.preventDefault(); acceptPick(); return; }
  }
  if (e.key === 'Escape' && !$('suggest').hidden) { e.preventDefault(); $('suggest').hidden = true; picks = []; renderKindHint(false); return; }
  if (e.key === 'Escape') { e.preventDefault(); window.steady.closeCapture(); }
  else if (e.key === 'Enter') { e.preventDefault(); submit((e.ctrlKey || e.metaKey) && suggested ? suggested : kind); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const i = KINDS.indexOf(kind);
    setKind(KINDS[(i + (e.shiftKey ? KINDS.length - 1 : 1)) % KINDS.length], { remember: true });
  }
});
document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind, { remember: true })));
$('text').addEventListener('input', () => {
  // "done: ..." or "/park ..." at the start picks the type for this capture, and the prefix is taken out of the box.
  const p = CaptureKind.parsePrefix($('text').value);
  if (p) {
    $('text').value = p.text;
    if (p.kind !== kind || !chosen) setKind(p.kind, { pick: true });
  }
  pick = 0;
  renderSuggest();
});
$('text').addEventListener('click', renderSuggest);
$('suggest').addEventListener('mousedown', (e) => {
  const b = e.target.closest('[data-pick]');
  if (!b) return;
  e.preventDefault(); // keep the cursor in the box
  acceptPick(Number(b.dataset.pick));
});
window.steady.onCaptureReset(reset);
window.addEventListener('focus', () => $('text').focus());
reset();
