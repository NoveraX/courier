import { getSocket } from "@/socket";

/**
 * Start, stop or restart a mock Studio runs from courier.mocks.ts.
 *
 * @param serverId - The mock's key
 * @param command - What to do
 * @example
 * ```ts
 * manageMock("shop", "restart");
 * ```
 */
export function manageMock(serverId: string, command: "start" | "stop" | "restart"): void {
  getSocket().emit("mock:managed", { command: `mock:managed:${command}`, serverId });
}
