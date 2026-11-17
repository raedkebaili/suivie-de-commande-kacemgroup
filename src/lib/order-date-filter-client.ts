export function validISODate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || value < "1900-01-01" || value > "9999-12-31") return false;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value;
}
export function calendarRange(mode: string, year: string, month: string, from: string, to: string) {
  if (mode === "period") return { from, to };
  if (!/^\d{4}$/.test(year)) return { from: "", to: "" };
  if (mode === "year") return { from: `${year}-01-01`, to: `${year}-12-31` };
  if (mode === "month" && /^(0[1-9]|1[0-2])$/.test(month)) {
    const last = new Date(Date.UTC(Number(year), Number(month), 0)).getUTCDate();
    return { from: `${year}-${month}-01`, to: `${year}-${month}-${last}` };
  }
  return { from: "", to: "" };
}
export const formatCompletionDay = (day?: string | null) => day && validISODate(day) ? day.split("-").reverse().join("/") : "Date non disponible";
