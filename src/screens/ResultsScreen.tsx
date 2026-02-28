import React, { useRef, useCallback } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  Pressable,
  FlatList,
} from 'react-native';
import { Info } from 'lucide-react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import type BottomSheet from '@gorhom/bottom-sheet';

import { useAppContext } from '@/context/AppContext';
import DrugCard from '@/components/DrugCard';
import ExplanationSheet from '@/components/ExplanationSheet';
import type { DrugCandidate } from '@/types/index';
import type { ResultsStackParamList } from '@/navigation/ResultsStack';

const ACCENT = '#2563EB';
const MUTED_FG = '#9CA3AF';
const BORDER = '#E5E7EB';

export default function ResultsScreen() {
  const {
    candidates,
    selectedDrug,
    selectedDisease,
    loading,
    selectDrug,
  } = useAppContext();

  const navigation =
    useNavigation<NativeStackNavigationProp<ResultsStackParamList>>();
  const sheetRef = useRef<BottomSheet>(null);

  const handleDrugPress = useCallback(
    async (drug: DrugCandidate) => {
      await selectDrug(drug);
      navigation.navigate('DrugDetail');
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
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: 52,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
          flexDirection: 'row',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 16, fontWeight: '700', color: '#111827' }}>
            Drug Alternatives
          </Text>
          <Text style={{ fontSize: 10, color: MUTED_FG, marginTop: 2 }}>
            Ranked by repurposing potential
          </Text>
          {selectedDisease && (
            <Text style={{ fontSize: 11, color: ACCENT, marginTop: 4, fontWeight: '500' }}>
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
              backgroundColor: pressed ? '#F3F4F6' : 'transparent',
            })}
          >
            <Info size={18} color={ACCENT} />
          </Pressable>
        )}
      </View>

      {loading.predict && (
        <View style={{ alignItems: 'center', paddingVertical: 40 }}>
          <ActivityIndicator size="large" color={ACCENT} />
          <Text style={{ fontSize: 12, color: MUTED_FG, marginTop: 8 }}>
            Analyzing drug candidates…
          </Text>
          {selectedDisease && (
            <Text style={{ fontSize: 10, color: MUTED_FG, marginTop: 4 }}>
              {selectedDisease.disease_name}
            </Text>
          )}
        </View>
      )}

      {!loading.predict && candidates.length === 0 && (
        <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24 }}>
          <Text style={{ fontSize: 13, color: MUTED_FG, textAlign: 'center', lineHeight: 20 }}>
            Select a disease from the Search tab to see predicted drug repurposing candidates
          </Text>
        </View>
      )}

      {!loading.predict && candidates.length > 0 && (
        <FlatList
          data={candidates}
          keyExtractor={item => item.drug_id}
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
