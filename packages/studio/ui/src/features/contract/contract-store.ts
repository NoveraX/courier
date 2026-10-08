import { create } from "zustand";

import { post } from "@/lib/api-client";
import { contractsOf, type EndpointContract } from "./contract-report";

/** The contract report Studio last sent, by endpoint. */
interface ContractStore {
  /** By `source:endpoint` */
  byEndpoint: ReadonlyMap<string, EndpointContract>;
  /** Why the last report could not be read, while it could not */
  problem: string | undefined;
}

/**
 * How each endpoint's real answers stand against its response schema, as
 * Studio last reported it.
 *
 * @example
 * ```ts
 * useContractStore((s) => s.byEndpoint.get(contractKey("shop", "products.get")))?.state;
 * ```
 */
export const useContractStore = create<ContractStore>(() => ({
  byEndpoint: new Map(),
  problem: undefined,
}));

/**
 * The key the contract report is kept by.
 *
 * @param source - The endpoint's source
 * @param endpoint - Its call in the client: `products.get`
 * @returns The key
 * @example
 * ```ts
 * contractKey("shop", "products.get"); // "shop:products.get"
 * ```
 */
export function contractKey(source: string, endpoint: string): string {
  return `${source}:${endpoint}`;
}

/**
 * Ask Studio for the contract report again; a failure is kept to say so,
 * the last report staying as it was.
 *
 * @example
 * ```ts
 * await refreshContract();
 * ```
 */
export async function refreshContract(): Promise<void> {
  try {
    const contracts = contractsOf(await post<unknown>("/api/contract/report"));
    useContractStore.setState({
      byEndpoint: new Map(
        contracts.map((contract) => [contractKey(contract.source, contract.endpoint), contract]),
      ),
      problem: undefined,
    });
  } catch (error) {
    useContractStore.setState({ problem: error instanceof Error ? error.message : String(error) });
  }
}
