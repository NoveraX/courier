import { CourierError } from "@noverax/courier";

/** Studio could not listen: another process holds the port it was asked for. */
export class StudioPortInUseError extends CourierError<"STUDIO_PORT_IN_USE"> {
  constructor(port: number, host: string, cause: unknown) {
    super(
      `Port ${port} on ${host} is in use — is Studio already running? Choose another with --port.`,
      {
        code: "STUDIO_PORT_IN_USE",
        cause,
        context: { port, host },
      },
    );
  }
}
