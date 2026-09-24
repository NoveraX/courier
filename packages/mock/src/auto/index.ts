/**
 * Internal auto-generation pipeline.
 * Not part of the public API — consumed by managed/run-mock-worker.ts and managed/describe-mock-server.ts via direct imports.
 */

export { seedAllCollections } from "./auto-scenario";
export type { AutoMockServerConfig, SeedConfig } from "./create-auto-server";
export { createAutoMockServer } from "./create-auto-server";
export type { CrudOperation, RouteInfo } from "./route-analyzer";
export { analyzeRoutes } from "./route-analyzer";
