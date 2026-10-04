import { CourierError } from "@noverax/courier";
import type { CourierConfig } from "@noverax/courier/config";
import { getSourceName } from "@noverax/courier/define";

/** Transports the binding table tracks */
export type BindingTransport = "http" | "sse" | "ws";

/** A `(source, transport)` pair owned by a runtime */
export interface RuntimeBinding {
  runtimeId: string;
  sourceName: string;
  transport: BindingTransport;
}

/** Status reported per expected `(source, transport)` pair */
export type BindingStatusKind = "bound" | "orphan" | "conflict";

export interface BindingStatus {
  sourceName: string;
  transport: BindingTransport;
  status: BindingStatusKind;
  /** Owner runtime — present when `status === "bound"` */
  runtimeId?: string;
  /** All runtimes that claimed this pair — present when `status === "conflict"` */
  conflicting?: string[];
  /**
   * Canonical HTTP(S) origin of the owning runtime. Populated by the namespace
   * layer from `runtimeRegistry.listenOrigin` when emitting `binding:snapshot`,
   * not by `BindingTable.getStatus()` itself — the table is intentionally
   * decoupled from runtime registry state. UI uses this for the playground
   * "resolved URL" badge.
   */
  appOrigin?: string;
}

/** Thrown when two runtimes claim the same `(source, transport)` */
export class BindingConflictError extends CourierError<"BINDING_CONFLICT"> {
  constructor(sourceName: string, transport: BindingTransport, runtimeIds: string[]) {
    super(`Binding conflict on ${sourceName}/${transport}: claimed by ${runtimeIds.join(", ")}`, {
      code: "BINDING_CONFLICT",
      context: { sourceName, transport, runtimeIds },
    });
  }
}

interface ExpectedKey {
  sourceName: string;
  transport: BindingTransport;
}

/**
 * In-memory routing table that maps each `(source, transport)` pair declared
 * in `courier.config.ts` to the runtime that announced ownership of it.
 *
 * Two runtimes claiming the same pair surface as a `conflict` status — not
 * whichever claimed it first — and an error when Studio asks to resolve a
 * routing decision against them.
 */
export class BindingTable {
  private expected: ExpectedKey[] = [];
  /** key = `${sourceName}::${transport}` → ordered list of claiming runtimeIds */
  private claims = new Map<string, string[]>();

  /** Replace the expected pair set after every config (re)load */
  setConfig(config: CourierConfig): void {
    this.expected = computeExpectedPairs(config);
  }

  /** Register a runtime's claim over `(source, transport)` pairs */
  attachRuntime(
    runtimeId: string,
    transports: ReadonlyArray<BindingTransport>,
    sourceNames: ReadonlyArray<string>,
  ): void {
    for (const sourceName of sourceNames) {
      for (const transport of transports) {
        const key = pairKey(sourceName, transport);
        const list = this.claims.get(key) ?? [];
        if (!list.includes(runtimeId)) list.push(runtimeId);
        this.claims.set(key, list);
      }
    }
  }

  /** Drop every claim made by a runtime — used on disconnect */
  detachRuntime(runtimeId: string): void {
    for (const [key, list] of this.claims) {
      const next = list.filter((id) => id !== runtimeId);
      if (next.length === 0) this.claims.delete(key);
      else this.claims.set(key, next);
    }
  }

  /** The runtimes that claim a `(source, transport)` pair, in the order they did. */
  claimantsOf(sourceName: string, transport: BindingTransport): readonly string[] {
    return this.claims.get(pairKey(sourceName, transport)) ?? [];
  }

  /**
   * Resolve a `(source, transport)` pair to the runtime that should serve it.
   *
   * Returns `null` when no runtime has claimed the pair (orphan). Throws
   * `BindingConflictError` when two or more runtimes claim it — callers
   * surface that as a UI `binding:error` event.
   */
  resolveBinding(sourceName: string, transport: BindingTransport): RuntimeBinding | null {
    const list = this.claims.get(pairKey(sourceName, transport));
    if (!list || list.length === 0) return null;
    if (list.length > 1) throw new BindingConflictError(sourceName, transport, list);
    const owner = list[0];
    if (!owner) return null;
    return { runtimeId: owner, sourceName, transport };
  }

  /** One status row per expected pair, useful for the `/apis` UI tab */
  getStatus(): BindingStatus[] {
    return this.expected.map(({ sourceName, transport }) => {
      const list = this.claims.get(pairKey(sourceName, transport)) ?? [];
      if (list.length === 0) return { sourceName, transport, status: "orphan" };
      if (list.length > 1) {
        return { sourceName, transport, status: "conflict", conflicting: [...list] };
      }
      const owner = list[0];
      if (!owner) return { sourceName, transport, status: "orphan" };
      return { sourceName, transport, status: "bound", runtimeId: owner };
    });
  }

  /** Drop all claims and the expected set — for tests */
  clear(): void {
    this.expected = [];
    this.claims.clear();
  }
}

function pairKey(sourceName: string, transport: BindingTransport): string {
  return `${sourceName}::${transport}`;
}

/**
 * Walk `config.sources`, infer the canonical name (config key wins after
 * `loadCourierConfig` stamping), and emit one expected pair per declared
 * `proxyPath` transport. Sources without `proxyPath` contribute zero pairs —
 * they exist for direct callers and never need a runtime binding.
 */
function computeExpectedPairs(config: CourierConfig): ExpectedKey[] {
  const out: ExpectedKey[] = [];
  for (const [key, source] of Object.entries(config.sources)) {
    const sourceName = getSourceName(source) ?? key;
    const proxyPath = proxyPathOf(source);
    if (!proxyPath) continue;
    for (const transport of ["http", "sse", "ws"] as const) {
      if (proxyPath[transport]) out.push({ sourceName, transport });
    }
  }
  return out;
}

/* What a source's `proxyPath` declares, read field by field: a config written
   without types may give it any shape. */
function proxyPathOf(source: unknown): Record<string, unknown> | undefined {
  if (typeof source !== "object" || source === null || !("options" in source)) return undefined;
  const { options } = source;
  if (typeof options !== "object" || options === null || !("proxyPath" in options))
    return undefined;
  const { proxyPath } = options;
  return typeof proxyPath === "object" && proxyPath !== null
    ? Object.fromEntries(Object.entries(proxyPath))
    : undefined;
}
