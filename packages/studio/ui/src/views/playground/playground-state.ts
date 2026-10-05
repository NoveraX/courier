import type { Dispatch, SetStateAction } from "react";
import type { FormBodyField } from "@/features/playground/form-body";
import type { Catalog, CatalogEndpoint, CatalogEntry } from "@/store/types-ui";
import type { BodyKind } from "./body-section";

/** The Playground's choice of endpoint, the request it is writing, and how to change both. */
export interface PlaygroundState {
  /** The endpoints the Playground can send to, by source */
  sourceMap: Catalog;
  sources: string[];
  groups: string[];
  methods: string[];
  sourceInfo: CatalogEntry | null;
  groupPrefix: string;
  endpointInfo: CatalogEndpoint | null;
  source: string;
  group: string;
  method: string;
  setSource: (s: string) => void;
  setGroup: (g: string) => void;
  setMethod: Dispatch<SetStateAction<string | null>>;
  selectEndpoint: (s: string, g: string, m: string) => void;
  /** The Variables editor's text */
  variables: string;
  setVariables: Dispatch<SetStateAction<string>>;
  /** The Headers editor's text */
  headers: string;
  setHeaders: Dispatch<SetStateAction<string>>;
  mode: "direct" | "proxy";
  setMode: Dispatch<SetStateAction<"direct" | "proxy">>;
  bodyKind: BodyKind;
  setBodyKind: Dispatch<SetStateAction<BodyKind>>;
  formFields: FormBodyField[];
  setFormFields: Dispatch<SetStateAction<FormBodyField[]>>;
  responseTab: string;
  setResponseTab: Dispatch<SetStateAction<string>>;
  /** Whether an endpoint is chosen that the Playground can send to */
  canSend: boolean;
}
