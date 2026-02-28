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
import NetworkGraph from '@/components/NetworkGraph';

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
        <SectionCard title="Drug-Disease Network">
          {loading.network ? (
            <LoadingPlaceholder label="Loading network…" />
          ) : networkData ? (
            <View style={{ height: CARD_HEIGHT }}>
              <NetworkGraph networkData={networkData} loading={loading.network} />
            </View>
          ) : (
            <EmptyPlaceholder label="No network data available" />
          )}
        </SectionCard>

        <SectionCard title="Molecular Structure">
          {loading.structure ? (
            <LoadingPlaceholder label="Loading structure…" />
          ) : structureData ? (
            <View style={{ height: CARD_HEIGHT, alignItems: 'center', justifyContent: 'center' }}>
              <Text style={{ fontSize: 12, color: MUTED_FG }}>
                3D molecule viewer — coming soon
              </Text>
              <Text style={{ fontSize: 10, color: MUTED_FG, marginTop: 4 }}>
                {structureData.source ?? '3d'} · CID {structureData.pubchem_cid ?? 'N/A'}
              </Text>
            </View>
          ) : (
            <EmptyPlaceholder label="No structure data available" />
          )}
        </SectionCard>

        <SectionCard title="Analysis">
          <DrugAnalysis
            drug={selectedDrug}
            disease={selectedDisease}
            networkData={networkData}
            onOpenChatbot={() => setShowChatbot(true)}
          />
        </SectionCard>
      </ScrollView>

      <ExplanationSheet ref={sheetRef} drug={selectedDrug} disease={selectedDisease} />
    </View>
  );
}

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
