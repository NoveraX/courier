import type { Redis } from "ioredis";

/**
 * Track Redis connection health via events.
 * Returns a synchronous `isHealthy()` check and a cleanup function.
 *
 * @param redis - ioredis instance to monitor
 * @returns `{ isHealthy, cleanup }` — cleanup removes event listeners
 */
export function trackHealth(redis: Redis): {
  isHealthy: () => boolean;
  cleanup: () => void;
} {
  let healthy = redis.status === "ready";

  const onReady = (): void => {
    healthy = true;
  };
  const onClose = (): void => {
    healthy = false;
  };
  const onEnd = (): void => {
    healthy = false;
  };

  redis.on("ready", onReady);
  redis.on("close", onClose);
  redis.on("end", onEnd);

  return {
    isHealthy: () => healthy,
    cleanup: () => {
      redis.off("ready", onReady);
      redis.off("close", onClose);
      redis.off("end", onEnd);
    },
  };
}
