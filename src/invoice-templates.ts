export interface InvoiceLineItem {
  project: string;
  date: string;
  description: string;
  hours: number;
  rate: number;
  amount: number;
  /** Running owed/credit position after this line. Negative = credit remaining. */
  balance?: number;
  /** True for retainer / prior-balance adjustment rows (not time entries). */
  isAdjustment?: boolean;
}

export interface InvoiceData {
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string;
  yourName: string;
  yourCompany: string;
  yourAddress: string;
  yourEmail: string;
  yourPhone: string;
  clientName: string;
  clientAddress: string;
  notes: string;
  dateRange: string;
  projectName: string;
  lineItems: InvoiceLineItem[];
  subtotal: number;
  total: number;
  /** Earned before this invoice minus payments. Negative = unused retainer. */
  openingBalance: number;
  /** Unused retainer/credit applied to this invoice (always >= 0). */
  paymentsApplied: number;
}

export interface InvoiceTemplate {
  id: number;
  name: string;
  description: string;
  primaryColor: string;
  accentColor: string;
  isDark: boolean;
  render: (data: InvoiceData) => string;
}

function esc(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function addr(s: string): string {
  return esc(s).replace(/\n/g, '<br>');
}

function money(n: number): string {
  const formatted = Math.abs(n).toFixed(2);
  return n < 0 ? `-$${formatted}` : `$${formatted}`;
}

function hasRunningBalance(d: InvoiceData): boolean {
  return Math.abs(d.openingBalance) >= 0.005;
}

function balanceTh(d: InvoiceData): string {
  return hasRunningBalance(d) ? '<th class="r" style="text-align:right">Balance</th>' : '';
}

function balanceTd(d: InvoiceData, item: InvoiceLineItem, extraStyle = ''): string {
  if (!hasRunningBalance(d)) return '';
  const b = item.balance ?? 0;
  const tone = b < 0 ? 'color:#059669;' : '';
  return `<td class="r" style="text-align:right;${tone}${extraStyle}">${money(b)}</td>`;
}

function paymentsAppliedRow(d: InvoiceData, rowClass: string): string {
  if (d.paymentsApplied < 0.005) return '';
  return `<div class="${rowClass}"><span>Retainer / payments applied</span><span>${money(-d.paymentsApplied)}</span></div>`;
}

function hours(n: number): string {
  return n.toFixed(2);
}

function groupByProject(items: InvoiceLineItem[]): Map<string, { items: InvoiceLineItem[]; subtotal: number }> {
  const map = new Map<string, { items: InvoiceLineItem[]; subtotal: number }>();
  for (const item of items) {
    if (item.isAdjustment === true) continue;
    const existing = map.get(item.project);
    if (existing) {
      existing.items.push(item);
      existing.subtotal += item.amount;
    } else {
      map.set(item.project, { items: [item], subtotal: item.amount });
    }
  }
  return map;
}

const BASE_PRINT_CSS = `
  @page { margin: 0.65in; }
  * { box-sizing: border-box; }
  body { -webkit-print-color-adjust: exact; print-color-adjust: exact; margin: 0; padding: 0; }
`;

// ── Template 1: Classic Minimal ──────────────────────────────────────────────

function renderClassicMinimal(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i) => `<tr>
        <td>${esc(i.date)}</td>
        <td>${esc(i.project)}${i.description ? `<br><span class="note">${esc(i.description)}</span>` : ''}</td>
        <td class="r">${hours(i.hours)}</td>
        <td class="r">${money(i.rate)}</td>
        <td class="r">${money(i.amount)}</td>
        ${balanceTd(d, i)}
      </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 11pt; color: #1a1a1a; background: #fff; }
    .top { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; border-bottom: 2px solid #1a1a1a; padding-bottom: 20px; }
    .brand { font-size: 22pt; font-weight: 700; letter-spacing: -0.5px; }
    .brand .sub { font-size: 9pt; font-weight: 400; color: #666; margin-top: 2px; }
    .invoice-meta { text-align: right; }
    .invoice-meta .label { font-size: 9pt; color: #888; text-transform: uppercase; letter-spacing: 0.05em; }
    .invoice-meta .num { font-size: 18pt; font-weight: 700; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 32px; }
    .party h4 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin: 0 0 6px; }
    .party p { margin: 0; line-height: 1.5; font-size: 10pt; }
    .meta-row { display: flex; gap: 40px; margin-bottom: 32px; }
    .meta-item { }
    .meta-item .lbl { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #888; }
    .meta-item .val { font-size: 10pt; font-weight: 600; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    th { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #888; padding: 6px 8px; border-bottom: 1px solid #e0e0e0; text-align: left; }
    td { padding: 8px 8px; border-bottom: 1px solid #f0f0f0; font-size: 10pt; vertical-align: top; }
    .note { font-size: 8pt; color: #888; }
    .r { text-align: right; }
    .totals { margin-left: auto; width: 260px; }
    .totals-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10pt; border-bottom: 1px solid #f0f0f0; }
    .totals-row.total { font-weight: 700; font-size: 12pt; border-top: 2px solid #1a1a1a; border-bottom: none; padding-top: 8px; margin-top: 4px; }
    .notes-section { margin-top: 32px; border-top: 1px solid #e0e0e0; padding-top: 16px; }
    .notes-section h4 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #888; margin: 0 0 6px; }
    .notes-section p { font-size: 10pt; color: #444; line-height: 1.5; margin: 0; }
  </style></head><body>
  <div class="top">
    <div class="brand">${esc(d.yourCompany || d.yourName)}<div class="sub">${d.yourCompany ? esc(d.yourName) : ''}</div></div>
    <div class="invoice-meta"><div class="label">Invoice</div><div class="num">${esc(d.invoiceNumber)}</div></div>
  </div>
  <div class="parties">
    <div class="party"><h4>From</h4><p>${addr(d.yourCompany ? `${d.yourCompany}\n${d.yourName}` : d.yourName)}${d.yourAddress ? `<br>${addr(d.yourAddress)}` : ''}${d.yourEmail ? `<br>${esc(d.yourEmail)}` : ''}${d.yourPhone ? `<br>${esc(d.yourPhone)}` : ''}</p></div>
    <div class="party"><h4>Bill To</h4><p>${addr(d.clientName)}${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</p></div>
  </div>
  <div class="meta-row">
    <div class="meta-item"><div class="lbl">Invoice Date</div><div class="val">${esc(d.invoiceDate)}</div></div>
    ${d.dueDate ? `<div class="meta-item"><div class="lbl">Due Date</div><div class="val">${esc(d.dueDate)}</div></div>` : ''}
    ${d.paymentTerms ? `<div class="meta-item"><div class="lbl">Terms</div><div class="val">${esc(d.paymentTerms)}</div></div>` : ''}
    <div class="meta-item"><div class="lbl">Period</div><div class="val">${esc(d.dateRange)}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Description</th><th class="r">Hours</th><th class="r">Rate</th><th class="r">Amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div class="totals-row"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    ${paymentsAppliedRow(d, 'totals-row')}
    <div class="totals-row total"><span>Total Due</span><span>${money(d.total)}</span></div>
  </div>
  ${d.notes ? `<div class="notes-section"><h4>Notes</h4><p>${esc(d.notes)}</p></div>` : ''}
  </body></html>`;
}

