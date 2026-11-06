import { CourierError } from "../errors/courier-error";
import { createLogger } from "../logger";
import { holdsDeviceFiles } from "./device-files";
import { unrepeatable } from "./unrepeatable";

const log = createLogger("Caller");
let told = false;

/**
 * An upload whose progress reporting did not load — a deployment took its
 * chunk away, a policy kept it out. Progress betters an upload and never
 * decides it: the upload goes as any body does, said once a process or a
 * page. A device's file in a React Native form goes no other way, and is
 * refused, once.
 *
 * @param body - The upload
 * @param cause - Why the progress reporting did not load
 * @throws CourierError `MODULE_NOT_LOADED`, which no retry repeats, for a device's file
 * @example
 * ```ts
 * uploadWithoutProgress(body, cause);
 * ```
 */
export function uploadWithoutProgress(body: unknown, cause: unknown): void {
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
  log.warn("upload progress did not load", cause);
}
