// The shape of Steady's saved data, and how older or damaged files are brought up to date.
// Kept separate from main.js so it can be tested without Electron.

const DEFAULTS = {
  settings: {
    focusMin: 30,
    shortBreakMin: 5,
    longBreakMin: 15,
    longEvery: 4,
    strictBreaks: false,
    snoozeMin: 5,
    maxSnoozes: 2,
    meetingAware: true,
    eyeBreaks: true,
    eyeEveryMin: 20,
    idleCheckins: true,
    idleCheckinMin: 30,
    idleAutoPause: true,
    idlePauseMin: 5,
    dailyGoalMin: 240,
    reviewEnabled: true,
    reviewTime: '17:30',
    weeklyReview: true,
    weeklyReviewDay: 5,
    miniMode: 'focus',
    theme: 'system',
    compactAuto: false,
    sound: 'off',
    soundVolume: 0.5,
    soundInBreaks: false,
    presetId: 'standard',
    presets: [
      { id: 'classic', name: 'Classic', focusMin: 25, breakMin: 5 },
      { id: 'standard', name: 'Standard', focusMin: 30, breakMin: 5 },
      { id: 'deep', name: 'Deep work', focusMin: 50, breakMin: 10 },
      { id: 'long', name: 'Long block', focusMin: 90, breakMin: 15 }
    ],
    workStart: '09:00',
    workEnd: '17:00',
    calendars: [], // { id, kind: 'outlook' | 'link', name, url }
    accent: 'pine',
    projectTint: true,
    dayTint: true,
    chimes: false,
    nextPrompt: true,
    backupKeepDays: 30,
    startAtLogin: false,
    startMinimized: true,
    blockSites: false,
    blockedSites: ['youtube.com', 'reddit.com', 'x.com', 'twitter.com', 'facebook.com', 'instagram.com', 'tiktok.com'],
    distractionKeywords: ['YouTube', 'Reddit', 'Twitter', ' / X', 'Facebook', 'Instagram', 'TikTok', 'Netflix']
  },
  entries: [],
  parking: [],
  tasks: [],
  recurring: [],
  projects: [],
  notes: {},
  meta: {}
};

function normalize(input) {
  // A damaged or hand-edited file might hold null, an array or a string; treat those as empty.
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  if (raw.settings && (typeof raw.settings !== 'object' || Array.isArray(raw.settings))) delete raw.settings;
  const base = structuredClone(DEFAULTS);
  // Older versions had a single focus length; carry it into the "Standard" preset.
  if (raw.settings && !Array.isArray(raw.settings.presets)) {
    raw.settings.presets = structuredClone(base.settings.presets);
    const std = raw.settings.presets.find((p) => p.id === 'standard');
    std.focusMin = raw.settings.focusMin || 30;
    std.breakMin = raw.settings.shortBreakMin || 5;
  }
  // Before 1.3.1 there was a single calendar source; carry it into the list.
  if (raw.settings && !Array.isArray(raw.settings.calendars)) {
    const { calendarSource: src, calendarUrl: url } = raw.settings;
    raw.settings.calendars = src === 'outlook' ? [{ id: 'outlook', kind: 'outlook', name: 'Outlook' }]
      : src === 'link' && url ? [{ id: 'link1', kind: 'link', name: 'Calendar', url }]
        : [];
  }
  if (raw.settings) {
    delete raw.settings.calendarSource;
    delete raw.settings.calendarUrl;
    raw.settings.calendars = raw.settings.calendars
      .filter((c) => c && c.id && (c.kind === 'outlook' || (c.kind === 'link' && c.url)));
  }
  return {
    ...base,
    ...raw,
    settings: { ...base.settings, ...(raw.settings || {}) },
    entries: Array.isArray(raw.entries) ? raw.entries : [],
    parking: Array.isArray(raw.parking) ? raw.parking : [],
    tasks: Array.isArray(raw.tasks) ? raw.tasks : [],
    recurring: Array.isArray(raw.recurring) ? raw.recurring : [],
    projects: Array.isArray(raw.projects) ? raw.projects : [],
    notes: raw.notes && typeof raw.notes === 'object' ? raw.notes : {},
    meta: raw.meta && typeof raw.meta === 'object' ? raw.meta : {}
  };
}

module.exports = { DEFAULTS, normalize };
