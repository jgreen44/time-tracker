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
const earningsProjectSelect = document.getElementById('earningsProjectSelect') as HTMLSelectElement;
const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;

const THEME_STORAGE_KEY = 'time-tracker-theme';

function applyTheme(theme: 'dark' | 'light') {
  document.documentElement.setAttribute('data-theme', theme);
  themeToggle.textContent = theme === 'dark' ? '🌙' : '☀️';
}

function initTheme() {
  const stored = localStorage.getItem(THEME_STORAGE_KEY);
  const theme = stored === 'light' ? 'light' : 'dark';
  applyTheme(theme);
}

themeToggle.addEventListener('click', () => {
  const current = document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  const next = current === 'light' ? 'dark' : 'light';
  localStorage.setItem(THEME_STORAGE_KEY, next);
  applyTheme(next);
});

initTheme();

const copyrightYearEl = document.getElementById('copyrightYear') as HTMLSpanElement;
const authorLink = document.getElementById('authorLink') as HTMLAnchorElement;
copyrightYearEl.textContent = String(new Date().getFullYear());
authorLink.addEventListener('click', (e) => {
  e.preventDefault();
  window.api.openExternal('https://www.clearedfinal.com');
});

let activeEntry: Awaited<ReturnType<typeof window.api.getActiveEntry>> = null;
let projects: Awaited<ReturnType<typeof window.api.listProjects>> = [];
let tickHandle: number | undefined;
let noteSaveHandle: number | undefined;
let rateSaveHandle: number | undefined;
const entryRateSaveHandles = new Map<number, number>();
const entryTimeSaveHandles = new Map<number, number>();

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

  const previousEarningsSelection = earningsProjectSelect.value;
  earningsProjectSelect.innerHTML = '<option value="">All Projects</option>';
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = String(project.id);
    option.textContent = project.name;
    earningsProjectSelect.appendChild(option);
  }
  earningsProjectSelect.value = previousEarningsSelection;
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
    div.innerHTML = `<span>${row.project_name}</span><span class="value">${formatDuration(row.total_ms)}</span>`;
    summaryEl.appendChild(div);
  }
}

async function refreshEarnings() {
  const selected = earningsProjectSelect.value;
  const projectId = selected === '' ? null : Number(selected);
  const earnings = await window.api.getEarningsSummary(projectId);
  earningsTodayEl.textContent = formatMoney(earnings.today);
  earningsWeekEl.textContent = formatMoney(earnings.week);
  earningsAllTimeEl.textContent = formatMoney(earnings.allTime);
}

earningsProjectSelect.addEventListener('change', () => {
  refreshEarnings();
});

function formatDateTime(ms: number): string {
  return new Date(ms).toLocaleString();
}

function toDatetimeLocalValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function fromDatetimeLocalValue(value: string): number | null {
  if (!value) return null;
  const ms = new Date(value).getTime();
  return Number.isFinite(ms) ? ms : null;
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

    let durationHours = entry.ended_at ? (entry.ended_at - entry.started_at) / 3600000 : 0;
    const earnings = entry.hourly_rate ? durationHours * entry.hourly_rate : 0;

    const top = document.createElement('div');
    top.className = 'entry-top';
    top.innerHTML = `<span>${entry.project_name}</span><span>${entry.ended_at ? formatDuration(entry.ended_at - entry.started_at) : 'running'}</span>`;
    row.appendChild(top);

    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = entry.note ?? '';
    row.appendChild(meta);

    const statusEl = document.createElement('div');
    statusEl.className = 'entry-save-status';

    const earningsSpan = document.createElement('span');
    earningsSpan.className = 'entry-earnings';
    earningsSpan.textContent = formatMoney(earnings);

    if (entry.ended_at !== null) {
      const startGroup = document.createElement('div');
      startGroup.className = 'field-group';
      const startLabel = document.createElement('label');
      startLabel.textContent = 'Start';
      const startInput = document.createElement('input');
      startInput.type = 'datetime-local';
      startInput.value = toDatetimeLocalValue(entry.started_at);
      startGroup.appendChild(startLabel);
      startGroup.appendChild(startInput);

      const stopGroup = document.createElement('div');
      stopGroup.className = 'field-group';
      const stopLabel = document.createElement('label');
      stopLabel.textContent = 'Stop';
      const stopInput = document.createElement('input');
      stopInput.type = 'datetime-local';
      stopInput.value = toDatetimeLocalValue(entry.ended_at);
      stopGroup.appendChild(stopLabel);
      stopGroup.appendChild(stopInput);

      const saveTimes = () => {
        const existing = entryTimeSaveHandles.get(entry.id);
        if (existing) clearTimeout(existing);
        const handle = window.setTimeout(async () => {
          const newStart = fromDatetimeLocalValue(startInput.value);
          const newEnd = fromDatetimeLocalValue(stopInput.value);
          if (newStart === null || newEnd === null || newEnd <= newStart) {
            statusEl.textContent = 'Stop must be after start.';
            statusEl.style.color = '#d1242f';
            return;
          }
          await window.api.updateEntryTimes(entry.id, newStart, newEnd);
          durationHours = (newEnd - newStart) / 3600000;
          top.querySelector('span:last-child')!.textContent = formatDuration(newEnd - newStart);
          const rate = entry.hourly_rate ?? 0;
          earningsSpan.textContent = formatMoney(durationHours * rate);
          statusEl.textContent = 'Saved.';
          statusEl.style.color = '#1a7f37';
          await refreshEarnings();
          await refreshSummary();
        }, 500);
        entryTimeSaveHandles.set(entry.id, handle);
      };

      startInput.addEventListener('input', saveTimes);
      stopInput.addEventListener('input', saveTimes);

      row.appendChild(startGroup);
      row.appendChild(stopGroup);
    } else {
      const runningNote = document.createElement('div');
      runningNote.className = 'entry-meta';
      runningNote.textContent = `Started ${formatDateTime(entry.started_at)} · still running`;
      row.appendChild(runningNote);
    }

    const rateGroup = document.createElement('div');
    rateGroup.className = 'field-group';
    const label = document.createElement('label');
    label.textContent = '$/hr';
    const input = document.createElement('input');
    input.type = 'number';
    input.min = '0';
    input.step = '0.01';
    input.placeholder = '0.00';
    input.value = entry.hourly_rate != null ? String(entry.hourly_rate) : '';

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

    rateGroup.appendChild(label);
    rateGroup.appendChild(input);
    row.appendChild(rateGroup);
    row.appendChild(earningsSpan);
    row.appendChild(statusEl);

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
