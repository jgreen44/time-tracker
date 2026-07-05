// flatpickr is loaded as a UMD global via <script> in index.html (no require()).
// Minimal ambient declaration for the subset of the API we actually call.
interface FpInstance { setDate(d: Date, triggerChange: boolean): void; clear(): void; }
interface FpOptions { dateFormat?: string; allowInput?: boolean; disableMobile?: boolean; }
declare function flatpickr(el: HTMLInputElement, opts?: FpOptions): FpInstance;

// ── Template preview data (mirrors invoice-templates.ts registry) ─────────────
const TEMPLATE_META = [
  { id: 1, name: 'Classic Minimal',    headerColor: '#1a1a1a', lineColor: '#1a1a1a', isDark: false },
  { id: 2, name: 'Modern Gradient',    headerColor: 'linear-gradient(135deg,#1e3a8a,#6366f1)', lineColor: '#6366f1', isDark: false },
  { id: 3, name: 'Itemized Detail',    headerColor: '#0f766e', lineColor: '#0f766e', isDark: false },
  { id: 4, name: 'Executive Summary',  headerColor: '#7c3aed', lineColor: '#7c3aed', isDark: false },
  { id: 5, name: 'Dark Tech',          headerColor: '#0d1117', lineColor: '#6366f1', isDark: true  },
  { id: 6, name: 'Contractor Formal',  headerColor: '#78350f', lineColor: '#78350f', isDark: false },
  { id: 7, name: 'Two-Column',         headerColor: '#1d4ed8', lineColor: '#1d4ed8', isDark: false },
  { id: 8, name: 'Stripe-Inspired',    headerColor: '#635bff', lineColor: '#635bff', isDark: false },
  { id: 9, name: 'Creative Color',     headerColor: 'linear-gradient(120deg,#059669,#34d399)', lineColor: '#059669', isDark: false },
  { id: 10, name: 'Simple Text',       headerColor: '#f5f5f5', lineColor: '#555', isDark: false },
];

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
const tabTimer = document.getElementById('tabTimer') as HTMLButtonElement;
const tabHistory = document.getElementById('tabHistory') as HTMLButtonElement;
const tabTimer2 = document.getElementById('tabTimer2') as HTMLButtonElement;
const tabHistory2 = document.getElementById('tabHistory2') as HTMLButtonElement;
const startStopLabel = document.getElementById('startStopLabel') as HTMLSpanElement;
const mainView = document.getElementById('mainView') as HTMLDivElement;
const historyView = document.getElementById('historyView') as HTMLDivElement;
const historyListEl = document.getElementById('historyList') as HTMLDivElement;
const loadMoreBtn = document.getElementById('loadMoreBtn') as HTMLButtonElement;
const earningsProjectSelect = document.getElementById('earningsProjectSelect') as HTMLSelectElement;
const themeToggle = document.getElementById('themeToggle') as HTMLButtonElement;
const addEntryBtn = document.getElementById('addEntryBtn') as HTMLButtonElement;
const addEntryForm = document.getElementById('addEntryForm') as HTMLDivElement;
const addEntryProjectSelect = document.getElementById('addEntryProjectSelect') as HTMLSelectElement;
const addEntryStart = document.getElementById('addEntryStart') as HTMLInputElement;
const addEntryStop = document.getElementById('addEntryStop') as HTMLInputElement;
const addEntryRate = document.getElementById('addEntryRate') as HTMLInputElement;
const addEntryNote = document.getElementById('addEntryNote') as HTMLInputElement;
const addEntryStatus = document.getElementById('addEntryStatus') as HTMLDivElement;
const addEntryCancelBtn = document.getElementById('addEntryCancelBtn') as HTMLButtonElement;
const addEntrySaveBtn = document.getElementById('addEntrySaveBtn') as HTMLButtonElement;

