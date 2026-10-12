import { Upload } from "lucide-react";

import { Segmented } from "@/design/segmented";
import { bandwidthLabel } from "@/features/mocks/network-condition";
import { optionsWith } from "@/features/mocks/preset-options";
import {
  SIZE_LIMITS,
  sizeLimitLabel,
  UPLOAD_SPEEDS,
  uploadsOf,
} from "@/features/mocks/upload-conditions";
import { setUploads } from "@/mocks/network-commands";
import type { MockServerInfo, UploadConditions } from "@/store/mock-slice";
import { NetworkCard } from "./network-card";
import { TypesField } from "./types-field";

const speedLabel = (kbps: number): string => (kbps === 0 ? "Unlimited" : bandwidthLabel(kbps));
const limitLabel = (bytes: number): string => (bytes === 0 ? "None" : sizeLimitLabel(bytes));

/* The conditions with one of them set anew; a speed or a limit of 0, or no types, is none. */
function withCondition(uploads: UploadConditions, patch: UploadConditions): UploadConditions {
  const { bandwidth = 0, maxBytes = 0, accept = [] } = { ...uploads, ...patch };
  return {
    ...(bandwidth > 0 && { bandwidth }),
    ...(maxBytes > 0 && { maxBytes }),
    ...(accept.length > 0 && { accept }),
  };
}

function Row({
  label,
  hint,
  children,
}: {
  label: string;
  hint: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
      <span className="flex flex-col gap-px">
        <span className="text-control font-strong">{label}</span>
        <span className="text-badge text-fg-subtle">{hint}</span>
      </span>
      {children}
    </div>
  );
}

/**
 * How the mock takes uploads: how fast request bodies arrive — so an
 * upload's progress moves as it would on a slow link — the largest upload
 * it takes, answering a larger one 413, and the types of file it takes,
 * answering a file of another 415. Each condition goes to the mock as it
 * is set; a route can set its own limit and types in Per-route overrides.
 *
 * @param props - The mock server, and whether it can take a change
 * @returns The card
 * @example
 * ```tsx
 * <UploadsPanel server={server} disabled={false} />
 * ```
 */
export function UploadsPanel({
  server,
  disabled,
}: {
  server: MockServerInfo;
  disabled: boolean;
}): React.ReactNode {
  const uploads = uploadsOf(server);
  const speed = uploads.bandwidth ?? 0;
  const limit = uploads.maxBytes ?? 0;
  const set = (patch: UploadConditions): void => setUploads(server, withCondition(uploads, patch));
  return (
    <NetworkCard icon={Upload} tone="text-syntax-function" title="Uploads" note="request bodies">
      <fieldset
        disabled={disabled}
        className="m-0 flex min-w-0 flex-col gap-4 border-0 p-4.5 disabled:opacity-50"
      >
        <Row label="Upload speed" hint="every body, JSON included">
          <div className="scroll-row max-w-full min-w-0">
            <Segmented
              label="Upload speed"
              quiet="subtle"
              options={optionsWith(UPLOAD_SPEEDS, speed, speedLabel)}
              value={String(speed)}
              onChange={(kbps) => set({ bandwidth: Number(kbps) })}
            />
          </div>
        </Row>
        <Row label="Size limit" hint="413 for a larger upload">
          <div className="scroll-row max-w-full min-w-0">
            <Segmented
              label="Size limit"
              quiet="subtle"
              options={optionsWith(SIZE_LIMITS, limit, limitLabel)}
              value={String(limit)}
              onChange={(bytes) => set({ maxBytes: Number(bytes) })}
            />
          </div>
        </Row>
        <Row label="File types" hint="415 for a file of another">
          <TypesField
            label="File types"
            placeholder="Any type"
            value={uploads.accept}
            onCommit={(accept) => set({ accept })}
            className="w-56 max-w-full"
          />
        </Row>
      </fieldset>
    </NetworkCard>
  );
}
