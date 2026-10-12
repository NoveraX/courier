import { Outlet } from "@tanstack/react-router";

import { mockBannerOf } from "@/features/mocks/mock-banner";
import { useMockWizard } from "@/mocks/wizard/use-mock-wizard";
import { useStudioStore } from "@/store";
import { MocksBanner } from "./mocks-banner";
import { MocksBar } from "./mocks-bar";
import { useMockRecords } from "./use-mock-records";
import { useMockServer } from "./use-mock-server";
import { GenerateMocksDialog } from "./wizard/generate-mocks-dialog";

/**
 * The Mocks pages: the bar with the tabs, the server in use and the way to
 * generate mocks; the banner when something is not as written; the tab;
 * and the dialog that generates mocks.
 *
 * @returns The layout
 * @example
 * ```tsx
 * <MocksLayout />
 * ```
 */
export function MocksLayout(): React.ReactNode {
  const { server, servers } = useMockServer();
  /* Asked for as the section opens, the records are there when its Store tab is. */
  useMockRecords(server);
  const file = useStudioStore((s) => s.mocksFileStatus);
  const wizard = useMockWizard();
  const banner = mockBannerOf(server, file);
  return (
    <div className="flex h-full min-h-0 flex-col">
      <MocksBar server={server} servers={servers} />
      {banner && <MocksBanner banner={banner} server={server} />}
      <div className="flex min-h-0 flex-1 flex-col overflow-auto">
        <Outlet />
      </div>
      <GenerateMocksDialog wizard={wizard} />
    </div>
  );
}
