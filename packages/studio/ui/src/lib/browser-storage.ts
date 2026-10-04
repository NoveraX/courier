/**
 * The page's own storage, which a browser may refuse: a sandboxed frame,
 * blocked site data or a full quota make every access throw. Studio then
 * keeps nothing for the next visit and runs on, saying so once.
 */

let refusalReported = false;

function reportRefusal(error: unknown): void {
  if (refusalReported) return;
  refusalReported = true;
  console.warn("The browser refuses Studio's storage: nothing is kept for the next visit", error);
}

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch (error) {
    reportRefusal(error);
    return null;
  }
}

function write(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch (error) {
    reportRefusal(error);
  }
}

function remove(key: string): void {
  try {
    localStorage.removeItem(key);
  } catch (error) {
    reportRefusal(error);
  }
}

/**
 * Read, write and remove a key of the page's storage, never throwing when
 * the browser refuses it: a read then finds nothing, and a write keeps
 * nothing.
 *
 * @example
 * ```ts
 * browserStorage.write(SETTINGS_STORAGE_KEY, JSON.stringify(settings));
 * browserStorage.read(SETTINGS_STORAGE_KEY); // null when absent or refused
 * ```
 */
export const browserStorage = { read, write, remove } as const;
