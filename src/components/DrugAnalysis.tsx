import React from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { Sparkles, AlertTriangle } from 'lucide-react-native';

import type { DrugCandidate, Disease, NetworkData } from '@/types/index';
import { useThemeColors } from '@/theme/colors';

interface DrugAnalysisProps {
  drug: DrugCandidate;
  disease: Disease;
  networkData: NetworkData | null;
  onOpenChatbot: () => void;
}

export default function DrugAnalysis({
  drug,
  disease,
  networkData,
  onOpenChatbot,
}: DrugAnalysisProps) {
  const C = useThemeColors();

  const mechanismText =
    drug.mechanism && drug.mechanism !== 'Unknown'
      ? drug.mechanism
          .replace(/_/g, ' ')
          .toLowerCase()
          .replace(/^\w/, c => c.toUpperCase())
      : 'Mechanism of action is under investigation. This drug may act through novel pathways relevant to the target disease.';

  const targetNodes =
    networkData?.nodes?.filter(n => n.type === 'gene' || n.type === 'target') ?? [];

  return (
    <View>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: C.textPrimary }}>Drug Details</Text>
        <Pressable
          onPress={onOpenChatbot}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: pressed ? C.accentPressed : C.accent,
            paddingHorizontal: 10,
            paddingVertical: 5,
            borderRadius: 6,
            gap: 4,
          })}
        >
          <Sparkles size={11} color="#FFFFFF" />
          <Text style={{ fontSize: 10, fontWeight: '500', color: '#FFFFFF' }}>Explain with AI</Text>
        </Pressable>
      </View>

      {/* Drug Name — full width */}
      <InfoRow label="Drug Name" value={drug.drug_name} bold colors={C} />

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow label="ChEMBL ID" value={drug.drug_id} mono colors={C} />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow label="Rank" value={`#${drug.rank}`} colors={C} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Repurposing Score"
            value={`${(drug.score * 100).toFixed(1)}% (${drug.confidence})`}
            colors={C}
          />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Association Score"
            value={drug.association_score ? drug.association_score.toFixed(3) : 'N/A'}
            colors={C}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow label="Drug Type" value={drug.drug_type ?? 'Unknown'} colors={C} />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Max Clinical Phase"
            value={drug.max_phase > 0 ? `Phase ${drug.max_phase}` : 'Preclinical'}
            colors={C}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Gene Overlap"
            value={`${drug.gene_overlap} ${drug.gene_overlap === 1 ? 'gene' : 'genes'}`}
            colors={C}
          />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow label="Disease Context" value={disease.disease_name} truncate colors={C} />
        </View>
      </View>

      <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginTop: 12, marginBottom: 10 }}>
        <Text
          style={{
            fontSize: 9,
            fontWeight: '500',
            color: C.textMuted,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 4,
          }}
        >
          Mechanism of Action
        </Text>
        <Text style={{ fontSize: 10, color: C.textPrimary, lineHeight: 16 }}>{mechanismText}</Text>
      </View>

      {targetNodes.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: C.border, paddingTop: 10, marginBottom: 10 }}>
          <Text
            style={{
              fontSize: 9,
              fontWeight: '500',
              color: C.textMuted,
              textTransform: 'uppercase',
              letterSpacing: 0.8,
              marginBottom: 6,
            }}
          >
            Molecular Targets ({targetNodes.length})
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={{ flexDirection: 'row', gap: 4, flexWrap: 'wrap' }}>
              {targetNodes.slice(0, 12).map(n => (
                <View
                  key={n.id}
                  style={{
                    backgroundColor: C.tagBg,
                    borderWidth: 1,
                    borderColor: C.tagBorder,
                    borderRadius: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      color: C.tagText,
                      fontFamily:
                        Platform.OS === 'ios' ? 'Courier' : 'monospace',
                    }}
                  >
                    {n.label ?? n.id}
                  </Text>
                </View>
              ))}
            </View>
          </ScrollView>
        </View>
      )}

      {drug.guardrail && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: C.border,
            paddingTop: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              backgroundColor: C.warningBg,
              borderWidth: 1,
              borderColor: C.warningBorder,
              borderRadius: 6,
              padding: 8,
              gap: 6,
            }}
          >
            <AlertTriangle size={11} color={C.warningIcon} style={{ marginTop: 1 }} />
            <Text style={{ fontSize: 9, color: C.warningText, flex: 1, lineHeight: 14 }}>
              {drug.guardrail}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

function InfoRow({
  label,
  value,
  bold,
  mono,
  truncate,
  colors,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
  truncate?: boolean;
  colors: ReturnType<typeof useThemeColors>;
}) {
  return (
    <View>
      <Text style={{ fontSize: 9, color: colors.textMuted, marginBottom: 2 }}>{label}</Text>
      <Text
        numberOfLines={truncate ? 1 : undefined}
        style={{
          fontSize: bold ? 12 : 10,
          fontWeight: bold ? '600' : mono ? '400' : '500',
          color: colors.textPrimary,
          fontFamily: mono
            ? Platform.OS === 'ios'
              ? 'Courier'
              : 'monospace'
            : undefined,
        }}
      >
        {value}
      </Text>
    </View>
  );
}
