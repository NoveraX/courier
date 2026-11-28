/**
 * Options the core hands the platform, each of its own alone: what a
 * prototype of the process answers for a key they do not have is read by
 * no listener and no stream of the core's.
 */

/**
 * The options of a listener that runs once, as the platform reads them —
 * its own alone: `Object.prototype.signal`, given in the process, makes no
 * listener of the core's refuse to be added.
 */
export const ONCE = { __proto__: null, once: true } as AddEventListenerOptions;

/**
 * The strategy of a stream that queues nothing ahead of its reader, as the
 * platform reads it — its own alone: `Object.prototype.size`, given in the
 * process, measures no chunk of the core's.
 */
export const UNQUEUED = { __proto__: null, highWaterMark: 0 } as QueuingStrategy<unknown>;
