import type { StudioTarget } from "../projects/studio-targets";
import { type StudioFinder, studioInFront } from "./studio-in-front";

/**
 * The Studios a command may mean: the one of the file in front, or, with
 * none in front, every Studio the workspace's projects run.
 *
 * @param studioFor - What finds a file's Studio
 * @param targets - The workspace's Studios
 * @returns Their addresses, each once
 * @example
 * ```ts
 * const studios = await studiosAtHand(core.studioFor, core.view.targets);
 * ```
 */
export async function studiosAtHand(
  studioFor: StudioFinder,
  targets: () => Promise<readonly StudioTarget[]>,
): Promise<readonly string[]> {
  const front = await studioInFront(studioFor);
  if (front) return [front];
  const running = (await targets()).flatMap((target) => (target.studio ? [target.studio] : []));
  return [...new Set(running)];
}

/**
 * The Studio a command means: the one of the file in front, or the only
 * one the workspace runs.
 *
 * @param studioFor - What finds a file's Studio
 * @param targets - The workspace's Studios
 * @returns Its address, or `undefined` while none runs, or several do and none is in front
 * @example
 * ```ts
 * const studio = await studioAtHand(core.studioFor, core.view.targets);
 * ```
 */
export async function studioAtHand(
  studioFor: StudioFinder,
  targets: () => Promise<readonly StudioTarget[]>,
): Promise<string | undefined> {
  const studios = await studiosAtHand(studioFor, targets);
  return studios.length === 1 ? studios[0] : undefined;
}
