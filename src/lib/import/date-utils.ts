const BR_DATE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

export function brDateToIso(s: string | null | undefined): string | null {
  if (!s) return null;
  const m = BR_DATE.exec(s);
  if (!m) throw new Error(`Invalid BR date: "${s}"`);
  return `${m[3]}-${m[2]}-${m[1]}`;
}

export function isoToBrDate(iso: string | null): string {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function isExpired(endDateIso: string, todayIso: string): boolean {
  if (!endDateIso) return false;
  if (endDateIso.startsWith('9999')) return false;
  return endDateIso < todayIso;
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
