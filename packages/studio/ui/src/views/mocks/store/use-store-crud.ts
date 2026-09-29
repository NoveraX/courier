import { useState } from "react";
import { toast } from "sonner";
import type { MockCommand } from "../shared/send-mock-command";
import { sendMockCommand } from "../shared/send-mock-command";

interface StoreCrudActions {
  activeCollection: string | null;
  selectCollection: (name: string) => void;
  createRecord: (serverId: string, collection: string, record: Record<string, unknown>) => void;
  updateRecord: (
    serverId: string,
    collection: string,
    id: string,
    data: Record<string, unknown>,
  ) => void;
  deleteRecords: (serverId: string, collection: string, ids: string[]) => void;
  seedCollection: (serverId: string, collection: string, count: number) => void;
  clearCollection: (serverId: string, collection: string) => void;
  seedAll: (serverId: string, count: number) => void;
}

/**
 * The collection shown in the Store view, and the changes it makes to a
 * mock's store. Each change is confirmed only once the mock has made it; one
 * the mock refuses says why.
 *
 * @returns The selected collection and the store actions
 * @example
 * ```tsx
 * const crud = useStoreCrud();
 * crud.seedCollection(server.serverId, "users", 10);
 * ```
 */
export function useStoreCrud(): StoreCrudActions {
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  return {
    activeCollection,
    selectCollection: setActiveCollection,
    createRecord: (serverId, collection, record) =>
      void run(
        { action: "mock:store:create", serverId, collection, record },
        `Created a record in ${collection}`,
        `Could not create a record in ${collection}`,
      ),
    updateRecord: (serverId, collection, id, data) =>
      void run(
        { action: "mock:store:update", serverId, collection, id, data },
        `Updated #${id}`,
        `Could not update #${id}`,
      ),
    deleteRecords: (serverId, collection, ids) => void deleteAll(serverId, collection, ids),
    seedCollection: (serverId, collection, count) =>
      void run(
        { action: "mock:store:seed", serverId, collection, count },
        `Seeded ${collection} (${count})`,
        `Could not seed ${collection}`,
      ),
    clearCollection: (serverId, collection) =>
      void run(
        { action: "mock:store:delete", serverId, collection, id: "*" },
        `Cleared ${collection}`,
        `Could not clear ${collection}`,
      ),
    seedAll: (serverId, count) =>
      void run(
        { action: "mock:store:seed", serverId, collection: "*", count },
        `Re-seeded all (${count})`,
        "Could not re-seed the store",
      ),
  };
}

async function run(command: MockCommand, done: string, failed: string): Promise<void> {
  const reply = await sendMockCommand(command);
  if (reply.ok) toast.success(done);
  else toast.error(failed, { description: reply.error });
}

/* One toast for a selection, however many records it holds. */
async function deleteAll(serverId: string, collection: string, ids: string[]): Promise<void> {
  const replies = await Promise.all(
    ids.map((id) => sendMockCommand({ action: "mock:store:delete", serverId, collection, id })),
  );
  const refused = replies.filter((reply) => !reply.ok);
  if (refused.length === 0) {
    toast.success(ids.length === 1 ? `Deleted #${ids[0]}` : `Deleted ${ids.length} records`);
    return;
  }
  toast.error(`Could not delete ${refused.length} of ${ids.length} records`, {
    description: refused[0]?.error,
  });
}
