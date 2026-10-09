// Reads meetings from classic Outlook (desktop) or from a published calendar link (.ics).
const { spawn } = require('child_process');

/* ---------- Classic Outlook via its COM interface ---------- */

function outlookScript(startIso, endIso) {
  return String.raw`
$ErrorActionPreference = 'Stop'
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
try { $ol = [Runtime.InteropServices.Marshal]::GetActiveObject('Outlook.Application') } catch { $ol = New-Object -ComObject Outlook.Application }
$ns = $ol.GetNamespace('MAPI')
$cal = $ns.GetDefaultFolder(9)
$items = $cal.Items
$items.Sort('[Start]')
$items.IncludeRecurrences = $true
$s = [datetime]::Parse('__START__')
$e = [datetime]::Parse('__END__')
$filter = "[Start] < '" + $e.ToString('g') + "' AND [End] > '" + $s.ToString('g') + "'"
$out = New-Object System.Collections.ArrayList
foreach ($a in $items.Restrict($filter)) {
  [void]$out.Add([pscustomobject]@{
    title = [string]$a.Subject
    start = $a.Start.ToString('yyyy-MM-ddTHH:mm:ss')
    end = $a.End.ToString('yyyy-MM-ddTHH:mm:ss')
    allDay = [bool]$a.AllDayEvent
    busy = [int]$a.BusyStatus
  })
  if ($out.Count -ge 400) { break }
}
[Console]::Out.Write((ConvertTo-Json -InputObject @($out) -Compress -Depth 3))
`.replace('__START__', startIso).replace('__END__', endIso);
}

