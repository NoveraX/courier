import type { Request, Response } from "express"

import type { SandboxStore } from "./data/sandbox-store"
import type { DemoData, DemoView } from "./data/types"
import { visitorCookie, visitorIn } from "./visitor-cookie"

/** The data of the visitor a call comes from, as the routes read and change it. */
export interface Visits {
  /**
   * The data the visitor's call reads.
   *
   * @param req - The call
   * @returns Their data, or the examples' first data while they have none of their own
   */
  read(req: Request): DemoView
  /**
   * Make a change to the visitor's data, handing them the cookie of the
   * copy their first change makes.
   *
   * @param req - The call
   * @param res - Its answer, which carries the cookie
   * @param change - What to change, returning what the call answers
   * @returns What the change returned
   */
  change<TResult>(req: Request, res: Response, change: (data: DemoData) => TResult): TResult
}

/**
 * Each call's visitor, as the cookie it carries names them, kept apart in
 * the store.
 *
 * @param store - Where each visitor's data is kept
 * @param lifetimeMs - How long the store keeps a visitor's data at most, which the cookie lasts
 * @returns The visits
 * @example
 * ```ts
 * const user = visits.change(req, res, (data) => addUser(data, fields, making))
 * ```
 */
export function visitsIn(store: SandboxStore, lifetimeMs: number): Visits {
  return {
    read: (req) => store.read(visitorIn(req.headers.cookie)),
    change(req, res, change) {
      const { result, visitor, made } = store.change(visitorIn(req.headers.cookie), change)
      if (made) res.append("Set-Cookie", visitorCookie(visitor, lifetimeMs))
      return result
    },
  }
}
