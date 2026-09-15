import { encodeMessage } from "@noverax/courier/realtime";
import type { WebSocket as NodeWebSocket } from "ws";

/**
 * In-memory registry of active mock WS connections, keyed by topic.
 *
 * Used by the channel `broadcast(topic, data)` API to fan out a message
 * to every other connection currently subscribed to the same topic. The
 * mock server is single-process, so this is a process-local Map.
 */
export class WSConnectionRegistry {
  private readonly byTopic = new Map<string, Set<NodeWebSocket>>();

  /** Register a connection under a topic */
  register(topic: string, ws: NodeWebSocket): void {
    let set = this.byTopic.get(topic);
    if (!set) {
      set = new Set();
      this.byTopic.set(topic, set);
    }
    set.add(ws);
  }

  /** Remove a connection from a topic */
  unregister(topic: string, ws: NodeWebSocket): void {
    const set = this.byTopic.get(topic);
    if (!set) return;
    set.delete(ws);
    if (set.size === 0) {
      this.byTopic.delete(topic);
    }
  }

  /**
   * Broadcast a `data` frame to every connection subscribed to `topic`,
   * **excluding** the originating connection. Returns the number of
   * recipients reached.
   */
  broadcast(topic: string, data: unknown, exclude: NodeWebSocket): number {
    const set = this.byTopic.get(topic);
    if (!set || set.size === 0) return 0;

    const frame = encodeMessage({ type: "data", topic, payload: data });
    let count = 0;
    for (const ws of set) {
      if (ws === exclude) continue;
      if (ws.readyState !== ws.OPEN) continue;
      ws.send(frame);
      count++;
    }
    return count;
  }

  /** Number of connections currently subscribed to a topic */
  count(topic: string): number {
    return this.byTopic.get(topic)?.size ?? 0;
  }

  /** Total number of unique topics with at least one connection */
  topicCount(): number {
    return this.byTopic.size;
  }

  /** Drop all connections (used by server shutdown) */
  clear(): void {
    this.byTopic.clear();
  }
}
