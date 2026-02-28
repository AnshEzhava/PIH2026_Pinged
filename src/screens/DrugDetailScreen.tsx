/**
 * DrugDetailScreen — Phase 7
 *
 * Three sections stacked in a ScrollView:
 *   1. NetworkGraph (placeholder → Phase 10)
 *   2. MoleculeViewer (placeholder → Phase 11)
 *   3. DrugAnalysis
 *
 * Each section is wrapped in a card View matching the web's
 * `bg-white rounded-lg border border-border` pattern.
 */

import React, { useRef } from 'react';
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from 'react-native';
import { ArrowLeft } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type BottomSheet from '@gorhom/bottom-sheet';

import { useAppContext } from '@/context/AppContext';
import DrugAnalysis from '@/components/DrugAnalysis';
import ExplanationSheet from '@/components/ExplanationSheet';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACCENT = '#2563EB';
const MUTED_FG = '#9CA3AF';
const BORDER = '#E5E7EB';
const CARD_HEIGHT = 260;

export default function DrugDetailScreen() {
  const {
    selectedDrug,
    selectedDisease,
    networkData,
    structureData,
    loading,
    setShowChatbot,
  } = useAppContext();

  const navigation = useNavigation();
  const sheetRef = useRef<BottomSheet>(null);

  if (!selectedDrug || !selectedDisease) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#FFFFFF' }}>
        <Text style={{ fontSize: 13, color: MUTED_FG }}>No drug selected</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: '#F9FAFB' }}>
      {/* ── Navigation header ─────────────────────────────────────────────── */}
      <View
        style={{
          paddingTop: 52,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
          flexDirection: 'row',
          alignItems: 'center',
          gap: 10,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => ({
            padding: 4,
            borderRadius: 6,
            backgroundColor: pressed ? '#F3F4F6' : 'transparent',
          })}
        >
          <ArrowLeft size={20} color="#374151" />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }} numberOfLines={1}>
            {selectedDrug.drug_name}
          </Text>
          <Text style={{ fontSize: 11, color: MUTED_FG }} numberOfLines={1}>
            {selectedDisease.disease_name}
          </Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={{ padding: 12, gap: 12 }} showsVerticalScrollIndicator={false}>
        {/* ── Network Graph card ────────────────────────────────────────────── */}
        <SectionCard title="Drug-Disease Network">
          {loading.network ? (
            <LoadingPlaceholder label="Loading network…" />
          ) : networkData ? (
            /* NetworkGraph placeholder — Phase 10 will replace this */
            <View style={{ height: CARD_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, color: MUTED_FG }}>
                Network graph — coming in Phase 10
              </Text>
              <Text style={{ fontSize: 10, color: MUTED_FG, marginTop: 4 }}>
                {networkData.nodes.length} nodes · {networkData.edges?.length ?? 0} edges
              </Text>
            </View>
          ) : (
            <EmptyPlaceholder label="No network data available" />
          )}
        </SectionCard>

        {/* ── Molecular Structure card ──────────────────────────────────────── */}
        <SectionCard title="Molecular Structure">
          {loading.structure ? (
            <LoadingPlaceholder label="Loading structure…" />
          ) : structureData ? (
            /* MoleculeViewer placeholder — Phase 11 will replace this */
            <View style={{ height: CARD_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, color: MUTED_FG }}>
                3D molecule viewer — coming in Phase 11
              </Text>
              <Text style={{ fontSize: 10, color: MUTED_FG, marginTop: 4 }}>
                {structureData.source ?? '3d'} · CID {structureData.pubchem_cid ?? 'N/A'}
              </Text>
            </View>
          ) : (
            <EmptyPlaceholder label="No structure data available" />
          )}
        </SectionCard>

        {/* ── Drug Analysis card ────────────────────────────────────────────── */}
        <SectionCard title="Analysis">
          <DrugAnalysis
            drug={selectedDrug}
            disease={selectedDisease}
            networkData={networkData}
            onOpenChatbot={() => setShowChatbot(true)}
          />
        </SectionCard>
      </ScrollView>

      {/* ── Explanation sheet ─────────────────────────────────────────────── */}
      <ExplanationSheet ref={sheetRef} drug={selectedDrug} disease={selectedDisease} />
    </View>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View
      style={{
        backgroundColor: '#FFFFFF',
        borderRadius: 10,
        borderWidth: 1,
        borderColor: BORDER,
        padding: 12,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: '500', color: MUTED_FG, marginBottom: 8 }}>
        {title}
      </Text>
      {children}
    </View>
  );
}

function LoadingPlaceholder({ label }: { label: string }) {
  return (
    <View style={{ height: CARD_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
      <ActivityIndicator size="large" color={ACCENT} />
      <Text style={{ fontSize: 12, color: MUTED_FG, marginTop: 10 }}>{label}</Text>
    </View>
  );
}

function EmptyPlaceholder({ label }: { label: string }) {
  return (
    <View style={{ height: 100, alignItems: 'center', justifyContent: 'center' }}>
      <Text style={{ fontSize: 12, color: MUTED_FG }}>{label}</Text>
    </View>
  );
}
