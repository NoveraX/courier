/**
 * @noverax/courier-mock — Public API
 *
 * For test utilities (createMockClient, createMockStore, record/replay, etc.)
 * import from "@noverax/courier-mock/testing" instead.
 */

export { MockTargetError, type MockTargetErrorCode } from "./auto/mock-target-error";
// Factory (test data generation helpers)
export type { FactoryConfig, ResponseFactory } from "./factory";
export { defineFactory } from "./factory";
// Managed server definitions — the default export of courier.mocks.ts
export type {
  MockServerConfig,
  MockServerDefinition,
  MockServerEntry,
  MockServerSeedConfig,
} from "./managed";
export { defineMockServer, defineMocks, isMockServerDefinition } from "./managed";
// Scenarios
export { defineScenario } from "./scenario";
export {
  ScenarioConfigError,
  type ScenarioConfigErrorCode,
} from "./scenario/scenario-record";
// Errors (used in override handlers)
export { isMockHttpError, MockHttpError } from "./server/errors";

// Store types (appear in override callback signatures)
export type { Collection, MockStore } from "./store";
export type { TypedMockFn } from "./typed-mock-fn";
// Types used in override callbacks and scenario definitions
export type {
  LatencyProfile,
  MockRequestContext,
  MockScenario,
  NetworkConfig,
} from "./types";
