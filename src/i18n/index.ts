import { fr, type TextKey } from './fr';

const dict: Record<TextKey, string> = fr;

/** Traduit une clé, en remplaçant les `{variables}`. */
export function t(key: TextKey, vars?: Record<string, string | number>): string {
  let s: string = dict[key] ?? key;
  if (vars) for (const k of Object.keys(vars)) s = s.replace(`{${k}}`, String(vars[k]));
  return s;
}

/** Temps en ms/secondes → M:SS.cc */
export function formatTime(seconds: number): string {
  const total = Math.max(0, seconds);
  const m = Math.floor(total / 60);
  const s = Math.floor(total % 60);
  const cs = Math.floor((total * 100) % 100);
  return `${m}:${String(s).padStart(2, '0')}.${String(cs).padStart(2, '0')}`;
}
