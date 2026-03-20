import type { EventBus } from "../event-bus";
import { wireMiddlewareHooks } from "./hooks-middleware";
import { wireRequestHooks } from "./hooks-request";
import { wireValidationHooks } from "./hooks-validation";

/** Wire all core devtools hooks to emit events on the bus */
export function wireHooks(
  bus: EventBus,
  sessionId: string,
  resolveSourceName: (name: string) => string,
  shouldFilter: (source: string) => boolean,
): void {
  wireRequestHooks(bus, sessionId, resolveSourceName, shouldFilter);
  wireMiddlewareHooks(bus, sessionId);
  wireValidationHooks(bus, sessionId);
}
