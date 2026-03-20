import { useCallback, useMemo } from "react";
import type { Node, Edge, NodeMouseHandler } from "@xyflow/react";

interface DimmingActions {
  onNodeMouseEnter: NodeMouseHandler;
  onNodeMouseLeave: () => void;
}

/**
 * Directional hover dimming — highlights ancestors (up) and descendants (down)
 * of the hovered node, without leaking into sibling branches.
 */
export function useGraphDimming(
  setNodes: (updater: (prev: Node[]) => Node[]) => void,
  setEdges: (updater: (prev: Edge[]) => Edge[]) => void,
  edges: Edge[],
): DimmingActions {
  // Directed maps: parent → children, child → parents
  const { children, parents } = useMemo(() => {
    const ch = new Map<string, Set<string>>();
    const pa = new Map<string, Set<string>>();
    for (const e of edges) {
      if (!ch.has(e.source)) ch.set(e.source, new Set());
      if (!pa.has(e.target)) pa.set(e.target, new Set());
      ch.get(e.source)!.add(e.target);
      pa.get(e.target)!.add(e.source);
    }
    return { children: ch, parents: pa };
  }, [edges]);

  /** Walk up to all ancestors */
  const collectAncestors = useCallback((nodeId: string): Set<string> => {
    const result = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const pars = parents.get(id);
      if (!pars) continue;
      for (const p of pars) {
        if (!result.has(p)) {
          result.add(p);
          queue.push(p);
        }
      }
    }
    return result;
  }, [parents]);

  /** Walk down to all descendants */
  const collectDescendants = useCallback((nodeId: string): Set<string> => {
    const result = new Set<string>();
    const queue = [nodeId];
    while (queue.length > 0) {
      const id = queue.shift()!;
      const chs = children.get(id);
      if (!chs) continue;
      for (const c of chs) {
        if (!result.has(c)) {
          result.add(c);
          queue.push(c);
        }
      }
    }
    return result;
  }, [children]);

  const applyOpacity = useCallback((nodeId: string | null) => {
    if (!nodeId) {
      setNodes((prev) => prev.map((n) => ({ ...n, style: { ...n.style, opacity: 1 } })));
      setEdges((prev) => prev.map((e) => ({ ...e, style: { ...e.style, opacity: 1 } })));
      return;
    }

    const connected = new Set<string>([nodeId]);
    for (const a of collectAncestors(nodeId)) connected.add(a);
    for (const d of collectDescendants(nodeId)) connected.add(d);

    const connectedEdges = new Set<string>();
    for (const e of edges) {
      if (connected.has(e.source) && connected.has(e.target)) {
        connectedEdges.add(e.id);
      }
    }

    setNodes((prev) =>
      prev.map((n) => ({
        ...n,
        style: {
          ...n.style,
          opacity: connected.has(n.id) ? 1 : 0.25,
          transition: "opacity 200ms ease",
        },
      })),
    );
    setEdges((prev) =>
      prev.map((e) => ({
        ...e,
        style: {
          ...e.style,
          opacity: connectedEdges.has(e.id) ? 1 : 0.12,
          transition: "opacity 200ms ease",
        },
      })),
    );
  }, [collectAncestors, collectDescendants, edges, setNodes, setEdges]);

  const onNodeMouseEnter: NodeMouseHandler = useCallback(
    (_event, node) => applyOpacity(node.id),
    [applyOpacity],
  );

  const onNodeMouseLeave = useCallback(() => applyOpacity(null), [applyOpacity]);

  return { onNodeMouseEnter, onNodeMouseLeave };
}
