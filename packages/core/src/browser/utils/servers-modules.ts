/**
 * Whether the core's modules here are the server's, as a page's bundle has
 * them: no. A test environment with the `browser` condition — Jest's jsdom
 * environment among them — and Node's `--conditions=browser` take this
 * stand-in too.
 */
export const SERVERS_MODULES: boolean = false;
