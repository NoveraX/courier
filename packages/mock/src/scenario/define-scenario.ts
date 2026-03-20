import type { DefinedApi } from "@noverax/nexus/define";
import type { MockScenario, TypedMockFn } from "../types";

/** Define a named scenario that configures multiple mocks at once */
export function defineScenario<TApi extends DefinedApi<any>>(
  name: string,
  setup: (mock: TypedMockFn<TApi>) => void,
): MockScenario<TApi> {
  return {
    name,
    apply(mock) {
      setup(mock);
    },
  };
}
