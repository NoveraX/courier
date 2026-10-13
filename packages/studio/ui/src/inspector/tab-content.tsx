import type { InspectorTab } from "@/features/requests/inspector-tabs";
import { requestView, responseView } from "@/features/requests/payload-view";
import { failureOf } from "@/features/requests/request-failure";
import type { SnippetFlavor } from "@/features/requests/request-snippets";
import type { RequestEntry } from "@/store/types";
import { downloadRequestBody } from "./download-request-body";
import { FailureTab } from "./tabs/failure-tab";
import { HeadersTab } from "./tabs/headers-tab";
import { MessagesTab } from "./tabs/messages-tab";
import { OverviewTab } from "./tabs/overview-tab";
import type { PayloadMode } from "./tabs/payload-tab";
import { PayloadTab } from "./tabs/payload-tab";
import { SnippetsTab } from "./tabs/snippets-tab";
import { TimingTab } from "./tabs/timing-tab";

/** How the payload tabs show a body, kept while the inspector moves between requests. */
export interface PayloadControls {
  mode: PayloadMode;
  onMode: (mode: PayloadMode) => void;
}

/** Which snippet the Snippets tab shows, kept while the inspector moves between requests. */
export interface SnippetControls {
  flavor: SnippetFlavor;
  onFlavor: (flavor: SnippetFlavor) => void;
}

interface TabContentProps {
  request: RequestEntry;
  current: InspectorTab;
  payload: PayloadControls;
  snippets: SnippetControls;
}

/**
 * What the inspector shows of a request under the tab open.
 *
 * @param props - The request, the tab, and how the payload and snippet tabs show it
 * @returns The tab's content
 * @example
 * ```tsx
 * <TabContent request={request} current="headers" payload={payload} snippets={snippets} />
 * ```
 */
export function TabContent({
  request,
  current,
  payload,
  snippets,
}: TabContentProps): React.ReactNode {
  switch (current) {
    case "overview":
      return <OverviewTab request={request} />;
    case "failure": {
      const failure = failureOf(request);
      return failure ? <FailureTab request={request} failure={failure} /> : null;
    }
    case "response":
      return (
        <PayloadTab
          view={responseView(request)}
          mode={payload.mode}
          onMode={payload.onMode}
          onWhole={() => void downloadRequestBody(request, "response")}
          searchLabel="Find in the answer"
        />
      );
    case "request":
      return (
        <PayloadTab
          view={requestView(request)}
          mode={payload.mode}
          onMode={payload.onMode}
          onWhole={() => void downloadRequestBody(request, "request")}
          searchLabel="Find in the request"
        />
      );
    case "headers":
      return <HeadersTab request={request} />;
    case "timing":
      return <TimingTab request={request} />;
    case "snippets":
      return (
        <SnippetsTab
          request={request}
          flavor={snippets.flavor}
          onFlavor={snippets.onFlavor}
          onWhole={() => void downloadRequestBody(request, "request")}
        />
      );
    case "messages":
      return <MessagesTab request={request} />;
  }
}
