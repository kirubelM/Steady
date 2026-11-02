/* ---------- Quick capture: reading the type out of what you typed ---------- */

// Two helpers for the quick capture window, kept apart from the page so they can be tested:
//  - parsePrefix: "done: sent the report", "/park look into SSO" set the type without touching Tab.
//  - suggestKind: when what you typed sounds like another type ("Call Sam tomorrow" while saving to Done),
//    says which one, so the window can offer it. It only suggests; it never switches by itself.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.CaptureKind = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  const LABELS = { todo: 'To do', done: 'Done', park: 'Parking lot' };

  // A word and a colon ("done:", "t:") or a slash command followed by a space ("/done "). The colon or slash is
  // required, so a task like "Done reviewing the PR" is never mistaken for a type, a path like "D:\files" is left
  // alone, and a half-typed "/don" never switches anything.
  const PREFIX = /^\s*(?:\/(todo|to-do|done|park|parking)\s+|(todo|to-do|to do|done|park|parking|t|d|p)\s*:(?![\\/])\s*)/i;
  const KIND_OF = { todo: 'todo', 'to-do': 'todo', 'to do': 'todo', t: 'todo', done: 'done', d: 'done', park: 'park', parking: 'park', p: 'park' };

  // { kind, text } with the prefix removed, or null when there isn't one.
  function parsePrefix(input) {
    const m = PREFIX.exec(String(input || ''));
    if (!m) return null;
    return { kind: KIND_OF[(m[1] || m[2]).toLowerCase()], text: String(input).slice(m[0].length) };
  }

  /* ---------- Does it sound finished, or still to do? ---------- */

  // Past tense: most verbs end in -ed (a few that don't are listed), and a few -ed words aren't verbs.
  const NOT_PAST = new Set(['speed', 'embed', 'proceed', 'succeed', 'exceed', 'shred', 'indeed', 'hundred', 'sacred', 'naked', 'wicked']);
  const PAST_IRREGULAR = new Set(['sent', 'wrote', 'did', 'made', 'spoke', 'met', 'paid', 'bought', 'got', 'took', 'had', 'told', 'gave',
    'ran', 'built', 'held', 'left', 'kept', 'sold', 'heard', 'saw', 'won', 'caught', 'taught', 'thought', 'brought', 'began', 'drew', 'chose']);
  // Things you tell yourself to do: the verb comes first.
  const IMPERATIVE = new Set(['call', 'email', 'send', 'buy', 'fix', 'write', 'review', 'book', 'pay', 'submit', 'update', 'merge', 'deploy',
    'reply', 'schedule', 'finish', 'prepare', 'plan', 'order', 'cancel', 'check', 'ask', 'follow', 'remind', 'draft', 'renew', 'clean',
    'organize', 'organise', 'research', 'find', 'get', 'make', 'create', 'add', 'remove', 'test', 'try', 'ping', 'text', 'message', 'contact',
    'arrange', 'confirm', 'print', 'sign', 'file', 'pick', 'return', 'prep', 'set', 'look', 'start', 'read', 'finalize', 'finalise', 'sort', 'book']);
  const DAYS = '(?:mon|tue|tues|wed|thu|thur|thurs|fri|sat|sun|monday|tuesday|wednesday|thursday|friday|saturday|sunday)';
  const FUTURE = [
    /\b(tomorrow|tonight|tmrw|someday|later today)\b/i,
    /\bnext (?:week|month|year|weekend|quarter)\b/i,
    new RegExp(`\\b(?:next|this coming|by|before|until|on) ${DAYS}\\b`, 'i'),
    /\bby (?:tomorrow|eod|end of (?:day|week|month)|noon|tonight)\b/i,
    /\b(?:in|within) \d{1,2} (?:days?|weeks?|months?)\b/i,
    /\bevery (?:day|week|weekday|month|other day)\b/i,
    new RegExp(`\\bevery ${DAYS}\\b`, 'i'),
    /\b(?:need|needs|have|has|got|want|plan) to\b/i,
    /\b(?:remember to|don'?t forget|remind me|should|must|gotta|todo|to-do)\b/i
  ];

  // The words that decide it: tags, a trailing length like "20m" and a trailing "!" don't count.
  function words(input) {
    return String(input || '')
      .replace(/(^|\s)#[^\s#]+/g, ' ')
      .replace(/\s\d{1,3}\s*(?:m|min|mins|minutes|h|hr|hrs|hours?)\s*$/i, ' ')
      .replace(/\s+!(?=\s|$)/g, ' ')
      .trim();
  }

  const soundsDone = (text) => {
    const first = (/^[a-z']+/i.exec(text) || [''])[0].toLowerCase();
    if (!first) return false;
    if (PAST_IRREGULAR.has(first)) return true;
    if (/^[a-z]{3,}ed$/.test(first) && !NOT_PAST.has(first)) return true;
    return /\b(?:done|finished|completed)\s*$/i.test(text);
  };
  const soundsTodo = (text) => {
    const first = (/^[a-z']+/i.exec(text) || [''])[0].toLowerCase();
    return IMPERATIVE.has(first) || FUTURE.some((re) => re.test(text));
  };

  // 'done', 'todo', 'both' (mixed signals) or null (can't tell).
  function sounds(input) {
    const text = words(input);
    if (!/\s/.test(text)) return null; // one word isn't enough to go on
    const done = soundsDone(text);
    const todo = soundsTodo(text);
    if (done && todo) return 'both';
    return done ? 'done' : todo ? 'todo' : null;
  }

  // The type this text sounds like when it isn't the one it's being saved to; null when it fits or can't be told.
  // The Parking lot takes anything, so it never gets a suggestion.
  function suggestKind(kind, input) {
    if (kind !== 'todo' && kind !== 'done') return null;
    const s = sounds(input);
    if (kind === 'done' && s === 'todo') return 'todo';
    if (kind === 'todo' && s === 'done') return 'done';
    return null;
  }

  return { LABELS, parsePrefix, sounds, suggestKind };
});
