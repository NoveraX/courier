/**
 * Whether the core's modules here are the server's: as a server's build,
 * a test environment that takes them as Node does, an edge runtime and
 * React Native take them. A page's bundle takes a stand-in that says no,
 * and so does a test environment with the `browser` condition — Jest's
 * jsdom environment among them — or Node's `--conditions=browser`.
 */
export const SERVERS_MODULES: boolean = true;
