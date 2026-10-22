const $ = (id) => document.getElementById(id);
const KINDS = ['todo', 'done', 'park'];
const PLACEHOLDERS = {
  todo: 'Something to do, e.g. Call Sam fri 2pm #project !',
  done: 'Something you just finished, e.g. Called the vendor 20m #project',
  park: 'A stray thought to deal with later #project'
};
let kind = 'park';
try { kind = localStorage.getItem('captureKind') || 'park'; } catch { /* storage unavailable */ }
if (!KINDS.includes(kind)) kind = 'park';

function setKind(k) {
  kind = k;
  try { localStorage.setItem('captureKind', k); } catch { /* ignore */ }
  document.querySelectorAll('[data-kind]').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.kind === k)));
  $('text').placeholder = PLACEHOLDERS[k];
  $('minutes').hidden = k !== 'done';
  renderSuggest();
  $('hint').innerHTML = k === 'done'
    ? '<kbd>Enter</kbd> saves, <kbd>Tab</kbd> switches type. Add time like "20m" and a project like "#Acme".'
    : k === 'todo'
      ? '<kbd>Enter</kbd> saves, <kbd>Tab</kbd> switches type. Type a day, a time, "every week", a #project or ! to star.'
      : '<kbd>Enter</kbd> saves, <kbd>Tab</kbd> switches type. Add a project with "#Acme".';
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
  $('hint').hidden = open;
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

function reset() {
  window.steady.captureProjects?.().then((list) => { projects = list || []; }).catch(() => {});
  pick = 0;
  $('text').value = '';
  $('minutes').value = '';
  setKind(kind);
}

function submit() {
  let text = $('text').value.trim();
  if (!text) return;
  let minutes = Number($('minutes').value) || 0;
  // "Called the vendor 20m" also works, so you never have to leave the keyboard.
  // A "#project" tag may come before or after the time, so set it aside while reading the time.
  const tag = /(^|\s)#[^\s#]+/.exec(text);
  const tagText = tag ? tag[0].trim() : '';
  if (tag && kind === 'done') text = (text.slice(0, tag.index) + ' ' + text.slice(tag.index + tag[0].length)).trim();
  const m = /\s(\d{1,3})\s*(m|min|mins|minutes)$/i.exec(text);
  if (kind === 'done' && m && !minutes) {
    minutes = Number(m[1]);
    text = text.slice(0, m.index).trim();
  }
  if (tag && kind === 'done') text = `${text} ${tagText}`.trim();
  window.steady.submitCapture({ kind, text, minutes });
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
  if (e.key === 'Escape' && !$('suggest').hidden) { e.preventDefault(); $('suggest').hidden = true; $('hint').hidden = false; picks = []; return; }
  if (e.key === 'Escape') { e.preventDefault(); window.steady.closeCapture(); }
  else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const i = KINDS.indexOf(kind);
    setKind(KINDS[(i + (e.shiftKey ? KINDS.length - 1 : 1)) % KINDS.length]);
  }
});
document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind)));
$('text').addEventListener('input', () => { pick = 0; renderSuggest(); });
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
