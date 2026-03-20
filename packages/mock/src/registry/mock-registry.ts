import type { ResolvedHandler } from "../types";

/** Key for storing handlers: "group/method" */
function handlerKey(group: string, method: string): string {
  return `${group}/${method}`;
}

export interface MockRegistry {
  /** Register a handler for an endpoint */
  set(group: string, method: string, handler: ResolvedHandler): void;
  /** Resolve the best matching handler for an endpoint */
  get(group: string, method: string, scenarioState: string): ResolvedHandler | undefined;
  /** Remove all handlers for an endpoint */
  remove(group: string, method: string): void;
  /** Clear all handlers */
  clear(): void;
  /** Check if any handlers exist for an endpoint */
  has(group: string, method: string): boolean;
  /** List all registered endpoints with handler counts */
  list(): Array<{ group: string; method: string; count: number }>;
}

/** Create a mock registry with LIFO stack + state matching */
export function createMockRegistry(): MockRegistry {
  const handlers = new Map<string, ResolvedHandler[]>();

  return {
    set(group, method, handler) {
      const key = handlerKey(group, method);
      if (!handlers.has(key)) handlers.set(key, []);
      handlers.get(key)?.push(handler);
    },

    get(group, method, scenarioState) {
      const key = handlerKey(group, method);
      const stack = handlers.get(key);
      if (!stack?.length) return undefined;

      return resolveHandler(stack, scenarioState);
    },

    remove(group, method) {
      handlers.delete(handlerKey(group, method));
    },

    clear() {
      handlers.clear();
    },

    has(group, method) {
      const stack = handlers.get(handlerKey(group, method));
      return !!stack?.length;
    },

    list() {
      const result: Array<{ group: string; method: string; count: number }> = [];
      for (const [key, stack] of handlers) {
        const [group = "", method = ""] = key.split("/");
        result.push({ group, method, count: stack.length });
      }
      return result;
    },
  };
}

/** LIFO resolution with state matching and consumption tracking */
function resolveHandler(
  stack: ResolvedHandler[],
  scenarioState: string,
): ResolvedHandler | undefined {
  // Walk stack from top (latest) to bottom, find first state-matching handler
  for (let i = stack.length - 1; i >= 0; i--) {
    const handler = stack[i];
    if (!handler) continue;

    // Skip if handler requires a different scenario state
    if (handler.requiredState && handler.requiredState !== scenarioState) {
      continue;
    }

    // Consume if handler has remaining count
    if (handler.remaining !== undefined) {
      handler.remaining--;
      if (handler.remaining <= 0) stack.splice(i, 1);
    }

    return handler;
  }

  return undefined;
}
