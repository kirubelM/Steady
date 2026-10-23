/* ---------- Projects ---------- */

const PROJECT_COLORS = ['#2E8B7A', '#3E73B8', '#8A5BB5', '#C2603F', '#C08A1E', '#4C8C3A', '#B03D6E', '#6B7C82'];

function activeProjects() {
  return (data.projects || []).filter((p) => !p.archived);
}

function projectById(id) {
  return id ? (data.projects || []).find((p) => p.id === id) || null : null;
}

function projectChip(id) {
  const p = projectById(id);
  if (!p) return '';
  return `<span class="pchip" style="--pc:${p.color}">${esc(p.name)}</span>`;
}

function projectName(id) {
  const p = projectById(id);
  return p ? p.name : '';
}

// Option list for a <select>; keeps an archived project visible if it's the current value.
function projectOptions(selected, noneLabel = 'No project') {
  const list = activeProjects().slice();
  const cur = projectById(selected);
  if (cur && cur.archived) list.push(cur);
  return `<option value="">${esc(noneLabel)}</option>` +
    list.map((p) => `<option value="${p.id}" ${p.id === selected ? 'selected' : ''}>${esc(p.name)}</option>`).join('');
}

function refreshProjectSelects() {
  document.querySelectorAll('select.project-select').forEach((sel) => {
    const v = sel.value;
    sel.innerHTML = projectOptions(v, sel.dataset.none || 'No project');
    sel.value = projectById(v) ? v : '';
  });
}

async function addProject(name) {
  const clean = name.trim();
  if (!clean) return null;
  const existing = activeProjects().find((p) => p.name.toLowerCase() === clean.toLowerCase());
  if (existing) return existing.id;
  const used = new Set((data.projects || []).map((p) => p.color));
  const color = PROJECT_COLORS.find((c) => !used.has(c)) || PROJECT_COLORS[(data.projects || []).length % PROJECT_COLORS.length];
  const p = { id: uid(), name: clean, color, archived: false, createdAt: Date.now() };
  data.projects.push(p);
  await persist('projects');
  projectsChanged();
  return p.id;
}

const projectKey = (s) => String(s).toLowerCase().replace(/[^\p{L}\p{N}]/gu, '');

