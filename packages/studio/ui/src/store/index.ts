import { create } from "zustand";
import { editorThemeInLink } from "@/features/editor/editor-theme";
import { createActions } from "./actions";
import { loadSettings } from "./constants";
import { createInitialState } from "./initial-state";
import type { StudioState } from "./store-types";
import { applyTheme } from "./theme";

export { DEFAULT_SETTINGS, EMPTY_FILTERS, MAX_REQUESTS, PLAYGROUND_MAX_HISTORY } from "./constants";
export type { StudioState } from "./store-types";
// Re-export types consumers need
export type {
  EventType,
  MiddlewareEntry,
  ProxyTiming,
  RequestTiming,
  StudioEvent,
  ValidationIssue,
} from "./types-events";
export type {
  RequestEntry,
  RequestStatus,
} from "./types-request";
export type {
  ApisClient,
  ApisGroupBy,
  BindingErrorPayload,
  BindingSnapshot,
  BindingStatusKind,
  BindingStatusRow,
  BindingTransport,
  Catalog,
  CatalogEndpoint,
  CatalogEntry,
  CatalogGroup,
  ConnectionStatus,
  EndpointInfo,
  ExportFormat,
  GroupInfo,
  JsonIndent,
  PlaygroundHistoryEntry,
  Settings,
  SourceInfo,
  SourceMap,
  Theme,
  TimelineFilters,
  TimestampFormat,
  ValidationLib,
  WaterfallGroupBy,
  WaterfallSortField,
} from "./types-ui";

// ── Initialize appearance from persisted settings ────────────────────────────

const savedSettings = loadSettings();
applyTheme(editorThemeInLink() ?? savedSettings.theme);

// ── Store ───────────────────────────────────────────────────────────────────

export const useStudioStore = create<StudioState>((set, get) => ({
  ...createInitialState(savedSettings.theme),
  ...createActions(set, get),
}));
