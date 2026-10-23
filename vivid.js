/* ---------- Lively effects: a moving tab marker, a soft drifting backdrop, confetti for finished tasks,
   a light that follows the pointer over cards, and ripples on buttons. Settings > Appearance turns them off,
   and they stay off whenever motion is reduced. ---------- */

const livelyOn = () => settings.lively !== false && !reducedMotion();

const TAB_ICONS = {
  plan: '<path d="M3 4.5h1.5M3 8h1.5M3 11.5h1.5"/><path d="M6.5 4.5h6.5M6.5 8h6.5M6.5 11.5h4"/>',
  day: '<rect x="2.5" y="3.5" width="11" height="10" rx="2"/><path d="M2.5 6.5h11M5.5 2v3M10.5 2v3"/>',
  log: '<circle cx="8" cy="8" r="5.5"/><path d="M8 5v3l2 1.5"/>',
  insights: '<path d="M3 13V9M6.5 13V5.5M10 13V8M13.5 13V3"/>',
  parking: '<path d="M4 2.5h8v11l-4-2.5-4 2.5z"/>',
  settings: '<circle cx="8" cy="8" r="2"/><path d="M8 1.8v1.7M8 12.5v1.7M1.8 8h1.7M12.5 8h1.7M3.6 3.6l1.2 1.2M11.2 11.2l1.2 1.2M3.6 12.4l1.2-1.2M11.2 4.8l1.2-1.2"/>'
};

/* The tab bar: an icon on each tab and a marker that glides to the one you pick. */
function bindTabInk() {
  const bar = document.querySelector('.tabs');
  if (!bar) return;
  bar.querySelectorAll('.tab-btn').forEach((b) => {
    const svg = TAB_ICONS[b.dataset.tab];
    if (svg && !b.querySelector('.tab-ico')) b.insertAdjacentHTML('afterbegin', `<svg class="tab-ico" viewBox="0 0 16 16" aria-hidden="true">${svg}</svg>`);
  });
  const ink = document.createElement('span');
  ink.className = 'tab-ink';
  ink.setAttribute('aria-hidden', 'true');
  bar.appendChild(ink);
  const place = () => {
    const on = bar.querySelector('.tab-btn[aria-selected="true"]');
    if (!on) return;
    ink.style.width = `${on.offsetWidth}px`;
    ink.style.transform = `translateX(${on.offsetLeft}px)`;
  };
  new MutationObserver(place).observe(bar, { attributes: true, subtree: true, attributeFilter: ['aria-selected'] });
  window.addEventListener('resize', place);
  requestAnimationFrame(place);
  document.fonts?.ready?.then(place);
}

/* A few soft blobs of the accent color drifting slowly behind the page. */
function addAurora() {
  const panel = document.querySelector('.panel');
  if (!panel || panel.querySelector('.aurora')) return;
  panel.insertAdjacentHTML('afterbegin', '<div class="aurora" aria-hidden="true"><i></i><i></i><i></i></div>');
}

/* Confetti from a point on screen. `big` is for finishing everything planned today. */
function burstAt(x, y, big = false) {
  if (!livelyOn()) return;
  const accent = getComputedStyle(document.documentElement).getPropertyValue('--pine').trim() || '#2E8B7A';
  const colors = [accent, '#E2B04E', '#E5808E', '#6FA8DC', '#8FCB9B', ...(data.projects || []).map((p) => p.color)];
  const count = big ? 70 : 16;
  for (let i = 0; i < count; i++) {
    const p = document.createElement('span');
    p.className = 'confetti';
    const size = (big ? 6 : 5) + Math.random() * 4;
    p.style.cssText = `left:${x}px;top:${y}px;width:${size}px;height:${size * (Math.random() < 0.5 ? 1 : 0.45)}px;background:${colors[i % colors.length]};border-radius:${Math.random() < 0.4 ? '50%' : '2px'}`;
    document.body.appendChild(p);
    const angle = big ? Math.PI * (0.15 + Math.random() * 0.7) : Math.random() * Math.PI * 2;
    const speed = big ? 260 + Math.random() * 420 : 40 + Math.random() * 70;
    const dx = Math.cos(angle) * speed * (big ? (Math.random() < 0.5 ? -1 : 1) : 1);
    const dy = big ? Math.sin(angle) * speed + 120 : Math.sin(angle) * speed - 30;
    const spin = (Math.random() - 0.5) * 900;
    p.animate([
      { transform: 'translate(-50%, -50%) rotate(0deg)', opacity: 1 },
      { transform: `translate(calc(-50% + ${dx * 0.7}px), calc(-50% + ${dy * 0.5}px)) rotate(${spin * 0.6}deg)`, opacity: 1, offset: 0.55 },
      { transform: `translate(calc(-50% + ${dx}px), calc(-50% + ${dy + (big ? 260 : 60)}px)) rotate(${spin}deg)`, opacity: 0 }
    ], { duration: (big ? 1600 : 750) + Math.random() * 500, easing: 'cubic-bezier(0.2, 0.7, 0.3, 1)' }).onfinish = () => p.remove();
  }
}

// Ticking off a task, subtask or parked item sends up a little burst; clearing the whole day sends up a big one.
function bindConfetti() {
  document.addEventListener('change', (e) => {
    const box = e.target;
    if (!box.checked || box.type !== 'checkbox') return;
    if (!box.closest('#taskList, #parkList, .subtask-list, .focus-subs')) return;
    const r = box.getBoundingClientRect();
    burstAt(r.left + r.width / 2, r.top + r.height / 2);
    if (box.dataset.taskDone && typeof openTodayTasks === 'function') {
      setTimeout(() => {
        if (todayTasks().length > 1 && !openTodayTasks().length) {
          burstAt(window.innerWidth / 2, window.innerHeight * 0.18, true);
          showNudge('Everything on today\'s plan is done. Nicely done!', 'info', true);
        }
      }, 900);
    }
  }, true);
}

/* Cards light up softly where the pointer is. */
const GLOW_CARDS = '.plan-section, .insight, .g-tile, .day-side, .day-main, .app-insights, .leftovers, .settings fieldset, .h-day, .entry, .done-item';
function bindGlow() {
  let last = null;
  document.addEventListener('pointermove', (e) => {
    if (!livelyOn()) return;
    const card = e.target.closest?.(GLOW_CARDS);
    if (last && last !== card) last.classList.remove('glowing');
    last = card;
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty('--mx', `${e.clientX - r.left}px`);
    card.style.setProperty('--my', `${e.clientY - r.top}px`);
    card.classList.add('glowing');
  }, { passive: true });
  document.addEventListener('pointerleave', () => last?.classList.remove('glowing'));
}

/* A ripple spreads from where you press a button. */
function bindRipples() {
  document.addEventListener('pointerdown', (e) => {
    if (!livelyOn() || e.button !== 0) return;
    const b = e.target.closest?.('.btn, .range button, .tab-btn');
    if (!b || b.disabled) return;
    const r = b.getBoundingClientRect();
    const size = Math.max(r.width, r.height) * 2.2;
    const dot = document.createElement('span');
    dot.className = 'ripple';
    dot.style.cssText = `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(dot);
    dot.animate([{ transform: 'scale(0)', opacity: 0.35 }, { transform: 'scale(1)', opacity: 0 }], { duration: 550, easing: 'ease-out' }).onfinish = () => dot.remove();
  });
}

function bindLively() {
  bindTabInk();
  addAurora();
  bindConfetti();
  bindGlow();
  bindRipples();
}
