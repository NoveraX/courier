import type { ResolvedHandler } from "../types";

/** Key for storing handlers: "group/method" */
function handlerKey(group: string, method: string): string {
  return `${group}/${method}`;
}

export interface MockRegistry {
  /** Register a handler in the scenario layer (cleared on every scenario switch) */
  set(group: string, method: string, handler: ResolvedHandler): void;
  /** Register a handler in the base layer (never cleared — overrides, auto-CRUD) */
  setBase(group: string, method: string, handler: ResolvedHandler): void;
  /** Resolve the best matching handler: scenario layer first, then base layer */
  get(group: string, method: string, scenarioState: string): ResolvedHandler | undefined;
  /** Read the latest handler without side effects — scenario layer first, then base */
  peek(group: string, method: string): ResolvedHandler | undefined;
  /** Remove all handlers for an endpoint in both layers */
  remove(group: string, method: string): void;
  /** Clear the scenario layer only (base layer is preserved) */
  clear(): void;
  /** Clear both layers entirely */
  clearAll(): void;
  /** Check if any handlers exist for an endpoint in either layer */
  has(group: string, method: string): boolean;
  /** Check if a handler exists in the scenario layer for an endpoint */
  hasScenario(group: string, method: string): boolean;
  /** Count base layer handlers for an endpoint (>1 means overrides on top of auto) */
  baseCount(group: string, method: string): number;
  /** List all registered endpoints with handler counts across both layers */
  list(): Array<{ group: string; method: string; count: number }>;
}

/** Create a mock registry with scenario + base layers and LIFO stacks per layer */
export function createMockRegistry(): MockRegistry {
  // scenario layer: cleared on every applyScenario()
  const scenarioHandlers = new Map<string, ResolvedHandler[]>();
  // base layer: auto-CRUD + user overrides, never cleared
  const baseHandlers = new Map<string, ResolvedHandler[]>();

  /** Resolve one key through the scenario layer, then the base layer. */
  function resolveAt(key: string, scenarioState: string): ResolvedHandler | undefined {
    const scenarioStack = scenarioHandlers.get(key);
    if (scenarioStack?.length) {
      const resolved = resolveHandler(scenarioStack, scenarioState);
      if (resolved) return resolved;
    }
    const baseStack = baseHandlers.get(key);
    return baseStack?.length ? resolveHandler(baseStack, scenarioState) : undefined;
  }

  /** The only key registered for this method name, if there is exactly one. */
  function soleKeyFor(method: string): string | undefined {
    const suffix = `/${method}`;
    let found: string | undefined;
    for (const key of [...scenarioHandlers.keys(), ...baseHandlers.keys()]) {
      if (!key.endsWith(suffix)) continue;
      if (found !== undefined && found !== key) return undefined;
      found = key;
    }
    return found;
  }

  return {
    set(group, method, handler) {
      const key = handlerKey(group, method);
      if (!scenarioHandlers.has(key)) scenarioHandlers.set(key, []);
      scenarioHandlers.get(key)?.push(handler);
    },

    setBase(group, method, handler) {
      const key = handlerKey(group, method);
      if (!baseHandlers.has(key)) baseHandlers.set(key, []);
      baseHandlers.get(key)?.push(handler);
    },

    get(group, method, scenarioState) {
      const direct = resolveAt(handlerKey(group, method), scenarioState);
      if (direct) return direct;

      /* A source that declares its endpoints without groups is addressed with
         no group, while auto-generated mocks are filed under the collection
         their records live in. Answer by name when the caller named no group
         and exactly one collection offers that name — two would be a guess. */
      if (group !== "") return undefined;
      const sole = soleKeyFor(method);
      return sole ? resolveAt(sole, scenarioState) : undefined;
    },

    peek(group, method) {
      const key = handlerKey(group, method);
      const scenarioStack = scenarioHandlers.get(key);
      if (scenarioStack?.length) return scenarioStack[scenarioStack.length - 1];
      const baseStack = baseHandlers.get(key);
      return baseStack?.length ? baseStack[baseStack.length - 1] : undefined;
    },

    remove(group, method) {
      const key = handlerKey(group, method);
      scenarioHandlers.delete(key);
      baseHandlers.delete(key);
    },

    clear() {
      scenarioHandlers.clear();
    },

    clearAll() {
      scenarioHandlers.clear();
      baseHandlers.clear();
    },

    has(group, method) {
      const key = handlerKey(group, method);
      const sStack = scenarioHandlers.get(key);
      const bStack = baseHandlers.get(key);
      return !!(sStack?.length || bStack?.length);
    },

    hasScenario(group, method) {
      return (scenarioHandlers.get(handlerKey(group, method))?.length ?? 0) > 0;
    },

    baseCount(group, method) {
      return baseHandlers.get(handlerKey(group, method))?.length ?? 0;
    },

    list() {
      const counts = new Map<string, number>();

      for (const [key, stack] of scenarioHandlers) {
        counts.set(key, (counts.get(key) ?? 0) + stack.length);
      }
      for (const [key, stack] of baseHandlers) {
        counts.set(key, (counts.get(key) ?? 0) + stack.length);
      }

      const result: Array<{ group: string; method: string; count: number }> = [];
      for (const [key, count] of counts) {
        const [group = "", method = ""] = key.split("/");
        result.push({ group, method, count });
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
  for (let i = stack.length - 1; i >= 0; i--) {
    const handler = stack[i];
    if (!handler) continue;

    if (handler.requiredState && handler.requiredState !== scenarioState) {
      continue;
    }

    if (handler.remaining !== undefined) {
      handler.remaining--;
      if (handler.remaining <= 0) stack.splice(i, 1);
    }

    return handler;
  }

  return undefined;
}
