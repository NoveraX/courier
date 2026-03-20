// Re-export from client/ directory — keeps external imports stable
export { buildClientProxy } from "./client/proxy";
export type {
  ExecuteBackend,
  FlatClient,
  GroupClient,
  InferClient,
  MixedClient,
  TypedClient,
  WithOptions,
} from "./client/types";
