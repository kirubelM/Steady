/* One motion preference for the main window, mini timer and break screens. */
let motionPreference = 'system';
const windowsMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const motionQueries = new WeakMap();
function reducedMotion() {
  return motionPreference === 'reduced' || (motionPreference === 'system' && windowsMotion.matches);
}
function applyMotion(value) {
  motionPreference = ['system', 'full', 'reduced'].includes(value) ? value : 'system';
  document.documentElement.dataset.motion = reducedMotion() ? 'reduced' : 'full';
  const visit = (rules) => {
    for (const rule of rules) {
      if (rule.media) {
        const original = motionQueries.get(rule) || rule.media.mediaText;
        if (original.includes('prefers-reduced-motion')) {
          motionQueries.set(rule, original);
          rule.media.mediaText = original.replace(/\(prefers-reduced-motion:\s*(reduce|no-preference)\)/g,
            (_match, mode) => ((mode === 'reduce') === reducedMotion()) ? '(min-width: 0px)' : 'not all');
        }
      }
      if (rule.cssRules) visit(rule.cssRules);
    }
  };
  for (const sheet of document.styleSheets) visit(sheet.cssRules);
}
document.addEventListener('DOMContentLoaded', async () => {
  const data = await window.steady.load();
  applyMotion(data.settings.motion);
});
windowsMotion.addEventListener('change', () => applyMotion(motionPreference));
window.steady.onMotionChanged(applyMotion);
