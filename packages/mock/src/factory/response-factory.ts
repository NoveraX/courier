/** Configuration for defining a response factory */
export interface FactoryConfig<TResponse> {
  /** Default values used as base for every build */
  defaults: TResponse | (() => TResponse);
  /** Named trait overrides for common variations */
  traits?: Record<string, Partial<TResponse> | ((base: TResponse) => TResponse)> | undefined;
}

/** Factory for generating type-safe response data */
export interface ResponseFactory<TResponse> {
  /** Create a single instance with optional overrides */
  build(overrides?: Partial<TResponse>): TResponse;
  /** Create with a named trait applied, plus optional overrides */
  buildWith(trait: string, overrides?: Partial<TResponse>): TResponse;
  /** Create N instances */
  buildList(count: number, overrides?: Partial<TResponse>): TResponse[];
  /** Create N instances with an index-based transform */
  buildSequence(count: number, fn: (index: number, base: TResponse) => TResponse): TResponse[];
}

/** Define a type-safe response factory with traits */
export function defineFactory<TResponse>(
  config: FactoryConfig<TResponse>,
): ResponseFactory<TResponse> {
  const getDefaults = (): TResponse => {
    const d = config.defaults;
    return typeof d === "function" ? (d as () => TResponse)() : structuredClone(d);
  };

  const applyOverrides = (base: TResponse, overrides?: Partial<TResponse>): TResponse => {
    if (!overrides) return base;
    return { ...base, ...overrides };
  };

  const applyTrait = (base: TResponse, traitName: string): TResponse => {
    const trait = config.traits?.[traitName];
    if (!trait) {
      throw new Error(
        `[courier-mock] Unknown trait "${traitName}". Available: ${Object.keys(config.traits ?? {}).join(", ")}`,
      );
    }
    if (typeof trait === "function") return trait(base);
    return { ...base, ...trait };
  };

  return {
    build(overrides) {
      return applyOverrides(getDefaults(), overrides);
    },

    buildWith(trait, overrides) {
      return applyOverrides(applyTrait(getDefaults(), trait), overrides);
    },

    buildList(count, overrides) {
      return Array.from({ length: count }, () => applyOverrides(getDefaults(), overrides));
    },

    buildSequence(count, fn) {
      return Array.from({ length: count }, (_, i) => fn(i, getDefaults()));
    },
  };
}
