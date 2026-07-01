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
const historyBtn = document.getElementById('historyBtn') as HTMLButtonElement;
const backBtn = document.getElementById('backBtn') as HTMLButtonElement;
const mainView = document.getElementById('mainView') as HTMLDivElement;
const historyView = document.getElementById('historyView') as HTMLDivElement;
const historyListEl = document.getElementById('historyList') as HTMLDivElement;

let activeEntry: Awaited<ReturnType<typeof window.api.getActiveEntry>> = null;
let projects: Awaited<ReturnType<typeof window.api.listProjects>> = [];
let tickHandle: number | undefined;
let noteSaveHandle: number | undefined;
let rateSaveHandle: number | undefined;
const entryRateSaveHandles = new Map<number, number>();

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

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

async function refreshHistory() {
  const entries = await window.api.listEntries();
  historyListEl.innerHTML = '';
  if (entries.length === 0) {
    historyListEl.textContent = 'No entries yet.';
    return;
  }
  for (const entry of entries) {
    const row = document.createElement('div');
    row.className = 'entry-row';

    const durationHours = entry.ended_at ? (entry.ended_at - entry.started_at) / 3600000 : 0;
    const earnings = entry.hourly_rate ? durationHours * entry.hourly_rate : 0;

    const top = document.createElement('div');
    top.className = 'entry-top';
    top.innerHTML = `<span>${entry.project_name}</span><span>${entry.ended_at ? formatDuration(entry.ended_at - entry.started_at) : 'running'}</span>`;
    row.appendChild(top);

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = `${formatDateTime(entry.started_at)}${entry.ended_at ? ' – ' + formatDateTime(entry.ended_at) : ''}${entry.note ? ' · ' + entry.note : ''}`;
    row.appendChild(meta);

    const rateRow = document.createElement('div');
    rateRow.className = 'entry-rate-row';
    const label = document.createElement('label');
    label.textContent = '$/hr';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.01';
    input.placeholder = '0.00';
    input.value = entry.hourly_rate != null ? String(entry.hourly_rate) : '';
    const earningsSpan = document.createElement('span');
    earningsSpan.className = 'entry-earnings';
    earningsSpan.textContent = formatMoney(earnings);

    input.addEventListener('input', () => {
      const existing = entryRateSaveHandles.get(entry.id);
      if (existing) clearTimeout(existing);
      const handle = window.setTimeout(async () => {
        const value = input.value.trim();
        const rate = value === '' ? null : Number(value);
        await window.api.updateEntryRate(entry.id, Number.isFinite(rate) ? rate : null);
        const newEarnings = rate ? durationHours * rate : 0;
        earningsSpan.textContent = formatMoney(newEarnings);
        await refreshEarnings();
      }, 500);
      entryRateSaveHandles.set(entry.id, handle);
    });

    rateRow.appendChild(label);
    rateRow.appendChild(input);
    rateRow.appendChild(earningsSpan);
    row.appendChild(rateRow);

    historyListEl.appendChild(row);
  }
}

historyBtn.addEventListener('click', async () => {
  mainView.style.display = 'none';
  historyView.style.display = 'block';
  await refreshHistory();
});

backBtn.addEventListener('click', () => {
  historyView.style.display = 'none';
  mainView.style.display = 'block';
});

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
