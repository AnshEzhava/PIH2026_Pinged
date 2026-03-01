import React, { useRef } from "react";
import {
  View,
  Text,
  ScrollView,
  ActivityIndicator,
  Pressable,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ArrowLeft } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type BottomSheet from "@gorhom/bottom-sheet";

import { useAppContext } from "@/context";
import { DrugAnalysis, ExplanationSheet, NetworkGraph, MoleculeViewer } from "@/components";
import { useThemeColors, type AppColors } from "@/theme";

const CARD_HEIGHT = 260;

export default function DrugDetailScreen() {
  const C = useThemeColors();
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
  const insets = useSafeAreaInsets();

  if (!selectedDrug || !selectedDisease) {
    return (
      <View
        style={{
          flex: 1,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: C.background,
        }}
      >
        <Text style={{ fontSize: 13, color: C.textMuted }}>No drug selected</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: C.backgroundSubtle }}>
      <View
        style={{
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          paddingHorizontal: 16,
          backgroundColor: C.card,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
        }}
      >
        <Pressable
          onPress={() => navigation.goBack()}
          style={({ pressed }) => ({
            padding: 4,
            borderRadius: 6,
            backgroundColor: pressed ? C.cardPressed : "transparent",
          })}
        >
          <ArrowLeft size={20} color={C.textSecondary} />
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text
            style={{ fontSize: 16, fontWeight: "700", color: C.textPrimary }}
            numberOfLines={1}
          >
            {selectedDrug.drug_name}
          </Text>
          <Text style={{ fontSize: 11, color: C.textMuted }} numberOfLines={1}>
            {selectedDisease.disease_name}
          </Text>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={{ padding: 12, gap: 12 }}
        showsVerticalScrollIndicator={false}
      >
        <SectionCard title="Drug-Disease Network" colors={C}>
          {loading.network ? (
            <LoadingPlaceholder label="Loading network…" colors={C} />
          ) : networkData ? (
            <View style={{ height: CARD_HEIGHT }}>
              <NetworkGraph
                networkData={networkData}
                loading={loading.network}
              />
            </View>
          ) : (
            <EmptyPlaceholder label="No network data available" colors={C} />
          )}
        </SectionCard>

        <SectionCard title="Molecular Structure" colors={C}>
          {loading.structure ? (
            <LoadingPlaceholder label="Loading structure…" colors={C} />
          ) : structureData ? (
            <View style={{ height: CARD_HEIGHT }}>
              <MoleculeViewer
                structureData={structureData}
                drugName={selectedDrug.drug_name}
              />
            </View>
          ) : (
            <EmptyPlaceholder label="No structure data available" colors={C} />
          )}
        </SectionCard>

        <SectionCard title="Analysis" colors={C}>
          <DrugAnalysis
            drug={selectedDrug}
            disease={selectedDisease}
            networkData={networkData}
            onOpenChatbot={() => setShowChatbot(true)}
          />
        </SectionCard>
      </ScrollView>

      <ExplanationSheet
        ref={sheetRef}
        drug={selectedDrug}
        disease={selectedDisease}
      />
    </View>
  );
}

function SectionCard({
  title,
  children,
  colors,
}: {
  title: string;
  children: React.ReactNode;
  colors: AppColors;
}) {
  return (
    <View
      style={{
        backgroundColor: colors.card,
        borderRadius: 10,
        borderWidth: 1,
        borderColor: colors.border,
        padding: 12,
      }}
    >
      <Text
        style={{
          fontSize: 11,
          fontWeight: "500",
          color: colors.textMuted,
          marginBottom: 8,
        }}
      >
        {title}
      </Text>
      {children}
    </View>
  );
}

function LoadingPlaceholder({ label, colors }: { label: string; colors: AppColors }) {
  return (
    <View
      style={{
        height: CARD_HEIGHT,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <ActivityIndicator size="large" color={colors.accent} />
      <Text style={{ fontSize: 12, color: colors.textMuted, marginTop: 10 }}>
        {label}
      </Text>
    </View>
  );
}

function EmptyPlaceholder({ label, colors }: { label: string; colors: AppColors }) {
  return (
    <View
      style={{ height: 100, alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: 12, color: colors.textMuted }}>{label}</Text>
    </View>
  );
}
