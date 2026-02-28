import React from 'react';
import { View, Text, Pressable } from 'react-native';
import Animated, { FadeInDown } from 'react-native-reanimated';
import type { DrugCandidate } from '@/types/index';

interface DrugCardProps {
  drug: DrugCandidate;
  index: number;
  isSelected: boolean;
  onPress: (drug: DrugCandidate) => void;
}

const ACCENT = '#2563EB';
const MUTED_FG = '#9CA3AF';
const BORDER = '#E5E7EB';

export default function DrugCard({ drug, index, isSelected, onPress }: DrugCardProps) {
  const isTop = index === 0;
  const confidenceColor =
    drug.confidence === 'High' ? '#059669' : '#D97706'; // emerald-600 / amber-600

  const mechanismText =
    drug.mechanism && drug.mechanism !== 'Unknown'
      ? drug.mechanism
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/^\w/, c => c.toUpperCase())
      : 'Mechanism under investigation';

  return (
    <Animated.View entering={FadeInDown.delay(index * 50).duration(200)}>
      <Pressable
        onPress={() => onPress(drug)}
        style={({ pressed }) => ({
          borderRadius: 8,
          borderWidth: 1,
          borderColor: isSelected ? 'rgba(37,99,235,0.3)' : BORDER,
          backgroundColor: pressed
            ? 'rgba(37,99,235,0.03)'
            : isSelected
            ? 'rgba(37,99,235,0.05)'
            : '#FFFFFF',
          padding: isTop ? 12 : 10,
          marginBottom: 8,
        })}
      >
        <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
          <View
            style={{
              width: isTop ? 24 : 20,
              height: isTop ? 24 : 20,
              borderRadius: isTop ? 12 : 10,
              backgroundColor: isTop ? ACCENT : '#F3F4F6',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Text
              style={{
                fontSize: 10,
                fontWeight: isTop ? '600' : '500',
                color: isTop ? '#FFFFFF' : MUTED_FG,
              }}
            >
              {drug.rank}
            </Text>
          </View>

          <View style={{ alignItems: 'flex-end' }}>
            <Text style={{ fontSize: 10, fontWeight: '500', color: confidenceColor }}>
              {Math.round(drug.score * 100)}%
            </Text>
            <Text style={{ fontSize: 9, color: MUTED_FG, textTransform: 'capitalize' }}>
              {drug.confidence}
            </Text>
          </View>
        </View>

        <Text
          style={{
            fontSize: isTop ? 18 : 15,
            fontWeight: '600',
            color: isSelected ? ACCENT : '#111827',
            marginBottom: 2,
          }}
        >
          {drug.drug_name}
        </Text>

        {drug.drug_type && drug.drug_type !== 'Unknown' && (
          <Text style={{ fontSize: 11, color: MUTED_FG, marginTop: 2 }}>
            Current use: {drug.drug_type}
          </Text>
        )}

        <Text
          numberOfLines={2}
          style={{ fontSize: isTop ? 10 : 9, color: MUTED_FG, marginTop: 6, lineHeight: 14 }}
        >
          {mechanismText}
        </Text>

        {drug.guardrail && (
          <View
            style={{
              marginTop: 6,
              backgroundColor: '#FFFBEB',
              borderRadius: 4,
              paddingHorizontal: 6,
              paddingVertical: 3,
            }}
          >
            <Text style={{ fontSize: 9, color: '#B45309' }}>{drug.guardrail}</Text>
          </View>
        )}
      </Pressable>
    </Animated.View>
  );
}
