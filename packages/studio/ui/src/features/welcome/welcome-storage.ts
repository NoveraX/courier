/**
 * Whether the welcome flow was completed, as the page's storage remembers it
 * between visits. A browser that refuses storage remembers nothing, so the
 * flow reads as not completed.
 */

import { browserStorage } from "@/lib/browser-storage";

import { WELCOME_STORAGE_KEY } from "./frameworks";

export function isWelcomeCompleted(): boolean {
  return browserStorage.read(WELCOME_STORAGE_KEY) === "true";
}

export function markWelcomeCompleted(): void {
  browserStorage.write(WELCOME_STORAGE_KEY, "true");
}
