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
  forceCenter,
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

    const sim = forceSimulation<SimNode>(simNodes)
      .force(
        'link',
        forceLink<SimNode, SimLink>(simLinks)
          .id(d => d.id)
          .distance(60),
      )
      .force('charge', forceManyBody<SimNode>().strength(-120))
      .force('center', forceCenter<SimNode>(width / 2, height / 2))
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
