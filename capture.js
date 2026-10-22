const $ = (id) => document.getElementById(id);
const KINDS = ['todo', 'done', 'park'];
const PLACEHOLDERS = {
  todo: 'Something to do today',
  done: 'Something you just finished',
  park: 'A stray thought to deal with later'
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
  $('hint').innerHTML = k === 'done'
    ? '<kbd>Enter</kbd> saves, <kbd>Tab</kbd> switches type. Add time like "20m" and a project like "#Acme".'
    : '<kbd>Enter</kbd> saves, <kbd>Tab</kbd> switches type. Add a project with "#Acme".';
  $('text').focus();
}

function reset() {
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
  if (e.key === 'Escape') { e.preventDefault(); window.steady.closeCapture(); }
  else if (e.key === 'Enter') { e.preventDefault(); submit(); }
  else if (e.key === 'Tab') {
    e.preventDefault();
    const i = KINDS.indexOf(kind);
    setKind(KINDS[(i + (e.shiftKey ? KINDS.length - 1 : 1)) % KINDS.length]);
  }
});
document.querySelectorAll('[data-kind]').forEach((b) => b.addEventListener('click', () => setKind(b.dataset.kind)));
window.steady.onCaptureReset(reset);
window.addEventListener('focus', () => $('text').focus());
reset();
