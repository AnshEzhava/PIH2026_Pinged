/**
 * ExplanationSheet — Phase 8 port of ExplanationPopup.js
 *
 * Replaces Framer Motion fixed-position modal with @gorhom/bottom-sheet.
 * Content sections (Summary, Mechanism, Disease Relevance, Contraindications,
 * Confidence) are ported verbatim — only <div>/<p> → <View>/<Text>.
 */

import React, { useState, useEffect, forwardRef } from 'react';
import { View, Text, ActivityIndicator } from 'react-native';
import BottomSheet, {
  BottomSheetScrollView,
  BottomSheetBackdrop,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { AlertTriangle } from 'lucide-react-native';

import { getGeminiExplanation } from '@/services/index';
import type { DrugCandidate, Disease, GeminiExplanation } from '@/types/index';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ExplanationSheetProps {
  drug: DrugCandidate | null;
  disease: Disease | null;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#2563EB';
const MUTED_FG = '#9CA3AF';
const BORDER = '#E5E7EB';

const SNAP_POINTS = ['80%'];

// ─── Component ────────────────────────────────────────────────────────────────

const ExplanationSheet = forwardRef<BottomSheet, ExplanationSheetProps>(
  ({ drug, disease }, ref) => {
    const [loading, setLoading] = useState(false);
    const [explanation, setExplanation] = useState<GeminiExplanation | null>(null);
    const [fetchError, setFetchError] = useState<string | null>(null);

    // Fetch when drug/disease change
    useEffect(() => {
      if (!drug || !disease) return;

      let cancelled = false;
      setLoading(true);
      setFetchError(null);
      setExplanation(null);

      getGeminiExplanation(
        drug.drug_name,
        disease.disease_name,
        drug.drug_type ?? 'Unknown',
        drug.mechanism ?? 'Unknown',
      )
        .then(data => {
          if (!cancelled) setExplanation(data);
        })
        .catch(() => {
          if (!cancelled)
            setFetchError('Unable to fetch detailed information. Please try again.');
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });

      return () => { cancelled = true; };
    }, [drug, disease]);

    const confidenceScore = drug ? Math.round(drug.score * 100) : 0;
    const confidenceTier = drug?.confidence ?? 'Low';
    const confidenceColor = confidenceTier === 'High' ? '#059669' : '#D97706';

    const renderBackdrop = (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop {...props} disappearsOnIndex={-1} appearsOnIndex={0} />
    );

    return (
      <BottomSheet
        ref={ref}
        index={-1}
        snapPoints={SNAP_POINTS}
        enablePanDownToClose
        backdropComponent={renderBackdrop}
        handleIndicatorStyle={{ backgroundColor: '#D1D5DB', width: 40 }}
        backgroundStyle={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 16, borderTopRightRadius: 16 }}
      >
        <BottomSheetScrollView contentContainerStyle={{ paddingBottom: 40 }}>
          {/* ── Sheet header ──────────────────────────────────────────────── */}
          <View
            style={{
              paddingHorizontal: 20,
              paddingTop: 16,
              paddingBottom: 14,
              borderBottomWidth: 1,
              borderBottomColor: BORDER,
            }}
          >
            <Text style={{ fontSize: 20, fontWeight: '700', color: '#111827' }}>
              {drug?.drug_name ?? '—'}
            </Text>
            <Text style={{ fontSize: 13, color: MUTED_FG, marginTop: 4 }}>
              Generated explanation for interpretability
            </Text>
          </View>

          {/* ── Content ───────────────────────────────────────────────────── */}
          <View style={{ paddingHorizontal: 20, paddingTop: 20 }}>
            {loading && (
              <View style={{ alignItems: 'center', paddingVertical: 48 }}>
                <ActivityIndicator size="large" color={ACCENT} />
                <Text style={{ fontSize: 13, color: MUTED_FG, marginTop: 12 }}>
                  Loading detailed information…
                </Text>
              </View>
            )}

            {fetchError && (
              <View
                style={{
                  backgroundColor: '#FEF2F2',
                  borderWidth: 1,
                  borderColor: '#FECACA',
                  borderRadius: 8,
                  padding: 12,
                }}
              >
                <Text style={{ fontSize: 13, color: '#B91C1C' }}>{fetchError}</Text>
              </View>
            )}

            {!loading && !fetchError && explanation && drug && disease && (
              <>
                {/* Summary */}
                <Section title="SUMMARY">
                  <Text style={{ fontSize: 14, color: '#111827', lineHeight: 22 }}>
                    {explanation.summary ??
                      `${drug.drug_name} shows potential for ${disease.disease_name} based on its mechanism of action and known biological pathways.`}
                  </Text>
                </Section>

                {/* Mechanism */}
                <Section title="MECHANISM OF ACTION">
                  <Text style={{ fontSize: 14, color: '#111827', lineHeight: 22 }}>
                    {explanation.mechanism_detail ??
                      `${drug.drug_name} acts on multiple biological targets that are implicated in ${disease.disease_name} pathology.`}
                  </Text>
                  {drug.mechanism && drug.mechanism !== 'Unknown' && !explanation.mechanism_detail && (
                    <Text style={{ fontSize: 14, color: '#111827', lineHeight: 22, marginTop: 8 }}>
                      Primary mechanism:{' '}
                      {drug.mechanism
                        .replace(/_/g, ' ')
                        .toLowerCase()
                        .replace(/^\w/, c => c.toUpperCase())}
                    </Text>
                  )}
                </Section>

                {/* Disease Relevance */}
                <Section title="DISEASE RELEVANCE">
                  <Text style={{ fontSize: 14, color: '#111827', lineHeight: 22 }}>
                    {explanation.disease_relevance ??
                      `In the context of ${disease.disease_name}, this drug candidate addresses critical aspects of disease biology.`}
                  </Text>
                  {drug.gene_overlap > 0 && (
                    <Text style={{ fontSize: 12, color: MUTED_FG, marginTop: 8 }}>
                      Gene overlap: {drug.gene_overlap}{' '}
                      {drug.gene_overlap === 1 ? 'gene' : 'genes'} shared between drug targets and disease pathways.
                    </Text>
                  )}
                </Section>

                {/* Contraindications */}
                {explanation.contraindications && explanation.contraindications.length > 0 && (
                  <Section title="CONTRAINDICATIONS">
                    <View
                      style={{
                        backgroundColor: '#FFFBEB',
                        borderWidth: 1,
                        borderColor: '#FDE68A',
                        borderRadius: 8,
                        padding: 14,
                      }}
                    >
                      <View style={{ flexDirection: 'row', alignItems: 'flex-start', marginBottom: 10 }}>
                        <AlertTriangle size={14} color="#D97706" style={{ marginRight: 6, marginTop: 2 }} />
                        <Text style={{ fontSize: 12, fontWeight: '500', color: '#92400E', flex: 1 }}>
                          The following patient groups should NOT receive {drug.drug_name}:
                        </Text>
                      </View>
                      {explanation.contraindications.map((item, i) => (
                        <View key={i} style={{ flexDirection: 'row', marginTop: 6 }}>
                          <Text style={{ fontSize: 13, color: '#D97706', marginRight: 6 }}>•</Text>
                          <Text style={{ fontSize: 13, color: '#78350F', flex: 1, lineHeight: 20 }}>
                            {item}
                          </Text>
                        </View>
                      ))}
                    </View>
                  </Section>
                )}

                {/* Confidence */}
                <Section title="CONFIDENCE INTERPRETATION">
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 8 }}>
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>
                      Confidence Score
                    </Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: confidenceColor }}>
                      {confidenceScore}%
                    </Text>
                  </View>
                  <View
                    style={{
                      flexDirection: 'row',
                      justifyContent: 'space-between',
                      paddingVertical: 8,
                      borderTopWidth: 1,
                      borderTopColor: BORDER,
                    }}
                  >
                    <Text style={{ fontSize: 14, fontWeight: '500', color: '#111827' }}>Tier</Text>
                    <Text style={{ fontSize: 14, fontWeight: '600', color: confidenceColor }}>
                      {confidenceTier}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 13, color: MUTED_FG, lineHeight: 20, marginTop: 10 }}>
                    {confidenceTier === 'High'
                      ? 'High confidence predictions indicate strong computational evidence for repurposing potential based on molecular mechanisms, pathway analysis, and target compatibility.'
                      : 'Moderate confidence suggests promising therapeutic potential that warrants further investigation through experimental validation and clinical assessment.'}
                  </Text>
                </Section>

                {/* Additional info */}
                {drug.drug_type && drug.drug_type !== 'Unknown' && (
                  <View style={{ paddingTop: 16, borderTopWidth: 1, borderTopColor: BORDER }}>
                    <Text style={{ fontSize: 12, color: MUTED_FG }}>
                      <Text style={{ fontWeight: '600' }}>Current Use: </Text>
                      {drug.drug_type}
                    </Text>
                    {drug.max_phase > 0 && (
                      <Text style={{ fontSize: 12, color: MUTED_FG, marginTop: 4 }}>
                        <Text style={{ fontWeight: '600' }}>Clinical Phase: </Text>
                        Phase {drug.max_phase}
                      </Text>
                    )}
                  </View>
                )}
              </>
            )}
          </View>
        </BottomSheetScrollView>
      </BottomSheet>
    );
  },
);

ExplanationSheet.displayName = 'ExplanationSheet';
export default ExplanationSheet;

// ─── Section helper ────────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={{ marginBottom: 24 }}>
      <Text
        style={{
          fontSize: 11,
          fontWeight: '600',
          color: MUTED_FG,
          letterSpacing: 0.8,
          marginBottom: 10,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}
