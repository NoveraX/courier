import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import type { ScannedSource } from "@/features/apis/types";
import { mergeDraftErrors } from "@/features/mocks/wizard/merge-draft-errors";
import type { SourceAvailability } from "@/features/mocks/wizard/source-availability";
import { sourceAvailability } from "@/features/mocks/wizard/source-availability";
import type { DraftErrors, MockWizardState } from "@/features/mocks/wizard/types";
import { validateDrafts } from "@/features/mocks/wizard/validate-drafts";
import { useStudioStore } from "@/store";
import type { MockServerInfo } from "@/store/mock-slice";
import { useMockStore } from "@/store/mock-slice";
import { declareClient } from "./declare-client";
import { watchProject } from "./watch-project";
import { wizardBus } from "./wizard-bus";
import type { WizardSession } from "./wizard-session";
import { createWizardSession } from "./wizard-session";

/** Everything the mock wizard's dialog reads and does. */
export interface MockWizardHandle {
  open: boolean;
  state: MockWizardState;
  session: WizardSession;
  connected: boolean;
  availability: SourceAvailability;
  sources: readonly ScannedSource[];
  /** The problems of each draft, found while typing or told by Studio. */
  errors: ReadonlyMap<number, DraftErrors>;
  /** Close the dialog; ignored while an apply is in flight. */
  close: () => void;
  toggleSource: (source: string) => void;
}

/* Studio names each mock it runs from courier.mocks.ts by its key. */
function declaredKeysOf(servers: Readonly<Record<string, MockServerInfo>>): string[] {
  return Object.values(servers)
    .filter((server) => server.managed)
    .map((server) => server.serverId);
}

/**
 * The mock wizard: its session, the project it plans against, and the
 * dialog's open state. It opens on `openMockWizard()`, from its first step.
 * While it is open, a change to the project Studio runs asks for a plan
 * shown again (`WizardSession.projectChanged`); it never applies one.
 *
 * @returns What the dialog renders and calls
 *
 * @example
 * ```tsx
 * const wizard = useMockWizard();
 * return <MockWizard wizard={wizard} />;
 * ```
 */
export function useMockWizard(): MockWizardHandle {
  const session = useMemo(() => createWizardSession({ client: declareClient }), []);
  const state = useSyncExternalStore(session.subscribe, session.getState);
  const [open, setOpen] = useState(false);
  const connected = useStudioStore((s) => s.connected);
  const configStatus = useStudioStore((s) => s.configStatus);
  const sources = useStudioStore((s) => s.scanSources);
  const servers = useMockStore((s) => s.servers);
  const declaredKeys = useMemo(() => declaredKeysOf(servers), [servers]);
  const availability = sourceAvailability({
    connected,
    status: configStatus,
    sourceCount: sources.length,
  });

  const errors = useMemo(() => {
    const sourceKeys = sources.map((source) => source.name);
    const typed = validateDrafts(state.drafts, { sourceKeys, declaredKeys });
    return mergeDraftErrors(typed, state.serverErrors);
  }, [state.drafts, state.serverErrors, sources, declaredKeys]);

  useEffect(() => {
    const onOpen = (): void => {
      session.dispatch({ type: "open" });
      setOpen(true);
    };
    wizardBus.addEventListener("open", onOpen);
    return () => wizardBus.removeEventListener("open", onOpen);
  }, [session]);

  useEffect(() => {
    if (!open) return;
    return watchProject(useStudioStore, () => session.projectChanged());
  }, [session, open]);

  const close = useCallback(() => {
    if (session.getState().apply.status !== "applying") setOpen(false);
  }, [session]);

  const toggleSource = useCallback(
    (source: string) => session.dispatch({ type: "toggleSource", source, declaredKeys }),
    [session, declaredKeys],
  );

  return { open, state, session, connected, availability, sources, errors, close, toggleSource };
}
