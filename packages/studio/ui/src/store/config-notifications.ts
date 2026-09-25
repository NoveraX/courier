import { toast } from "sonner";

import type { ConfigStatusPayload } from "./config-status";
import type { ConfigReloadContext } from "./config-transition";

import { configTransitionNotice } from "./config-transition";

/**
 * Show a toast when the config's status changes in a way worth telling:
 * `configTransitionNotice` decides what, and this only shows it.
 *
 * @param prev - The status the UI had, or `null` when it had none since connecting
 * @param next - The status Studio just sent
 * @param reload - The change behind a reload, whether reloads are announced, and how the mocks file loads
 *
 * @example
 * ```ts
 * notifyConfigTransition(store().configStatus, next, { lastChange, announceReloads: true, mocks });
 * ```
 */
export function notifyConfigTransition(
  prev: ConfigStatusPayload | null,
  next: ConfigStatusPayload,
  reload: ConfigReloadContext,
): void {
  const notice = configTransitionNotice(prev, next, reload);
  if (notice) toast[notice.tone](notice.text);
}
