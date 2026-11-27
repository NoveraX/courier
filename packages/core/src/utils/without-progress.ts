import { CourierError } from "../errors/courier-error";
import { createLogger } from "../logger";
import { holdsDeviceFiles } from "./device-files";
import { unrepeatable } from "./unrepeatable";

const log = createLogger("Caller");
let told = false;

/**
 * A request whose progress reporting did not load — a deployment took its
 * chunk away, a policy kept it out. Progress betters a request and never
 * decides it: an upload goes as any body does, and a download uncounted,
 * said once a process or a page. A device's file in a React Native form goes
 * no other way, and is refused, once.
 *
 * @param cause - Why the progress reporting did not load
 * @param body - The request's body, when what did not load was its sending
 * @returns Nothing, which a download takes as no counter, and is read uncounted
 * @throws CourierError `MODULE_NOT_LOADED`, which no retry repeats, for a device's file
 * @example
 * ```ts
 * withoutProgress(cause, body);
 * ```
 */
export function withoutProgress(cause: unknown, body?: unknown): undefined {
  if (holdsDeviceFiles(body)) {
    throw unrepeatable(
      new CourierError("[courier] the code that sends a device's file did not load", {
        code: "MODULE_NOT_LOADED",
        cause,
      }),
    );
  }
  if (told) return;
  told = true;
  log.warn("progress reporting did not load", cause);
}
