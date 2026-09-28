/**
 * Test utilities for @noverax/courier-mock.
 *
 * Import from "@noverax/courier-mock/testing" when writing tests.
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
  RecorderErrorCode,
  RecordMode,
} from "./record";
export {
  createRecorder,
  diffFixtures,
  fixturesToHar,
  harToFixtures,
  RecorderError,
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
  ExtractResponse,
  ExtractVariables,
  TopLevelKeys,
} from "./typed-mock-fn";
export type {
  EnhancedMockBuilder,
  MockHandlerFn,
  MockHistoryEntry,
  MockStreamFn,
  ResolvedHandler,
} from "./types";