// ── Export modal elements ──────────────────────────────────────────────────────
const exportModal = document.getElementById('exportModal') as HTMLDivElement;
const exportModalClose = document.getElementById('exportModalClose') as HTMLButtonElement;
const exportLastHint = document.getElementById('exportLastHint') as HTMLDivElement;
const exportLastDateEl = document.getElementById('exportLastDate') as HTMLSpanElement;
const exportFromDate = document.getElementById('exportFromDate') as HTMLInputElement;
const exportToDate = document.getElementById('exportToDate') as HTMLInputElement;
const exportProjectFilter = document.getElementById('exportProjectFilter') as HTMLSelectElement;
const exportConfirmBtn = document.getElementById('exportConfirmBtn') as HTMLButtonElement;
const exportModalStatus = document.getElementById('exportModalStatus') as HTMLDivElement;

// ── Invoice modal elements ────────────────────────────────────────────────────
const invoiceModal = document.getElementById('invoiceModal') as HTMLDivElement;
const invoiceModalClose = document.getElementById('invoiceModalClose') as HTMLButtonElement;
const templateGrid = document.getElementById('templateGrid') as HTMLDivElement;
const invNumber = document.getElementById('invNumber') as HTMLInputElement;
const invDueDate = document.getElementById('invDueDate') as HTMLInputElement;
const invPaymentTerms = document.getElementById('invPaymentTerms') as HTMLSelectElement;
const invYourName = document.getElementById('invYourName') as HTMLInputElement;
const invYourCompany = document.getElementById('invYourCompany') as HTMLInputElement;
const invYourAddress = document.getElementById('invYourAddress') as HTMLInputElement;
const invYourEmail = document.getElementById('invYourEmail') as HTMLInputElement;
const invYourPhone = document.getElementById('invYourPhone') as HTMLInputElement;
const invClientName = document.getElementById('invClientName') as HTMLInputElement;
const invClientAddress = document.getElementById('invClientAddress') as HTMLInputElement;
const invFromDate = document.getElementById('invFromDate') as HTMLInputElement;
const invToDate = document.getElementById('invToDate') as HTMLInputElement;
const invProjectFilter = document.getElementById('invProjectFilter') as HTMLSelectElement;
const invNotes = document.getElementById('invNotes') as HTMLInputElement;
const invoiceExportBtn = document.getElementById('invoiceExportBtn') as HTMLButtonElement;
const invoiceModalStatus = document.getElementById('invoiceModalStatus') as HTMLDivElement;
const invoiceBtn = document.getElementById('invoiceBtn') as HTMLButtonElement;

let selectedTemplateId = 1;

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

function formatDateLabel(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
}

function formatTimeOnly(ms: number): string {
  return new Date(ms).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' });
}

const HISTORY_PAGE_SIZE = 30;
let historyOffset = 0;
let historyTotalCount = 0;
let historyLastDateKey: string | null = null;

type HistoryEntry = Awaited<ReturnType<typeof window.api.listEntriesPage>>[number];

