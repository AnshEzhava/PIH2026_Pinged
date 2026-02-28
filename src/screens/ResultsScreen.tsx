import React, { useRef, useCallback } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  FlatList,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Info } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type BottomSheet from "@gorhom/bottom-sheet";

import { useAppContext } from "@/context/AppContext";
import DrugCard from "@/components/DrugCard";
import ExplanationSheet from "@/components/ExplanationSheet";
import type { DrugCandidate } from "@/types/index";
import type { ResultsStackParamList } from "@/navigation/ResultsStack";
import { useThemeColors } from "@/theme/colors";

export default function ResultsScreen() {
  const C = useThemeColors();
  const { candidates, selectedDrug, selectedDisease, loading, selectDrug } =
    useAppContext();

  const navigation =
    useNavigation<NativeStackNavigationProp<ResultsStackParamList>>();
  const sheetRef = useRef<BottomSheet>(null);
  const insets = useSafeAreaInsets();

  const handleDrugPress = useCallback(
    async (drug: DrugCandidate) => {
      await selectDrug(drug);
      navigation.navigate("DrugDetail");
    },
    [selectDrug, navigation],
  );

  const renderItem = useCallback(
    ({ item, index }: { item: DrugCandidate; index: number }) => (
      <DrugCard
        drug={item}
        index={index}
        isSelected={selectedDrug?.drug_id === item.drug_id}
        onPress={handleDrugPress}
      />
    ),
    [selectedDrug, handleDrugPress],
  );

  return (
    <View style={{ flex: 1, backgroundColor: C.background }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: C.border,
          flexDirection: "row",
          alignItems: "flex-start",
          justifyContent: "space-between",
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: "700", color: C.textPrimary }}>
            Drug Alternatives
          </Text>
          <Text style={{ fontSize: 10, color: C.textMuted, marginTop: 2 }}>
            Ranked by repurposing potential
          </Text>
          {selectedDisease && (
            <Text
              style={{
                fontSize: 11,
                color: C.accent,
                marginTop: 4,
                fontWeight: "500",
              }}
            >
              {selectedDisease.disease_name}
            </Text>
          )}
        </View>

        {selectedDrug && (
          <Pressable
            onPress={() => sheetRef.current?.expand()}
            style={({ pressed }) => ({
              padding: 8,
              borderRadius: 6,
              backgroundColor: pressed ? C.cardPressed : "transparent",
            })}
          >
            <Info size={18} color={C.accent} />
          </Pressable>
        )}
      </View>

      {loading.predict && (
        <View style={{ alignItems: "center", paddingVertical: 40 }}>
          <ActivityIndicator size="large" color={C.accent} />
          <Text style={{ fontSize: 12, color: C.textMuted, marginTop: 8 }}>
            Analyzing drug candidates…
          </Text>
          {selectedDisease && (
            <Text style={{ fontSize: 10, color: C.textMuted, marginTop: 4 }}>
              {selectedDisease.disease_name}
            </Text>
          )}
        </View>
      )}

      {!loading.predict && candidates.length === 0 && (
        <View
          style={{
            flex: 1,
            alignItems: "center",
            justifyContent: "center",
            paddingHorizontal: 24,
          }}
        >
          <Text
            style={{
              fontSize: 13,
              color: C.textMuted,
              textAlign: "center",
              lineHeight: 20,
            }}
          >
            Select a disease from the Search tab to see predicted drug
            repurposing candidates
          </Text>
        </View>
      )}

      {!loading.predict && candidates.length > 0 && (
        <FlatList
          data={candidates}
          keyExtractor={(item) => item.drug_id}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 12 }}
          showsVerticalScrollIndicator={false}
        />
      )}

      <ExplanationSheet
        ref={sheetRef}
        drug={selectedDrug}
        disease={selectedDisease}
      />
    </View>
  );
}
