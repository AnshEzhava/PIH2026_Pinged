/**
 * DrugAnalysis — Phase 7 port of DrugAnalysis.js
 *
 * Replaces:
 *   <div className="grid grid-cols-2">   → two-column flex row
 *   <span> badges (targets)              → horizontal ScrollView chips
 *   <Sparkles> / <AlertTriangle>         → lucide-react-native (same API)
 *   "Explain with AI" button             → Pressable onPress={onOpenChatbot}
 */

import React from 'react';
import { View, Text, Pressable, ScrollView, Platform } from 'react-native';
import { Sparkles, AlertTriangle } from 'lucide-react-native';

import type { DrugCandidate, Disease, NetworkData } from '@/types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface DrugAnalysisProps {
  drug: DrugCandidate;
  disease: Disease;
  networkData: NetworkData | null;
  onOpenChatbot: () => void;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#2563EB';
const MUTED_FG = '#9CA3AF';
const BORDER = '#E5E7EB';

// ─── Component ────────────────────────────────────────────────────────────────

export default function DrugAnalysis({
  drug,
  disease,
  networkData,
  onOpenChatbot,
}: DrugAnalysisProps) {
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
      {/* ── Header row ──────────────────────────────────────────────────────── */}
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: 12,
        }}
      >
        <Text style={{ fontSize: 14, fontWeight: '600', color: '#111827' }}>Drug Details</Text>
        <Pressable
          onPress={onOpenChatbot}
          style={({ pressed }) => ({
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: pressed ? 'rgba(37,99,235,0.85)' : ACCENT,
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

      {/* ── Info grid ───────────────────────────────────────────────────────── */}
      {/* Drug Name — full width */}
      <InfoRow label="Drug Name" value={drug.drug_name} bold />

      {/* Two-column rows */}
      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow label="ChEMBL ID" value={drug.drug_id} mono />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow label="Rank" value={`#${drug.rank}`} />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Repurposing Score"
            value={`${(drug.score * 100).toFixed(1)}% (${drug.confidence})`}
          />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Association Score"
            value={drug.association_score ? drug.association_score.toFixed(3) : 'N/A'}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow label="Drug Type" value={drug.drug_type ?? 'Unknown'} />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Max Clinical Phase"
            value={drug.max_phase > 0 ? `Phase ${drug.max_phase}` : 'Preclinical'}
          />
        </View>
      </View>

      <View style={{ flexDirection: 'row', gap: 16, marginTop: 8 }}>
        <View style={{ flex: 1 }}>
          <InfoRow
            label="Gene Overlap"
            value={`${drug.gene_overlap} ${drug.gene_overlap === 1 ? 'gene' : 'genes'}`}
          />
        </View>
        <View style={{ flex: 1 }}>
          <InfoRow label="Disease Context" value={disease.disease_name} truncate />
        </View>
      </View>

      {/* ── Mechanism ────────────────────────────────────────────────────────── */}
      <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, marginTop: 12, marginBottom: 10 }}>
        <Text
          style={{
            fontSize: 9,
            fontWeight: '500',
            color: MUTED_FG,
            textTransform: 'uppercase',
            letterSpacing: 0.8,
            marginBottom: 4,
          }}
        >
          Mechanism of Action
        </Text>
        <Text style={{ fontSize: 10, color: '#111827', lineHeight: 16 }}>{mechanismText}</Text>
      </View>

      {/* ── Molecular targets ────────────────────────────────────────────────── */}
      {targetNodes.length > 0 && (
        <View style={{ borderTopWidth: 1, borderTopColor: BORDER, paddingTop: 10, marginBottom: 10 }}>
          <Text
            style={{
              fontSize: 9,
              fontWeight: '500',
              color: MUTED_FG,
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
                    backgroundColor: '#F3F4F6',
                    borderWidth: 1,
                    borderColor: '#E5E7EB',
                    borderRadius: 4,
                    paddingHorizontal: 6,
                    paddingVertical: 2,
                  }}
                >
                  <Text
                    style={{
                      fontSize: 9,
                      color: '#374151',
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

      {/* ── Guardrail warning ────────────────────────────────────────────────── */}
      {drug.guardrail && (
        <View
          style={{
            borderTopWidth: 1,
            borderTopColor: BORDER,
            paddingTop: 10,
          }}
        >
          <View
            style={{
              flexDirection: 'row',
              alignItems: 'flex-start',
              backgroundColor: '#FFFBEB',
              borderWidth: 1,
              borderColor: '#FDE68A',
              borderRadius: 6,
              padding: 8,
              gap: 6,
            }}
          >
            <AlertTriangle size={11} color="#D97706" style={{ marginTop: 1 }} />
            <Text style={{ fontSize: 9, color: '#92400E', flex: 1, lineHeight: 14 }}>
              {drug.guardrail}
            </Text>
          </View>
        </View>
      )}
    </View>
  );
}

// ─── InfoRow helper ──────────────────────────────────────────────────────────

function InfoRow({
  label,
  value,
  bold,
  mono,
  truncate,
}: {
  label: string;
  value: string;
  bold?: boolean;
  mono?: boolean;
  truncate?: boolean;
}) {
  return (
    <View>
      <Text style={{ fontSize: 9, color: MUTED_FG, marginBottom: 2 }}>{label}</Text>
      <Text
        numberOfLines={truncate ? 1 : undefined}
        style={{
          fontSize: bold ? 12 : 10,
          fontWeight: bold ? '600' : mono ? '400' : '500',
          color: '#111827',
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
