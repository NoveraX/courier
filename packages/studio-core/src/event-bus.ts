import type { AnyStudioEvent, EventType } from "./events";

type EventListener = (event: AnyStudioEvent) => void;

/**
 * Central event bus for Studio instrumentation.
 * Collects events from the Nexus core hooks and forwards them to listeners
 * (Socket.IO transport, in-memory store, custom handlers).
 *
 * Supports buffering events before a listener connects,
 * so no events are lost during startup.
 */
export class EventBus {
  private listeners = new Set<EventListener>();
  private typeListeners = new Map<EventType, Set<EventListener>>();
  private buffer: AnyStudioEvent[] = [];
  private buffering = true;
  private maxBufferSize: number;

  constructor(options?: { maxBufferSize?: number }) {
    this.maxBufferSize = options?.maxBufferSize ?? 1000;
  }

  /** Subscribe to all events */
  on(listener: EventListener): () => void;
  /** Subscribe to a specific event type */
  on(type: EventType, listener: EventListener): () => void;
  on(typeOrListener: EventType | EventListener, maybeListener?: EventListener): () => void {
    if (typeof typeOrListener === "function") {
      const listener = typeOrListener;
      this.listeners.add(listener);

      // Flush buffer to this listener
      if (this.buffering && this.buffer.length > 0) {
        this.buffering = false;
        for (const event of this.buffer) {
          listener(event);
        }
        this.buffer = [];
      }

      return () => {
        this.listeners.delete(listener);
      };
    }

    const type = typeOrListener;
    const listener = maybeListener!;
    let set = this.typeListeners.get(type);
    if (!set) {
      set = new Set();
      this.typeListeners.set(type, set);
    }
    set.add(listener);

    return () => {
      set?.delete(listener);
      if (set?.size === 0) {
        this.typeListeners.delete(type);
      }
    };
  }

  /** Emit an event to all listeners */
  emit(event: AnyStudioEvent): void {
    // Buffer if no global listeners yet
    if (this.buffering && this.listeners.size === 0) {
      if (this.buffer.length < this.maxBufferSize) {
        this.buffer.push(event);
      }
      // Still deliver to type-specific listeners
      const typeSet = this.typeListeners.get(event.type);
      if (typeSet) {
        for (const listener of typeSet) {
          listener(event);
        }
      }
      return;
    }

    for (const listener of this.listeners) {
      listener(event);
    }

    const typeSet = this.typeListeners.get(event.type);
    if (typeSet) {
      for (const listener of typeSet) {
        listener(event);
      }
    }
  }

  /** Remove all listeners */
  clear(): void {
    this.listeners.clear();
    this.typeListeners.clear();
    this.buffer = [];
    this.buffering = true;
  }

  /** Get the current buffer (for testing) */
  getBuffer(): readonly AnyStudioEvent[] {
    return this.buffer;
  }
}
