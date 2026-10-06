/** The tones Studio colours state and figures in. */
export type Tone = "ok" | "warn" | "err" | "brand" | "muted" | "normal";

/** Text in a tone. */
export const TONE_TEXT: Readonly<Record<Tone, string>> = {
  ok: "text-ok",
  warn: "text-warn",
  err: "text-err",
  brand: "text-brand",
  muted: "text-fg-subtle",
  normal: "text-fg",
};

/** A solid fill — a bar, a track — in a tone. */
export const TONE_FILL: Readonly<Record<Tone, string>> = {
  ok: "bg-ok",
  warn: "bg-warn",
  err: "bg-err",
  brand: "bg-brand",
  muted: "bg-fg-subtle",
  normal: "bg-fg",
};

/** A tinted ground in a tone, for a badge or an icon's square. */
export const TONE_DIM: Readonly<Record<Tone, string>> = {
  ok: "bg-ok-dim",
  warn: "bg-warn-dim",
  err: "bg-err-dim",
  brand: "bg-brand-dim",
  muted: "bg-raised",
  normal: "bg-raised",
};
