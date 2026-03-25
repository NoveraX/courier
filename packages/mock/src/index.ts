/**
 * @noverax/nexus-mock — Public API
 *
 * For test utilities (createMockClient, createMockStore, record/replay, etc.)
 * import from "@noverax/nexus-mock/testing" instead.
 */

// Factory (test data generation helpers)
export type { FactoryConfig, ResponseFactory } from "./factory";
export { defineFactory } from "./factory";

// Managed server definition (primary user-facing API)
export type {
  MockServerConfig,
  MockServerDefinition,
  MockServerSeedConfig,
} from "./managed";
export { defineMockServer, isMockServerDefinition } from "./managed";

// Scenarios
export { defineScenario } from "./scenario";

// Errors (used in override handlers)
export { isMockHttpError, MockHttpError } from "./server/errors";

// Store types (appear in override callback signatures)
export type { Collection, MockStore } from "./store";

// Types used in override callbacks and scenario definitions
export type {
  LatencyProfile,
  MockRequestContext,
  MockScenario,
  NetworkConfig,
  TypedMockFn,
} from "./types";
