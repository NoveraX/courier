import type { NextFunction, Request, RequestHandler, Response } from "express-serve-static-core";

import { errorFieldsRewritten } from "./error-fields-rewritten";
import { jsonStringsRewritten } from "./json-strings-rewritten";
import { type MachinePaths, pathScrubber } from "./machine-paths";
import { machineSpellings } from "./machine-spellings";
import { sentTextRewritten } from "./sent-text-rewritten";
import type { StudioToken } from "./studio-token";
import { TOKEN_HEADER } from "./token-guard";

type Rewrite = (text: string) => string;

/**
 * Take this machine's paths out of what Studio's API tells a caller without
 * the project's token: every string and key of an error answer a route sends
 * in one piece — through `res.json`, as a string or a page, as JSON written
 * by hand — and the fields that say what went wrong in an answer that
 * succeeded, at any depth. A path in the project is named relative to it,
 * any other under the home or temporary directory from `~` or `<temp>` —
 * `realpath 'specs/x'`, not `realpath '/Users/ana/shop/specs/x'` — each
 * directory by every name it goes by on this machine. An error answer
 * tells the length of its body as rewritten, to HEAD as to GET, and carries
 * no ETag. A caller with the token is told paths as they are.
 *
 * @param token - The project's token
 * @param paths - The project's directory by its names, and the home directory when not this machine's
 * @returns The middleware, mounted on `/api` before the routes
 * @example
 * ```ts
 * app.use("/api", hideMachinePaths(token, { project: [root], home: homedir() }));
 * ```
 */
export function hideMachinePaths(token: StudioToken, paths: MachinePaths): RequestHandler {
  const scrub = pathScrubber(machineSpellings(paths));
  return (req: Request, res: Response, next: NextFunction): void => {
    if (token.matches(req.get(TOKEN_HEADER))) {
      next();
      return;
    }
    const json = res.json.bind(res);
    res.json = (body: unknown) =>
      json(
        res.statusCode >= 400
          ? jsonStringsRewritten(body, scrub)
          : errorFieldsRewritten(body, scrub),
      );
    rewriteMeasuredBody(res, scrub);
    rewriteSentText(res, scrub);
    next();
  };
}

/* Express measures a body in `res.send` — its length, its tag — and answers
   HEAD with the headers alone, so an error's body is rewritten before it is
   measured: a HEAD answer tells the length of the body GET sends, not of
   the one the route wrote. */
function rewriteMeasuredBody(res: Response, scrub: Rewrite): void {
  const send = res.send;
  res.send = (body?: unknown) => {
    const type = String(res.getHeader("Content-Type") ?? "");
    const shown = res.statusCode >= 400 ? sentTextRewritten(body, type, scrub) : undefined;
    return Reflect.apply(send, res, [shown ?? body]);
  };
}

/* The last stop of every body: what `res.json` and `res.send` already
   rewrote passes unchanged, anything else an error answer sends is rewritten
   here. An error answer carries no tag: no client revalidates one — Express
   answers 304 to a success alone — and a tag a route set itself names the
   body as the route wrote it. */
function rewriteSentText(res: Response, scrub: Rewrite): void {
  const end = res.end;
  res.end = (...args: unknown[]) => {
    if (res.statusCode >= 400 && !res.headersSent) {
      res.removeHeader("ETag");
      if (isUtf8(args[1])) replaceBody(res, args, scrub);
    }
    Reflect.apply(end, res, args);
    return res;
  };
}

function replaceBody(res: Response, args: unknown[], scrub: Rewrite): void {
  const body = sentTextRewritten(args[0], String(res.getHeader("Content-Type") ?? ""), scrub);
  if (body === undefined) return;
  args[0] = body;
  if (res.getHeader("Content-Length") !== undefined) {
    res.setHeader("Content-Length", Buffer.byteLength(body));
  }
}

/* `res.end(chunk, encoding)` with another encoding sends bytes this does not read as text. */
function isUtf8(encoding: unknown): boolean {
  return typeof encoding !== "string" || /^utf-?8$/i.test(encoding);
}
