import React, { useState, useCallback, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  PanResponder,
  LayoutChangeEvent,
  StyleSheet,
} from 'react-native';
import Svg, { G, Line, Circle, Text as SvgText } from 'react-native-svg';
import {
  GestureHandlerRootView,
  PinchGestureHandler,
  State,
  PinchGestureHandlerGestureEvent,
} from 'react-native-gesture-handler';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
} from 'react-native-reanimated';

import { NetworkData, NetworkNodeType } from '@/types/index';
import { useForceSimulation } from '@/hooks/useForceSimulation';
import { useThemeColors } from '@/theme/colors';

const NODE_COLORS: Record<NetworkNodeType | string, string> = {
  drug: '#6366F1',
  gene: '#10B981',
  target: '#10B981',
  disease: '#F59E0B',
  pathway: '#F59E0B',
};

const NODE_RADIUS: Record<NetworkNodeType | string, number> = {
  drug: 12,
  gene: 9,
  target: 9,
  disease: 12,
  pathway: 9,
};

interface Props {
  networkData?: NetworkData | null;
  loading?: boolean;
}

export default function NetworkGraph({ networkData, loading = false }: Props) {
  const C = useThemeColors();
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  // Zoom state
  const scale = useSharedValue(1);
  const savedScale = useRef(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);

  const { positions, linkPositions, setFixedPos } =
    useForceSimulation(
      networkData?.nodes,
      networkData?.edges ?? networkData?.links,
      dimensions.width,
      dimensions.height,
    );

  const onLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setDimensions({ width, height });
  }, []);

  const onPinch = (event: PinchGestureHandlerGestureEvent) => {
    if (event.nativeEvent.state === State.ACTIVE) {
      scale.value = Math.max(0.3, Math.min(3, savedScale.current * event.nativeEvent.scale));
    }
    if (event.nativeEvent.state === State.END) {
      savedScale.current = scale.value;
    }
  };

  const animatedSvgStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const makePanResponder = useCallback(
    (nodeId: string) =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          const pos = positions[nodeId];
          if (pos) setFixedPos(nodeId, pos);
        },
        onPanResponderMove: (_, gs) => {
          const base = positions[nodeId] ?? { x: 0, y: 0 };
          setFixedPos(nodeId, { x: base.x + gs.dx / scale.value, y: base.y + gs.dy / scale.value });
        },
        onPanResponderRelease: () => setFixedPos(nodeId, null),
        onPanResponderTerminate: () => setFixedPos(nodeId, null),
      }),
    [positions, setFixedPos, scale],
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
        <Text style={[styles.emptyText, { color: C.textMuted }]}>Select a drug to view network</Text>
      </View>
    );
  }

  const nodes = networkData.nodes;
  const selectedNodeData = selectedNode
    ? nodes.find(n => n.id === selectedNode)
    : null;

  return (
    <View style={{ flex: 1 }} onLayout={onLayout}>
      {dimensions.width > 0 && (
        <GestureHandlerRootView style={{ flex: 1 }}>
          <PinchGestureHandler onGestureEvent={onPinch}>
            <Animated.View style={[{ flex: 1 }, animatedSvgStyle]}>
              <Svg
                width={dimensions.width}
                height={dimensions.height}
                viewBox={`0 0 ${dimensions.width} ${dimensions.height}`}
              >
                <G>
                  {linkPositions.map(lp => (
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
                    .filter(lp => !!lp.label)
                    .map(lp => (
                      <SvgText
                        key={`lbl-${lp.id}`}
                        x={lp.mx}
                        y={lp.my}
                        textAnchor="middle"
                        fontSize={8}
                        fill={C.networkEdgeLabel}
                      >
                        {lp.label}
                      </SvgText>
                    ))}
                </G>

                {nodes.map(node => {
                  const pos = positions[node.id] ?? { x: 0, y: 0 };
                  const r = NODE_RADIUS[node.type] ?? 8;
                  const color = NODE_COLORS[node.type] ?? '#6366F1';
                  const pr = makePanResponder(node.id);
                  return (
                    <G
                      key={node.id}
                      {...pr.panHandlers}
                      onPress={() =>
                        setSelectedNode(prev => (prev === node.id ? null : node.id))
                      }
                    >
                      <Circle
                        cx={pos.x}
                        cy={pos.y}
                        r={r}
                        fill={color}
                        stroke={C.networkNodeStroke}
                        strokeWidth={selectedNode === node.id ? 2.5 : 1.5}
                        opacity={selectedNode && selectedNode !== node.id ? 0.5 : 1}
                      />
                      <SvgText
                        x={pos.x}
                        y={pos.y - r - 4}
                        textAnchor="middle"
                        fontSize={9}
                        fontWeight="500"
                        fill={C.networkNodeLabel}
                      >
                        {node.label ?? node.id}
                      </SvgText>
                    </G>
                  );
                })}
              </Svg>
            </Animated.View>
          </PinchGestureHandler>

          <View style={styles.legend}>
            {(['drug', 'gene', 'disease'] as const).map(type => (
              <View key={type} style={styles.legendItem}>
                <View
                  style={[
                    styles.legendDot,
                    { backgroundColor: NODE_COLORS[type] },
                  ]}
                />
                <Text style={[styles.legendLabel, { color: C.networkLegendLabel }]}>
                  {type === 'gene' ? 'Target' : type.charAt(0).toUpperCase() + type.slice(1)}
                </Text>
              </View>
            ))}
          </View>

          {selectedNodeData && (
            <View style={[styles.tooltip, { backgroundColor: C.card, borderColor: C.border }]}>
              <Text style={[styles.tooltipTitle, { color: C.textPrimary }]}>
                {selectedNodeData.label ?? selectedNodeData.id}
              </Text>
              <Text style={[styles.tooltipType, { color: C.textMuted }]}>{selectedNodeData.type}</Text>
            </View>
          )}
        </GestureHandlerRootView>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    fontSize: 13,
  },
  legend: {
    position: 'absolute',
    bottom: 12,
    left: 12,
    flexDirection: 'row',
    gap: 12,
  },
  legendItem: {
    flexDirection: 'row',
    alignItems: 'center',
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
    position: 'absolute',
    top: 12,
    right: 12,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.08,
    shadowRadius: 2,
    elevation: 2,
  },
  tooltipTitle: {
    fontSize: 12,
    fontWeight: '600',
  },
  tooltipType: {
    fontSize: 11,
    textTransform: 'capitalize',
  },
});
