import type { NcmLevel } from '../types';

export function detectLevel(codigo: string): NcmLevel {
  const digits = codigo.replace(/\D/g, '');
  if (digits.length === 2) return 2;
  if (digits.length === 4) return 4;
  if (digits.length === 5) return 5;
  if (digits.length === 6) return 6;
  if (digits.length === 7) return 7;
  if (digits.length === 8) return 8;
  throw new Error(`Cannot detect level for code "${codigo}" (${digits.length} digits)`);
}

export function isClassifiable(codigo: string): boolean {
  try {
    return detectLevel(codigo) === 8;
  } catch {
    return false;
  }
}
