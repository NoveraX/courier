import { create } from "zustand";

import type { PickedEndpoint } from "@/apis/use-manage";

/** An import to manage, asked for from another page, with an endpoint picked to add. */
export interface ManageRequest {
  /** The import's name: the source it declares. */
  source: string;
  picked: PickedEndpoint;
}

/**
 * An import the APIs page is asked to open in its manage dialog: the
 * Explorer asks for one declared from traffic, to add an endpoint its
 * traffic shows.
 */
export const useManageRequest = create<{ request: ManageRequest | null }>(() => ({
  request: null,
}));
