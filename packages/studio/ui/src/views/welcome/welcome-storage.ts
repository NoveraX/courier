/**
 * LocalStorage helpers for the welcome flow.
 *
 * Wraps `localStorage.getItem`/`setItem` in try/catch so SSR or restricted
 * environments don't crash the welcome view.
 */

import { WELCOME_STORAGE_KEY } from "./frameworks";

export function isWelcomeCompleted(): boolean {
  try {
    return localStorage.getItem(WELCOME_STORAGE_KEY) === "true";
  } catch {
    return true;
  }
}

export function markWelcomeCompleted(): void {
  try {
    localStorage.setItem(WELCOME_STORAGE_KEY, "true");
  } catch {
    /* noop */
  }
}
