// Core

// Auto-generation
export type {
  AutoMockServerConfig,
  AutoScenarioOptions,
  CrudOperation,
  RouteInfo,
  SeedConfig,
} from "./auto";
export {
  analyzeRoutes,
  buildAutoScenario,
  createAutoMockServer,
  generateRecord,
  generateRecords,
  inferRoutes,
} from "./auto";
// Builder
export { createEnhancedMockBuilder } from "./builder";
export type { MockClient, MockClientConfig } from "./create-mock-client";
export { createMockClient } from "./create-mock-client";
export type {
  FileWatcherHandle,
  FileWatcherOptions,
  MockCommand,
  MockDevToolsBridge,
  MockDevToolsBridgeOptions,
} from "./devtools";
// DevTools bridge
export { connectMockToDevTools, createFileWatcher } from "./devtools";
// Factory
export type { FactoryConfig, ResponseFactory } from "./factory";
export { defineFactory } from "./factory";
// Network
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
// Scenario
export type { HandlerGroup } from "./scenario";
export { defineHandlers, defineScenario, mergeHandlers } from "./scenario";
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
// Types
export type {
  ApiGroups,
  EndpointKeys,
  EnhancedMockBuilder,
  ExtractResponse,
  ExtractVariables,
  LatencyProfile,
  MockHandlerFn,
  MockHistoryEntry,
  MockRequestContext,
  MockScenario,
  NetworkConfig,
  ResolvedHandler,
  TypedMockFn,
} from "./types";
