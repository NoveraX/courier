import type { StateCreator } from "zustand";

import type { StudioState } from "./store-types";

/** Zustand's `set` for the Studio store, as each group of its actions receives it. */
export type StudioSet = Parameters<StateCreator<StudioState>>[0];

/** Zustand's `get` for the Studio store, as each group of its actions receives it. */
export type StudioGet = Parameters<StateCreator<StudioState>>[1];
