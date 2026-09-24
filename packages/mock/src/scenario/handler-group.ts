import type { AnySource } from "@noverax/courier/define";
import type { TypedMockFn } from "../typed-mock-fn";

/** A group of handlers scoped to a domain (MSW-style organization) */
export interface HandlerGroup<TApi extends AnySource> {
  apply(mock: TypedMockFn<TApi>): void;
}

/** Define a domain-scoped handler group (MSW best practice) */
export function defineHandlers<TApi extends AnySource>(
  _domain: string,
  setup: (mock: TypedMockFn<TApi>) => void,
): HandlerGroup<TApi> {
  return {
    apply(mock) {
      setup(mock);
    },
  };
}

/** Merge multiple handler groups into a single apply function */
export function mergeHandlers<TApi extends AnySource>(
  ...groups: HandlerGroup<TApi>[]
): HandlerGroup<TApi> {
  return {
    apply(mock) {
      for (const group of groups) {
        group.apply(mock);
      }
    },
  };
}
