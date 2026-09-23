import type { WSMessage } from "../realtime/ws/ws-protocol";
import { validateSchema } from "../validation";
import type { WSSocketContext } from "./ws-context";

export const VALIDATION_FAILED = Symbol("validation_failed");

/** Validate subscribe variables against schema, sending error on failure */
export async function validateVariablesSafe(
  ctx: WSSocketContext,
  msg: WSMessage,
  schema: { variables?: { "~standard": { validate: (v: unknown) => unknown } } },
): Promise<unknown> {
  if (!schema.variables) return msg.payload;
  try {
    /* A subscription with no variables is one with none set, as on every
       other transport. */
    return await validateSchema(
      schema.variables as Parameters<typeof validateSchema>[0],
      msg.payload ?? {},
      "variables",
    );
  } catch {
    ctx.sendMessage({
      type: "error",
      id: msg.id,
      error: { code: 4422, message: "Invalid variables" },
    });
    return VALIDATION_FAILED;
  }
}