function buildEntryRow(entry: HistoryEntry): HTMLDivElement {
  const row = document.createElement('div');
  row.className = 'entry-row';

  let durationHours = entry.ended_at ? (entry.ended_at - entry.started_at) / 3600000 : 0;
  const earnings = entry.hourly_rate ? durationHours * entry.hourly_rate : 0;

  const summaryEl = document.createElement('div');
  summaryEl.className = 'entry-summary';

  const chevron = document.createElement('span');
  chevron.className = 'chevron';
  chevron.textContent = '▶';

  const main = document.createElement('div');
  main.className = 'entry-summary-main';
  const top = document.createElement('div');
  top.className = 'entry-summary-top';
  top.innerHTML = `<span>${entry.project_name}</span><span class="duration">${entry.ended_at ? formatDuration(entry.ended_at - entry.started_at) : 'running'}</span>`;
  const timeLine = document.createElement('div');
  timeLine.className = 'entry-summary-time';
  timeLine.textContent = entry.ended_at
    ? `${formatTimeOnly(entry.started_at)} – ${formatTimeOnly(entry.ended_at)}${entry.note ? ' · ' + entry.note : ''}`
    : `Started ${formatTimeOnly(entry.started_at)} · still running`;
  main.appendChild(top);
  main.appendChild(timeLine);

  summaryEl.appendChild(chevron);
  summaryEl.appendChild(main);
  row.appendChild(summaryEl);

  const details = document.createElement('div');
  details.className = 'entry-details';
  let detailsBuilt = false;

  summaryEl.addEventListener('click', () => {
    const expanding = !row.classList.contains('expanded');
    row.classList.toggle('expanded', expanding);
    if (expanding && !detailsBuilt) {
      buildDetails();
      detailsBuilt = true;
    }
  });

  function buildDetails() {
    const meta = document.createElement('div');
    meta.className = 'entry-meta';
    meta.textContent = entry.note ?? '';
    if (entry.note) details.appendChild(meta);

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
            statusEl.style.color = 'var(--danger)';
            return;
          }
          await window.api.updateEntryTimes(entry.id, newStart, newEnd);
          durationHours = (newEnd - newStart) / 3600000;
          top.querySelector('.duration')!.textContent = formatDuration(newEnd - newStart);
          const rate = entry.hourly_rate ?? 0;
          earningsSpan.textContent = formatMoney(durationHours * rate);
          statusEl.textContent = 'Saved.';
          statusEl.style.color = 'var(--success)';
          await refreshEarnings();
          await refreshSummary();
        }, 500);
        entryTimeSaveHandles.set(entry.id, handle);
      };

      startInput.addEventListener('input', saveTimes);
      stopInput.addEventListener('input', saveTimes);

      details.appendChild(startGroup);
      details.appendChild(stopGroup);
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
    details.appendChild(rateGroup);
    details.appendChild(earningsSpan);
    details.appendChild(statusEl);

    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'btn-danger delete-btn';
    deleteBtn.textContent = 'Delete Entry';
    deleteBtn.addEventListener('click', async (e) => {
      e.stopPropagation();
      if (deleteBtn.textContent === 'Delete Entry') {
        deleteBtn.textContent = 'Click again to confirm';
        return;
      }
      await window.api.deleteEntry(entry.id);
      row.remove();
      historyTotalCount--;
      historyOffset--;
      await refreshEarnings();
      await refreshSummary();
    });
    details.appendChild(deleteBtn);
  }

  row.appendChild(details);
  return row;
}

function appendEntries(entries: HistoryEntry[]) {
  let currentGroup: HTMLDivElement | null = null;
  for (const entry of entries) {
    const dateKey = new Date(entry.started_at).toDateString();
    if (dateKey !== historyLastDateKey) {
      currentGroup = document.createElement('div');
      currentGroup.className = 'date-group';
      const header = document.createElement('div');
      header.className = 'date-group-header';
      header.textContent = formatDateLabel(entry.started_at);
      currentGroup.appendChild(header);
      historyListEl.appendChild(currentGroup);
      historyLastDateKey = dateKey;
    } else if (!currentGroup) {
      currentGroup = historyListEl.lastElementChild as HTMLDivElement;
    }
    currentGroup!.appendChild(buildEntryRow(entry));
  }
}

async function refreshHistory() {
  historyListEl.innerHTML = '';
  historyOffset = 0;
  historyLastDateKey = null;
  historyTotalCount = await window.api.countEntries();
  if (historyTotalCount === 0) {
    const empty = document.createElement('div');
    empty.id = 'historyEmptyState';
    empty.textContent = 'No entries yet.';
    historyListEl.appendChild(empty);
    loadMoreBtn.style.display = 'none';
    return;
  }
  const entries = await window.api.listEntriesPage(HISTORY_PAGE_SIZE, historyOffset);
  appendEntries(entries);
  historyOffset += entries.length;
  loadMoreBtn.style.display = historyOffset < historyTotalCount ? 'block' : 'none';
}

loadMoreBtn.addEventListener('click', async () => {
  const entries = await window.api.listEntriesPage(HISTORY_PAGE_SIZE, historyOffset);
  appendEntries(entries);
  historyOffset += entries.length;
  loadMoreBtn.style.display = historyOffset < historyTotalCount ? 'block' : 'none';
});

async function showHistoryView() {
  mainView.style.display = 'none';
  historyView.style.display = 'block';
  [tabTimer, tabTimer2].forEach((t) => t.classList.remove('active'));
  [tabHistory, tabHistory2].forEach((t) => t.classList.add('active'));
  await refreshHistory();
}