function localIso(ms) {
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}:00`;
}

function fromOutlook(rangeStart, rangeEnd) {
  return new Promise((resolve) => {
    if (process.platform !== 'win32') {
      resolve({ ok: false, error: 'Reading Outlook directly only works on Windows.' });
      return;
    }
    const script = outlookScript(localIso(rangeStart), localIso(rangeEnd));
    const encoded = Buffer.from(script, 'utf16le').toString('base64');
    const ps = spawn('powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-EncodedCommand', encoded],
      { windowsHide: true });
    let out = '';
    let err = '';
    const timer = setTimeout(() => ps.kill(), 45000);
    ps.stdout.on('data', (c) => { out += c.toString('utf8'); });
    ps.stderr.on('data', (c) => { err += c.toString('utf8'); });
    ps.on('close', () => {
      clearTimeout(timer);
      try {
        const raw = JSON.parse(out.trim() || '[]');
        const list = (Array.isArray(raw) ? raw : [raw]).map((a) => ({
          title: a.title || '(No title)',
          start: new Date(a.start).getTime(),
          end: new Date(a.end).getTime(),
          allDay: !!a.allDay,
          busy: a.busy !== 0 // 0 = shown as free
        }));
        resolve({ ok: true, events: list });
      } catch {
        const classic = /80040154|Class not registered|ComObject/i.test(err);
        resolve({
          ok: false,
          error: classic
            ? 'Couldn\'t find classic Outlook on this computer. New Outlook doesn\'t allow this; use a calendar link instead.'
            : 'Couldn\'t read your Outlook calendar. Make sure classic Outlook is installed and signed in.',
          detail: err.slice(0, 500)
        });
      }
    });
  });
}

/* ---------- Calendar link (.ics) ---------- */

const WINDOWS_ZONES = {
  'Pacific Standard Time': 'America/Los_Angeles', 'Mountain Standard Time': 'America/Denver',
  'US Mountain Standard Time': 'America/Phoenix', 'Central Standard Time': 'America/Chicago',
  'Eastern Standard Time': 'America/New_York', 'Alaskan Standard Time': 'America/Anchorage',
  'Hawaiian Standard Time': 'Pacific/Honolulu', 'Atlantic Standard Time': 'America/Halifax',
  'GMT Standard Time': 'Europe/London', 'Greenwich Standard Time': 'Atlantic/Reykjavik',
  'W. Europe Standard Time': 'Europe/Berlin', 'Romance Standard Time': 'Europe/Paris',
  'Central Europe Standard Time': 'Europe/Budapest', 'Central European Standard Time': 'Europe/Warsaw',
  'E. Europe Standard Time': 'Europe/Chisinau', 'FLE Standard Time': 'Europe/Kiev',
  'GTB Standard Time': 'Europe/Bucharest', 'Russian Standard Time': 'Europe/Moscow',
  'E. Africa Standard Time': 'Africa/Nairobi', 'South Africa Standard Time': 'Africa/Johannesburg',
  'Arabian Standard Time': 'Asia/Dubai', 'India Standard Time': 'Asia/Kolkata',
  'China Standard Time': 'Asia/Shanghai', 'Singapore Standard Time': 'Asia/Singapore',
  'Tokyo Standard Time': 'Asia/Tokyo', 'Korea Standard Time': 'Asia/Seoul',
  'AUS Eastern Standard Time': 'Australia/Sydney', 'New Zealand Standard Time': 'Pacific/Auckland',
  'SA Pacific Standard Time': 'America/Bogota', 'E. South America Standard Time': 'America/Sao_Paulo',
  'Canada Central Standard Time': 'America/Regina', 'Mexico Standard Time': 'America/Mexico_City',
  'UTC': 'UTC', 'Coordinated Universal Time': 'UTC'
};

function validZone(tz) {
  if (!tz) return null;
  const name = WINDOWS_ZONES[tz] || tz.replace(/^\/[^/]+\/[^/]+\//, ''); // strip some vendor prefixes
  try { new Intl.DateTimeFormat('en-US', { timeZone: name }); return name; } catch { return null; }
}

function zoneOffset(utcMs, tz) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(new Date(utcMs));
  const v = Object.fromEntries(parts.map((p) => [p.type, Number(p.value)]));
  return Date.UTC(v.year, v.month - 1, v.day, v.hour, v.minute, v.second) - utcMs;
}

// Converts a wall-clock time in a zone (or local time when no zone) to a timestamp.
function wallToMs(y, mo, d, h, mi, s, tz) {
  if (!tz) return new Date(y, mo, d, h, mi, s).getTime();
  const guess = Date.UTC(y, mo, d, h, mi, s);
  let t = guess - zoneOffset(guess, tz);
  t = guess - zoneOffset(t, tz);
  return t;
}

function parseIcsDate(value, params) {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})?(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  const [, Y, M, D, h, mi, s, z] = m;
  const y = +Y, mo = +M - 1, d = +D;
  if (h === undefined || params.VALUE === 'DATE') {
    return { allDay: true, y, mo, d, h: 0, mi: 0, s: 0, tz: null, ms: new Date(y, mo, d).getTime() };
  }
  const tz = z ? 'UTC' : validZone(params.TZID);
  return { allDay: false, y, mo, d, h: +h, mi: +mi, s: +(s || 0), tz, ms: wallToMs(y, mo, d, +h, +mi, +(s || 0), tz) };
}

function parseDuration(v) {
  const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(v || '');
  if (!m) return 0;
  const [, sign, w, d, h, mi, s] = m;
  const ms = (((+w || 0) * 7 + (+d || 0)) * 86400 + (+h || 0) * 3600 + (+mi || 0) * 60 + (+s || 0)) * 1000;
  return sign === '-' ? -ms : ms;
}

function parseIcs(text) {
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/);
  const events = [];
  let cur = null;
  for (const line of lines) {
    if (line === 'BEGIN:VEVENT') { cur = { exdates: [] }; continue; }
    if (line === 'END:VEVENT') { if (cur) events.push(cur); cur = null; continue; }
    if (!cur) continue;
    const idx = line.indexOf(':');
    if (idx < 0) continue;
    const left = line.slice(0, idx);
    const value = line.slice(idx + 1);
    const [name, ...rawParams] = left.split(';');
    const params = Object.fromEntries(rawParams.map((p) => {
      const i = p.indexOf('=');
      return [p.slice(0, i).toUpperCase(), p.slice(i + 1).replace(/^"|"$/g, '')];
    }));
    switch (name.toUpperCase()) {
      case 'SUMMARY': cur.title = value.replace(/\\([,;\\])/g, '$1').replace(/\\n/gi, ' '); break;
      case 'DTSTART': cur.start = parseIcsDate(value, params); break;
      case 'DTEND': cur.end = parseIcsDate(value, params); break;
      case 'DURATION': cur.duration = parseDuration(value); break;
      case 'RRULE': cur.rrule = Object.fromEntries(value.split(';').map((kv) => kv.split('='))); break;
      case 'EXDATE': value.split(',').forEach((v) => { const d = parseIcsDate(v, params); if (d) cur.exdates.push(d.ms); }); break;
      case 'RECURRENCE-ID': cur.recurrenceId = parseIcsDate(value, params); break;
      case 'UID': cur.uid = value; break;
      case 'STATUS': cur.cancelled = value.toUpperCase() === 'CANCELLED'; break;
      case 'TRANSP': cur.free = value.toUpperCase() === 'TRANSPARENT'; break;
      default: break;
    }
  }
  return events;
}

const DAY_CODES = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];
const dayNum = (y, mo, d) => Math.floor(Date.UTC(y, mo, d) / 86400000);

// Expands a repeating event into the occurrences that overlap the range.
function expand(ev, rangeStart, rangeEnd) {
  const s = ev.start;
  const length = ev.end ? ev.end.ms - s.ms : ev.duration || (s.allDay ? 86400000 : 3600000);
  const make = (ms) => ({ start: ms, end: ms + length });
  if (!ev.rrule) return [make(s.ms)];

  const r = ev.rrule;
  const freq = r.FREQ;
  const interval = Math.max(1, +(r.INTERVAL || 1));
  const count = r.COUNT ? +r.COUNT : Infinity;
  const until = r.UNTIL ? parseIcsDate(r.UNTIL, {}).ms + (r.UNTIL.length === 8 ? 86399999 : 0) : Infinity;
  const byDay = r.BYDAY ? r.BYDAY.split(',').map((x) => {
    const m = /^([+-]?\d+)?([A-Z]{2})$/.exec(x);
    return m ? { n: m[1] ? +m[1] : 0, wd: DAY_CODES.indexOf(m[2]) } : null;
  }).filter(Boolean) : null;
  const byMonthDay = r.BYMONTHDAY ? r.BYMONTHDAY.split(',').map(Number) : null;
  const ex = new Set(ev.exdates);

  const startDay = dayNum(s.y, s.mo, s.d);
  const startWd = new Date(Date.UTC(s.y, s.mo, s.d)).getUTCDay();
  const mondayOfStart = startDay - ((startWd + 6) % 7);
  const out = [];
  let n = 0;
  const limitDay = Math.min(dayNum(new Date(rangeEnd).getFullYear(), new Date(rangeEnd).getMonth(), new Date(rangeEnd).getDate()) + 1, startDay + 6000);

  for (let day = startDay; day <= limitDay && n < count; day++) {
    const dt = new Date(day * 86400000);
    const y = dt.getUTCFullYear(), mo = dt.getUTCMonth(), d = dt.getUTCDate(), wd = dt.getUTCDay();
    let match = false;
    if (freq === 'DAILY') {
      match = (day - startDay) % interval === 0 && (!byDay || byDay.some((b) => b.wd === wd));
    } else if (freq === 'WEEKLY') {
      const week = Math.floor((day - mondayOfStart) / 7);
      match = week % interval === 0 && (byDay ? byDay.some((b) => b.wd === wd) : wd === startWd);
    } else if (freq === 'MONTHLY') {
      const months = (y - s.y) * 12 + (mo - s.mo);
      if (months % interval === 0) {
        const dim = new Date(Date.UTC(y, mo + 1, 0)).getUTCDate();
        if (byMonthDay) match = byMonthDay.some((md) => (md > 0 ? md === d : dim + md + 1 === d));
        else if (byDay) {
          match = byDay.some((b) => {
            if (b.wd !== wd) return false;
            if (!b.n) return true;
            const nth = Math.floor((d - 1) / 7) + 1;
            const nthFromEnd = Math.floor((dim - d) / 7) + 1;
            return b.n > 0 ? b.n === nth : -b.n === nthFromEnd;
          });
        } else match = d === s.d;
      }
    } else if (freq === 'YEARLY') {
      match = (y - s.y) % interval === 0 && mo === s.mo && d === s.d;
    }
    if (!match) continue;
    const ms = s.allDay ? new Date(y, mo, d).getTime() : wallToMs(y, mo, d, s.h, s.mi, s.s, s.tz);
    if (ms < s.ms) continue;
    if (ms > until) break;
    n++;
    if (ex.has(ms)) continue;
    if (ms + length > rangeStart && ms < rangeEnd) out.push(make(ms));
    if (out.length > 500) break;
  }
  return out;
}

function eventsFromIcs(text, rangeStart, rangeEnd) {
  const raw = parseIcs(text).filter((e) => e.start && !e.cancelled);
  const overrides = raw.filter((e) => e.recurrenceId);
  const replaced = new Set(overrides.map((e) => `${e.uid}|${e.recurrenceId.ms}`));
  const out = [];
  for (const ev of raw) {
    if (ev.recurrenceId) {
      expand({ ...ev, rrule: null }, rangeStart, rangeEnd).forEach((o) => out.push({ ...o, ev }));
      continue;
    }
    expand(ev, rangeStart, rangeEnd)
      .filter((o) => !replaced.has(`${ev.uid}|${o.start}`))
      .forEach((o) => out.push({ ...o, ev }));
  }
  return out
    .filter((o) => o.end > rangeStart && o.start < rangeEnd)
    .map((o) => ({ title: o.ev.title || '(No title)', start: o.start, end: o.end, allDay: o.ev.start.allDay, busy: !o.ev.free }))
    .sort((a, b) => a.start - b.start);
}

async function fromLink(url, rangeStart, rangeEnd, fetchFn) {
  let clean = String(url || '').trim().replace(/^webcal:\/\//i, 'https://');
  if (!/^https:\/\//i.test(clean)) return { ok: false, error: 'Paste a calendar link that starts with https:// or webcal://.' };
  try {
    const res = await fetchFn(clean, { headers: { Accept: 'text/calendar, */*' } });
    if (!res.ok) return { ok: false, error: `The calendar link returned an error (${res.status}). Check that it's still published.` };
    const text = await res.text();
    if (!/BEGIN:VCALENDAR/.test(text)) return { ok: false, error: 'That link didn\'t return a calendar. Use the ICS link, not the web page link.' };
    return { ok: true, events: eventsFromIcs(text, rangeStart, rangeEnd) };
  } catch (e) {
    return { ok: false, error: 'Couldn\'t reach the calendar link. Check your internet connection.', detail: String(e && e.message) };
  }
}

// Combines the results of fetching several calendars. A meeting that shows up in two calendars
// (for example Google subscribed inside Outlook) is listed once. Fails only if every calendar failed.
function mergeResults(cals, results) {
  const failed = cals
    .map((c, i) => ({ name: c.name, error: results[i].error }))
    .filter((_f, i) => !results[i].ok);
  if (failed.length === cals.length) {
    return { ok: false, error: cals.length > 1 ? `${failed[0].name}: ${failed[0].error}` : failed[0].error };
  }
  const merged = new Map();
  results.forEach((r, i) => {
    if (!r.ok) return;
    for (const ev of r.events) {
      const key = `${ev.title}|${ev.start}|${ev.end}`;
      const seen = merged.get(key);
      if (seen) seen.busy = seen.busy || ev.busy;
      else merged.set(key, { ...ev, cal: cals[i].name });
    }
  });
  const events = [...merged.values()].sort((a, b) => a.start - b.start);
  return { ok: true, events, failed };
}

module.exports = { fromOutlook, fromLink, eventsFromIcs, mergeResults };
