// Domo fiscal calendar — fiscal year starts Feb 1.
// Mirrors the Python helper the user provided in the chat.

export type WindowKey =
  | "current_quarter"
  | "current_fy_to_date"
  | "trailing_12_months"
  | "trailing_24_months";

export const WINDOW_LABELS: Record<WindowKey, string> = {
  current_quarter: "Current quarter",
  current_fy_to_date: "FY to date",
  trailing_12_months: "Trailing 12 mo",
  trailing_24_months: "Trailing 24 mo",
};

export const DEFAULT_WINDOW: WindowKey = "current_fy_to_date";

function pad(n: number): string {
  return n.toString().padStart(2, "0");
}

export function isoDate(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

/** Fiscal year start for a given date — Domo FY runs Feb 1 -> Jan 31. */
export function fiscalYearStart(d: Date): Date {
  const fyYear = d.getMonth() >= 1 ? d.getFullYear() : d.getFullYear() - 1;
  return new Date(fyYear, 1, 1); // Feb = month index 1
}

/** Fiscal quarter start (Q1 = Feb-Apr, Q2 = May-Jul, Q3 = Aug-Oct, Q4 = Nov-Jan). */
export function fiscalQuarterStart(d: Date): Date {
  const fyStart = fiscalYearStart(d);
  const monthsIn =
    (d.getFullYear() - fyStart.getFullYear()) * 12 +
    (d.getMonth() - fyStart.getMonth());
  const qIdx = Math.floor(monthsIn / 3); // 0..3
  const start = new Date(fyStart);
  start.setMonth(fyStart.getMonth() + qIdx * 3);
  return start;
}

/** Fiscal year label (FY26 means the year ending Jan 31, 2026). */
export function fiscalYearLabel(d: Date): string {
  // FY label = the calendar year containing Jan 31 of that FY, two-digit.
  const fy = d.getMonth() >= 1 ? d.getFullYear() + 1 : d.getFullYear();
  return `FY${String(fy).slice(-2)}`;
}

export function fiscalQuarterLabel(d: Date): string {
  const fyStart = fiscalYearStart(d);
  const monthsIn =
    (d.getFullYear() - fyStart.getFullYear()) * 12 +
    (d.getMonth() - fyStart.getMonth());
  const qIdx = Math.floor(monthsIn / 3) + 1; // 1..4
  return `${fiscalYearLabel(d)} Q${qIdx}`;
}

export type DateRange = { start: Date; end: Date; label: string };

export function dateRangeFor(window: WindowKey, today: Date = new Date()): DateRange {
  switch (window) {
    case "current_quarter":
      return {
        start: fiscalQuarterStart(today),
        end: today,
        label: fiscalQuarterLabel(today),
      };
    case "current_fy_to_date":
      return {
        start: fiscalYearStart(today),
        end: today,
        label: `${fiscalYearLabel(today)} to date`,
      };
    case "trailing_12_months": {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 1);
      return { start, end: today, label: "Trailing 12 months" };
    }
    case "trailing_24_months": {
      const start = new Date(today);
      start.setFullYear(start.getFullYear() - 2);
      return { start, end: today, label: "Trailing 24 months" };
    }
  }
}
