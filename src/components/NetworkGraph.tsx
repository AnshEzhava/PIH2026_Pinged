import React, { useState, useCallback, useRef } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  PanResponder,
  GestureResponderEvent,
  PanResponderGestureState,
  LayoutChangeEvent,
  StyleSheet,
} from "react-native";
import Svg, { G, Line, Circle, Text as SvgText } from "react-native-svg";

import { NetworkData, NetworkNodeType } from "@/types/index";
import { useForceSimulation } from "@/hooks/useForceSimulation";
import { useThemeColors } from "@/theme/colors";

const NODE_COLORS: Record<NetworkNodeType | string, string> = {
  drug: "#6366F1",
  gene: "#10B981",
  target: "#10B981",
  disease: "#F59E0B",
  pathway: "#F59E0B",
};

const NODE_RADIUS: Record<NetworkNodeType | string, number> = {
  drug: 12,
  gene: 9,
  target: 9,
  disease: 12,
  pathway: 9,
};

interface Transform {
  scale: number;
  tx: number;
  ty: number;
}

const DEFAULT_TRANSFORM: Transform = { scale: 1, tx: 0, ty: 0 };

interface Props {
  networkData?: NetworkData | null;
  loading?: boolean;
}

export default function NetworkGraph({ networkData, loading = false }: Props) {
  const C = useThemeColors();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Single source of truth for the SVG transform; kept in a ref for sync
  // coordinate math and mirrored into state to trigger re-renders.
  const transformRef = useRef<Transform>(DEFAULT_TRANSFORM);
  const [transform, setTransform] = useState<Transform>(DEFAULT_TRANSFORM);

  const applyTransform = useCallback((t: Transform) => {
    transformRef.current = t;
    setTransform(t);
  }, []);

  const { positions, linkPositions, setFixedPos } = useForceSimulation(
    networkData?.nodes,
    networkData?.edges ?? networkData?.links,
    dimensions.width,
    dimensions.height,
  );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setDimensions({ width, height });
  }, []);

  // --- Canvas pan responder ------------------------------------------------
  // Tracks the transform at the moment the gesture started so delta math is
  // relative to a stable baseline rather than the continuously-updating ref.
  const panBaseTransform = useRef<Transform>(DEFAULT_TRANSFORM);

  const canvasPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      // Only claim the gesture if it has moved enough to look like a pan
      // (this avoids stealing taps meant for nodes).
      onMoveShouldSetPanResponder: (
        _: GestureResponderEvent,
        gs: PanResponderGestureState,
      ) => Math.abs(gs.dx) > 4 || Math.abs(gs.dy) > 4,
      onPanResponderGrant: () => {
        panBaseTransform.current = { ...transformRef.current };
      },
      onPanResponderMove: (
        _: GestureResponderEvent,
        gs: PanResponderGestureState,
      ) => {
        const base = panBaseTransform.current;
        applyTransform({
          scale: base.scale,
          tx: base.tx + gs.dx,
          ty: base.ty + gs.dy,
        });
      },
    }),
  ).current;

  // --- Pinch zoom (canvas-level, focal-point-aware) ------------------------
  // We track the previous distance ourselves so we can compute the focal point
  // without relying on gesture-handler's PinchGestureHandler (which transforms
  // the entire SVG as a bitmap). Instead we use a two-touch MultiTouchHandler
  // approach via PanResponder's raw touch list.
  const pinchRef = useRef<{
    startDist: number;
    startScale: number;
    focalX: number;
    focalY: number;
  } | null>(null);

  const pinchPanResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onMoveShouldSetPanResponder: (e) => e.nativeEvent.touches.length === 2,
      onPanResponderGrant: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length < 2) return;
        const dx = touches[1].pageX - touches[0].pageX;
        const dy = touches[1].pageY - touches[0].pageY;
        pinchRef.current = {
          startDist: Math.sqrt(dx * dx + dy * dy),
          startScale: transformRef.current.scale,
          // Focal point in screen coordinates
          focalX: (touches[0].pageX + touches[1].pageX) / 2,
          focalY: (touches[0].pageY + touches[1].pageY) / 2,
        };
      },
      onPanResponderMove: (e) => {
        const touches = e.nativeEvent.touches;
        if (touches.length < 2 || !pinchRef.current) return;
        const dx = touches[1].pageX - touches[0].pageX;
        const dy = touches[1].pageY - touches[0].pageY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const { startDist, startScale, focalX, focalY } = pinchRef.current;
        const newScale = Math.max(
          0.3,
          Math.min(4, startScale * (dist / startDist)),
        );

        // Adjust translation so the focal point stays fixed on-screen:
        // newTx = focalX - newScale * (focalX - oldTx) / oldScale
        const { tx, ty, scale: oldScale } = transformRef.current;
        const newTx = focalX - (newScale / oldScale) * (focalX - tx);
        const newTy = focalY - (newScale / oldScale) * (focalY - ty);
        applyTransform({ scale: newScale, tx: newTx, ty: newTy });
      },
      onPanResponderRelease: () => {
        pinchRef.current = null;
      },
    }),
  ).current;

  // --- Per-node drag responder (cached) --------------------------------------
  // PanResponder objects are expensive to construct. We cache one per node id
  // in a ref-map and only create a new one when we see a previously unseen id.
  // Positions are read via positionsRef so closures never go stale.
  const positionsRef = useRef(positions);
  positionsRef.current = positions;

  const nodePanResponders = useRef<
    Map<string, ReturnType<typeof PanResponder.create>>
  >(new Map());

  const getNodePanResponder = useCallback(
    (nodeId: string) => {
      if (!nodePanResponders.current.has(nodeId)) {
        nodePanResponders.current.set(
          nodeId,
          PanResponder.create({
            onStartShouldSetPanResponder: () => true,
            onMoveShouldSetPanResponder: () => true,
            onPanResponderGrant: () => {
              const pos = positionsRef.current[nodeId];
              if (pos) setFixedPos(nodeId, pos);
            },
            onPanResponderMove: (
              _: GestureResponderEvent,
              gs: PanResponderGestureState,
            ) => {
              const base = positionsRef.current[nodeId] ?? { x: 0, y: 0 };
              const s = transformRef.current.scale;
              setFixedPos(nodeId, {
                x: base.x + gs.dx / s,
                y: base.y + gs.dy / s,
              });
            },
            onPanResponderRelease: () => setFixedPos(nodeId, null),
            onPanResponderTerminate: () => setFixedPos(nodeId, null),
          }),
        );
      }
      return nodePanResponders.current.get(nodeId)!;
    },
    [setFixedPos],
  );

  if (loading) {
    return (
      <View style={[styles.center, { backgroundColor: C.card }]}>
        <ActivityIndicator color="#6366F1" />
      </View>
    );
  }

  if (!networkData?.nodes?.length) {
    return (
      <View style={[styles.center, { backgroundColor: C.card }]}>
        <Text style={[styles.emptyText, { color: C.textMuted }]}>
          Select a drug to view network
        </Text>
      </View>
    );
  }

  const nodes = networkData.nodes;
  const selectedNodeData = selectedNode
    ? nodes.find((n) => n.id === selectedNode)
    : null;

  const { scale: s, tx, ty } = transform;
  const svgTransform = `translate(${tx}, ${ty}) scale(${s})`;

  return (
    <View
      style={{ flex: 1 }}
      onLayout={onLayout}
      {...canvasPanResponder.panHandlers}
      {...pinchPanResponder.panHandlers}
    >
      {dimensions.width > 0 && (
        <>
          <Svg
            width={dimensions.width}
            height={dimensions.height}
            viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
          >
            {/* Single <G> carries the zoom/pan transform so the SVG coordinate
                space is correct for all child elements. Legend and tooltip are
                rendered outside the SVG so they remain fixed on screen. */}
            <G transform={svgTransform}>
              <G>
                {linkPositions.map((lp) => (
                  <Line
                    key={lp.id}
                    x1={lp.x1}
                    y1={lp.y1}
                    x2={lp.x2}
                    y2={lp.y2}
                    stroke={C.networkEdge}
                    strokeWidth={1.2}
                  />
                ))}
              </G>

              <G>
                {linkPositions
                  .filter((lp) => !!lp.label)
                  .map((lp) => (
                    <SvgText
                      key={`lbl-${lp.id}`}
                      x={lp.mx}
                      y={lp.my}
                      textAnchor="middle"
                      // Inverse-scale keeps labels legible at all zoom levels
                      fontSize={8 / s}
                      fill={C.networkEdgeLabel}
                    >
                      {lp.label}
                    </SvgText>
                  ))}
              </G>

              {nodes.map((node) => {
                const pos = positions[node.id] ?? { x: 0, y: 0 };
                const r = NODE_RADIUS[node.type] ?? 8;
                const color = NODE_COLORS[node.type] ?? "#6366F1";
                const pr = getNodePanResponder(node.id);
                return (
                  <G
                    key={node.id}
                    {...pr.panHandlers}
                    onPress={() =>
                      setSelectedNode((prev) =>
                        prev === node.id ? null : node.id,
                      )
                    }
                  >
                    <Circle
                      cx={pos.x}
                      cy={pos.y}
                      r={r}
                      fill={color}
                      stroke={C.networkNodeStroke}
                      strokeWidth={selectedNode === node.id ? 2.5 : 1.5}
                      opacity={
                        selectedNode && selectedNode !== node.id ? 0.5 : 1
                      }
                    />
                    <SvgText
                      x={pos.x}
                      y={pos.y - r - 4}
                      textAnchor="middle"
                      fontSize={9 / s}
                      fontWeight="500"
                      fill={C.networkNodeLabel}
                    >
                      {node.label ?? node.id}
                    </SvgText>
                  </G>
                );
              })}
            </G>
          </Svg>

          {/* Reset button — snaps back to default transform */}
          <TouchableOpacity
            style={[
              styles.resetButton,
              { backgroundColor: C.card, borderColor: C.border },
            ]}
            onPress={() => applyTransform(DEFAULT_TRANSFORM)}
          >
            <Text style={[styles.resetLabel, { color: C.textMuted }]}>
              Reset
            </Text>
          </TouchableOpacity>

          <View style={styles.legend}>
            {(["drug", "gene", "disease"] as const).map((type) => (
              <View key={type} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: NODE_COLORS[type] },
                  ]}
                />
                <Text
                  style={[styles.legendLabel, { color: C.networkLegendLabel }]}
                >
                  {type === "gene"
                    ? "Target"
                    : type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </View>
            ))}
          </View>

          {selectedNodeData && (
            <View
              style={[
                styles.tooltip,
                { backgroundColor: C.card, borderColor: C.border },
              ]}
            >
              <Text style={[styles.tooltipTitle, { color: C.textPrimary }]}>
                {selectedNodeData.label ?? selectedNodeData.id}
              </Text>
              <Text style={[styles.tooltipType, { color: C.textMuted }]}>
                {selectedNodeData.type}
              </Text>
            </View>
          )}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
  },
  emptyText: {
    fontSize: 13,
  },
  resetButton: {
    position: "absolute",
    top: 12,
    left: 12,
    borderWidth: 1,
    borderRadius: 6,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  resetLabel: {
    fontSize: 11,
    fontWeight: "500",
  },
  legend: {
    position: "absolute",
    bottom: 12,
    left: 12,
    flexDirection: "row",
    gap: 12,
  },
  legendItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
  },
  legendDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  legendLabel: {
    fontSize: 10,
  },
  tooltip: {
    position: "absolute",
    top: 12,
    right: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: "600",
  },
  tooltipType: {
    fontSize: 11,
    textTransform: "capitalize",
  },
});
