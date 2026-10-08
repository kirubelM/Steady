/* ---------- Focus sounds (generated in the app, no files or internet needed) ---------- */

const SOUND_OPTIONS = [
  { id: 'off', name: 'No sound' },
  { id: 'brown', name: 'Brown noise' },
  { id: 'pink', name: 'Soft static' },
  { id: 'rain', name: 'Rain' },
  { id: 'ocean', name: 'Ocean waves' }
];

const Sound = (() => {
  let ctx = null;
  let master = null;
  let parts = [];     // nodes to stop when switching
  let current = null; // sound id currently built
  let playing = false;
  let stopTimer = null;
  let previewTimer = null;
  const buffers = {};

  function ensure() {
    if (ctx) return;
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = 0;
    master.connect(ctx.destination);
  }

  function makeBuffer(kind) {
    if (buffers[kind]) return buffers[kind];
    const seconds = 10;
    const len = ctx.sampleRate * seconds;
    const buf = ctx.createBuffer(2, len, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      let last = 0;
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
      for (let i = 0; i < len; i++) {
        const w = Math.random() * 2 - 1;
        if (kind === 'brown') {
          last = (last + 0.02 * w) / 1.02;
          d[i] = last * 3.5;
        } else if (kind === 'pink') {
          b0 = 0.99886 * b0 + w * 0.0555179;
          b1 = 0.99332 * b1 + w * 0.0750759;
          b2 = 0.96900 * b2 + w * 0.1538520;
          b3 = 0.86650 * b3 + w * 0.3104856;
          b4 = 0.55000 * b4 + w * 0.5329522;
          b5 = -0.7616 * b5 - w * 0.0168980;
          d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
          b6 = w * 0.115926;
        } else {
          d[i] = w * 0.5;
        }
      }
      // Remove drift and soften the loop point so there's no click when it repeats.
      const drift = d[len - 1] - d[0];
      for (let i = 0; i < len; i++) d[i] -= (drift * i) / len;
      const fade = Math.floor(ctx.sampleRate * 0.05);
      for (let i = 0; i < fade; i++) {
        const k = i / fade;
        d[i] *= k;
        d[len - 1 - i] *= k;
      }
    }
    buffers[kind] = buf;
    return buf;
  }

  function source(kind) {
    const s = ctx.createBufferSource();
    s.buffer = makeBuffer(kind);
    s.loop = true;
    s.start();
    parts.push(s);
    return s;
  }

  function lfo(freq, depth, target, offset) {
    const osc = ctx.createOscillator();
    osc.frequency.value = freq;
    const amt = ctx.createGain();
    amt.gain.value = depth;
    osc.connect(amt).connect(target);
    if (offset !== undefined) target.value = offset;
    osc.start();
    parts.push(osc);
  }

  function build(id) {
    teardown();
    const out = ctx.createGain();
    out.connect(master);
    parts.push(out);

    if (id === 'brown') {
      source('brown').connect(out);
      out.gain.value = 0.9;
    } else if (id === 'pink') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 5000;
      source('pink').connect(lp).connect(out);
      out.gain.value = 0.7;
    } else if (id === 'rain') {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 450;
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 8000;
      const patter = ctx.createGain();
      lfo(0.31, 0.12, patter.gain, 0.8);
      source('pink').connect(hp).connect(lp).connect(patter).connect(out);
      const rumble = ctx.createGain();
      rumble.gain.value = 0.35;
      source('brown').connect(rumble).connect(out);
      out.gain.value = 0.8;
    } else if (id === 'ocean') {
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = 700;
      lfo(0.075, 450, lp.frequency, 750);
      const swell = ctx.createGain();
      lfo(0.075, 0.4, swell.gain, 0.6);
      source('brown').connect(lp).connect(swell).connect(out);
      out.gain.value = 1;
    }
    current = id;
  }

  function teardown() {
    parts.forEach((n) => {
      try { if (n.stop) n.stop(); } catch { /* already stopped */ }
      try { n.disconnect(); } catch { /* ignore */ }
    });
    parts = [];
    current = null;
  }

  const level = (v) => Math.pow(Math.max(0, Math.min(1, v)), 2) * 0.6;

  function play(id, volume) {
    if (!id || id === 'off') return stop();
    ensure();
    if (ctx.state === 'suspended') ctx.resume();
    clearTimeout(stopTimer);
    if (current !== id) build(id);
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(level(volume), now + 1.5);
    playing = true;
  }

  function stop() {
    if (!ctx || !playing) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(0, now + 1.2);
    playing = false;
    clearTimeout(stopTimer);
    stopTimer = setTimeout(teardown, 1400);
  }

  function setVolume(volume) {
    if (!ctx || !playing) return;
    const now = ctx.currentTime;
    master.gain.cancelScheduledValues(now);
    master.gain.setValueAtTime(master.gain.value, now);
    master.gain.linearRampToValueAtTime(level(volume), now + 0.2);
  }

  // A few seconds of the sound so you can hear it before a session.
  function preview(id, volume) {
    clearTimeout(previewTimer);
    play(id, volume);
    previewTimer = setTimeout(() => { if (!wanted()) stop(); }, 4000);
  }
  function previewing() { return !!previewTimer && playing; }

  return { play, stop, setVolume, preview, isPlaying: () => playing, current: () => current, previewing };
})();

function wanted() {
  if (!settings || settings.sound === 'off') return false;
  return S.state === 'focus' || (settings.soundInBreaks && S.state === 'break');
}

let soundPreviewUntil = 0;

// Called every tick: starts, switches or fades the sound to match the session.
function syncSound() {
  if (wanted()) {
    soundPreviewUntil = 0; // a real session takes over from any preview
    if (!Sound.isPlaying() || Sound.current() !== settings.sound) Sound.play(settings.sound, settings.soundVolume);
  } else if (Date.now() >= soundPreviewUntil && Sound.isPlaying()) {
    Sound.stop();
  }
}

function renderSoundControls() {
  $('soundSelect').innerHTML = SOUND_OPTIONS
    .map((o) => `<option value="${o.id}" ${o.id === settings.sound ? 'selected' : ''}>${o.name}</option>`).join('');
  $('soundVolume').value = String(Math.round((settings.soundVolume ?? 0.5) * 100));
  $('soundVolume').disabled = settings.sound === 'off';
}

function bindSound() {
  $('soundSelect').addEventListener('change', async (e) => {
    settings.sound = e.target.value;
    $('soundVolume').disabled = settings.sound === 'off';
    await persist('settings');
    if (settings.sound === 'off') { Sound.stop(); return; }
    if (!wanted()) {
      soundPreviewUntil = Date.now() + 4000;
      Sound.preview(settings.sound, settings.soundVolume);
    } else {
      Sound.play(settings.sound, settings.soundVolume);
    }
  });
  let saveTimer = null;
  $('soundVolume').addEventListener('input', (e) => {
    settings.soundVolume = Number(e.target.value) / 100;
    Sound.setVolume(settings.soundVolume);
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => persist('settings'), 600);
  });
}