// ── Template 2: Modern Gradient ──────────────────────────────────────────────

function renderModernGradient(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i, idx) => `<tr style="${idx % 2 === 0 ? 'background:#f8f9ff' : ''}">
        <td>${esc(i.date)}</td>
        <td>${esc(i.project)}${i.description ? `<br><span style="font-size:8pt;color:#888">${esc(i.description)}</span>` : ''}</td>
        <td style="text-align:right">${hours(i.hours)}h</td>
        <td style="text-align:right">${money(i.rate)}</td>
        <td style="text-align:right;font-weight:600">${money(i.amount)}</td>
        ${balanceTd(d, i, 'font-weight:600;')}
      </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 11pt; color: #1e2340; background: #fff; }
    .inv-banner { background: linear-gradient(135deg, #1e3a8a 0%, #4f46e5 60%, #7c3aed 100%); color: white; padding: 36px 40px; display: flex; justify-content: space-between; align-items: flex-start; margin: -0.65in -0.65in 32px; }
    .inv-banner .header-left .company { font-size: 20pt; font-weight: 700; }
    .inv-banner .header-left .name { font-size: 10pt; opacity: 0.75; margin-top: 2px; }
    .inv-banner .header-right { text-align: right; }
    .inv-banner .header-right .inv-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.75; }
    .inv-banner .header-right .inv-num { font-size: 22pt; font-weight: 800; }
    .inv-banner .header-right .inv-date { font-size: 9pt; opacity: 0.8; margin-top: 2px; }
    .body-pad { padding: 0 0; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 28px; }
    .party-box { background: #f0f4ff; border-radius: 8px; padding: 16px 20px; min-width: 200px; }
    .party-box h4 { margin: 0 0 8px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6366f1; }
    .party-box p { margin: 0; font-size: 10pt; line-height: 1.6; color: #2d3560; }
    .meta-strip { display: flex; gap: 0; background: #1e3a8a; border-radius: 8px; overflow: hidden; margin-bottom: 28px; }
    .meta-chip { flex: 1; padding: 12px 16px; text-align: center; border-right: 1px solid rgba(255,255,255,0.15); }
    .meta-chip:last-child { border-right: none; }
    .meta-chip .lbl { font-size: 7pt; text-transform: uppercase; letter-spacing: 0.08em; color: rgba(255,255,255,0.6); }
    .meta-chip .val { font-size: 10pt; font-weight: 700; color: white; margin-top: 3px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #6366f1; padding: 8px 10px; border-bottom: 2px solid #e0e7ff; text-align: left; }
    td { padding: 9px 10px; font-size: 10pt; vertical-align: top; border-bottom: 1px solid #eef0ff; }
    .totals { margin-left: auto; width: 280px; }
    .tr { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10pt; }
    .tr.grand { font-weight: 800; font-size: 14pt; color: #4f46e5; border-top: 2px solid #4f46e5; padding-top: 10px; margin-top: 6px; }
    .notes { margin-top: 28px; padding: 16px 20px; background: #f0f4ff; border-radius: 8px; }
    .notes h4 { margin: 0 0 6px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #6366f1; }
    .notes p { margin: 0; font-size: 10pt; line-height: 1.5; color: #2d3560; }
  </style></head><body>
  <div class="inv-banner">
    <div class="header-left"><div class="company">${esc(d.yourCompany || d.yourName)}</div><div class="name">${d.yourCompany ? esc(d.yourName) : ''}</div>${d.yourEmail ? `<div class="name" style="margin-top:6px">${esc(d.yourEmail)}</div>` : ''}</div>
    <div class="header-right"><div class="inv-label">Invoice</div><div class="inv-num">${esc(d.invoiceNumber)}</div><div class="inv-date">${esc(d.invoiceDate)}</div></div>
  </div>
  <div class="parties">
    <div class="party-box"><h4>Billed By</h4><p>${addr(d.yourCompany ? `${d.yourCompany}\n${d.yourName}` : d.yourName)}${d.yourAddress ? `<br>${addr(d.yourAddress)}` : ''}${d.yourEmail ? `<br>${esc(d.yourEmail)}` : ''}${d.yourPhone ? `<br>${esc(d.yourPhone)}` : ''}</p></div>
    <div class="party-box"><h4>Billed To</h4><p>${addr(d.clientName)}${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</p></div>
  </div>
  <div class="meta-strip">
    ${d.dueDate ? `<div class="meta-chip"><div class="lbl">Due Date</div><div class="val">${esc(d.dueDate)}</div></div>` : ''}
    ${d.paymentTerms ? `<div class="meta-chip"><div class="lbl">Terms</div><div class="val">${esc(d.paymentTerms)}</div></div>` : ''}
    <div class="meta-chip"><div class="lbl">Period</div><div class="val">${esc(d.dateRange)}</div></div>
    <div class="meta-chip"><div class="lbl">Amount Due</div><div class="val">${money(d.total)}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Project / Description</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div class="tr"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    ${paymentsAppliedRow(d, 'tr')}
    <div class="tr grand"><span>Total Due</span><span>${money(d.total)}</span></div>
  </div>
  ${d.notes ? `<div class="notes"><h4>Notes</h4><p>${esc(d.notes)}</p></div>` : ''}
  </body></html>`;
}

// ── Template 3: Itemized Detail (grouped by project) ─────────────────────────

