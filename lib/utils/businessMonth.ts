/**
 * Centralized Business Month Utilities for BLOW SALON ERP.
 * 
 * Salon Business Month Rule:
 * Business Month = 6th of one month → 5th of the next month.
 * 
 * - If the date is 6th through the end of month:
 *   Belongs to business month starting on 6th of current month, ending 5th of next month.
 * - If the date is 1st through 5th:
 *   Belongs to business month starting on 6th of previous month, ending 5th of current month.
 * 
 * Naming / Display Rule:
 * The business month is labeled according to its START month:
 * - 6 Oct 2026 – 5 Nov 2026 → "October 2026"
 * - 6 Sep 2026 – 5 Oct 2026 → "September 2026"
 * - 6 Dec 2026 – 5 Jan 2027 → "December 2026"
 * - 6 Jan 2027 – 5 Feb 2027 → "January 2027"
 */

import { toLocalDateString } from "./date";

export interface BusinessMonth {
  /** Identifier of the business month based on its start month: "YYYY-MM" (e.g. "2026-10") */
  monthKey: string;
  /** Year of the start date (e.g. 2026) */
  year: number;
  /** 0-indexed month of the start date (0 = Jan, 9 = Oct) */
  monthIndex: number;
  /** Start Date: 6th of start month at 00:00:00.000 local time */
  startDate: Date;
  /** End Date: 5th of next month at 23:59:59.999 local time */
  endDate: Date;
  /** Next business month start (6th of next month at 00:00:00.000) for exclusive range queries */
  nextMonthStartDate: Date;
  /** Start date formatted as "YYYY-MM-DD" (e.g. "2026-10-06") */
  startDateStr: string;
  /** End date formatted as "YYYY-MM-DD" (e.g. "2026-11-05") */
  endDateStr: string;
  /** Primary label based on start month (e.g. "October 2026") */
  label: string;
  /** Formatted range string (e.g. "6 Oct – 5 Nov 2026" or "6 Dec 2026 – 5 Jan 2027") */
  rangeLabel: string;
  /** Full descriptive label (e.g. "October 2026 (6 Oct – 5 Nov)") */
  fullLabel: string;
  /** Array of all dates (YYYY-MM-DD) in this business month period */
  daysInPeriod: string[];
}

/**
 * Parses any date-like input (Date, Timestamp, ISO string, YYYY-MM-DD string, or YYYY-MM monthKey)
 * into a local Date object.
 */
function parseDateInput(input?: Date | string | number | any): { year: number; month: number; day: number; isMonthKeyOnly: boolean } {
  const now = new Date();
  if (!input) {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      isMonthKeyOnly: false,
    };
  }

  // Case 1: String in "YYYY-MM" format (treated as business month selector key)
  if (typeof input === "string" && /^\d{4}-\d{2}$/.test(input.trim())) {
    const [yStr, mStr] = input.trim().split("-");
    const y = parseInt(yStr, 10);
    const m = parseInt(mStr, 10) - 1;
    return {
      year: y,
      month: m,
      day: 6, // 6th is the start of that business month
      isMonthKeyOnly: true,
    };
  }

  // Case 2: String in "YYYY-MM-DD" format
  if (typeof input === "string" && /^\d{4}-\d{2}-\d{2}/.test(input.trim())) {
    const parts = input.trim().slice(0, 10).split("-");
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    return { year: y, month: m, day: d, isMonthKeyOnly: false };
  }

  // Case 3: Firestore Timestamp or Date object or milliseconds
  let dObj: Date;
  if (input instanceof Date) {
    dObj = input;
  } else if (typeof input?.toDate === "function") {
    dObj = input.toDate();
  } else {
    dObj = new Date(input);
  }

  if (isNaN(dObj.getTime())) {
    return {
      year: now.getFullYear(),
      month: now.getMonth(),
      day: now.getDate(),
      isMonthKeyOnly: false,
    };
  }

  return {
    year: dObj.getFullYear(),
    month: dObj.getMonth(),
    day: dObj.getDate(),
    isMonthKeyOnly: false,
  };
}

/**
 * Resolves the full BusinessMonth metadata for any given date or business month key ("YYYY-MM").
 */
