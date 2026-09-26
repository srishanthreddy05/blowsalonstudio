/**
 * Formats a Date object (or date string / Timestamp) into a YYYY-MM-DD string
 * in the local timezone of the browser/system.
 */
export function toLocalDateString(date: Date | string | any): string {
  if (!date) return "";
  
  let d: Date;
  if (date instanceof Date) {
    d = date;
  } else if (typeof date?.toDate === "function") {
    d = date.toDate();
  } else {
    d = new Date(date);
  }

  // Fallback if date is invalid
  if (isNaN(d.getTime())) return "";

  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO) into a human readable display format (e.g. 26 Sep 2026)
 */
export function formatDisplayDate(dateStr?: string | null): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-");
    if (parts.length === 3) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      const d = new Date(year, month, day);
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      return d.toLocaleDateString("en-IN", {
        day: "numeric",
        month: "short",
        year: "numeric",
      });
    }
    return dateStr;
  } catch {
    return dateStr;
  }
}
