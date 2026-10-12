import { Globe, Zap } from "lucide-react";

import { MEDIA } from "@/design/breakpoints";
import type { SegmentedOption } from "@/design/segmented";
import { Segmented } from "@/design/segmented";
import type { PlaygroundEndpoint } from "@/features/playground/endpoint-choices";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { PlaygroundHistoryEntry } from "@/store/types-ui";
import { EndpointPicker } from "./endpoint-picker";
import { HistoryMenu } from "./history-menu";
import type { SendAction } from "./send-button";
import { SendButton } from "./send-button";

const MODES: readonly SegmentedOption<"direct" | "proxy">[] = [
  { value: "direct", label: "Direct", icon: Zap },
  { value: "proxy", label: "Proxy", icon: Globe },
];

/* A phone's second row holds the mode, the recent sends and Send: the modes go by their names alone. */
const NAMED_MODES = MODES.map(({ value, label }) => ({ value, label }));

interface PlaygroundToolbarProps {
  choices: readonly PlaygroundEndpoint[];
  endpoint: PlaygroundEndpoint;
  onChoose: (endpoint: PlaygroundEndpoint) => void;
  mode: "direct" | "proxy";
  onMode: (mode: "direct" | "proxy") => void;
  history: {
    now: number;
    labelOf: (entry: PlaygroundHistoryEntry) => string;
    onPick: (entry: PlaygroundHistoryEntry) => void;
  };
  action: SendAction;
  onPrimary: () => void;
}

/**
 * The Playground's bar: the endpoint, whether the call goes straight to
 * the API or through the app's Courier proxy, the recent sends, and the
 * primary button. On a phone the endpoint takes the first row, and the
 * mode, the recent sends and the primary button the second, the button at
 * its end.
 *
 * @param props - The endpoints and the one chosen, the mode, the history, and the primary action
 * @returns The bar
 * @example
 * ```tsx
 * <PlaygroundToolbar choices={choices} endpoint={endpoint} onChoose={choose} mode="direct" onMode={setMode} history={history} action="send" onPrimary={send} />
 * ```
 */
export function PlaygroundToolbar(props: PlaygroundToolbarProps): React.ReactNode {
  const { choices, endpoint, onChoose, mode, onMode, history, action, onPrimary } = props;
  const phone = useMediaQuery(MEDIA.phone);
  return (
    <div className="flex min-h-13.5 shrink-0 flex-wrap items-center gap-2 border-b border-line py-2.5 pr-4 pl-5 pointer-coarse:py-2">
      <EndpointPicker choices={choices} current={endpoint} onChoose={onChoose} />
      <span
        title={
          mode === "direct"
            ? "Run the call on the runtime, straight to the API"
            : "Send the call through the app's Courier proxy route"
        }
        className="flex"
      >
        <Segmented
          label="Mode"
          options={phone ? NAMED_MODES : MODES}
          value={mode}
          onChange={onMode}
          quiet="subtle"
        />
      </span>
      <HistoryMenu now={history.now} labelOf={history.labelOf} onPick={history.onPick} />
      <SendButton action={action} transport={endpoint.transport} onClick={onPrimary} />
    </div>
  );
}
