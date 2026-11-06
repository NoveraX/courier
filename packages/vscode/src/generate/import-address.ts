import { urlWithoutSecrets } from "@noverax/courier/internal";
import * as vscode from "vscode";

const CREDENTIALS =
  "courier-studio import refuses an address with a user or a password: type it without them, then pick User and Password to name the variables that hold them";
const KEY =
  "The address carries a key, which goes onto the command line as typed: if the host takes it in a header too, type the address without it and pick Headers to name its variable, as --header-env does";

/**
 * What the address field of Import an API says of an address as it is
 * typed, read as a URL parser reads it: one with a user or a password is
 * refused, as `courier-studio import` refuses it, before anything runs —
 * its credentials are named by variable next; one with a key in its query
 * or fragment is taken with a warning that the key goes onto the command
 * line, and that a host which takes it in a header too is read with
 * `--header-env`.
 *
 * @param value - The address, as typed
 * @returns The refusal, the warning, or `undefined` for an address to take as it is
 * @example
 * ```ts
 * addressProblem("https://ana:pw@specs.example/orders.json"); // → the refusal
 * addressProblem("https://specs.example/orders.json"); // → undefined
 * ```
 */
export function addressProblem(
  value: string,
): string | vscode.InputBoxValidationMessage | undefined {
  const url = parsed(value.trim());
  if (url === undefined) return undefined;
  if (url.username !== "" || url.password !== "") return CREDENTIALS;
  if (urlWithoutSecrets(url.href) === url.href) return undefined;
  return { message: KEY, severity: vscode.InputBoxValidationSeverity.Warning };
}

function parsed(value: string): URL | undefined {
  try {
    return new URL(value);
  } catch {
    /* Not an address yet: the command says what it cannot read. */
    return undefined;
  }
}
