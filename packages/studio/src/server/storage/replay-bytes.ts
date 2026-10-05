/**
 * The most of a log a page is sent as it connects, as JSON text: its newest
 * requests, each whole, as many as fit. A page parses it in one go, and a
 * message far larger broke the page's connection there, every time.
 */
export const REPLAY_BYTES: number = 16 * 1024 * 1024;
