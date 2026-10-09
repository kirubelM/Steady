// Loads Steady's window scripts into a sandbox so their logic can be tested without Electron.
// The page, storage and saving are replaced by small stand-ins; everything else is the real code.
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { normalize } = require('../../datamodel');

const ROOT = path.join(__dirname, '..', '..');
// Same order as index.html, so later scripts see the earlier ones.
const SCRIPTS = ['core.js', 'projects.js', 'sound.js', 'views.js', 'insights.js', 'plan.js', 'review.js',
  'recurring.js', 'schedule.js', 'planning.js', 'goals.js', 'shortcuts.js', 'datacare.js'];

// An element that accepts anything: enough for code that touches the page as a side effect.
function fakeElement() {
  const el = {
    style: { setProperty() {}, removeProperty() {} },
    dataset: {},
    classList: { add() {}, remove() {}, toggle() {}, contains: () => false },
    addEventListener() {},
    querySelector: () => null,
    querySelectorAll: () => [],
    closest: () => null,
    getBoundingClientRect: () => ({ top: 0, bottom: 0, left: 0, right: 0, width: 0, height: 0 }),
    focus() {},
    blur() {},
    showModal() {},
    close() {},
    hidden: false,
    open: false,
    value: '',
    textContent: '',
    innerHTML: '',
    offsetWidth: 0
  };
  return el;
}

function loadApp(raw = {}) {
  const elements = new Map();
  const saved = [];
  const sandbox = {
    console,
    setTimeout: () => 0,
    clearTimeout() {},
    setInterval: () => 0,
    clearInterval() {},
    requestAnimationFrame: () => 0,
    performance: { now: () => 0 },
    structuredClone,
    localStorage: { getItem: () => null, setItem() {} },
    matchMedia: () => ({ matches: true }), // pretend "reduce motion" is on: no animation timers
    getComputedStyle: () => ({ getPropertyValue: () => '' }),
    Event: class {},
    addEventListener() {},
    window: null,
    document: {
      getElementById: (id) => { if (!elements.has(id)) elements.set(id, fakeElement()); return elements.get(id); },
      querySelector: () => null,
      querySelectorAll: () => [],
      createElement: fakeElement,
      documentElement: fakeElement(),
      body: fakeElement(),
      activeElement: null,
      title: ''
    }
  };
  sandbox.window = sandbox;
  sandbox.window.steady = new Proxy({}, {
    get: (_t, name) => (name === 'save'
      ? async (patch) => { saved.push(patch); return true; }
      : async () => ({ ok: true, events: [] }))
  });
  vm.createContext(sandbox);
  for (const file of SCRIPTS) {
    vm.runInContext(fs.readFileSync(path.join(ROOT, file), 'utf8'), sandbox, { filename: file });
  }
  const run = (code) => vm.runInContext(code, sandbox);
  sandbox.__data = normalize(structuredClone(raw));
  run('data = __data; settings = data.settings;');
  // Drawing is not under test; skip it so logic runs without a page.
  run(`renderPlan = () => {}; renderFocusSubs = () => {}; renderRecurringSettings = () => {}; fillSettingsForm = () => {}; renderTimer = () => {}; renderParking = () => {};
       showNudge = (text, tone, auto, action) => { __nudges.push({ text, action: action && action.label, fn: action && action.fn }); };
       hideNudge = () => {}; playChime = () => {};`.replace('__nudges', '(globalThis.__nudges = globalThis.__nudges || [])'));
  return { run, sandbox, saved, nudges: () => sandbox.__nudges || [] };
}

module.exports = { loadApp };
