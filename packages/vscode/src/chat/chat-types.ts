import type * as vscode from "vscode";

import type { RecordedRequest, RequestQuery } from "../studio/live-types";
import type {
  CallSite,
  EndpointDefinition,
  EndpointName,
  EndpointStats,
  Finding,
} from "../studio/studio-types";

/** What @courier reads its answers from. */
export interface ChatDeps {
  /** The Studios a question may mean: the one of the file in front, or every one running */
  studios(): Promise<readonly string[]>;
  /** The endpoint the cursor is on — a call to it, or its declaration — in the file in front */
  endpointInFront(): Promise<EndpointName | undefined>;
  fetchStats(studio: string): Promise<EndpointStats[]>;
  fetchRequests(studio: string, wanted: RequestQuery): Promise<RecordedRequest[]>;
  fetchFindings(studio: string): Promise<Finding[]>;
  definitionsFor(studio: string): Promise<readonly EndpointDefinition[]>;
  fetchSites(studio: string, source: string, endpoint: string): Promise<CallSite[]>;
  /** A model to answer in words with, when the request brings none */
  model(): Promise<vscode.LanguageModelChat | undefined>;
}

/** A request to @courier, as the chat hands it over. */
export interface ChatTurn {
  readonly request: vscode.ChatRequest;
  readonly context: vscode.ChatContext;
  readonly stream: vscode.ChatResponseStream;
  readonly token: vscode.CancellationToken;
}

/** A request to @courier with what answers it: its Studio, and the endpoints' figures. */
export interface ChatAsk extends ChatTurn {
  readonly deps: ChatDeps;
  readonly studio: string;
  readonly stats: readonly EndpointStats[];
  readonly now: number;
}
