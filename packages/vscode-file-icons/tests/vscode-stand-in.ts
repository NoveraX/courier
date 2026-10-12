/*
 * The few parts of VS Code's API Courier File Icons uses, standing in for
 * the editor in tests that run outside it.
 */
type Listener<TEvent> = (event: TEvent) => void;
type Held = { dispose(): unknown };

export class EventEmitter<TEvent> {
  private readonly listeners = new Set<Listener<TEvent>>();
  readonly event = (listener: Listener<TEvent>) => {
    this.listeners.add(listener);
    return { dispose: () => this.listeners.delete(listener) };
  };
  fire(event: TEvent): void {
    for (const listener of this.listeners) listener(event);
  }
  dispose(): void {
    this.listeners.clear();
  }
}

export class Uri {
  private constructor(
    readonly scheme: string,
    readonly fsPath: string,
  ) {}
  static file(path: string): Uri {
    return new Uri("file", path);
  }
  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export const Disposable = {
  from: (...held: Held[]): Held => ({ dispose: () => held.map((each) => each.dispose()) }),
};

/** The settings the code reads — the user's, as a test sets them — by their full key: `courier.fileIcons.offer`. */
export const settings = new Map<string, unknown>();

/** The settings of the workspace open, by their full key, which take the place of the user's. */
export const workspaceSettings = new Map<string, unknown>();

export const ConfigurationTarget = { Global: 1, Workspace: 2, WorkspaceFolder: 3 } as const;

/** What another extension does when a setting changes, as a test has it react. */
export const settingsChanged: ((key: string) => void)[] = [];

/** Who listens for changes of the settings, as the code registered them. */
export const configurationListeners = new Set<
  (change: { affectsConfiguration(key: string): boolean }) => unknown
>();

/** The Courier configs the workspace holds, as the editor's search finds them. */
export const workspaceConfigs: string[] = [];

/** Who watches the workspace's Courier configs come and go. */
export const configWatchers = new EventEmitter<void>();

/** Who listens for the user trusting the workspace. */
export const trustGranted = new EventEmitter<void>();

const configuration = (section?: string) => {
  const full = (key: string) => (section ? `${section}.${key}` : key);
  return {
    get: (key: string, fallback?: unknown) =>
      workspaceSettings.get(full(key)) ?? settings.get(full(key)) ?? fallback,
    inspect: (key: string) => ({
      key: full(key),
      globalValue: settings.get(full(key)),
      workspaceValue: workspaceSettings.get(full(key)),
    }),
    update: async (key: string, value: unknown, target: number = ConfigurationTarget.Global) => {
      const scope = target === ConfigurationTarget.Global ? settings : workspaceSettings;
      if (value === undefined) scope.delete(full(key));
      else scope.set(full(key), value);
      for (const listener of settingsChanged) listener(full(key));
    },
  };
};

export const workspace = {
  workspaceFolders: undefined as { uri: { fsPath: string } }[] | undefined,
  isTrusted: true,
  getConfiguration: configuration,
  onDidChangeConfiguration: (
    listener: (change: { affectsConfiguration(key: string): boolean }) => unknown,
  ) => {
    configurationListeners.add(listener);
    return { dispose: () => configurationListeners.delete(listener) };
  },
  findFiles: async () => workspaceConfigs.map((path) => Uri.file(path)),
  createFileSystemWatcher: () => ({
    onDidCreate: configWatchers.event,
    onDidDelete: configWatchers.event,
    dispose: () => undefined,
  }),
  onDidChangeWorkspaceFolders: () => ({ dispose: () => undefined }),
  onDidGrantWorkspaceTrust: trustGranted.event,
};

/** The extensions installed where this extension runs, by id, as a test installs them. */
export const installed = new Map<
  string,
  { extensionPath: string; isActive?: boolean; activate?: () => Promise<unknown> }
>();

/** Who listens for extensions installed and taken out, as the code registered them. */
export const extensionListeners = new EventEmitter<void>();

export const extensions = {
  getExtension: (id: string) => installed.get(id),
  onDidChange: extensionListeners.event,
};

/** What the code showed the user. */
export const shown = { warnings: [] as string[], infos: [] as string[] };

/** The picks a test makes for the user, and the buttons they press. */
export const asked = { picks: [] as unknown[], buttons: [] as string[] };

/** What the code wrote to its log, level and line. */
export const logged: [string, string][] = [];

export const window = {
  showWarningMessage: async (message: string) => {
    shown.warnings.push(message);
    return undefined;
  },
  showInformationMessage: async (message: string) => {
    shown.infos.push(message);
    return asked.buttons.shift();
  },
  createOutputChannel: () => ({
    trace: (line: string) => logged.push(["trace", line]),
    info: (line: string) => logged.push(["info", line]),
    warn: (line: string) => logged.push(["warn", line]),
    error: (line: string) => logged.push(["error", line]),
    show: () => undefined,
    dispose: () => undefined,
  }),
  showQuickPick: async <TItem>(items: readonly TItem[]) => {
    const wanted = asked.picks.shift();
    return items.find((item) => JSON.stringify(item).includes(String(wanted)));
  },
};

/** The editor itself: its build's name, and the remote a window is connected to, if any. */
export const env = {
  appName: "Visual Studio Code",
  remoteName: undefined as string | undefined,
};

/** The commands registered, by name, as the code registered them. */
export const registered = new Map<string, (...args: unknown[]) => unknown>();

/** The commands the code ran, each with its arguments. */
export const executed: unknown[][] = [];

/** Commands other extensions registered, as a test has them. */
export const elsewhere: string[] = [];

export const commands = {
  registerCommand: (name: string, handler: (...args: unknown[]) => unknown) => {
    registered.set(name, handler);
    return { dispose: () => registered.delete(name) };
  },
  executeCommand: async (name: string, ...args: unknown[]) => {
    executed.push([name, ...args]);
    return undefined;
  },
  getCommands: async () => [...registered.keys(), ...elsewhere],
};
