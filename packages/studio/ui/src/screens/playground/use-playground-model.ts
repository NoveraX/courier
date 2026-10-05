import { useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useMemo } from "react";

import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import { endpointChoicesOf } from "@/features/playground/endpoint-choices";
import { sendableCatalog } from "@/features/playground/sendable-catalog";
import { inspectorOf } from "@/features/requests/inspector-of";
import { useCatalog } from "@/hooks/use-catalog";
import { useStudioStore } from "@/store";

/** The endpoints the Playground can send to, the one chosen, and what chooses another. */
export interface PlaygroundModel {
  choices: PlaygroundEndpoint[];
  endpoint: PlaygroundEndpoint | undefined;
  choose: (endpoint: PlaygroundEndpoint) => void;
}

/**
 * The Playground's endpoints — those of a source the config declares or an
 * attached app serves — and the one its address names, the first while it
 * names none it knows.
 *
 * @returns The endpoints, the one chosen, and what chooses another
 * @example
 * ```ts
 * const { endpoint, choose } = usePlaygroundModel();
 * ```
 */
export function usePlaygroundModel(): PlaygroundModel {
  const catalog = useCatalog();
  const declared = useStudioStore((s) => s.scanSources);
  const rows = useStudioStore((s) => s.bindingSnapshot.rows);
  const choices = useMemo(
    () => endpointChoicesOf(sendableCatalog(catalog, declared, rows)),
    [catalog, declared, rows],
  );
  const { endpoint: key } = useSearch({ from: "/playground" });
  const navigate = useNavigate({ from: "/playground" });
  const choose = useCallback(
    (next: PlaygroundEndpoint) =>
      void navigate({ search: (prev) => ({ ...inspectorOf(prev), endpoint: next.key }) }),
    [navigate],
  );
  return { choices, endpoint: choices.find((c) => c.key === key) ?? choices[0], choose };
}