function showTimerView() {
  historyView.style.display = 'none';
  mainView.style.display = 'block';
  [tabHistory, tabHistory2].forEach((t) => t.classList.remove('active'));
  [tabTimer, tabTimer2].forEach((t) => t.classList.add('active'));
}

tabTimer.addEventListener('click', showTimerView);
tabTimer2.addEventListener('click', showTimerView);
tabHistory.addEventListener('click', showHistoryView);
tabHistory2.addEventListener('click', showHistoryView);

function resetAddEntryForm() {
  addEntryForm.style.display = 'none';
  addEntryStart.value = '';
  addEntryStop.value = '';
  addEntryRate.value = '';
  addEntryNote.value = '';
  addEntryStatus.textContent = '';
}

addEntryBtn.addEventListener('click', () => {
  addEntryProjectSelect.innerHTML = '';
  for (const project of projects) {
    const option = document.createElement('option');
    option.value = String(project.id);
    option.textContent = project.name;
    addEntryProjectSelect.appendChild(option);
  }
  const selectedProject = projects.find((p) => p.id === Number(addEntryProjectSelect.value));
  addEntryRate.value = selectedProject?.hourly_rate != null ? String(selectedProject.hourly_rate) : '';
  addEntryForm.style.display = 'block';
});

addEntryProjectSelect.addEventListener('change', () => {
  const selectedProject = projects.find((p) => p.id === Number(addEntryProjectSelect.value));
  addEntryRate.value = selectedProject?.hourly_rate != null ? String(selectedProject.hourly_rate) : '';
});

addEntryCancelBtn.addEventListener('click', resetAddEntryForm);

addEntrySaveBtn.addEventListener('click', async () => {
  const projectId = Number(addEntryProjectSelect.value);
  const start = fromDatetimeLocalValue(addEntryStart.value);
  const end = fromDatetimeLocalValue(addEntryStop.value);
  if (!projectId) {
    addEntryStatus.textContent = 'Choose a project.';
    addEntryStatus.style.color = 'var(--danger)';
    return;
  }
  if (start === null || end === null || end <= start) {
    addEntryStatus.textContent = 'Stop must be after start.';
    addEntryStatus.style.color = 'var(--danger)';
    return;
  }
  const rateValue = addEntryRate.value.trim();
  const rate = rateValue === '' ? null : Number(rateValue);
  await window.api.createManualEntry(projectId, start, end, addEntryNote.value.trim(), Number.isFinite(rate) ? rate : null);
  resetAddEntryForm();
  await refreshHistory();
  await refreshEarnings();
  await refreshSummary();
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
  startStopLabel.textContent = running ? 'Stop' : 'Start';
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
  await openExportModal();
});

invoiceBtn.addEventListener('click', async () => {
  await openInvoiceModal();
});

// ── Helpers ───────────────────────────────────────────────────────────────────

