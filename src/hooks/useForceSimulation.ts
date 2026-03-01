/**
 * useForceSimulation
 *
 * Runs a d3-force simulation on a web worker-free JS loop and exposes the
 * current (x, y) positions of nodes via React state so that react-native-svg
 * can render them declaratively.
 *
 * Strategy:
 *   1. On networkData change, build d3 SimulationNode / SimulationLink arrays.
 *   2. Tick the simulation in a requestAnimationFrame loop until alpha < 0.01
 *      (or maxTicks exceeded), then settle.
 *   3. Return `positions` map: nodeId → { x, y }.
 *   4. Expose `setFixedPos` so that drag gestures can pin a node (fx/fy).
 */

import { useEffect, useRef, useState, useCallback } from 'react';
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
} from 'd3-force';

import { NetworkNode, NetworkEdge } from '@/types/index';

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

const MAX_TICKS = 300;

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
    // Cancel any previous RAF loop
    if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
    if (simRef.current) simRef.current.stop();

    if (!nodes?.length || width === 0 || height === 0) {
      setPositions({});
      setLinkPositions([]);
      return;
    }

    // Defensive copy so d3 mutations don't bleed into source data
    const simNodes: SimNode[] = nodes.map(n => ({ ...n }));
    const rawEdges = edges ?? [];
    const simLinks: SimLink[] = rawEdges.map(e => ({
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
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id(d => d.id)
          // Shorter distance for edges directly touching a drug or disease node keeps
          // the two anchor nodes from spanning the full card width before centering
          // forces can pull them back. Gene/target edges use a slightly larger distance
          // so intermediate nodes have room to spread around the anchors.
          .distance(l => {
            const srcType = (l.source as SimNode).type;
            const tgtType = (l.target as SimNode).type;
            return srcType === 'drug' || srcType === 'disease' ||
                   tgtType === 'drug' || tgtType === 'disease'
              ? 45
              : 55;
          }),
      )
      // Change 5: reduced from -120 to -80 — less aggressive initial explosion on the
      // small 260px card viewport so centering forces can catch up sooner
      .force('charge', forceManyBody<SimNode>().strength(-80))
      // Change 1: forceX + forceY replace forceCenter. forceCenter only moves the
      // cloud's centre-of-mass; forceX/forceY apply a per-node spring toward the
      // target coordinate, making it impossible for any single node to drift far.
      .force('centerX', forceX<SimNode>(cx).strength(0.08))
      .force('centerY', forceY<SimNode>(cy).strength(0.08))
      // Change 2: stronger gravity for drug and disease nodes specifically. These are
      // the two anchor nodes users expect to always be visible; pulling them harder
      // toward the centre prevents the layout from splitting into two disconnected clusters.
      .force(
        'anchorX',
        forceX<SimNode>(cx).strength(d =>
          d.type === 'drug' || d.type === 'disease' ? 0.15 : 0,
        ),
      )
      .force(
        'anchorY',
        forceY<SimNode>(cy).strength(d =>
          d.type === 'drug' || d.type === 'disease' ? 0.15 : 0,
        ),
      )
      .force(
        'collision',
        forceCollide<SimNode>().radius(d => (NODE_RADII[d.type] ?? 8) + 4),
      )
      .stop();

    simRef.current = sim;

    let tick = 0;

    const loop = () => {
      if (tick >= MAX_TICKS || sim.alpha() < 0.005) {
        flushPositions(simNodes, simLinks);
        return;
      }
      sim.tick();
      tick++;

      // Change 3: hard boundary clamp — after each physics tick, prevent any node
      // from leaving the visible viewport. Without this, the repulsion force can
      // accelerate a node past the edge faster than the centering spring pulls it back.
      for (const n of simNodes) {
        const r = (NODE_RADII[n.type] ?? 8) + 4;
        if (n.x !== undefined) n.x = Math.max(r, Math.min(width - r, n.x));
        if (n.y !== undefined) n.y = Math.max(r, Math.min(height - r, n.y));
      }

      flushPositions(simNodes, simLinks);
      rafRef.current = requestAnimationFrame(loop);
    };

    rafRef.current = requestAnimationFrame(loop);

    return () => {
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      sim.stop();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, width, height]);

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
    const n = simNodesRef.current.find(n => n.id === id);
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

  return { positions, linkPositions, setFixedPos, simNodes: simNodesRef.current };
}
