import { useState } from "react";
import { toast } from "sonner";
import { getSocket } from "@/socket";

interface StoreCrudActions {
  activeCollection: string | null;
  selectCollection: (name: string) => void;
  createRecord: (serverId: string, collection: string, record: Record<string, unknown>) => void;
  updateRecord: (serverId: string, collection: string, id: string, data: Record<string, unknown>) => void;
  deleteRecord: (serverId: string, collection: string, recordId: string) => void;
  seedCollection: (serverId: string, collection: string, count: number) => void;
  clearCollection: (serverId: string, collection: string) => void;
  seedAll: (serverId: string, count: number) => void;
}

export function useStoreCrud(): StoreCrudActions {
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  const sendCommand = (action: string, payload: Record<string, unknown>, label: string) => {
    try {
      getSocket().emit("mock:command", { action, ...payload });
      toast.success(label);
    } catch {
      toast.error(`Failed: ${label}`);
    }
  };

  const createRecord = (serverId: string, collection: string, record: Record<string, unknown>) => {
    sendCommand("mock:store:create", { serverId, collection, record }, `Created record in ${collection}`);
  };

  const updateRecord = (serverId: string, collection: string, id: string, data: Record<string, unknown>) => {
    sendCommand("mock:store:update", { serverId, collection, id, data }, `Updated #${id}`);
  };

  const seedCollection = (serverId: string, collection: string, count: number) => {
    sendCommand("mock:store:seed", { serverId, collection, count }, `Seeded ${collection} (${count})`);
  };

  const clearCollection = (serverId: string, collection: string) => {
    sendCommand("mock:store:delete", { serverId, collection, id: "*" }, `Cleared ${collection}`);
  };

  const deleteRecord = (serverId: string, collection: string, recordId: string) => {
    sendCommand("mock:store:delete", { serverId, collection, id: recordId }, `Deleted #${recordId}`);
  };

  const seedAll = (serverId: string, count: number) => {
    sendCommand("mock:store:seed", { serverId, collection: "*", count }, `Re-seeded all (${count})`);
  };

  return {
    activeCollection,
    selectCollection: setActiveCollection,
    createRecord,
    updateRecord,
    deleteRecord,
    seedCollection,
    clearCollection,
    seedAll,
  };
}
