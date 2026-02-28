/**
 * ResultsStack — two-screen stack for the Results tab.
 *   ResultsScreen  → lists drug candidates
 *   DrugDetailScreen → network graph + molecule viewer + drug analysis
 */

import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import ResultsScreen from '@/screens/ResultsScreen';
import DrugDetailScreen from '@/screens/DrugDetailScreen';

export type ResultsStackParamList = {
  Results: undefined;
  DrugDetail: undefined;
};

const Stack = createNativeStackNavigator<ResultsStackParamList>();

export default function ResultsStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="Results" component={ResultsScreen} />
      <Stack.Screen name="DrugDetail" component={DrugDetailScreen} />
    </Stack.Navigator>
  );
}
