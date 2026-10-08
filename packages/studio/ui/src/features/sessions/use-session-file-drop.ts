import { useState } from "react";

import { openSessionFile } from "./open-session-file";

/** What makes an element take a dropped session file. */
export interface SessionFileDropHandlers {
  onDragEnter: (event: React.DragEvent) => void;
  onDragOver: (event: React.DragEvent) => void;
  onDragLeave: (event: React.DragEvent) => void;
  onDrop: (event: React.DragEvent) => void;
}

function carriesFiles(event: React.DragEvent): boolean {
  return Array.from(event.dataTransfer.types).includes("Files");
}

/**
 * Open a session file dropped on an element, and say while a file is
 * dragged over it — counted across its children, so the state holds while
 * the pointer crosses them. A drag of anything but files is left alone.
 *
 * @returns Whether a file is over the element, and the handlers it takes
 * @example
 * ```tsx
 * const { over, handlers } = useSessionFileDrop();
 * <div {...handlers}>{over && <DropHint />}</div>
 * ```
 */
export function useSessionFileDrop(): { over: boolean; handlers: SessionFileDropHandlers } {
  const [depth, setDepth] = useState(0);
  return {
    over: depth > 0,
    handlers: {
      onDragEnter: (event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDepth((entered) => entered + 1);
      },
      onDragOver: (event) => {
        if (carriesFiles(event)) event.preventDefault();
      },
      onDragLeave: (event) => {
        if (carriesFiles(event)) setDepth((entered) => Math.max(0, entered - 1));
      },
      onDrop: (event) => {
        if (!carriesFiles(event)) return;
        event.preventDefault();
        setDepth(0);
        const file = event.dataTransfer.files[0];
        if (file) void openSessionFile(file);
      },
    },
  };
}
