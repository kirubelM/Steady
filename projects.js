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
        <button class="del" type="button" data-proj-del="${p.id}" data-used="${used ? 1 : 0}" aria-label="Delete ${esc(p.name)}">×</button>
      </li>`;
    }).join('')
    : '<li class="empty">No projects yet. Add one to group your tasks and time.</li>';
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
