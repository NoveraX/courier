import { createLogger } from "../logger";
import type { WSMessage } from "../realtime/ws/ws-protocol";
import { ValidationError, validateSchema } from "../validation";
import type { WSSocketContext } from "./ws-context";
import { sendSubscriptionEnd } from "./ws-subscription-end";

const log = createLogger("WS");

export const VALIDATION_FAILED = Symbol("validation_failed");

/** Validate subscribe variables against schema, ending the subscription on failure */
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
  } catch (error) {
    /* The issues travel with the refusal, as an HTTP call's 422 carries
       them; anything else a schema throws is logged, not blamed on the
       caller's variables. */
    const topic = msg.topic ?? "";
    if (error instanceof ValidationError) {
      const failure = { code: 4422, message: "Invalid variables", issues: error.issues };
      sendSubscriptionEnd(ctx, topic, msg.id, failure);
    } else {
      log.warn("Variables schema failed", error);
      sendSubscriptionEnd(ctx, topic, msg.id, { code: 5000, message: "Subscription failed" });
    }
    return VALIDATION_FAILED;
  }
}
