import { useEffect, useRef, useState, useCallback } from "react";
import {
  forceSimulation,
  forceLink,
  forceManyBody,
  forceX,
  forceY,
  forceCollide,
  Simulation,
  SimulationNodeDatum,
  SimulationLinkDatum,
} from "d3-force";

import { NetworkNode, NetworkEdge } from "@/types";

export interface SimNode extends SimulationNodeDatum {
  id: string;
  type: string;
  label?: string;
}

export interface SimLink extends SimulationLinkDatum<SimNode> {
  label?: string;
}

export interface NodePosition {
  x: number;
  y: number;
}

export type PositionMap = Record<string, NodePosition>;

export interface LinkPosition {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  label?: string;
  mx: number;
  my: number;
}

export interface ForceSimulationResult {
  positions: PositionMap;
  linkPositions: LinkPosition[];
  setFixedPos: (id: string, pos: NodePosition | null) => void;
  simNodes: SimNode[];
}

const NODE_RADII: Record<string, number> = {
  drug: 12,
  gene: 9,
  target: 9,
  disease: 12,
  pathway: 9,
};

const MAX_TICKS = 200; // was 300 — simulation converges well before this
const PREWARM_TICKS = 80; // run synchronously before first RAF so graph lands settled
const FLUSH_EVERY = 6; // only call setState every Nth tick during animation
const MAX_NODES = 60; // cap input so SVG element count stays bounded
const MAX_EDGES = 120;

export function useForceSimulation(
  nodes: NetworkNode[] | undefined,
  edges: NetworkEdge[] | undefined,
  width: number,
  height: number,
): ForceSimulationResult {
  const [positions, setPositions] = useState<PositionMap>({});
  const [linkPositions, setLinkPositions] = useState<LinkPosition[]>([]);
  const simRef = useRef<Simulation<SimNode, SimLink> | null>(null);
  const simNodesRef = useRef<SimNode[]>([]);
  const simLinksRef = useRef<SimLink[]>([]);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (simRef.current) simRef.current.stop();

    if (!nodes?.length || width === 0 || height === 0) {
      setPositions({});
      setLinkPositions([]);
      return;
    }

    // --- Cap inputs to keep the SVG manageable ---------------------------------
    const cappedNodes = nodes.slice(0, MAX_NODES);
    const cappedNodeIds = new Set(cappedNodes.map((n) => n.id));
    const cappedEdges = (edges ?? [])
      .filter((e) => {
        const src =
          typeof e.source === "string"
            ? e.source
            : (e.source as NetworkNode).id;
        const tgt =
          typeof e.target === "string"
            ? e.target
            : (e.target as NetworkNode).id;
        return cappedNodeIds.has(src) && cappedNodeIds.has(tgt);
      })
      .slice(0, MAX_EDGES);

    // Defensive copy so d3 mutations don't bleed into source data
    const simNodes: SimNode[] = cappedNodes.map((n) => ({ ...n }));
    const simLinks: SimLink[] = cappedEdges.map((e) => ({
      source: e.source,
      target: e.target,
      label: e.label,
    }));

    simNodesRef.current = simNodes;
    simLinksRef.current = simLinks;

    const cx = width / 2;
    const cy = height / 2;

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        "link",
        forceLink<SimNode, SimLink>(simLinks)
          .id((d) => d.id)
          .distance((l) => {
            const srcType = (l.source as SimNode).type;
            const tgtType = (l.target as SimNode).type;
            return srcType === "drug" ||
              srcType === "disease" ||
              tgtType === "drug" ||
              tgtType === "disease"
              ? 45
              : 55;
          }),
      )
      .force("charge", forceManyBody<SimNode>().strength(-80))
      .force("centerX", forceX<SimNode>(cx).strength(0.08))
      .force("centerY", forceY<SimNode>(cy).strength(0.08))
      .force(
        "anchorX",
        forceX<SimNode>(cx).strength((d) =>
          d.type === "drug" || d.type === "disease" ? 0.15 : 0,
        ),
      )
      .force(
        "anchorY",
        forceY<SimNode>(cy).strength((d) =>
          d.type === "drug" || d.type === "disease" ? 0.15 : 0,
        ),
      )
      .force(
        "collision",
        forceCollide<SimNode>().radius((d) => (NODE_RADII[d.type] ?? 8) + 4),
      )
      .stop();

    simRef.current = sim;

    // --- Fix 1: Pre-warm synchronously -----------------------------------------
    // Run PREWARM_TICKS ticks before the first paint so the graph lands in a
    // roughly converged state rather than starting from a random scatter.
    for (let i = 0; i < PREWARM_TICKS; i++) {
      sim.tick();
      clampNodes(simNodes, width, height);
    }
    // Flush once synchronously so first render shows the pre-warmed positions.
    flushPositions(simNodes, simLinks);

    // --- Fix 2: Throttled RAF loop ---------------------------------------------
    // Only call setState every FLUSH_EVERY frames to reduce React re-renders.
    let tick = PREWARM_TICKS;
    let frameSinceFlush = 0;

    const loop = () => {
      if (tick >= MAX_TICKS || sim.alpha() < 0.005) {
        flushPositions(simNodes, simLinks); // always flush on completion
        return;
      }
      sim.tick();
      clampNodes(simNodes, width, height);
      tick++;
      frameSinceFlush++;

      if (frameSinceFlush >= FLUSH_EVERY) {
        flushPositions(simNodes, simLinks);
        frameSinceFlush = 0;
      }

      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, width, height]);

  function clampNodes(sn: SimNode[], w: number, h: number) {
    for (const n of sn) {
      const r = (NODE_RADII[n.type] ?? 8) + 4;
      if (n.x !== undefined) n.x = Math.max(r, Math.min(w - r, n.x));
      if (n.y !== undefined) n.y = Math.max(r, Math.min(h - r, n.y));
    }
  }

  function flushPositions(sn: SimNode[], sl: SimLink[]) {
    const pos: PositionMap = {};
    for (const n of sn) {
      pos[n.id] = { x: n.x ?? 0, y: n.y ?? 0 };
    }
    setPositions(pos);

    const lp: LinkPosition[] = sl.map((l, i) => {
      const src = l.source as SimNode;
      const tgt = l.target as SimNode;
      const x1 = src.x ?? 0;
      const y1 = src.y ?? 0;
      const x2 = tgt.x ?? 0;
      const y2 = tgt.y ?? 0;
      return {
        id: `link-${i}`,
        x1,
        y1,
        x2,
        y2,
        label: l.label,
        mx: (x1 + x2) / 2,
        my: (y1 + y2) / 2,
      };
    });
    setLinkPositions(lp);
  }

  const setFixedPos = useCallback((id: string, pos: NodePosition | null) => {
    const n = simNodesRef.current.find((n) => n.id === id);
    if (!n) return;
    if (pos) {
      n.fx = pos.x;
      n.fy = pos.y;
      simRef.current?.alphaTarget(0.3).restart();
    } else {
      n.fx = undefined;
      n.fy = undefined;
      simRef.current?.alphaTarget(0);
    }
  }, []);

  return {
    positions,
    linkPositions,
    setFixedPos,
    simNodes: simNodesRef.current,
  };
}