function toDateInputValue(ms: number): string {
  const d = new Date(ms);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function dateInputToStartMs(val: string): number {
  return new Date(val + 'T00:00:00').getTime();
}

function dateInputToEndMs(val: string): number {
  return new Date(val + 'T23:59:59.999').getTime();
}

// ── Flatpickr date pickers ────────────────────────────────────────────────────
// All four date inputs use the same config: calendar-only (no typing),
// YYYY-MM-DD internal format so the existing helpers work unchanged.

const fpConfig: FpOptions = {
  dateFormat: 'Y-m-d',
  allowInput: false,
  disableMobile: true,
};

const fpExportFrom = flatpickr(exportFromDate, fpConfig);
const fpExportTo   = flatpickr(exportToDate,   fpConfig);
const fpInvFrom    = flatpickr(invFromDate,     fpConfig);
const fpInvTo      = flatpickr(invToDate,       fpConfig);

/** Set a flatpickr instance to a date without triggering the change event. */
function setFpDate(fp: FpInstance, ms: number | null) {
  if (ms === null) { fp.clear(); return; }
  fp.setDate(new Date(ms), false);
}

function populateProjectDropdown(select: HTMLSelectElement) {
  const prev = select.value;
  select.innerHTML = '<option value="">All Projects</option>';
  for (const p of projects) {
    const opt = document.createElement('option');
    opt.value = String(p.id);
    opt.textContent = p.name;
    select.appendChild(opt);
  }
  select.value = prev;
}

// ── Export modal ──────────────────────────────────────────────────────────────

async function openExportModal() {
  exportModalStatus.textContent = '';
  populateProjectDropdown(exportProjectFilter);

  const lastRange = await window.api.getLastExportRange();
  if (lastRange) {
    exportLastHint.style.display = 'block';
    exportLastDateEl.textContent = new Date(lastRange.range_to).toLocaleDateString();
    setFpDate(fpExportFrom, lastRange.range_to + 86_400_000); // day after last export
  } else {
    exportLastHint.style.display = 'none';
    setFpDate(fpExportFrom, null);
  }
  setFpDate(fpExportTo, Date.now());

  exportModal.classList.add('open');
}

exportModalClose.addEventListener('click', () => exportModal.classList.remove('open'));
exportModal.addEventListener('click', (e) => {
  if (e.target === exportModal) exportModal.classList.remove('open');
});

exportConfirmBtn.addEventListener('click', async () => {
  if (!exportFromDate.value || !exportToDate.value) {
    exportModalStatus.textContent = 'Please select both dates.';
    exportModalStatus.style.color = 'var(--danger)';
    return;
  }
  const rangeFrom = dateInputToStartMs(exportFromDate.value);
  const rangeTo = dateInputToEndMs(exportToDate.value);
  if (rangeTo < rangeFrom) {
    exportModalStatus.textContent = '"To" must be after "From".';
    exportModalStatus.style.color = 'var(--danger)';
    return;
  }
  const projectId = exportProjectFilter.value ? Number(exportProjectFilter.value) : null;
  exportConfirmBtn.disabled = true;
  exportModalStatus.textContent = 'Exporting…';
  exportModalStatus.style.color = 'var(--text-muted)';
  try {
    const filePath = await window.api.exportExcel({ rangeFrom, rangeTo, projectId });
    if (filePath) {
      exportModalStatus.textContent = `Saved to ${filePath}`;
      exportModalStatus.style.color = 'var(--success)';
      exportStatusEl.textContent = `Last export: ${new Date(rangeTo).toLocaleDateString()}`;
    } else {
      exportModalStatus.textContent = 'Export cancelled.';
      exportModalStatus.style.color = 'var(--text-muted)';
    }
  } catch {
    exportModalStatus.textContent = 'Export failed.';
    exportModalStatus.style.color = 'var(--danger)';
  }
  exportConfirmBtn.disabled = false;
});

// ── Invoice modal ─────────────────────────────────────────────────────────────

function buildTemplateGrid() {
  templateGrid.innerHTML = '';
  for (const t of TEMPLATE_META) {
    const card = document.createElement('div');
    card.className = 'template-card' + (t.id === selectedTemplateId ? ' selected' : '');
    card.dataset.id = String(t.id);

    const bgColor = t.isDark ? '#161b22' : '#fff';
    const preview = document.createElement('div');
    preview.className = 'template-preview';
    preview.style.background = bgColor;
    preview.innerHTML = `
      <div class="tp-header" style="background:${t.headerColor}"></div>
      <div class="tp-body">
        <div class="tp-line short" style="background:${t.lineColor}"></div>
        <div class="tp-line medium" style="background:${t.lineColor}"></div>
        <div class="tp-line full" style="background:${t.lineColor}"></div>
        <div class="tp-line medium" style="background:${t.lineColor}"></div>
      </div>`;

    const nameEl = document.createElement('div');
    nameEl.className = 'template-name';
    nameEl.textContent = t.name;

    card.appendChild(preview);
    card.appendChild(nameEl);
    card.addEventListener('click', () => {
      selectedTemplateId = t.id;
      templateGrid.querySelectorAll('.template-card').forEach((c) => c.classList.remove('selected'));
      card.classList.add('selected');
      window.api.previewInvoiceTemplate(t.id, getInvoiceFormData());
      // Persist the preferred template immediately
      window.api.saveInvoiceSettings({ preferred_template_id: t.id });
    });
    templateGrid.appendChild(card);
  }
}

async function openInvoiceModal() {
  invoiceModalStatus.textContent = '';
  populateProjectDropdown(invProjectFilter);
  buildTemplateGrid();

  const [settings, nextNum, lastRange] = await Promise.all([
    window.api.getInvoiceSettings(),
    window.api.getNextInvoiceNumber(),
    window.api.getLastExportRange(),
  ]);

  invNumber.value = nextNum;
  invYourName.value = settings.your_name ?? '';
  invYourCompany.value = settings.your_company ?? '';
  invYourAddress.value = settings.your_address ?? '';
  invYourEmail.value = settings.your_email ?? '';
  invYourPhone.value = settings.your_phone ?? '';

  // Restore last-used template
  selectedTemplateId = settings.preferred_template_id ?? 1;
  buildTemplateGrid(); // re-render grid with correct selection highlighted

  // Restore last-used payment terms
  invPaymentTerms.value = settings.default_payment_terms ?? 'Net 30';

  // Restore last-used client info
  invClientName.value    = settings.last_client_name    ?? '';
  invClientAddress.value = settings.last_client_address ?? '';
  invNotes.value         = settings.last_notes          ?? '';

  // Restore last-used due date, or default to 30 days from now
  if (settings.last_due_date) {
    invDueDate.value = settings.last_due_date;
  } else {
    const due = new Date();
    due.setDate(due.getDate() + 30);
    invDueDate.value = due.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // Restore last-used project filter
  if (settings.last_project_id != null) {
    invProjectFilter.value = String(settings.last_project_id);
  }

  // default date range same logic as export modal
  if (lastRange) {
    setFpDate(fpInvFrom, lastRange.range_to + 86_400_000);
  } else {
    setFpDate(fpInvFrom, null);
  }
  setFpDate(fpInvTo, Date.now());

  invoiceModal.classList.add('open');
}

invoiceModalClose.addEventListener('click', () => invoiceModal.classList.remove('open'));
invoiceModal.addEventListener('click', (e) => {
  if (e.target === invoiceModal) invoiceModal.classList.remove('open');
});

function getInvoiceFormData(): InvoiceFormData {
  const from = invFromDate.value ? dateInputToStartMs(invFromDate.value) : null;
  const to = invToDate.value ? dateInputToEndMs(invToDate.value) : null;
  return {
    invoiceNumber: invNumber.value.trim(),
    dueDate: invDueDate.value.trim(),
    paymentTerms: invPaymentTerms.value,
    yourName: invYourName.value.trim(),
    yourCompany: invYourCompany.value.trim(),
    yourAddress: invYourAddress.value.trim(),
    yourEmail: invYourEmail.value.trim(),
    yourPhone: invYourPhone.value.trim(),
    clientName: invClientName.value.trim(),
    clientAddress: invClientAddress.value.trim(),
    notes: invNotes.value.trim(),
    rangeFrom: from,
    rangeTo: (to !== null && from !== null && to >= from) ? to : null,
    projectId: invProjectFilter.value ? Number(invProjectFilter.value) : null,
  };
}

let previewRefreshHandle: number | undefined;
function schedulePreviewRefresh() {
  if (previewRefreshHandle) clearTimeout(previewRefreshHandle);
  previewRefreshHandle = window.setTimeout(() => {
    window.api.refreshInvoicePreview({ ...getInvoiceFormData(), templateId: selectedTemplateId });
  }, 400);
}

// Auto-save all form fields to the database 800 ms after the user stops typing/changing.
let settingsSaveHandle: number | undefined;
function scheduleSettingsSave() {
  if (settingsSaveHandle) clearTimeout(settingsSaveHandle);
  settingsSaveHandle = window.setTimeout(() => {
    window.api.saveInvoiceSettings({
      your_name:             invYourName.value.trim(),
      your_company:          invYourCompany.value.trim(),
      your_address:          invYourAddress.value.trim(),
      your_email:            invYourEmail.value.trim(),
      your_phone:            invYourPhone.value.trim(),
      preferred_template_id: selectedTemplateId,
      default_payment_terms: invPaymentTerms.value,
      last_client_name:      invClientName.value.trim(),
      last_client_address:   invClientAddress.value.trim(),
      last_due_date:         invDueDate.value.trim(),
      last_notes:            invNotes.value.trim(),
      last_project_id:       invProjectFilter.value ? Number(invProjectFilter.value) : null,
    });
  }, 800);
}

const allSavedFields = [
  invYourName, invYourCompany, invYourAddress, invYourEmail, invYourPhone,
  invClientName, invClientAddress, invDueDate, invNotes,
];
allSavedFields.forEach((el) => el.addEventListener('input', scheduleSettingsSave));
invPaymentTerms.addEventListener('change', scheduleSettingsSave);
invProjectFilter.addEventListener('change', scheduleSettingsSave);

// Attach live-refresh listeners to all invoice form fields
const invoiceFormFields = [
  invNumber, invDueDate, invYourName, invYourCompany, invYourAddress,
  invYourEmail, invYourPhone, invClientName, invClientAddress, invNotes,
  invFromDate, invToDate,
];
invoiceFormFields.forEach((el) => el.addEventListener('input', schedulePreviewRefresh));
invPaymentTerms.addEventListener('change', schedulePreviewRefresh);
invProjectFilter.addEventListener('change', schedulePreviewRefresh);

invoiceExportBtn.addEventListener('click', async () => {
  if (!invFromDate.value || !invToDate.value) {
    invoiceModalStatus.textContent = 'Please select a date range.';
    invoiceModalStatus.style.color = 'var(--danger)';
    return;
  }
  if (!invClientName.value.trim()) {
    invoiceModalStatus.textContent = 'Client name is required.';
    invoiceModalStatus.style.color = 'var(--danger)';
    return;
  }

  // persist all settings before export
  await window.api.saveInvoiceSettings({
    your_name:             invYourName.value.trim(),
    your_company:          invYourCompany.value.trim(),
    your_address:          invYourAddress.value.trim(),
    your_email:            invYourEmail.value.trim(),
    your_phone:            invYourPhone.value.trim(),
    preferred_template_id: selectedTemplateId,
    default_payment_terms: invPaymentTerms.value,
    last_client_name:      invClientName.value.trim(),
    last_client_address:   invClientAddress.value.trim(),
    last_due_date:         invDueDate.value.trim(),
    last_notes:            invNotes.value.trim(),
    last_project_id:       invProjectFilter.value ? Number(invProjectFilter.value) : null,
  });

  const rangeFrom = dateInputToStartMs(invFromDate.value);
  const rangeTo = dateInputToEndMs(invToDate.value);
  const projectId = invProjectFilter.value ? Number(invProjectFilter.value) : null;

  invoiceExportBtn.disabled = true;
  invoiceModalStatus.textContent = 'Generating PDF…';
  invoiceModalStatus.style.color = 'var(--text-muted)';
  try {
    const filePath = await window.api.exportInvoice({
      templateId: selectedTemplateId,
      invoiceNumber: invNumber.value.trim() || 'INV-0001',
      dueDate: invDueDate.value,
      paymentTerms: invPaymentTerms.value.trim(),
      clientName: invClientName.value.trim(),
      clientAddress: invClientAddress.value.trim(),
      notes: invNotes.value.trim(),
      rangeFrom,
      rangeTo,
      projectId,
    });
    if (filePath) {
      invoiceModalStatus.textContent = `Saved to ${filePath}`;
      invoiceModalStatus.style.color = 'var(--success)';
    } else {
      invoiceModalStatus.textContent = 'Export cancelled.';
      invoiceModalStatus.style.color = 'var(--text-muted)';
    }
  } catch {
    invoiceModalStatus.textContent = 'PDF generation failed.';
    invoiceModalStatus.style.color = 'var(--danger)';
  }
  invoiceExportBtn.disabled = false;
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
