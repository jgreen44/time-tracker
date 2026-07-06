/**
 * Pure helper functions used by the invoice pipeline.
 *
 * Keeping them separate from main.ts allows them to be unit-tested
 * without requiring an Electron or database environment.
 */

import { InvoiceData, InvoiceLineItem, InvoiceTemplate, invoiceTemplates } from './invoice-templates';

// ── Date / time formatting ────────────────────────────────────────────────────

export function formatLocalDate(ms: number): string {
  return new Date(ms).toLocaleDateString();
}

export function formatLocalTime(ms: number): string {
  return new Date(ms).toLocaleTimeString();
}

// ── Invoice data construction ─────────────────────────────────────────────────

export interface InvoiceFormParams {
  templateId: number;
  invoiceNumber: string;
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
  rangeFrom: number | null;
  rangeTo: number | null;
  projectId: number | null;
}

export const SAMPLE_LINE_ITEMS: InvoiceLineItem[] = [
  { project: 'Web Development', date: '7/1/2026',  description: 'Frontend development',      hours: 4.5, rate: 150, amount: 675 },
  { project: 'Web Development', date: '7/3/2026',  description: 'API integration',             hours: 3.0, rate: 150, amount: 450 },
  { project: 'Web Development', date: '7/7/2026',  description: 'Code review & testing',       hours: 2.0, rate: 150, amount: 300 },
  { project: 'Design',          date: '7/10/2026', description: 'UI mockups & wireframes',     hours: 5.0, rate: 125, amount: 625 },
  { project: 'Design',          date: '7/14/2026', description: 'Design revisions',            hours: 2.5, rate: 125, amount: 312.50 },
  { project: 'Web Development', date: '7/18/2026', description: 'Performance optimization',    hours: 3.5, rate: 150, amount: 525 },
  { project: 'Web Development', date: '7/22/2026', description: 'Bug fixes & deployment',      hours: 4.0, rate: 150, amount: 600 },
];

/**
 * Build an InvoiceData object from form parameters and pre-fetched line items.
 *
 * Separating the DB fetch (in main.ts) from the data assembly (here) keeps this
 * function pure and fully testable.
 *
 * @param params       Form values from the renderer
 * @param lineItems    Pre-fetched & computed line items (pass SAMPLE_LINE_ITEMS when no real data)
 * @param dateRange    Human-readable date range string for the invoice header
 */
export function buildInvoiceData(
  params: InvoiceFormParams,
  lineItems: InvoiceLineItem[],
  dateRange: string
): InvoiceData {
  const subtotal = lineItems.reduce((s, i) => s + i.amount, 0);
  return {
    invoiceNumber: params.invoiceNumber || 'INV-0001',
    invoiceDate:   formatLocalDate(Date.now()),
    dueDate:       params.dueDate       || 'Net 30',
    paymentTerms:  params.paymentTerms  || 'Net 30',
    yourName:      params.yourName      || '',
    yourCompany:   params.yourCompany   || '',
    yourAddress:   params.yourAddress   || '',
    yourEmail:     params.yourEmail     || '',
    yourPhone:     params.yourPhone     || '',
    clientName:    params.clientName    || '',
    clientAddress: params.clientAddress || '',
    notes:         params.notes         || '',
    dateRange,
    projectName: params.projectId ? (lineItems[0]?.project ?? '') : '',
    lineItems,
    subtotal,
    total: subtotal,
  };
}

// ── Preview HTML construction ─────────────────────────────────────────────────

/**
 * CSS injected into every preview window to simulate @page margins on screen.
 *
 * Strategy:
 *  - <html> gets a grey background so the white invoice floats as a card.
 *  - <body> gets 40px / 36px padding to match the 0.65in @page margins used
 *    for print — so content has the same inset on screen as on paper.
 *  - Template 7 (Two-Column) uses body-level flex + full-bleed sidebar, so it
 *    gets the .t-two-column class and is exempted from body padding.
 *  - The three genuinely full-bleed elements (.inv-banner, .top-bar, .hero)
 *    use NEGATIVE margins equal to the body padding to re-escape it and
 *    span the full sheet width — just as they escape @page margins for print.
 *    Each class name is unique to its template so there is no cross-template
 *    collision.
 */
export const PREVIEW_SCREEN_CSS = `<style>
  @media screen {
    html { background: #e5e7eb; padding: 24px; box-sizing: border-box; }

    /* Default: all templates get padding that mimics @page margins */
    body {
      margin: 0 !important;
      padding: 36px 40px 40px !important;
      box-shadow: 0 4px 24px rgba(0,0,0,0.12);
    }

    /* Template 7 (Two-Column): full-bleed sidebar layout — no body padding */
    body.t-two-column {
      padding: 0 !important;
    }

    /* Template 2 – gradient banner (.inv-banner) */
    .inv-banner {
      margin-left: -40px !important;
      margin-right: -40px !important;
      margin-top: -36px !important;
    }

    /* Template 8 – thin colour bar (.top-bar) */
    .top-bar {
      margin-left: -40px !important;
      margin-right: -40px !important;
      margin-top: -36px !important;
    }

    /* Template 9 – full-bleed hero (.hero) */
    .hero {
      margin-left: -40px !important;
      margin-right: -40px !important;
      margin-top: -36px !important;
      border-radius: 0 !important;
    }
  }
</style>`;

export function buildPreviewHtml(templateId: number, data: InvoiceData): string {
  const template: InvoiceTemplate = invoiceTemplates.find((t) => t.id === templateId) ?? invoiceTemplates[0];
  return template.render(data).replace('</head>', `${PREVIEW_SCREEN_CSS}</head>`);
}

export function findTemplate(templateId: number): InvoiceTemplate {
  return invoiceTemplates.find((t) => t.id === templateId) ?? invoiceTemplates[0];
}

// ── Entry → line item conversion ──────────────────────────────────────────────

export interface RawEntry {
  project_name: string;
  started_at: number;
  ended_at: number | null;
  note: string | null;
  hourly_rate: number | null;
}

export function entriesToLineItems(entries: RawEntry[]): InvoiceLineItem[] {
  return entries
    .filter((e): e is RawEntry & { ended_at: number } => e.ended_at !== null)
    .map((e) => {
      const hrs  = (e.ended_at - e.started_at) / 3_600_000;
      const rate = e.hourly_rate ?? 0;
      return {
        project:     e.project_name,
        date:        formatLocalDate(e.started_at),
        description: e.note ?? '',
        hours:       hrs,
        rate,
        amount:      hrs * rate,
      };
    });
}