function renderItemizedDetail(d: InvoiceData): string {
  const groups = groupByProject(d.lineItems);
  const colCount = hasRunningBalance(d) ? 6 : 5;
  let tableRows = '';
  for (const i of d.lineItems.filter((item) => item.isAdjustment === true)) {
    tableRows += `<tr>
      <td>${esc(i.date)}</td>
      <td>${esc(i.description)}</td>
      <td class="r"></td>
      <td class="r"></td>
      <td class="r">${money(i.amount)}</td>
      ${balanceTd(d, i)}
    </tr>`;
  }
  for (const [project, { items, subtotal: projTotal }] of groups) {
    tableRows += `<tr class="project-header"><td colspan="${colCount}">${esc(project)}</td></tr>`;
    for (const i of items) {
      tableRows += `<tr>
        <td style="padding-left:20px">${esc(i.date)}</td>
        <td style="padding-left:20px">${i.description ? esc(i.description) : '<em style="color:#aaa">—</em>'}</td>
        <td class="r">${hours(i.hours)}h</td>
        <td class="r">${money(i.rate)}/hr</td>
        <td class="r">${money(i.amount)}</td>
        ${balanceTd(d, i)}
      </tr>`;
    }
    if (groups.size > 1) {
      tableRows += `<tr class="proj-subtotal"><td colspan="4" style="text-align:right;padding-right:10px">Subtotal — ${esc(project)}</td><td class="r">${money(projTotal)}</td>${hasRunningBalance(d) ? '<td></td>' : ''}</tr>`;
    }
  }
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 10.5pt; color: #1a2340; background: #fff; }
    .header { display: flex; justify-content: space-between; margin-bottom: 28px; padding-bottom: 20px; border-bottom: 3px solid #0f766e; }
    .from { }
    .from .co { font-size: 18pt; font-weight: 800; color: #0f766e; }
    .from .info { font-size: 9pt; color: #555; margin-top: 4px; line-height: 1.6; }
    .inv-box { background: #0f766e; color: white; padding: 16px 24px; border-radius: 8px; text-align: right; }
    .inv-box .lbl { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; opacity: 0.8; }
    .inv-box .num { font-size: 20pt; font-weight: 800; }
    .parties { display: flex; gap: 40px; margin-bottom: 24px; }
    .party h4 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #0f766e; margin: 0 0 6px; }
    .party p { margin: 0; font-size: 10pt; line-height: 1.5; }
    .meta { display: flex; gap: 32px; margin-bottom: 28px; padding: 12px 16px; background: #f0fdf9; border-radius: 6px; border-left: 4px solid #0f766e; }
    .meta-item .lbl { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #0f766e; }
    .meta-item .val { font-size: 10pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 10pt; }
    th { background: #0f766e; color: white; padding: 8px 10px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; }
    .r { text-align: right; }
    td { padding: 7px 10px; border-bottom: 1px solid #e6f7f5; vertical-align: top; }
    .project-header td { background: #e6f7f5; font-weight: 700; color: #0f766e; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.04em; padding: 6px 10px; border-bottom: none; }
    .proj-subtotal td { background: #d0f0ec; font-weight: 600; font-size: 9.5pt; border-top: 1px solid #b2e0da; }
    .totals { margin-left: auto; width: 260px; }
    .tr { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10.5pt; border-bottom: 1px solid #e6f7f5; }
    .tr.grand { font-weight: 800; font-size: 13pt; color: #0f766e; border-top: 2px solid #0f766e; border-bottom: none; padding-top: 8px; margin-top: 4px; }
    .notes { margin-top: 28px; padding: 12px 16px; background: #f0fdf9; border-left: 4px solid #0f766e; border-radius: 0 6px 6px 0; }
    .notes h4 { margin: 0 0 5px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #0f766e; }
  </style></head><body>
  <div class="header">
    <div class="from"><div class="co">${esc(d.yourCompany || d.yourName)}</div><div class="info">${d.yourCompany ? esc(d.yourName) + '<br>' : ''}${d.yourEmail ? esc(d.yourEmail) + '<br>' : ''}${d.yourPhone ? esc(d.yourPhone) : ''}</div></div>
    <div class="inv-box"><div class="lbl">Invoice</div><div class="num">${esc(d.invoiceNumber)}</div><div style="font-size:9pt;opacity:0.85;margin-top:4px">${esc(d.invoiceDate)}</div></div>
  </div>
  <div class="parties">
    <div class="party"><h4>From</h4><p>${addr(d.yourCompany ? `${d.yourCompany}\n${d.yourName}` : d.yourName)}${d.yourAddress ? `<br>${addr(d.yourAddress)}` : ''}${d.yourEmail ? `<br>${esc(d.yourEmail)}` : ''}${d.yourPhone ? `<br>${esc(d.yourPhone)}` : ''}</p></div>
    <div class="party"><h4>Bill To</h4><p>${addr(d.clientName)}${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</p></div>
  </div>
  <div class="meta">
    ${d.dueDate ? `<div class="meta-item"><div class="lbl">Due Date</div><div class="val">${esc(d.dueDate)}</div></div>` : ''}
    ${d.paymentTerms ? `<div class="meta-item"><div class="lbl">Payment Terms</div><div class="val">${esc(d.paymentTerms)}</div></div>` : ''}
    <div class="meta-item"><div class="lbl">Billing Period</div><div class="val">${esc(d.dateRange)}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Description</th><th class="r">Hours</th><th class="r">Rate</th><th class="r">Amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${tableRows}</tbody></table>
  <div class="totals">
    <div class="tr"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    ${paymentsAppliedRow(d, 'tr')}
    <div class="tr grand"><span>Total Due</span><span>${money(d.total)}</span></div>
  </div>
  ${d.notes ? `<div class="notes"><h4>Notes</h4><p style="margin:0;font-size:10pt;line-height:1.5">${esc(d.notes)}</p></div>` : ''}
  </body></html>`;
}

// ── Template 4: Executive Summary (project totals only) ───────────────────────

function renderExecutiveSummary(d: InvoiceData): string {
  const groups = groupByProject(d.lineItems);
  const totalHours = d.lineItems.reduce((s, i) => s + i.hours, 0);
  const projectRows = Array.from(groups.entries())
    .map(([project, { items, subtotal: projTotal }]) => {
      const pHours = items.reduce((s, i) => s + i.hours, 0);
      const avgRate = pHours > 0 ? projTotal / pHours : 0;
      return `<tr><td>${esc(project)}</td><td class="r">${hours(pHours)}</td><td class="r">${money(avgRate)}</td><td class="r bold">${money(projTotal)}</td></tr>`;
    })
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 11pt; color: #1a1a2e; background: #fff; }
    .top { display: flex; justify-content: space-between; align-items: center; margin-bottom: 40px; }
    .co-name { font-size: 24pt; font-weight: 800; color: #7c3aed; letter-spacing: -1px; }
    .co-sub { font-size: 10pt; color: #777; margin-top: 2px; }
    .co-addr { font-size: 9pt; color: #999; margin-top: 2px; line-height: 1.4; }
    .badge { background: #7c3aed; color: white; padding: 8px 20px; border-radius: 999px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 32px; }
    .party { }
    .party h4 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #7c3aed; margin: 0 0 6px; }
    .party p { margin: 0; font-size: 10pt; line-height: 1.6; }
    .summary-header { display: grid; grid-template-columns: repeat(4, 1fr); gap: 16px; margin-bottom: 36px; }
    .stat { background: #f5f3ff; border-radius: 10px; padding: 16px; text-align: center; }
    .stat .lbl { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #7c3aed; }
    .stat .val { font-size: 16pt; font-weight: 800; color: #1a1a2e; margin-top: 4px; }
    .section-title { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #7c3aed; font-weight: 700; margin-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.06em; color: #7c3aed; padding: 8px 12px; border-bottom: 2px solid #ede9fe; text-align: left; }
    td { padding: 10px 12px; border-bottom: 1px solid #f3f0ff; font-size: 11pt; }
    .r { text-align: right; }
    .bold { font-weight: 700; }
    .grand-total { background: #7c3aed; color: white; border-radius: 12px; padding: 24px 32px; display: flex; justify-content: space-between; align-items: center; margin-top: 28px; }
    .grand-total .lbl { font-size: 10pt; opacity: 0.85; text-transform: uppercase; letter-spacing: 0.1em; }
    .grand-total .amt { font-size: 28pt; font-weight: 900; }
    .meta-line { display: flex; gap: 24px; margin-bottom: 32px; font-size: 10pt; color: #555; }
    .meta-line span { font-weight: 600; color: #1a1a2e; }
    .notes { margin-top: 28px; padding: 16px; background: #f5f3ff; border-radius: 8px; }
    .notes .lbl { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.08em; color: #7c3aed; margin-bottom: 6px; }
    .notes p { margin: 0; font-size: 10pt; line-height: 1.5; }
  </style></head><body>
  <div class="top">
    <div><div class="co-name">${esc(d.yourCompany || d.yourName)}</div><div class="co-sub">${d.yourCompany ? esc(d.yourName) : ''}${d.yourEmail ? ` · ${esc(d.yourEmail)}` : ''}${d.yourPhone ? ` · ${esc(d.yourPhone)}` : ''}</div>${d.yourAddress ? `<div class="co-addr">${addr(d.yourAddress)}</div>` : ''}</div>
    <div class="badge">${esc(d.invoiceNumber)}</div>
  </div>
  <div class="parties">
    <div class="party"><h4>Bill To</h4><p><strong>${esc(d.clientName)}</strong>${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</p></div>
    <div class="party" style="text-align:right"><h4>Invoice Details</h4><p>Date: ${esc(d.invoiceDate)}${d.dueDate ? `<br>Due: ${esc(d.dueDate)}` : ''}${d.paymentTerms ? `<br>Terms: ${esc(d.paymentTerms)}` : ''}</p></div>
  </div>
  <div class="summary-header">
    <div class="stat"><div class="lbl">Period</div><div class="val" style="font-size:11pt">${esc(d.dateRange)}</div></div>
    <div class="stat"><div class="lbl">Total Hours</div><div class="val">${hours(totalHours)}</div></div>
    <div class="stat"><div class="lbl">Projects</div><div class="val">${groups.size}</div></div>
    <div class="stat"><div class="lbl">Line Items</div><div class="val">${d.lineItems.length}</div></div>
  </div>
  <div class="section-title">Project Breakdown</div>
  <table><thead><tr><th>Project</th><th class="r">Hours</th><th class="r">Avg Rate</th><th class="r">Subtotal</th></tr></thead>
  <tbody>${projectRows}</tbody></table>
  ${d.paymentsApplied >= 0.005 ? `<div class="tr" style="display:flex;justify-content:space-between;padding:8px 12px;color:#7c3aed"><span>Retainer / payments applied</span><span>${money(-d.paymentsApplied)}</span></div>` : ''}
  <div class="grand-total"><div><div class="lbl">Total Amount Due</div>${d.dueDate ? `<div style="font-size:9pt;opacity:0.75;margin-top:4px">Due ${esc(d.dueDate)}</div>` : ''}</div><div class="amt">${money(d.total)}</div></div>
  ${d.notes ? `<div class="notes"><div class="lbl">Notes</div><p>${esc(d.notes)}</p></div>` : ''}
  </body></html>`;
}

// ── Template 5: Dark Tech ─────────────────────────────────────────────────────

function renderDarkTech(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i, idx) => `<tr style="${idx % 2 === 0 ? 'background:rgba(99,102,241,0.04)' : ''}">
        <td style="color:#9ca3af;font-family:monospace;font-size:9.5pt">${esc(i.date)}</td>
        <td>${esc(i.project)}${i.description ? `<br><span style="font-size:8.5pt;color:#6b7280">${esc(i.description)}</span>` : ''}</td>
        <td style="text-align:right;font-family:monospace;color:#a78bfa">${hours(i.hours)}h</td>
        <td style="text-align:right;font-family:monospace;color:#9ca3af">${money(i.rate)}</td>
        <td style="text-align:right;font-family:monospace;color:#e2e8f0;font-weight:700">${money(i.amount)}</td>
        ${balanceTd(d, i, 'font-family:monospace;font-weight:700;')}
      </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 10.5pt; color: #e2e8f0; background: #0d1117; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; padding-bottom: 20px; border-bottom: 1px solid #30363d; }
    .logo { font-size: 20pt; font-weight: 800; color: #6366f1; font-family: monospace; letter-spacing: -1px; }
    .logo::before { content: '> '; color: #a78bfa; font-size: 16pt; }
    .contact { font-size: 9pt; color: #8b949e; text-align: right; line-height: 1.7; margin-top: 4px; }
    .inv-badge { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; padding: 10px 20px; border-radius: 6px; font-family: monospace; font-size: 11pt; font-weight: 700; letter-spacing: 0.05em; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .party { }
    .party h4 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.12em; color: #6366f1; margin: 0 0 8px; font-family: monospace; }
    .party p { margin: 0; font-size: 10pt; line-height: 1.6; color: #c9d1d9; }
    .meta { display: flex; gap: 0; margin-bottom: 28px; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
    .meta-chip { flex: 1; padding: 12px 14px; border-right: 1px solid #30363d; background: #161b22; }
    .meta-chip:last-child { border-right: none; }
    .meta-chip .lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; color: #6366f1; font-family: monospace; }
    .meta-chip .val { font-size: 10pt; color: #e2e8f0; font-weight: 600; margin-top: 3px; font-family: monospace; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #161b22; color: #6366f1; padding: 9px 10px; font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.1em; text-align: left; border-bottom: 1px solid #30363d; font-family: monospace; }
    td { padding: 8px 10px; border-bottom: 1px solid #1e2530; vertical-align: top; }
    .totals { margin-left: auto; width: 260px; border: 1px solid #30363d; border-radius: 6px; overflow: hidden; }
    .tr { display: flex; justify-content: space-between; padding: 9px 14px; border-bottom: 1px solid #30363d; font-size: 10pt; font-family: monospace; }
    .tr:last-child { border-bottom: none; }
    .tr.grand { background: linear-gradient(135deg, #4f46e5, #7c3aed); color: white; font-weight: 800; font-size: 12pt; }
    .notes { margin-top: 24px; padding: 14px 16px; background: #161b22; border: 1px solid #30363d; border-radius: 6px; border-left: 3px solid #6366f1; }
    .notes h4 { margin: 0 0 6px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #6366f1; font-family: monospace; }
    .notes p { margin: 0; font-size: 10pt; color: #8b949e; line-height: 1.5; }
  </style></head><body>
  <div class="header">
    <div><div class="logo">${esc(d.yourCompany || d.yourName)}</div>${d.yourEmail || d.yourPhone ? `<div class="contact">${d.yourEmail ? esc(d.yourEmail) : ''}${d.yourEmail && d.yourPhone ? '<br>' : ''}${d.yourPhone ? esc(d.yourPhone) : ''}</div>` : ''}</div>
    <div style="text-align:right"><div class="inv-badge">${esc(d.invoiceNumber)}</div><div style="font-size:9pt;color:#8b949e;margin-top:8px;font-family:monospace">${esc(d.invoiceDate)}</div></div>
  </div>
  <div class="parties">
    <div class="party"><h4>// from</h4><p>${addr(d.yourCompany ? `${d.yourCompany}\n${d.yourName}` : d.yourName)}${d.yourAddress ? `<br>${addr(d.yourAddress)}` : ''}${d.yourEmail ? `<br>${esc(d.yourEmail)}` : ''}${d.yourPhone ? `<br>${esc(d.yourPhone)}` : ''}</p></div>
    <div class="party"><h4>// bill_to</h4><p>${addr(d.clientName)}${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</p></div>
  </div>
  <div class="meta">
    ${d.dueDate ? `<div class="meta-chip"><div class="lbl">due_date</div><div class="val">${esc(d.dueDate)}</div></div>` : ''}
    ${d.paymentTerms ? `<div class="meta-chip"><div class="lbl">terms</div><div class="val">${esc(d.paymentTerms)}</div></div>` : ''}
    <div class="meta-chip"><div class="lbl">period</div><div class="val">${esc(d.dateRange)}</div></div>
  </div>
  <table><thead><tr><th>date</th><th>project</th><th style="text-align:right">hours</th><th style="text-align:right">rate</th><th style="text-align:right">amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div class="tr"><span style="color:#8b949e">subtotal</span><span>${money(d.subtotal)}</span></div>
    ${paymentsAppliedRow(d, 'tr')}
    <div class="tr grand"><span>TOTAL_DUE</span><span>${money(d.total)}</span></div>
  </div>
  ${d.notes ? `<div class="notes"><h4>// notes</h4><p>${esc(d.notes)}</p></div>` : ''}
  </body></html>`;
}

// ── Template 6: Contractor Formal ────────────────────────────────────────────

function renderContractorFormal(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i) => `<tr>
        <td>${esc(i.date)}</td>
        <td>${esc(i.project)}${i.description ? ` – ${esc(i.description)}` : ''}</td>
        <td class="r">${hours(i.hours)}</td>
        <td class="r">${money(i.rate)}</td>
        <td class="r">${money(i.amount)}</td>
        ${balanceTd(d, i)}
      </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: Georgia, "Times New Roman", serif; font-size: 11pt; color: #2c1810; background: #fefdf8; }
    .letterhead { text-align: center; border-bottom: 3px double #78350f; padding-bottom: 20px; margin-bottom: 28px; }
    .letterhead .company { font-size: 22pt; font-weight: bold; color: #78350f; letter-spacing: 2px; text-transform: uppercase; }
    .letterhead .tagline { font-size: 9pt; color: #a16207; margin-top: 4px; font-style: italic; }
    .letterhead .contact-line { font-size: 9pt; color: #78350f; margin-top: 6px; }
    .inv-title { text-align: center; font-size: 16pt; font-weight: bold; text-transform: uppercase; letter-spacing: 3px; color: #78350f; margin: 20px 0; border-top: 1px solid #78350f; border-bottom: 1px solid #78350f; padding: 8px 0; }
    .meta-table { width: 100%; margin-bottom: 24px; }
    .meta-table td { padding: 4px 0; font-size: 10pt; }
    .meta-table .lbl { font-weight: bold; width: 130px; color: #78350f; }
    .parties { display: flex; justify-content: space-between; margin-bottom: 28px; border: 1px solid #d4a373; padding: 16px 20px; background: #fdf6e3; }
    .party h4 { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; color: #78350f; margin: 0 0 6px; font-family: -apple-system, sans-serif; }
    .party p { margin: 0; font-size: 10pt; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #78350f; color: #fefdf8; padding: 8px 10px; font-size: 9pt; text-transform: uppercase; letter-spacing: 0.06em; text-align: left; font-family: -apple-system, sans-serif; }
    td { padding: 8px 10px; border-bottom: 1px solid #e9d5c0; font-size: 10pt; }
    .r { text-align: right; }
    .totals { margin-left: auto; width: 280px; margin-top: 8px; }
    .tr { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10.5pt; border-bottom: 1px solid #e9d5c0; }
    .tr.grand { font-weight: bold; font-size: 13pt; color: #78350f; border-top: 2px solid #78350f; border-bottom: 2px double #78350f; padding: 8px 0; margin-top: 4px; }
    .remittance { margin-top: 40px; border: 2px dashed #d4a373; padding: 16px 20px; }
    .remittance h4 { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; color: #78350f; margin: 0 0 10px; font-family: -apple-system, sans-serif; }
    .remit-row { display: flex; gap: 24px; font-size: 10pt; }
    .remit-field { flex: 1; border-bottom: 1px solid #d4a373; padding-bottom: 4px; color: #78350f; font-weight: bold; font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.06em; font-family: -apple-system, sans-serif; }
    .notes { margin-top: 20px; font-size: 10pt; font-style: italic; color: #555; line-height: 1.5; }
  </style></head><body>
  <div class="letterhead">
    <div class="company">${esc(d.yourCompany || d.yourName)}</div>
    ${d.yourCompany ? `<div class="tagline">${esc(d.yourName)}</div>` : ''}
    <div class="contact-line">${[d.yourAddress.replace(/\n/g, ', '), d.yourEmail, d.yourPhone].filter(Boolean).map(esc).join(' · ')}</div>
  </div>
  <div class="inv-title">Invoice</div>
  <table class="meta-table"><tbody>
    <tr><td class="lbl">Invoice Number:</td><td>${esc(d.invoiceNumber)}</td><td class="lbl">Invoice Date:</td><td>${esc(d.invoiceDate)}</td></tr>
    ${d.dueDate ? `<tr><td class="lbl">Payment Due:</td><td>${esc(d.dueDate)}</td><td class="lbl">Terms:</td><td>${esc(d.paymentTerms || 'Due on receipt')}</td></tr>` : ''}
    <tr><td class="lbl">Billing Period:</td><td colspan="3">${esc(d.dateRange)}</td></tr>
  </tbody></table>
  <div class="parties">
    <div class="party"><h4>Remit To</h4><p>${addr(d.yourCompany ? `${d.yourCompany}\n${d.yourName}` : d.yourName)}${d.yourAddress ? `<br>${addr(d.yourAddress)}` : ''}${d.yourEmail ? `<br>${esc(d.yourEmail)}` : ''}${d.yourPhone ? `<br>${esc(d.yourPhone)}` : ''}</p></div>
    <div class="party"><h4>Bill To</h4><p>${addr(d.clientName)}${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</p></div>
  </div>
  <table><thead><tr><th>Date</th><th>Services Rendered</th><th class="r">Hours</th><th class="r">Rate</th><th class="r">Amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div class="tr"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    ${paymentsAppliedRow(d, 'tr')}
    <div class="tr grand"><span>TOTAL DUE</span><span>${money(d.total)}</span></div>
  </div>
  ${d.notes ? `<div class="notes"><em>Note: ${esc(d.notes)}</em></div>` : ''}
  <div class="remittance">
    <h4>Remittance Stub — Please return with payment</h4>
    <div class="remit-row">
      <div class="remit-field">Invoice #: ${esc(d.invoiceNumber)}</div>
      <div class="remit-field">Amount Enclosed: $__________</div>
      <div class="remit-field">Date: __________</div>
    </div>
  </div>
  </body></html>`;
}

// ── Template 7: Two-Column Sidebar ───────────────────────────────────────────

function renderTwoColumn(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i) => `<tr>
        <td style="color:#64748b;font-size:9.5pt">${esc(i.date)}</td>
        <td>${esc(i.project)}${i.description ? `<br><span style="font-size:8.5pt;color:#94a3b8">${esc(i.description)}</span>` : ''}</td>
        <td style="text-align:right;white-space:nowrap">${hours(i.hours)}h</td>
        <td style="text-align:right">${money(i.amount)}</td>
        ${balanceTd(d, i)}
      </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 10.5pt; color: #1e293b; background: #fff; display: flex; min-height: 100vh; margin: -0.65in; }
    .t-two-column { margin: 0 !important; min-height: auto; }
    .sidebar { width: 220px; min-height: 100vh; background: #1d4ed8; color: white; padding: 36px 24px; flex-shrink: 0; }
    .sidebar .logo { font-size: 16pt; font-weight: 800; margin-bottom: 4px; }
    .sidebar .name { font-size: 9pt; opacity: 0.75; }
    .sidebar .divider { height: 1px; background: rgba(255,255,255,0.2); margin: 20px 0; }
    .sidebar h4 { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.65; margin: 0 0 8px; }
    .sidebar p { font-size: 9.5pt; line-height: 1.7; opacity: 0.9; margin: 0 0 16px; }
    .sidebar .contact p { font-size: 9pt; }
    .sidebar .inv-num { font-size: 18pt; font-weight: 800; margin-bottom: 4px; }
    .sidebar .inv-date { font-size: 9pt; opacity: 0.75; }
    .main { flex: 1; padding: 36px 32px; }
    .main-header { font-size: 26pt; font-weight: 900; color: #1d4ed8; letter-spacing: -1px; margin-bottom: 32px; }
    .info-row { display: flex; gap: 24px; margin-bottom: 28px; flex-wrap: wrap; }
    .info-box { background: #eff6ff; border-radius: 6px; padding: 12px 16px; flex: 1; min-width: 120px; }
    .info-box .lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #3b82f6; margin-bottom: 3px; }
    .info-box .val { font-size: 10pt; font-weight: 600; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #3b82f6; padding: 7px 8px; border-bottom: 2px solid #dbeafe; text-align: left; }
    td { padding: 8px 8px; border-bottom: 1px solid #f1f5f9; vertical-align: top; font-size: 10pt; }
    .total-block { background: #1d4ed8; color: white; border-radius: 10px; padding: 20px 24px; display: flex; justify-content: space-between; align-items: center; margin-top: 8px; }
    .total-block .lbl { font-size: 10pt; opacity: 0.8; }
    .total-block .amt { font-size: 22pt; font-weight: 900; }
    .notes { margin-top: 20px; font-size: 10pt; color: #475569; line-height: 1.5; }
    .notes strong { color: #3b82f6; }
  </style></head><body class="t-two-column">
  <div class="sidebar">
    <div class="logo">${esc(d.yourCompany || d.yourName)}</div>
    ${d.yourCompany ? `<div class="name">${esc(d.yourName)}</div>` : ''}
    <div class="divider"></div>
    <h4>Contact</h4>
    <div class="contact"><p>${d.yourEmail ? esc(d.yourEmail) + '<br>' : ''}${d.yourPhone ? esc(d.yourPhone) + '<br>' : ''}${d.yourAddress ? addr(d.yourAddress) : ''}</p></div>
    <div class="divider"></div>
    <h4>Bill To</h4>
    <p>${addr(d.clientName)}${d.clientAddress ? '<br>' + addr(d.clientAddress) : ''}</p>
    <div class="divider"></div>
    <h4>Invoice</h4>
    <div class="inv-num">${esc(d.invoiceNumber)}</div>
    <div class="inv-date">${esc(d.invoiceDate)}</div>
    ${d.dueDate ? `<div style="margin-top:12px"><h4>Due Date</h4><div style="font-size:10pt;font-weight:700">${esc(d.dueDate)}</div></div>` : ''}
  </div>
  <div class="main">
    <div class="main-header">Invoice</div>
    <div class="info-row">
      ${d.paymentTerms ? `<div class="info-box"><div class="lbl">Terms</div><div class="val">${esc(d.paymentTerms)}</div></div>` : ''}
      <div class="info-box"><div class="lbl">Period</div><div class="val">${esc(d.dateRange)}</div></div>
      <div class="info-box"><div class="lbl">Items</div><div class="val">${d.lineItems.length}</div></div>
    </div>
    <table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Hours</th><th style="text-align:right">Amount</th>${balanceTh(d)}</tr></thead>
    <tbody>${rows}</tbody></table>
    ${d.paymentsApplied >= 0.005 ? `<div style="display:flex;justify-content:space-between;padding:8px 4px;font-size:10pt;color:#3b82f6"><span>Retainer / payments applied</span><span>${money(-d.paymentsApplied)}</span></div>` : ''}
    <div class="total-block"><div class="lbl">Total Due${d.dueDate ? `<br><small style="opacity:0.65">Due ${esc(d.dueDate)}</small>` : ''}</div><div class="amt">${money(d.total)}</div></div>
    ${d.notes ? `<div class="notes"><strong>Note:</strong> ${esc(d.notes)}</div>` : ''}
  </div>
  </body></html>`;
}

// ── Template 8: Stripe-Inspired ──────────────────────────────────────────────

function renderStripeInspired(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i) => `<tr>
        <td style="color:#6b7280">${esc(i.date)}</td>
        <td>${esc(i.project)}${i.description ? `<div style="font-size:9pt;color:#9ca3af;margin-top:2px">${esc(i.description)}</div>` : ''}</td>
        <td style="text-align:right;color:#374151">${hours(i.hours)}h × ${money(i.rate)}</td>
        <td style="text-align:right;font-weight:600;color:#111827">${money(i.amount)}</td>
        ${balanceTd(d, i, 'font-weight:600;')}
      </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 11pt; color: #111827; background: #fff; }
    .top-bar { height: 4px; background: #635bff; margin: -0.65in -0.65in 36px; }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 44px; }
    .co { font-size: 13pt; font-weight: 700; color: #111827; }
    .co-contact { font-size: 9pt; color: #6b7280; margin-top: 4px; line-height: 1.6; }
    .inv-area { text-align: right; }
    .inv-area .word { font-size: 11pt; text-transform: uppercase; letter-spacing: 0.15em; color: #635bff; font-weight: 700; }
    .inv-area .num { font-size: 24pt; font-weight: 800; color: #111827; line-height: 1; }
    .inv-area .date { font-size: 9pt; color: #6b7280; margin-top: 4px; }
    .amount-due-block { background: #f9fafb; border: 1px solid #e5e7eb; border-radius: 12px; padding: 24px 28px; display: flex; justify-content: space-between; align-items: center; margin-bottom: 32px; }
    .adb-left .lbl { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; font-weight: 600; }
    .adb-left .amt { font-size: 28pt; font-weight: 800; color: #111827; margin-top: 4px; }
    .adb-right { text-align: right; font-size: 10pt; line-height: 1.7; }
    .adb-right strong { color: #111827; }
    .adb-right span { color: #6b7280; }
    .to-section { margin-bottom: 28px; }
    .to-section .lbl { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; color: #6b7280; font-weight: 600; margin-bottom: 4px; }
    .to-section .val { font-size: 11pt; font-weight: 600; }
    .to-section .addr { font-size: 10pt; color: #374151; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; }
    th { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; padding: 6px 0 10px; border-bottom: 1px solid #e5e7eb; text-align: left; font-weight: 600; }
    td { padding: 12px 0; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
    .totals { margin-top: 16px; }
    .total-line { display: flex; justify-content: space-between; padding: 8px 0; font-size: 10.5pt; color: #6b7280; border-bottom: 1px solid #f3f4f6; }
    .total-line.final { font-size: 13pt; font-weight: 800; color: #111827; border-bottom: none; border-top: 2px solid #111827; padding-top: 12px; margin-top: 6px; }
    .notes { margin-top: 32px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 10pt; color: #374151; line-height: 1.5; }
    .notes .lbl { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.1em; color: #9ca3af; font-weight: 600; margin-bottom: 6px; }
  </style></head><body>
  <div class="top-bar"></div>
  <div class="header">
    <div><div class="co">${esc(d.yourCompany || d.yourName)}</div><div class="co-contact">${d.yourCompany ? esc(d.yourName) + '<br>' : ''}${d.yourAddress ? addr(d.yourAddress) + '<br>' : ''}${d.yourEmail ? esc(d.yourEmail) + '<br>' : ''}${d.yourPhone ? esc(d.yourPhone) : ''}</div></div>
    <div class="inv-area"><div class="word">Invoice</div><div class="num">${esc(d.invoiceNumber)}</div><div class="date">${esc(d.invoiceDate)}</div></div>
  </div>
  <div class="amount-due-block">
    <div class="adb-left"><div class="lbl">Amount Due</div><div class="amt">${money(d.total)}</div></div>
    <div class="adb-right">${d.dueDate ? `<div><span>Due </span><strong>${esc(d.dueDate)}</strong></div>` : ''}${d.paymentTerms ? `<div><span>Terms: </span><strong>${esc(d.paymentTerms)}</strong></div>` : ''}<div><span>Period: </span><strong>${esc(d.dateRange)}</strong></div></div>
  </div>
  <div class="to-section"><div class="lbl">Billed To</div><div class="val">${esc(d.clientName)}</div>${d.clientAddress ? `<div class="addr">${addr(d.clientAddress)}</div>` : ''}</div>
  <table><thead><tr><th>Date</th><th>Description</th><th style="text-align:right">Details</th><th style="text-align:right">Amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div class="total-line"><span>Subtotal</span><span>${money(d.subtotal)}</span></div>
    ${paymentsAppliedRow(d, 'total-line')}
    <div class="total-line final"><span>Total Due</span><span>${money(d.total)}</span></div>
  </div>
  ${d.notes ? `<div class="notes"><div class="lbl">Notes</div>${esc(d.notes)}</div>` : ''}
  </body></html>`;
}

// ── Template 9: Creative Color (Emerald) ─────────────────────────────────────

function renderCreativeColor(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i, idx) => `<tr style="background:${idx % 2 === 0 ? '#f0fdf9' : '#fff'}">
        <td>${esc(i.date)}</td>
        <td>${esc(i.project)}${i.description ? `<br><em style="font-size:8.5pt;color:#6b7280">${esc(i.description)}</em>` : ''}</td>
        <td style="text-align:right;color:#059669">${hours(i.hours)}h</td>
        <td style="text-align:right;color:#374151">${money(i.rate)}</td>
        <td style="text-align:right;font-weight:700;color:#064e3b">${money(i.amount)}</td>
        ${balanceTd(d, i, 'font-weight:700;')}
      </tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 10.5pt; color: #1a2e1a; background: #fff; }
    .hero { background: linear-gradient(120deg, #059669 0%, #10b981 50%, #34d399 100%); color: white; margin: -0.65in -0.65in 32px; padding: 32px 40px; }
    .hero-inner { display: flex; justify-content: space-between; align-items: flex-start; }
    .hero .co { font-size: 22pt; font-weight: 900; letter-spacing: -0.5px; }
    .hero .tagline { font-size: 9pt; opacity: 0.8; margin-top: 2px; }
    .hero .inv-area { text-align: right; }
    .hero .inv-label { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.12em; opacity: 0.75; }
    .hero .inv-num { font-size: 22pt; font-weight: 900; }
    .hero .inv-date { font-size: 9pt; opacity: 0.8; margin-top: 2px; }
    .total-pill { display: inline-block; background: rgba(255,255,255,0.2); border-radius: 999px; padding: 8px 24px; font-size: 16pt; font-weight: 900; margin-top: 12px; }
    .parties { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }
    .party { border-left: 4px solid #10b981; padding: 12px 16px; background: #f0fdf9; border-radius: 0 8px 8px 0; }
    .party h4 { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.1em; color: #059669; margin: 0 0 6px; }
    .party p { margin: 0; font-size: 10pt; line-height: 1.6; }
    .meta-bar { display: flex; gap: 12px; margin-bottom: 24px; }
    .meta-tag { background: #ecfdf5; border: 1px solid #a7f3d0; border-radius: 6px; padding: 8px 14px; flex: 1; }
    .meta-tag .lbl { font-size: 7.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #059669; }
    .meta-tag .val { font-size: 10pt; font-weight: 600; color: #064e3b; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
    th { background: #059669; color: white; padding: 8px 10px; font-size: 8pt; text-transform: uppercase; letter-spacing: 0.07em; text-align: left; }
    td { padding: 8px 10px; border-bottom: 1px solid #d1fae5; vertical-align: top; }
    .totals { margin-left: auto; width: 260px; }
    .tr { display: flex; justify-content: space-between; padding: 5px 0; font-size: 10.5pt; border-bottom: 1px solid #d1fae5; }
    .tr.grand { font-weight: 900; font-size: 14pt; color: #059669; border: 2px solid #059669; border-radius: 8px; padding: 10px 14px; margin-top: 8px; background: #ecfdf5; }
    .notes { margin-top: 24px; padding: 14px 16px; background: #ecfdf5; border-radius: 8px; font-size: 10pt; line-height: 1.5; }
    .notes strong { color: #059669; }
  </style></head><body>
  <div class="hero">
    <div class="hero-inner">
      <div><div class="co">${esc(d.yourCompany || d.yourName)}</div><div class="tagline">${d.yourCompany ? esc(d.yourName) : ''}${d.yourEmail ? ` · ${esc(d.yourEmail)}` : ''}</div></div>
      <div class="inv-area"><div class="inv-label">Invoice</div><div class="inv-num">${esc(d.invoiceNumber)}</div><div class="inv-date">${esc(d.invoiceDate)}</div></div>
    </div>
    <div class="total-pill">Total Due: ${money(d.total)}</div>
  </div>
  <div class="parties">
    <div class="party"><h4>From</h4><p>${addr(d.yourCompany ? `${d.yourCompany} · ${d.yourName}` : d.yourName)}${d.yourAddress ? `<br>${addr(d.yourAddress)}` : ''}${d.yourEmail ? `<br>${esc(d.yourEmail)}` : ''}${d.yourPhone ? `<br>${esc(d.yourPhone)}` : ''}</p></div>
    <div class="party"><h4>Bill To</h4><p>${addr(d.clientName)}${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</p></div>
  </div>
  <div class="meta-bar">
    ${d.dueDate ? `<div class="meta-tag"><div class="lbl">Due Date</div><div class="val">${esc(d.dueDate)}</div></div>` : ''}
    ${d.paymentTerms ? `<div class="meta-tag"><div class="lbl">Terms</div><div class="val">${esc(d.paymentTerms)}</div></div>` : ''}
    <div class="meta-tag"><div class="lbl">Billing Period</div><div class="val">${esc(d.dateRange)}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Project / Work</th><th style="text-align:right">Hours</th><th style="text-align:right">Rate</th><th style="text-align:right">Amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="totals">
    <div class="tr"><span style="color:#6b7280">Subtotal</span><span>${money(d.subtotal)}</span></div>
    ${paymentsAppliedRow(d, 'tr')}
    <div class="tr grand"><span>Total Due</span><span>${money(d.total)}</span></div>
  </div>
  ${d.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(d.notes)}</div>` : ''}
  </body></html>`;
}

// ── Template 10: Simple Text / Statement ─────────────────────────────────────

function renderSimpleText(d: InvoiceData): string {
  const rows = d.lineItems
    .map(
      (i) =>
        `<tr><td style="font-family:monospace;font-size:10pt;padding:4px 8px;border-bottom:1px solid #e5e5e5;white-space:nowrap">${esc(i.date)}</td>
         <td style="padding:4px 8px;border-bottom:1px solid #e5e5e5">${esc(i.project)}${i.description ? ` (${esc(i.description)})` : ''}</td>
         <td style="text-align:right;font-family:monospace;padding:4px 8px;border-bottom:1px solid #e5e5e5;white-space:nowrap">${hours(i.hours)}h @ ${money(i.rate)}</td>
         <td style="text-align:right;font-family:monospace;font-weight:bold;padding:4px 8px;border-bottom:1px solid #e5e5e5">${money(i.amount)}</td>
         ${balanceTd(d, i, 'font-family:monospace;font-weight:bold;padding:4px 8px;border-bottom:1px solid #e5e5e5;')}</tr>`
    )
    .join('');
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    ${BASE_PRINT_CSS}
    body { font-family: -apple-system, Helvetica Neue, Arial, sans-serif; font-size: 11pt; color: #111; background: #fff; }
    pre, .mono { font-family: "Courier New", Courier, monospace; }
    .header { border: 2px solid #111; padding: 20px 24px; margin-bottom: 24px; }
    .header .title { font-size: 9pt; text-transform: uppercase; letter-spacing: 0.2em; color: #666; margin-bottom: 8px; }
    .header .inv-num { font-size: 20pt; font-weight: 900; font-family: "Courier New", monospace; }
    .header .meta { margin-top: 8px; font-size: 10pt; color: #444; }
    .header .meta span { font-weight: bold; }
    .from-to { display: flex; justify-content: space-between; margin-bottom: 24px; }
    .ft-box { border-top: 2px solid #111; padding-top: 12px; width: 48%; }
    .ft-box .ft-label { font-size: 8pt; text-transform: uppercase; letter-spacing: 0.15em; color: #666; margin-bottom: 6px; }
    .ft-box .ft-val { font-size: 10.5pt; line-height: 1.6; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
    th { font-size: 8.5pt; text-transform: uppercase; letter-spacing: 0.08em; color: #333; padding: 6px 8px; border-bottom: 2px solid #111; text-align: left; background: #f5f5f5; }
    .subtotal-line { display: flex; justify-content: space-between; padding: 6px 8px; font-size: 10.5pt; border-bottom: 1px solid #ddd; }
    .total-line { display: flex; justify-content: space-between; padding: 10px 8px; font-size: 13pt; font-weight: 900; font-family: "Courier New", monospace; border-top: 2px solid #111; border-bottom: 2px solid #111; margin-top: 4px; }
    .notes { margin-top: 24px; padding-top: 12px; border-top: 1px solid #ddd; font-size: 10pt; color: #444; line-height: 1.5; }
    .notes strong { color: #111; }
  </style></head><body>
  <div class="header">
    <div class="title">Statement of Services</div>
    <div class="inv-num">${esc(d.invoiceNumber)}</div>
    <div class="meta">
      <span>Date:</span> ${esc(d.invoiceDate)}
      ${d.dueDate ? ` &nbsp;·&nbsp; <span>Due:</span> ${esc(d.dueDate)}` : ''}
      ${d.paymentTerms ? ` &nbsp;·&nbsp; <span>Terms:</span> ${esc(d.paymentTerms)}` : ''}
      &nbsp;·&nbsp; <span>Period:</span> ${esc(d.dateRange)}
    </div>
  </div>
  <div class="from-to">
    <div class="ft-box"><div class="ft-label">From</div><div class="ft-val">${addr(d.yourCompany ? `${d.yourCompany}\n${d.yourName}` : d.yourName)}${d.yourAddress ? `<br>${addr(d.yourAddress)}` : ''}${d.yourEmail ? `<br>${esc(d.yourEmail)}` : ''}${d.yourPhone ? `<br>${esc(d.yourPhone)}` : ''}</div></div>
    <div class="ft-box"><div class="ft-label">Bill To</div><div class="ft-val">${addr(d.clientName)}${d.clientAddress ? `<br>${addr(d.clientAddress)}` : ''}</div></div>
  </div>
  <table><thead><tr><th>Date</th><th>Project</th><th style="text-align:right">Hours / Rate</th><th style="text-align:right">Amount</th>${balanceTh(d)}</tr></thead>
  <tbody>${rows}</tbody></table>
  <div class="subtotal-line"><span>Subtotal</span><span style="font-family:monospace">${money(d.subtotal)}</span></div>
  ${paymentsAppliedRow(d, 'subtotal-line')}
  <div class="total-line"><span>TOTAL DUE</span><span>${money(d.total)}</span></div>
  ${d.notes ? `<div class="notes"><strong>Notes:</strong> ${esc(d.notes)}</div>` : ''}
  </body></html>`;
}

// ── Template registry ─────────────────────────────────────────────────────────

export const invoiceTemplates: InvoiceTemplate[] = [
  { id: 1, name: 'Classic Minimal', description: 'Clean, professional black & white', primaryColor: '#1a1a1a', accentColor: '#e8e8e8', isDark: false, render: renderClassicMinimal },
  { id: 2, name: 'Modern Gradient', description: 'Blue-to-indigo gradient header', primaryColor: '#1e3a8a', accentColor: '#6366f1', isDark: false, render: renderModernGradient },
  { id: 3, name: 'Itemized Detail', description: 'Grouped by project with subtotals', primaryColor: '#0f766e', accentColor: '#10b981', isDark: false, render: renderItemizedDetail },
  { id: 4, name: 'Executive Summary', description: 'Project totals, no line items', primaryColor: '#7c3aed', accentColor: '#a78bfa', isDark: false, render: renderExecutiveSummary },
  { id: 5, name: 'Dark Tech', description: 'Developer-themed dark design', primaryColor: '#0d1117', accentColor: '#6366f1', isDark: true, render: renderDarkTech },
  { id: 6, name: 'Contractor Formal', description: 'Traditional letterhead style', primaryColor: '#78350f', accentColor: '#d97706', isDark: false, render: renderContractorFormal },
  { id: 7, name: 'Two-Column', description: 'Colored sidebar with details', primaryColor: '#1d4ed8', accentColor: '#3b82f6', isDark: false, render: renderTwoColumn },
  { id: 8, name: 'Stripe-Inspired', description: 'Ultra-clean modern SaaS look', primaryColor: '#635bff', accentColor: '#0f172a', isDark: false, render: renderStripeInspired },
  { id: 9, name: 'Creative Color', description: 'Emerald green with bold style', primaryColor: '#059669', accentColor: '#34d399', isDark: false, render: renderCreativeColor },
  { id: 10, name: 'Simple Text', description: 'Monospace statement style', primaryColor: '#111111', accentColor: '#666666', isDark: false, render: renderSimpleText },
];
