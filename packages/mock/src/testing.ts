/**
 * Test utilities for @noverax/nexus-mock.
 *
 * Import from "@noverax/nexus-mock/testing" when writing tests.
 * These are NOT included in the main entry point to keep production bundles lean.
 */

// Builder
export { createEnhancedMockBuilder } from "./builder";
// Test client
export type { MockClient, MockClientConfig } from "./create-mock-client";
export { createMockClient } from "./create-mock-client";
// Network utils
export { LATENCY_PROFILES, resolveLatency } from "./network";

// Record & Replay
export type {
  FieldChange,
  Fixture,
  FixtureDiff,
  HarEntry,
  HarLog,
  RecorderClient,
  RecorderConfig,
  RecordMode,
} from "./record";
export {
  createRecorder,
  diffFixtures,
  fixturesToHar,
  harToFixtures,
  replayFixtures,
  replayHar,
  sanitizeFixture,
} from "./record";
// Registry
export type { MockRegistry } from "./registry";
export { createMockRegistry } from "./registry";
// Scenario composition
export type { HandlerGroup } from "./scenario";
export { defineHandlers, mergeHandlers } from "./scenario";
// Store
export type {
  Collection,
  CollectionConfig,
  MockStore,
  PaginatedResult,
  QueryBuilder,
  QueryOptions,
  RelationDefinitions,
  WherePredicate,
} from "./store";
export {
  createCollection,
  createMockStore,
  defineRelations,
  resolveMany,
  resolveOne,
} from "./store";

// Handler & builder types
export type {
  ApiGroups,
  EndpointKeys,
  EnhancedMockBuilder,
  ExtractResponse,
  ExtractVariables,
  MockHandlerFn,
  MockHistoryEntry,
  ResolvedHandler,
} from "./types";
