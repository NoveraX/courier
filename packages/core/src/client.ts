// Re-export from client/ directory — keeps external imports stable
export { buildClientProxy } from "./client/proxy";
export { createClientRoot, type RootAccessors } from "./client/root";
export { type ClientShape, shapeOfClient } from "./client/shape";
export type {
  ExecuteBackend,
  FlatClient,
  GroupClient,
  InferClient,
  MixedClient,
  TypedClient,
  WithOptions,
} from "./client/types";
