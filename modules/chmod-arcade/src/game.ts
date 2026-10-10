// The rules of chmod Arcade, with no UI: questions, answers, scoring and explanations.

export type Question =
  | { kind: 'to-octal'; mode: number }
  | { kind: 'to-symbolic'; mode: number };

export const ROUND_SECONDS = 60;
const WHO = ['owner', 'group', 'others'];

/** Modes people actually meet: common ones most of the time, plus random ones to keep it honest. */
const COMMON = [0o644, 0o755, 0o600, 0o700, 0o750, 0o640, 0o664, 0o775, 0o444, 0o711, 0o555, 0o400];

export function nextQuestion(random: () => number, previous?: Question): Question {
  const kind = previous?.kind === 'to-octal' ? 'to-symbolic' : 'to-octal';
  let mode = random() < 0.7 ? COMMON[Math.floor(random() * COMMON.length)]! : Math.floor(random() * 0o1000);
  if (previous && mode === previous.mode) mode = (mode + 0o100) % 0o1000;
  return { kind, mode };
}

/** `rwxr-x---` for 0o750, the way `ls -l` shows it (without the leading file-type character). */
export function symbolic(mode: number): string {
  return [6, 3, 0].map((shift) => ['r', 'w', 'x']
    .map((letter, bit) => ((mode >> (shift + 2 - bit)) & 1 ? letter : '-')).join('')).join('');
}

export function octal(mode: number): string {
  return mode.toString(8).padStart(3, '0');
}

/** Parse a typed answer like "750" or "0750". */
export function parseOctal(text: string): number | undefined {
  const trimmed = text.trim();
  return /^0?[0-7]{3}$/.test(trimmed) ? Number.parseInt(trimmed, 8) : undefined;
}

/** Points for a correct answer: 10, plus 2 for every answer in the current streak, up to +10. */
export function points(streak: number): number {
  return 10 + Math.min(streak, 5) * 2;
}

/** Why `mode` is what it is, one digit at a time: "owner rwx = 4+2+1 = 7, group r-x = 4+1 = 5, ...". */
export function explain(mode: number): string {
  const digits = octal(mode);
  return WHO.map((who, index) => {
    const part = symbolic(mode).slice(index * 3, index * 3 + 3);
    const values = [...part].flatMap((letter, bit) => (letter === '-' ? [] : [[4, 2, 1][bit]!]));
    const sum = values.length ? `${values.join('+')} = ${digits[index]}` : '0';
    return `${who} ${part} = ${sum}`;
  }).join(', ');
}
