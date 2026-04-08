export { composeBackend, type StreamingFactories } from "./compose-backend";
export {
  createDirectHTTPExecutor,
  createDirectSSEFactory,
  createDirectWSChannelFactory,
  createDirectWSPushFactory,
  type DirectHTTPDefaults,
  type DirectSSEDefaults,
} from "./direct";
export {
  createProxyHTTPExecutor,
  createProxySSEFactory,
  createProxyWSChannelFactory,
  createProxyWSPushFactory,
  type ProxySSEDefaults,
  type ProxyWSDefaults,
} from "./proxy";
export type { HTTPExecutor, SSEFactory, WSChannelFactory, WSPushFactory } from "./types";
