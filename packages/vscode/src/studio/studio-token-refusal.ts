/** What the extension says when Studio does not show it the project's code for want of the token. */
export const TOKEN_NEEDED =
  "Courier Studio shows where the project's code calls and declares its endpoints only with the project's token, which it writes into .courier/studio-token as it starts; a Studio the settings name, for a project outside the workspace, shows it in Studio itself.";

/**
 * Studio did not show the project's code — where it calls and declares its
 * endpoints, where its groups write them — for want of the project's token:
 * none in the project's `.courier` folder yet, one that is not the token of
 * the Studio that answers, or a Studio the settings name, for a project
 * outside the workspace, whose token is not here.
 *
 * @example
 * ```ts
 * if (error instanceof StudioTokenRefusal) void vscode.window.showErrorMessage(error.message);
 * ```
 */
export class StudioTokenRefusal extends Error {
  constructor() {
    super(TOKEN_NEEDED);
    this.name = "StudioTokenRefusal";
  }
}
