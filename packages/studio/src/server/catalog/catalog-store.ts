/**
 * CatalogStore — server-authoritative single source of truth for SourceMap.
 *
 * Accepts updates from two layers (scan + runtime sessions),
 * merges them via mergeOverlay(), and notifies listeners with a
 * debounced CatalogSnapshot. Also computes canonical name mappings
 * and broadcasts them to connected apps.
 */

import type { SourceMap } from "@noverax/nexus-studio-core";
import { mergeOverlay } from "./merge-overlay";
import type { Catalog, CatalogMeta, CatalogSnapshot, NameMapping } from "./types";

type SnapshotListener = (snapshot: CatalogSnapshot) => void;
type NamesListener = (mapping: NameMapping) => void;

const OUTPUT_DEBOUNCE_MS = 50;

export class CatalogStore {
  private scanLayer: SourceMap | null = null;
  private scanTimestamp: number | null = null;
  private runtimeLayers = new Map<string, SourceMap>();

  private merged: Catalog = {};
  private currentNameMapping: NameMapping = {};
  private snapshotListeners = new Set<SnapshotListener>();
  private namesListeners = new Set<NamesListener>();
  private debounceTimer: ReturnType<typeof setTimeout> | null = null;

  /** Update the scan layer (from file watcher) */
  setScanLayer(sourceMap: SourceMap): void {
    this.scanLayer = sourceMap;
    this.scanTimestamp = Date.now();
    this.scheduleEmit();
  }

  /** Update a runtime layer (from app session) */
  setRuntimeLayer(sessionId: string, sourceMap: SourceMap): void {
    this.runtimeLayers.set(sessionId, sourceMap);
    this.scheduleEmit();
  }

  /** Read a single session's runtime layer (used by playground:stream routing) */
  getRuntimeLayer(sessionId: string): SourceMap | undefined {
    return this.runtimeLayers.get(sessionId);
  }

  /** Remove a runtime layer (session disconnected) */
  removeRuntimeLayer(sessionId: string): void {
    if (!this.runtimeLayers.delete(sessionId)) return;
    this.scheduleEmit();
  }

  /** Get current merged snapshot (for initial UI connection) */
  getSnapshot(): CatalogSnapshot {
    return {
      catalog: this.merged,
      timestamp: Date.now(),
      meta: this.buildMeta(),
    };
  }

  /** Get current name mapping (for initial app connection) */
  getNameMapping(): NameMapping {
    return this.currentNameMapping;
  }

  /** Subscribe to catalog changes. Returns unsubscribe function. */
  onChange(listener: SnapshotListener): () => void {
    this.snapshotListeners.add(listener);
    return () => this.snapshotListeners.delete(listener);
  }

  /** Subscribe to name mapping changes. Returns unsubscribe function. */
  onNamesChange(listener: NamesListener): () => void {
    this.namesListeners.add(listener);
    return () => this.namesListeners.delete(listener);
  }

  /** Force immediate merge + emit (for testing or shutdown) */
  flush(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.recompute();
  }

  /**
   * Drop every runtime layer and reset the merged catalog to scan-only state.
   *
   * Intended for full server shutdown and test isolation. Listeners are
   * preserved (they are owned by external subscribers), and the scan layer
   * is left intact (it is owned by the file watcher). The pending debounce
   * timer is cancelled and a synchronous final emit is fired so subscribers
   * observe the cleared state immediately.
   *
   * MUST NOT be called from per-socket disconnect handlers — use
   * `removeRuntimeLayer(sessionId)` for single-session cleanup.
   */
  clear(): void {
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
    this.runtimeLayers.clear();
    this.recompute();
  }

  private scheduleEmit(): void {
    if (this.debounceTimer) clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => {
      this.debounceTimer = null;
      this.recompute();
    }, OUTPUT_DEBOUNCE_MS);
  }

  private recompute(): void {
    const result = mergeOverlay(this.scanLayer, this.runtimeLayers);
    this.merged = result.catalog;

    // Emit snapshot to UI
    const snapshot = this.getSnapshot();
    for (const listener of this.snapshotListeners) {
      listener(snapshot);
    }

    // Emit name mapping to apps (only if changed)
    const prevHash = JSON.stringify(this.currentNameMapping);
    this.currentNameMapping = result.nameMapping;
    if (
      JSON.stringify(result.nameMapping) !== prevHash &&
      Object.keys(result.nameMapping).length > 0
    ) {
      for (const listener of this.namesListeners) {
        listener(result.nameMapping);
      }
    }
  }

  private buildMeta(): CatalogMeta {
    let total = 0;
    for (const source of Object.values(this.merged)) {
      for (const group of Object.values(source.groups)) {
        total += Object.keys(group.endpoints).length;
      }
    }
    return {
      scanTimestamp: this.scanTimestamp,
      runtimeSessions: [...this.runtimeLayers.keys()],
      totalEndpoints: total,
    };
  }
}