// Pulls a "#project" tag out of typed text, e.g. "Call Sam #Acme". The tag matches a project by name
// (spaces and punctuation ignored, or an unambiguous start of it) and creates the project if none fits.
async function takeProjectTag(text, fallbackId = null) {
  const m = /(^|\s)#([^\s#]+)/.exec(text);
  if (!m) return { text: text.trim(), projectId: fallbackId || null };
  const rest = (text.slice(0, m.index) + ' ' + text.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
  const key = projectKey(m[2]);
  if (!rest || !key) return { text: text.trim(), projectId: fallbackId || null };
  const list = activeProjects();
  const exact = list.find((p) => projectKey(p.name) === key);
  const starts = list.filter((p) => projectKey(p.name).startsWith(key));
  const found = exact || (starts.length === 1 ? starts[0] : null);
  const projectId = found ? found.id : await addProject(m[2].replace(/[-_]+/g, ' '));
  return { text: rest, projectId };
}

async function updateProject(id, patch) {
  const p = projectById(id);
  if (!p) return;
  Object.assign(p, patch);
  await persist('projects');
  projectsChanged();
}

async function deleteProject(id) {
  data.projects = data.projects.filter((p) => p.id !== id);
  data.tasks.forEach((t) => { if (t.projectId === id) t.projectId = null; });
  data.entries.forEach((e) => { if (e.projectId === id) e.projectId = null; });
  await persist('projects', 'tasks', 'entries');
  projectsChanged();
}

function projectsChanged() {
  refreshProjectSelects();
  renderProjectsSettings();
  if (typeof renderPlan === 'function') renderPlan();
  renderLog();
  if (!$('tab-insights').hidden) renderInsights();
}

function renderProjectsSettings() {
  const list = data.projects || [];
  $('projectList').innerHTML = list.length
    ? list.map((p) => {
      const used = data.entries.some((e) => e.projectId === p.id) || data.tasks.some((t) => t.projectId === p.id);
      return `<li class="${p.archived ? 'archived' : ''}">
        <button class="swatch" type="button" style="--pc:${p.color}" data-proj-color="${p.id}" aria-label="Change color for ${esc(p.name)}" title="Change color"></button>
        <input type="text" value="${esc(p.name)}" data-proj-name="${p.id}" maxlength="40" aria-label="Project name">
        <label class="proj-goal" title="Weekly goal in hours (leave empty for none)">
          <input type="number" min="0" max="80" step="0.5" value="${p.weeklyGoalMin ? +(p.weeklyGoalMin / 60).toFixed(1) : ''}" data-proj-goal="${p.id}" aria-label="Weekly goal for ${esc(p.name)} in hours" placeholder="–"> h/week
        </label>
        <button class="link" type="button" data-proj-archive="${p.id}">${p.archived ? 'Restore' : 'Archive'}</button>
        <button class="del" type="button" data-proj-del="${p.id}" data-used="${used ? 1 : 0}" aria-label="Delete ${esc(p.name)}">${icon('close')}</button>
      </li>`;
    }).join('')
    : '<li class="empty">No projects yet. Add one to group your tasks and time.</li>';
}

/* "#" in a text box offers your projects: arrows move, Tab or Enter picks, Esc closes. One popup is shared by every box. */
function bindHashSuggest(ids) {
  const pop = document.createElement('div');
  pop.className = 'hash-suggest';
  pop.setAttribute('role', 'listbox');
  pop.hidden = true;
  document.body.appendChild(pop);
  let field = null;
  let picks = [];
  let pick = 0;
  const flat = (s) => s.replace(/s+/g, '').toLowerCase();
  const atCaret = (el) => {
    const m = el.value.slice(0, el.selectionStart).match(/(^|s)#([^s#]*)$/);
    return m ? { query: m[2].toLowerCase(), start: el.selectionStart - m[2].length - 1, end: el.selectionStart } : null;
  };
  const close = () => { pop.hidden = true; picks = []; };
  const show = (el) => {
    field = el;
    const host = el.closest('dialog') || document.body; // a modal dialog covers anything outside it
    if (pop.parentNode !== host) host.appendChild(pop);
    const at = atCaret(el);
    if (!at) return close();
    picks = activeProjects().filter((x) => flat(x.name).startsWith(at.query) || x.name.toLowerCase().includes(at.query)).slice(0, 6);
    pick = Math.min(pick, Math.max(0, picks.length - 1));
    const r = el.getBoundingClientRect();
    pop.style.left = `${Math.round(r.left)}px`;
    pop.style.top = `${Math.round(r.bottom + 4)}px`;
    pop.style.minWidth = `${Math.min(260, Math.round(r.width))}px`;
    pop.innerHTML = picks.length
      ? picks.map((x, i) => `<button type="button" role="option" data-hash-pick="${i}" aria-selected="${i === pick}" style="--pc:${x.color}"><i></i>${esc(x.name)}</button>`).join('')
      : `<span class="hash-none">${activeProjects().length ? 'No project matches. Press Enter to create it.' : 'No projects yet. Typing #name creates one.'}</span>`;
    pop.hidden = false;
  };
  const accept = (i = pick) => {
    const at = field && atCaret(field);
    const x = picks[i];
    if (!at || !x) return false;
    const tag = `#${flat(x.name)} `;
    field.value = field.value.slice(0, at.start) + tag + field.value.slice(at.end).replace(/^s+/, '');
    const caret = at.start + tag.length;
    field.setSelectionRange(caret, caret);
    close();
    field.focus();
    return true;
  };
  ids.forEach((id) => {
    const el = $(id);
    el.addEventListener('input', () => { pick = 0; show(el); });
    el.addEventListener('click', () => show(el));
    el.addEventListener('blur', () => setTimeout(close, 150));
    el.addEventListener('keydown', (e) => {
      if (pop.hidden || !picks.length) return;
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        pick = (pick + (e.key === 'ArrowDown' ? 1 : picks.length - 1)) % picks.length;
        show(el);
      } else if (e.key === 'Tab' || e.key === 'Enter') {
        if (accept()) { e.preventDefault(); e.stopPropagation(); }
      } else if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    }, true);
  });
  pop.addEventListener('mousedown', (e) => {
    const b = e.target.closest('[data-hash-pick]');
    if (!b) return;
    e.preventDefault(); // keep the cursor in the box
    accept(Number(b.dataset.hashPick));
  });
}

function bindProjects() {
  $('projectForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = $('projectInput').value;
    $('projectInput').value = '';
    await addProject(name);
  });
  $('projectList').addEventListener('click', async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.projColor) {
      const p = projectById(b.dataset.projColor);
      const i = PROJECT_COLORS.indexOf(p.color);
      updateProject(p.id, { color: PROJECT_COLORS[(i + 1) % PROJECT_COLORS.length] });
    } else if (b.dataset.projArchive) {
      const p = projectById(b.dataset.projArchive);
      updateProject(p.id, { archived: !p.archived });
    } else if (b.dataset.projDel) {
      const p = projectById(b.dataset.projDel);
      if (b.dataset.used === '1' && !confirm(`Delete "${p.name}"? Tasks and log entries keep their content but lose the project. Archive it instead to keep the history.`)) return;
      deleteProject(p.id);
    }
  });
  $('projectList').addEventListener('change', (e) => {
    const id = e.target.dataset?.projName;
    if (id && e.target.value.trim()) updateProject(id, { name: e.target.value.trim() });
    const gid = e.target.dataset?.projGoal;
    if (gid) {
      const h = Math.max(0, Math.min(80, Number(e.target.value) || 0));
      updateProject(gid, { weeklyGoalMin: Math.round(h * 60) });
    }
  });
}
