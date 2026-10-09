const params = new URLSearchParams(location.search);
const kind = params.get('kind') === 'long' ? 'long' : 'short';
const minutes = Math.max(1, Number(params.get('minutes')) || 5);
const strict = params.get('strict') === '1';
const primary = params.get('primary') === '1';
const snoozesLeft = Number(params.get('snoozes')) || 0;
const snoozeMin = Number(params.get('snoozeMin')) || 5;

const total = minutes * 60000;
const endAt = Date.now() + total;

const SHORT_TIPS = [
  'Look out a window at something at least 20 feet (6 m) away.',
  'Roll your shoulders back a few times and unclench your jaw.',
  'Stand up and stretch your arms overhead.',
  'Blink slowly ten times to rewet your eyes.',
  'Take a few slow breaths, longer out than in.'
];
const LONG_TIPS = [
  'Step away from your desk. Walk somewhere, even just to another room.',
  'Refill your water and drink some of it.',
  'Get some daylight on your face if you can.',
  'Check your parking lot later, not now. This time is for resting.',
  'Stretch your hips and calves after all that sitting.'
];

const tips = kind === 'long' ? LONG_TIPS : SHORT_TIPS;
let tipIndex = Math.floor(Math.random() * tips.length);
let finished = false;

const $ = (id) => document.getElementById(id);
$('heading').textContent = kind === 'long' ? 'Time for a proper break' : 'Rest your eyes';
$('tip').textContent = tips[tipIndex];

if (primary && snoozesLeft > 0) {
  $('snooze').hidden = false;
  $('snooze').textContent = `${snoozeMin} more minute${snoozeMin === 1 ? '' : 's'}`;
  $('snooze').title = snoozesLeft === 1 ? 'Last snooze for this break' : `${snoozesLeft} snoozes left`;
  $('snooze').addEventListener('click', () => {
    finished = true;
    window.steady.snoozeBreak();
  });
}

if (primary) {
  $('skip').hidden = strict;
  $('skip').addEventListener('click', () => {
    finished = true;
    window.steady.endBreak(true);
  });
}

function fmt(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function tick() {
  if (finished) return;
  const now = Date.now();
  const rem = endAt - now;
  $('count').textContent = fmt(rem);
  $('bar').style.width = `${Math.min(100, ((total - rem) / total) * 100)}%`;

  if (primary && strict && rem <= total / 2) $('skip').hidden = false;

  if (rem <= 0) {
    finished = true;
    $('heading').textContent = "Break's over";
    $('tip').textContent = 'Welcome back.';
    $('skip').hidden = true;
    $('snooze').hidden = true;
    if (primary) setTimeout(() => window.steady.endBreak(false), 1500);
  }
}

setInterval(() => {
  if (finished) return;
  tipIndex = (tipIndex + 1) % tips.length;
  $('tip').classList.add('fade');
  setTimeout(() => { $('tip').textContent = tips[tipIndex]; $('tip').classList.remove('fade'); }, 600);
}, 20000);

// Follows the breathing circle: in for 4 seconds, out for 6.
const breathStart = Date.now();
setInterval(() => {
  if (finished) { $('breath').textContent = ''; return; }
  const t = ((Date.now() - breathStart) / 1000) % 10;
  $('breath').textContent = t < 4 ? 'Breathe in' : 'Breathe out';
}, 250);

setInterval(tick, 500);
tick();
