/** Deterministic pseudo-random (0-1) based on integer seed */
export function pseudoRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function roundTo(n: number, decimals: number): number {
  const factor = 10 ** decimals;
  return Math.round(n * factor) / factor;
}

/** Convert camelCase/snake_case key to human label: "firstName" → "First Name" */
export function formatKeyAsLabel(key: string): string {
  return key
    .replace(/([A-Z])/g, " $1")
    .replace(/[_-]/g, " ")
    .trim()
    .replace(/^\w/, (c) => c.toUpperCase());
}

/** Deterministic hex string from seed */
export function deterministicHex(seed: number, length: number): string {
  let result = "";
  for (let i = 0; i < length; i++) {
    result += Math.floor(pseudoRandom(seed * 100 + i) * 16).toString(16);
  }
  return result;
}

/** Pick from array by index (cycles) with fallback */
export function pick<T>(arr: readonly T[], index: number, fallback: T): T {
  return arr[index % arr.length] ?? fallback;
}
