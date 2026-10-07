/**
 * What the mock's channel sockets keep — on the proxy's WebSocket route and
 * on each channel's own path alike: their configuration, each socket, and
 * each subscription a socket holds.
 */

import type { HeartbeatConfig } from "@noverax/courier/internal";
import type { ChannelHandlers, WSChannelContext } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";
import type { MockRegistry } from "../../registry";
import type { MockHistoryEntry } from "../../types";
import type { ChannelShape, PrefixMapping } from "../prefix-route-types";
import type { RequestHooks } from "../route-types";
import type { WSConnectionRegistry } from "../ws-handler/connection-registry";

/** What the channel sockets serve subscriptions from */
export interface ChannelSocketConfig {
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
export interface ChannelSubscription {
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

/** The channel a socket opened on a channel's own path serves. */
export interface ChannelRoute {
  readonly group: string;
  readonly method: string;
  /** What the path carries: its parameters, `:room` as `room`, and its query */
  readonly variables: Readonly<Record<string, unknown>>;
}

/** One socket: the subscriptions it holds by topic, and those still opening */
export interface ChannelSocket {
  readonly ws: NodeWebSocket;
  readonly config: ChannelSocketConfig;
  /** The path it was opened on, which its subscriptions are logged under */
  readonly path: string;
  /**
   * The channel it serves, opened on that channel's own path; none on the
   * proxy's route, where each subscription's topic names its channel
   */
  readonly route: ChannelRoute | undefined;
  /** The upgrade request's headers, as they came */
  readonly handshake: Headers;
  /**
   * The upgrade request's headers with those of the client's `auth` frame,
   * as a Courier server reads them — which each channel's mock is called with
   */
  headers: Headers;
  readonly id: string;
  /** How many subscriptions it has opened, for their ids */
  opened: number;
  readonly subscriptions: Map<string, ChannelSubscription>;
  readonly opening: Map<string, Promise<void>>;
  /** The `onLeave` still running for each topic, which the next subscription to it waits for */
  readonly leaving: Map<string, Promise<void>>;
}
