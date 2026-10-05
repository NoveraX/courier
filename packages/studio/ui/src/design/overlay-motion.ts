/**
 * How every overlay in Studio comes and goes, as classes on its Radix part:
 * Radix keeps a closing part on screen until its animation ends, so each
 * leaves as it came. A reader who asks for less motion gets none.
 */

/** A dialog's dimmed ground: fades in, fades out. */
export const SCRIM_MOTION =
  "data-[state=open]:animate-scrim-in data-[state=closed]:animate-scrim-out";

/** A dialog: rises out of a soft blur, and sinks back into one. */
export const DIALOG_MOTION =
  "data-[state=open]:animate-dialog-in data-[state=closed]:animate-dialog-out";

/** A menu or a popover: drops into place, and lifts away. */
export const POP_MOTION = "animate-pop-in data-[state=closed]:animate-pop-out";
