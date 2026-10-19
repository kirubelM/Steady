/* The installed README supplies the same notes shown on GitHub. */
let currentRelease = null;
function featureNotesHtml(notes) {
  return notes.split(/\r?\n/).filter(line => line.startsWith('- ')).map(line => {
    const text = line.slice(2);
    const feature = text.match(/^\*\*(.+?)\*\*\s*(.*)$/);
    return '<article class="whats-new-feature"><span class="whats-new-dot" aria-hidden="true">&#10003;</span><div>' +
      (feature ? '<h3>' + esc(feature[1]) + '</h3><p>' + esc(feature[2]) + '</p>' : '<p>' + esc(text) + '</p>') + '</div></article>';
  }).join('');
}
// The last version from before this screen existed, so people updating from it still hear about what they missed.
const WHATS_NEW_FLOOR = '1.8.0';

// One version's cards, or each version under its own heading when several are new.
function releasesHtml(releases) {
  if (releases.length === 1) return featureNotesHtml(releases[0].notes);
  return releases.map((r) => '<h3 class="whats-new-version">Version ' + esc(r.version) + '</h3>' + featureNotesHtml(r.notes)).join('');
}

// Opens the notes for this version, or for every version after `since`. Quiet when there's nothing to show.
async function openWhatsNew(since, quiet) {
  try {
    const res = await api.releaseNotes(since);
    if (!res.releases.length) {
      if (!quiet) showNudge("There are no notes for this version.", 'info', true);
      return;
    }
    currentRelease = res;
    $('whatsNewTitle').textContent = res.releases.length > 1 ? "What's new since " + since : "What's new in " + res.releases[0].version;
    $('whatsNewFeatures').innerHTML = releasesHtml(res.releases);
    if (!$('whatsNewDialog').open) $('whatsNewDialog').showModal();
  } catch {
    if (!quiet) showNudge("Couldn't load the feature notes. Try again from Help and about.", 'info', true);
  }
}
function bindWhatsNew() {
  $('whatsNewBtn').addEventListener('click', () => openWhatsNew());
  $('whatsNewClose').addEventListener('click', () => $('whatsNewDialog').close());
  $('whatsNewDialog').addEventListener('close', async () => {
    if (!currentRelease) return;
    data.meta.whatsNewSeen = currentRelease.version;
    await persist('meta');
  });
}
function shouldShowWhatsNew(version) {
  return data.meta.whatsNewSeen !== version && !anyDialogOpen();
}
async function maybeShowWhatsNew() {
  const version = await api.appVersion();
  if (!shouldShowWhatsNew(version)) return;
  await openWhatsNew(data.meta.whatsNewSeen || WHATS_NEW_FLOOR, true);
}

// A fresh install gets the welcome instead, so there's nothing new to tell it about.
async function markWhatsNewSeen() {
  data.meta.whatsNewSeen = await api.appVersion();
  await persist('meta');
}
