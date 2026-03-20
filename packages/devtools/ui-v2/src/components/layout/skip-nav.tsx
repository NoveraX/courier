/** Anchor ID placed on the main content area. */
export const MAIN_CONTENT_ID = "main-content";

/**
 * Visually hidden link that becomes visible on focus.
 * Lets keyboard users skip sidebar/topbar and jump to main content.
 */
export function SkipNav(): React.ReactElement {
  return (
    <a
      href={`#${MAIN_CONTENT_ID}`}
      className="fixed left-4 top-2 z-100 -translate-y-16 rounded-md bg-accent-brand px-4 py-2 text-body-sm font-medium text-white transition-transform focus:translate-y-0"
    >
      Skip to content
    </a>
  );
}
