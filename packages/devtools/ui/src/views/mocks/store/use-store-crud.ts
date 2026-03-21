import { useState } from "react";
import { getSocket } from "@/socket";

interface StoreCrudActions {
  activeCollection: string | null;
  selectCollection: (name: string) => void;
  seedCollection: (serverId: string, collection: string, count: number) => void;
  clearCollection: (serverId: string, collection: string) => void;
  deleteRecord: (serverId: string, collection: string, recordId: string) => void;
  seedAll: (serverId: string, count: number) => void;
}

export function useStoreCrud(): StoreCrudActions {
  const [activeCollection, setActiveCollection] = useState<string | null>(null);

  const sendCommand = (action: string, payload: Record<string, unknown>) => {
    getSocket().emit("mock:command", { action, ...payload });
  };

  const seedCollection = (serverId: string, collection: string, count: number) => {
    sendCommand("mock:store:seed", { serverId, collection, count });
  };

  const clearCollection = (serverId: string, collection: string) => {
    sendCommand("mock:store:delete", { serverId, collection, id: "*" });
  };

  const deleteRecord = (serverId: string, collection: string, recordId: string) => {
    sendCommand("mock:store:delete", { serverId, collection, id: recordId });
  };

  const seedAll = (serverId: string, count: number) => {
    sendCommand("mock:store:seed", { serverId, collection: "*", count });
  };

  return {
    activeCollection,
    selectCollection: setActiveCollection,
    seedCollection,
    clearCollection,
    deleteRecord,
    seedAll,
  };
}
