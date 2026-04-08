/**
 * Shared types for the per-category event emitter factories.
 *
 * Extracted from event-emitter.ts so each category module can
 * declare the same low-level `emit` shape without duplication.
 */

/** Low-level emit function injected into every category factory */
export type EmitFn = (type: string, payload: Record<string, unknown>) => void;
