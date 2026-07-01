const projectSelect = document.getElementById('projectSelect') as HTMLSelectElement;
const addProjectBtn = document.getElementById('addProjectBtn') as HTMLButtonElement;
const startStopBtn = document.getElementById('startStop') as HTMLButtonElement;
const elapsedEl = document.getElementById('elapsed') as HTMLDivElement;
const summaryEl = document.getElementById('summary') as HTMLDivElement;
const exportBtn = document.getElementById('exportBtn') as HTMLButtonElement;
const exportStatusEl = document.getElementById('exportStatus') as HTMLDivElement;
const noteInput = document.getElementById('noteInput') as HTMLInputElement;
const rateInput = document.getElementById('rateInput') as HTMLInputElement;
const currentEarningsEl = document.getElementById('currentEarnings') as HTMLDivElement;
const earningsTodayEl = document.getElementById('earningsToday') as HTMLSpanElement;
const earningsWeekEl = document.getElementById('earningsWeek') as HTMLSpanElement;
const earningsAllTimeEl = document.getElementById('earningsAllTime') as HTMLSpanElement;

let activeEntry: Awaited<ReturnType<typeof window.api.getActiveEntry>> = null;
let projects: Awaited<ReturnType<typeof window.api.listProjects>> = [];
let tickHandle: number | undefined;
let noteSaveHandle: number | undefined;
let rateSaveHandle: number | undefined;

function formatDuration(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((n) => String(n).padStart(2, '0')).join(':');
}

function formatMoney(amount: number): string {
  return `$${amount.toFixed(2)}`;
}

function currentProject() {
  return projects.find((p) => p.id === Number(projectSelect.value));
}

async function refreshProjects() {
  projects = await window.api.listProjects();
  projectSelect.innerHTML = '';
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = String(project.id);
    option.textContent = project.name;
    projectSelect.appendChild(option);
  }
  if (activeEntry) {
    projectSelect.value = String(activeEntry.project_id);
  }
  rateInput.value = currentProject()?.hourly_rate != null ? String(currentProject()!.hourly_rate) : '';
}

async function refreshSummary() {
  const summary = await window.api.getTodaySummary();
  summaryEl.innerHTML = '';
  if (summary.length === 0) {
    summaryEl.textContent = 'No time tracked yet.';
    return;
  }
  for (const row of summary) {
    const div = document.createElement('div');
    div.className = 'summary-row';
    div.innerHTML = `<span>${row.project_name}</span><span>${formatDuration(row.total_ms)}</span>`;
    summaryEl.appendChild(div);
  }
}

async function refreshEarnings() {
  const earnings = await window.api.getEarningsSummary();
  earningsTodayEl.textContent = formatMoney(earnings.today);
  earningsWeekEl.textContent = formatMoney(earnings.week);
  earningsAllTimeEl.textContent = formatMoney(earnings.allTime);
}

function tick() {
  if (!activeEntry) {
    elapsedEl.textContent = '00:00:00';
    currentEarningsEl.textContent = formatMoney(0);
    return;
  }
  const elapsedMs = Date.now() - activeEntry.started_at;
  elapsedEl.textContent = formatDuration(elapsedMs);
  const rate = activeEntry.hourly_rate ?? 0;
  currentEarningsEl.textContent = formatMoney((elapsedMs / 3600000) * rate);
}

function setRunningUi(running: boolean) {
  startStopBtn.textContent = running ? 'Stop' : 'Start';
  startStopBtn.className = running ? 'running' : 'stopped';
  projectSelect.disabled = running;
}

async function refreshActiveEntry() {
  activeEntry = await window.api.getActiveEntry();
  setRunningUi(!!activeEntry);
  noteInput.value = activeEntry?.note ?? '';
  if (activeEntry) {
    projectSelect.value = String(activeEntry.project_id);
    rateInput.value = activeEntry.hourly_rate != null ? String(activeEntry.hourly_rate) : '';
  }
  if (tickHandle) clearInterval(tickHandle);
  tick();
  if (activeEntry) {
    tickHandle = window.setInterval(() => {
      tick();
      refreshEarnings();
    }, 1000);
  }
}

startStopBtn.addEventListener('click', async () => {
  if (activeEntry) {
    await window.api.stopEntry();
    noteInput.value = '';
  } else {
    const projectId = Number(projectSelect.value);
    if (!projectId) return;
    await window.api.startEntry(projectId, noteInput.value.trim() || undefined);
  }
  await refreshActiveEntry();
  await refreshSummary();
});

noteInput.addEventListener('input', () => {
  if (!activeEntry) return;
  if (noteSaveHandle) clearTimeout(noteSaveHandle);
  noteSaveHandle = window.setTimeout(() => {
    if (activeEntry) window.api.updateNote(activeEntry.id, noteInput.value.trim());
  }, 500);
});

projectSelect.addEventListener('change', () => {
  const project = currentProject();
  rateInput.value = project?.hourly_rate != null ? String(project.hourly_rate) : '';
});

rateInput.addEventListener('input', () => {
  const project = currentProject();
  if (!project) return;
  if (rateSaveHandle) clearTimeout(rateSaveHandle);
  rateSaveHandle = window.setTimeout(() => {
    const value = rateInput.value.trim();
    const rate = value === '' ? null : Number(value);
    window.api.updateProjectRate(project.id, Number.isFinite(rate) ? rate : null).then(() => {
      project.hourly_rate = rate;
    });
  }, 500);
});

addProjectBtn.addEventListener('click', async () => {
  const project = await window.api.addProject();
  if (project) {
    await refreshProjects();
    projectSelect.value = String(project.id);
  }
});

exportBtn.addEventListener('click', async () => {
  exportStatusEl.textContent = 'Exporting...';
  const filePath = await window.api.exportExcel();
  exportStatusEl.textContent = filePath ? `Saved to ${filePath}` : '';
});

(async () => {
  await refreshProjects();
  await refreshActiveEntry();
  await refreshSummary();
  await refreshEarnings();
  setInterval(refreshSummary, 30000);
  if (!activeEntry) {
    setInterval(refreshEarnings, 30000);
  }
})();