export function getBusinessMonth(dateInput?: Date | string | number | any): BusinessMonth {
  const { year, month, day, isMonthKeyOnly } = parseDateInput(dateInput);

  let startYear = year;
  let startMonth = month;

  if (!isMonthKeyOnly) {
    if (day >= 6) {
      // 6th through end of month -> starts 6th of this month
      startYear = year;
      startMonth = month;
    } else {
      // 1st through 5th -> belongs to business month that started on 6th of previous month
      if (month === 0) {
        startYear = year - 1;
        startMonth = 11;
      } else {
        startYear = year;
        startMonth = month - 1;
      }
    }
  }

  // Calculate End Month & Year (5th of the following month)
  let endYear = startYear;
  let endMonth = startMonth + 1;
  if (endMonth > 11) {
    endYear = startYear + 1;
    endMonth = 0;
  }

  const startDate = new Date(startYear, startMonth, 6, 0, 0, 0, 0);
  const endDate = new Date(endYear, endMonth, 5, 23, 59, 59, 999);
  const nextMonthStartDate = new Date(endYear, endMonth, 6, 0, 0, 0, 0);

  const monthKey = `${startYear}-${String(startMonth + 1).padStart(2, "0")}`;
  const startDateStr = toLocalDateString(startDate);
  const endDateStr = toLocalDateString(endDate);

  const startMonthName = startDate.toLocaleDateString("en-US", { month: "long" });
  const label = `${startMonthName} ${startYear}`;

  const startMonthShort = startDate.toLocaleDateString("en-US", { month: "short" });
  const endMonthShort = endDate.toLocaleDateString("en-US", { month: "short" });

  let rangeLabel = "";
  if (startYear === endYear) {
    rangeLabel = `6 ${startMonthShort} – 5 ${endMonthShort} ${startYear}`;
  } else {
    rangeLabel = `6 ${startMonthShort} ${startYear} – 5 ${endMonthShort} ${endYear}`;
  }

  const fullLabel = `${label} (${rangeLabel})`;

  // Generate all YYYY-MM-DD date strings in this business period
  const daysInPeriod: string[] = [];
  const cur = new Date(startYear, startMonth, 6);
  const endMarker = new Date(endYear, endMonth, 5);
  while (cur <= endMarker) {
    daysInPeriod.push(toLocalDateString(cur));
    cur.setDate(cur.getDate() + 1);
  }

  return {
    monthKey,
    year: startYear,
    monthIndex: startMonth,
    startDate,
    endDate,
    nextMonthStartDate,
    startDateStr,
    endDateStr,
    label,
    rangeLabel,
    fullLabel,
    daysInPeriod,
  };
}

/**
 * Returns the current active business month period based on today's local date.
 */
export function getCurrentBusinessMonth(): BusinessMonth {
  return getBusinessMonth(new Date());
}

/**
 * Returns the Date object representing 00:00:00.000 on the 6th of the business month.
 */
export function getBusinessMonthStart(dateInput?: Date | string | number | any): Date {
  return getBusinessMonth(dateInput).startDate;
}

/**
 * Returns the Date object representing 23:59:59.999 on the 5th of the following month.
 */
export function getBusinessMonthEnd(dateInput?: Date | string | number | any): Date {
  return getBusinessMonth(dateInput).endDate;
}

/**
 * Returns the canonical monthKey ("YYYY-MM") of the business month that contains the given date.
 */
export function getBusinessMonthKey(dateInput?: Date | string | number | any): string {
  return getBusinessMonth(dateInput).monthKey;
}

/**
 * Returns the display label of the business month (e.g. "October 2026").
 */
export function getBusinessMonthLabel(dateInput?: Date | string | number | any): string {
  return getBusinessMonth(dateInput).label;
}

/**
 * Checks whether a given date falls within a business month period.
 */
export function isDateInBusinessMonth(
  dateToCheck: Date | string | number | any,
  businessMonthOrKey?: BusinessMonth | string | Date
): boolean {
  if (!dateToCheck) return false;
  const bm = businessMonthOrKey && typeof (businessMonthOrKey as any).startDate === "object"
    ? (businessMonthOrKey as BusinessMonth)
    : getBusinessMonth(businessMonthOrKey);

  const d = typeof dateToCheck?.toDate === "function" 
    ? dateToCheck.toDate() 
    : (dateToCheck instanceof Date ? dateToCheck : new Date(dateToCheck));

  if (isNaN(d.getTime())) return false;
  return d >= bm.startDate && d <= bm.endDate;
}

/**
 * Returns the previous business month.
 */
export function getPreviousBusinessMonth(businessMonthOrKey?: BusinessMonth | string | Date): BusinessMonth {
  const current = getBusinessMonth(businessMonthOrKey);
  let prevYear = current.year;
  let prevMonth = current.monthIndex - 1;
  if (prevMonth < 0) {
    prevYear -= 1;
    prevMonth = 11;
  }
  const prevKey = `${prevYear}-${String(prevMonth + 1).padStart(2, "0")}`;
  return getBusinessMonth(prevKey);
}

/**
 * Returns the next business month.
 */
export function getNextBusinessMonth(businessMonthOrKey?: BusinessMonth | string | Date): BusinessMonth {
  const current = getBusinessMonth(businessMonthOrKey);
  let nextYear = current.year;
  let nextMonth = current.monthIndex + 1;
  if (nextMonth > 11) {
    nextYear += 1;
    nextMonth = 0;
  }
  const nextKey = `${nextYear}-${String(nextMonth + 1).padStart(2, "0")}`;
  return getBusinessMonth(nextKey);
}

/**
 * Generates options for a business month dropdown / selector.
 * Range: countPast months in the past through countFuture months in the future.
 */
export function getBusinessMonthOptions(
  countPast = 12,
  countFuture = 3
): Array<{
  value: string;
  label: string;
  rangeLabel: string;
  fullLabel: string;
}> {
  const current = getCurrentBusinessMonth();
  const options: Array<{
    value: string;
    label: string;
    rangeLabel: string;
    fullLabel: string;
  }> = [];

  for (let offset = -countPast; offset <= countFuture; offset++) {
    let y = current.year;
    let m = current.monthIndex + offset;
    while (m < 0) {
      y -= 1;
      m += 12;
    }
    while (m > 11) {
      y += 1;
      m -= 12;
    }
    const key = `${y}-${String(m + 1).padStart(2, "0")}`;
    const bm = getBusinessMonth(key);
    options.push({
      value: bm.monthKey,
      label: bm.label,
      rangeLabel: bm.rangeLabel,
      fullLabel: bm.fullLabel,
    });
  }

  return options;
}
