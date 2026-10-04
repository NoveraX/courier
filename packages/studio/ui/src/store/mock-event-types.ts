/**
 * Untyped event payload from the mock socket event stream, shared by the
 * dispatcher and the per-domain handler files. Each handler reads the fields
 * it needs through the payload readers, which keep only values of the
 * expected type; the Studio server validated the frame's shape before.
 */
export type MockEvent = Record<string, unknown>;
