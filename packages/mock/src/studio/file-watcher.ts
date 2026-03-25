import { type FSWatcher, watch } from "node:fs";
import { resolve } from "node:path";

/** Options for the mock config file watcher */
export interface FileWatcherOptions {
  /** Directories or files to watch */
  paths: string[];
  /** Callback when a file changes */
  onChange: (filePath: string) => void;
  /** Debounce interval in ms (default: 300) */
  debounce?: number;
}

/** Active file watcher — call stop() to tear down */
export interface FileWatcherHandle {
  /** Stop watching all files */
  stop(): void;
  /** Number of paths being watched */
  watchCount: number;
}

/**
 * Watch mock config files for changes (scenarios, overrides, factories).
 * Debounces rapid changes to avoid duplicate reloads.
 *
 * Uses Node.js `fs.watch` — zero dependencies.
 */
export function createFileWatcher(options: FileWatcherOptions): FileWatcherHandle {
  const { paths, onChange, debounce = 300 } = options;
  const watchers: FSWatcher[] = [];
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  for (const rawPath of paths) {
    const fullPath = resolve(rawPath);
    try {
      const watcher = watch(fullPath, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        const filePath = `${fullPath}/${filename}`;

        // Debounce per file
        const existing = timers.get(filePath);
        if (existing) clearTimeout(existing);

        timers.set(
          filePath,
          setTimeout(() => {
            timers.delete(filePath);
            onChange(filePath);
          }, debounce),
        );
      });
      watchers.push(watcher);
    } catch {
      // Path doesn't exist — skip silently
    }
  }

  return {
    stop() {
      for (const watcher of watchers) {
        watcher.close();
      }
      for (const timer of timers.values()) {
        clearTimeout(timer);
      }
      timers.clear();
      watchers.length = 0;
    },
    get watchCount() {
      return watchers.length;
    },
  };
}
