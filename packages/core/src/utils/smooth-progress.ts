import type { UploadProgress } from "../http-client/types";

/** How a smoothed progress callback reports. */
export interface SmoothProgressOptions {
  /** How often the bar is moved, in ms (default: 30). */
  everyMs?: number | undefined;
  /** How quickly the bar closes on the transfer: the time it takes to close two thirds of the gap, in ms (default: 120). */
  easeMs?: number | undefined;
}

/* The least the bar moves in a step while behind, so its last stretch does not crawl. */
const MIN_STEP = 0.005;

/**
 * Wrap a progress callback so a bar moves smoothly instead of in steps. A
 * browser reports an upload every 100 ms or so, a step of several percent
 * each on a slow link; a server reports in bursts, as `fetch` takes its
 * body. The wrapper moves the bar every `everyMs` toward what the transfer
 * last reported, closing two thirds of the gap each `easeMs`: it never runs
 * ahead of the transfer, never goes back, and comes to rest — at 100% too —
 * where the transfer is. A transfer with no size to report against, a
 * stream, is told as it reports. Each transfer takes a wrapper of its own.
 *
 * Progress counts the bytes handed to the network, as each platform reports
 * them: they reach the server a moment later, so 100% comes a little before
 * the answer does.
 *
 * @param onProgress - What the bar is told
 * @param options - How often, and how quickly, the bar moves
 * @returns The callback to give the call
 * @example
 * ```ts
 * await caller.files.with({ onUploadProgress: smoothProgress((p) => setPercent(p.percent)) }).upload(form);
 * ```
 */
export function smoothProgress<TProgress extends UploadProgress>(
  onProgress: (progress: TProgress) => void,
  { everyMs = 30, easeMs = 120 }: SmoothProgressOptions = {},
): (progress: TProgress) => void {
  const share = 1 - Math.exp(-everyMs / easeMs);
  let real: TProgress | undefined;
  let shown = -1;
  let timer: ReturnType<typeof setInterval> | undefined;

  const show = (percent: number): void => {
    if (!real || percent <= shown) return;
    shown = percent;
    onProgress({ ...real, percent, transferredBytes: Math.round(percent * real.totalBytes) });
  };
  const tick = (): void => {
    if (!real || shown >= real.percent) {
      clearInterval(timer);
      timer = undefined;
      return;
    }
    const gap = real.percent - shown;
    show(Math.min(real.percent, shown + Math.max(gap * share, MIN_STEP)));
  };

  return (progress) => {
    /* With no size to report against, every event says 0% but the last: each goes as it is. */
    if (progress.totalBytes === 0) {
      onProgress(progress);
      return;
    }
    real = progress;
    /* The bar starts at 0, told at once, whatever the first event says. */
    if (shown < 0) show(0);
    if (timer === undefined && shown < progress.percent) timer = setInterval(tick, everyMs);
  };
}
