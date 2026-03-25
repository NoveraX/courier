import { useMemo, useCallback } from "react";
import { useSearch, useNavigate } from "@tanstack/react-router";

import { useStudioStore } from "@/store";

import type { CompareTab } from "./types";
import type { CompareSearchParams } from "./search-schema";
import {
  computeTextDiff,
  computeHeaderDiff,
  computeTimingDiff,
  serializeForDiff,
  getPayloadData,
  getResponseData,
} from "./helpers";

export function useCompare() {
  const params = useSearch({ from: "/compare" }) as CompareSearchParams;
  const navigate = useNavigate({ from: "/compare" });
  const requests = useStudioStore((s) => s.requests);
  const jsonIndent = useStudioStore((s) => s.settings.jsonIndent);

  const tab: CompareTab = params.tab ?? "payload";
  const leftId = params.left;
  const rightId = params.right;

  const leftReq = useMemo(
    () => requests.find((r) => r.id === leftId),
    [requests, leftId],
  );

  const rightReq = useMemo(
    () => requests.find((r) => r.id === rightId),
    [requests, rightId],
  );

  // Memoized diffs — only computed when both sides present
  const payloadDiff = useMemo(() => {
    if (!leftReq || !rightReq) return null;
    const l = serializeForDiff(getPayloadData(leftReq), jsonIndent);
    const r = serializeForDiff(getPayloadData(rightReq), jsonIndent);
    return computeTextDiff(l, r);
  }, [leftReq, rightReq, jsonIndent]);

  const responseDiff = useMemo(() => {
    if (!leftReq || !rightReq) return null;
    const l = serializeForDiff(getResponseData(leftReq), jsonIndent);
    const r = serializeForDiff(getResponseData(rightReq), jsonIndent);
    return computeTextDiff(l, r);
  }, [leftReq, rightReq, jsonIndent]);

  const headersDiff = useMemo(() => {
    if (!leftReq || !rightReq) return null;
    return computeHeaderDiff(leftReq.headers, rightReq.headers);
  }, [leftReq, rightReq]);

  const timingDiff = useMemo(() => {
    if (!leftReq || !rightReq) return null;
    return computeTimingDiff(leftReq, rightReq);
  }, [leftReq, rightReq]);

  // URL sync
  const updateUrl = useCallback(
    (next: Partial<CompareSearchParams>) => {
      navigate({
        search: (prev: CompareSearchParams) => {
          const merged = { ...prev, ...next };
          const clean: Record<string, unknown> = {};
          for (const [k, v] of Object.entries(merged)) {
            if (v !== undefined && v !== "") clean[k] = v;
          }
          return clean;
        },
        replace: true,
      });
    },
    [navigate],
  );

  const setTab = useCallback(
    (t: CompareTab) => updateUrl({ tab: t }),
    [updateUrl],
  );

  const setLeft = useCallback(
    (id: string | undefined) => updateUrl({ left: id }),
    [updateUrl],
  );

  const setRight = useCallback(
    (id: string | undefined) => updateUrl({ right: id }),
    [updateUrl],
  );

  const swap = useCallback(
    () => updateUrl({ left: rightId, right: leftId }),
    [updateUrl, leftId, rightId],
  );

  return {
    tab,
    leftReq,
    rightReq,
    requests,
    payloadDiff,
    responseDiff,
    headersDiff,
    timingDiff,
    setTab,
    setLeft,
    setRight,
    swap,
  };
}
