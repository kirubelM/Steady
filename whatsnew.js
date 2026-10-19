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
async function openWhatsNew() {
  try {
    currentRelease = await api.releaseNotes();
    $('whatsNewTitle').textContent = "What's new in " + currentRelease.version;
    $('whatsNewFeatures').innerHTML = featureNotesHtml(currentRelease.notes);
    if (!$('whatsNewDialog').open) $('whatsNewDialog').showModal();
  } catch {
    showNudge("Couldn't load the feature notes. Try again from Help and about.", 'info', true);
  }
}
function bindWhatsNew() {
  $('whatsNewBtn').addEventListener('click', openWhatsNew);
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
  await openWhatsNew();
}
