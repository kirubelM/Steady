const $ = (id) => document.getElementById(id);
const C = 2 * Math.PI * 16;

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}
function fmtMins(sec) {
  const m = Math.round(sec / 60);
  if (m < 60) return `${m} min`;
  return m % 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m / 60} h`;
}

let current = { state: 'idle' };

function render(st) {
  current = st;
  document.body.dataset.state = st.state;
  const inSession = st.state === 'focus' || st.state === 'paused';
  let frac = 1;
  if (inSession) frac = 1 - st.remaining / st.total;
  if (st.state === 'breakPending' && st.pendingReason === 'snooze') frac = 1 - st.remaining / st.total;
  $('prog').style.strokeDashoffset = String(C * (1 - Math.min(1, Math.max(0, frac))));

  if (inSession || (st.state === 'breakPending' && st.pendingReason === 'snooze')) $('time').textContent = fmt(st.remaining);
  else if (st.state === 'breakPending') $('time').textContent = 'Break';
  else if (st.state === 'checkin') $('time').textContent = 'Done';
  else $('time').textContent = st.goalSec ? fmtMins(st.todaySec) : 'Ready';

  $('task').textContent = {
    focus: st.task,
    paused: st.autoPaused ? 'Paused while you were away' : `Paused: ${st.task}`,
    breakPending: st.pendingReason === 'meeting' ? 'Break after your call' : 'Break snoozed',
    checkin: 'Log your session',
    break: 'On a break'
  }[st.state] || (st.goalSec ? `of ${fmtMins(st.goalSec)} goal today` : 'Ready to focus');

  const showPause = st.state === 'focus';
  $('iconPause').hidden = !showPause;
  $('iconPlay').hidden = showPause;
  $('toggle').hidden = !['focus', 'paused', 'idle'].includes(st.state);
  const label = showPause ? 'Pause' : st.state === 'paused' ? 'Resume' : 'Start focus';
  $('toggle').setAttribute('aria-label', label);
  $('toggle').title = label;
}

window.steady.onMiniState(render);
$('toggle').addEventListener('click', () => window.steady.command('toggle'));
$('open').addEventListener('click', () => window.steady.command('open'));
$('hide').addEventListener('click', () => window.steady.command('mini-hide'));
