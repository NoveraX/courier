/**
 * What the proxy's WebSocket route keeps: its configuration, each socket,
 * and each subscription a socket holds.
 */

import type { HeartbeatConfig } from "@noverax/courier/internal";
import type { ChannelHandlers, WSChannelContext } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";
import type { MockRegistry } from "../../registry";
import type { MockHistoryEntry } from "../../types";
import type { ChannelShape, PrefixMapping } from "../prefix-route-types";
import type { RequestHooks } from "../route-types";
import type { WSConnectionRegistry } from "../ws-handler/connection-registry";

/** What the proxy's WebSocket route serves subscriptions from */
export interface ProxyWSConfig {
  /** The mocks, by group and endpoint */
  registry: MockRegistry;
  /** The source's groups and endpoints: each channel's schemas and `.topic()` reader */
  mappings: readonly PrefixMapping[];
  /** Every call the server answered, a subscription among them */
  history: MockHistoryEntry[];
  getScenarioState: () => string;
  /** Every socket's subscriptions, by topic, which a channel broadcasts to */
  connections: WSConnectionRegistry;
  /** Told of each subscription as it opens and ends — Studio's mock logs */
  hooks?: RequestHooks | undefined;
  /** How often each socket is pinged, and how long its pong may take */
  heartbeat?: HeartbeatConfig | undefined;
}

/** One subscription a socket holds */
export interface ProxySubscription {
  /** Names it in the history and to the hooks */
  readonly id: string;
  readonly group: string;
  readonly method: string;
  /** What the source declares about the channel, when the server has a source */
  readonly shape: ChannelShape | undefined;
  readonly ctx: WSChannelContext;
  readonly handlers: ChannelHandlers;
  /** Aborted when it ends; the handlers see it as `ctx.signal` */
  readonly ended: AbortController;
  readonly startedAt: number;
  readonly entry: MockHistoryEntry;
  left: boolean;
}

/** One socket: the subscriptions it holds by topic, and those still opening */
export interface ProxySocket {
  readonly ws: NodeWebSocket;
  readonly config: ProxyWSConfig;
  /** The upgrade request's headers, which each channel's mock is called with */
  readonly headers: Headers;
  readonly id: string;
  /** How many subscriptions it has opened, for their ids */
  opened: number;
  readonly subscriptions: Map<string, ProxySubscription>;
  readonly opening: Map<string, Promise<void>>;
}
