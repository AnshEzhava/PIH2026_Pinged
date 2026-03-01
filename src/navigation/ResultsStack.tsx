import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ResultsScreen, DrugDetailScreen } from '@/screens';

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
