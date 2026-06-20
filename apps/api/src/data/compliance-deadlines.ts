// Recurring Philippine compliance deadlines (BIR/SSS/PhilHealth/Pag-IBIG/DOLE).
// Ported from the pdfphile project's config/compliance-deadlines.json — the
// statutory rules as of April 2026 (post-RA 11976 / TRAIN). These derive into
// GET /api/calendar at read time as read-only `compliance_deadline` events.
//
// IMPORTANT: when a deadline lands on a weekend or holiday the next business
// day applies — NOT computed here. `dueDay` for month-end filings (e.g. SSS) is
// clamped to the actual last day of the month by the generator. Which filings
// apply depends on the business's registration (corp vs. individual, VAT vs.
// non-VAT, with/without employees) — all are surfaced; filter what doesn't fit.
export const COMPLIANCE_SOURCES =
  "BIR RR 11-2018, RA 11976 (Ease of Paying Taxes), SSS Circular 2019-009, " +
  "PhilHealth Circular 02-2024, HDMF Memo Circular 277, DOLE D.O. 238-23";

export type ComplianceAgency = "bir" | "sss" | "philhealth" | "pagibig" | "dole";
export type ComplianceFrequency = "monthly" | "quarterly" | "annual";

export interface ComplianceDeadline {
  id: string;
  form: string;
  agency: ComplianceAgency;
  name: string;
  frequency: ComplianceFrequency;
  dueDay?: number; // monthly: day-of-month (clamped to month length)
  dueDates?: string[]; // quarterly/annual: ["MM-DD", ...]
}

export const COMPLIANCE_DEADLINES: ComplianceDeadline[] = [
  // ── Monthly ──────────────────────────────────────────
  { id: "1601-c-monthly", form: "bir-1601C", agency: "bir", name: "Monthly Compensation Withholding Tax", frequency: "monthly", dueDay: 10 },
  { id: "0619-e-monthly", form: "bir-0619-E", agency: "bir", name: "Monthly Expanded Withholding Tax Remittance", frequency: "monthly", dueDay: 10 },
  { id: "0619-f-monthly", form: "bir-0619-F", agency: "bir", name: "Monthly Final Withholding Tax Remittance", frequency: "monthly", dueDay: 10 },
  { id: "sss-r5-monthly", form: "sss-r-5", agency: "sss", name: "SSS Contribution Payment (R-5)", frequency: "monthly", dueDay: 30 },
  { id: "philhealth-rf1-monthly", form: "philhealth-rf1", agency: "philhealth", name: "PhilHealth Premium Remittance (RF1)", frequency: "monthly", dueDay: 15 },
  { id: "pagibig-mcrf-monthly", form: "pagibig-PFF053", agency: "pagibig", name: "Pag-IBIG Membership Contribution (MCRF)", frequency: "monthly", dueDay: 10 },

  // ── Quarterly ────────────────────────────────────────
  { id: "1701q-quarterly", form: "bir-1701Q", agency: "bir", name: "Quarterly Income Tax — Individual", frequency: "quarterly", dueDates: ["05-15", "08-15", "11-15"] },
  { id: "1702q-quarterly", form: "bir-1702Q", agency: "bir", name: "Quarterly Income Tax — Corporation", frequency: "quarterly", dueDates: ["05-29", "08-29", "11-29", "04-15"] },
  { id: "2550q-quarterly", form: "bir-2550Q", agency: "bir", name: "Quarterly VAT Return", frequency: "quarterly", dueDates: ["04-25", "07-25", "10-25", "01-25"] },
  { id: "2551q-quarterly", form: "bir-2551Q", agency: "bir", name: "Quarterly Percentage Tax Return", frequency: "quarterly", dueDates: ["04-25", "07-25", "10-25", "01-25"] },
  { id: "1601-eq-quarterly", form: "bir-1601-EQ", agency: "bir", name: "Quarterly Expanded Withholding Tax + QAP", frequency: "quarterly", dueDates: ["04-30", "07-31", "10-31", "01-31"] },
  { id: "1601-fq-quarterly", form: "bir-1601-FQ", agency: "bir", name: "Quarterly Final Withholding Tax", frequency: "quarterly", dueDates: ["04-30", "07-31", "10-31", "01-31"] },

  // ── Annual ───────────────────────────────────────────
  { id: "2316-annual", form: "bir-2316", agency: "bir", name: "Annual Compensation Certificate (per employee)", frequency: "annual", dueDates: ["01-31"] },
  { id: "1604-c-annual", form: "bir-1604-C", agency: "bir", name: "Annual Information Return — Compensation", frequency: "annual", dueDates: ["01-31"] },
  { id: "1604-e-annual", form: "bir-1604-E", agency: "bir", name: "Annual Information Return — Expanded WHT", frequency: "annual", dueDates: ["03-01"] },
  { id: "1604-f-annual", form: "bir-1604-F", agency: "bir", name: "Annual Information Return — Final WHT", frequency: "annual", dueDates: ["01-31"] },
  { id: "1700-annual", form: "bir-1700", agency: "bir", name: "Annual ITR — Pure Compensation Earner", frequency: "annual", dueDates: ["04-15"] },
  { id: "1701-annual", form: "bir-1701", agency: "bir", name: "Annual ITR — Mixed Income / Itemized", frequency: "annual", dueDates: ["04-15"] },
  { id: "1701a-annual", form: "bir-1701A", agency: "bir", name: "Annual ITR — 8% Optional / OSD", frequency: "annual", dueDates: ["04-15"] },
  { id: "1702-annual", form: "bir-1702-RT", agency: "bir", name: "Annual ITR — Corporation (Regular Rate)", frequency: "annual", dueDates: ["04-15"] },
  { id: "dole-rks5-annual", form: "dole-rks-form-5", agency: "dole", name: "Annual Establishment Report (RKS Form 5)", frequency: "annual", dueDates: ["01-31"] },
];
