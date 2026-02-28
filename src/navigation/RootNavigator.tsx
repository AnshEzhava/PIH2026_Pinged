/**
 * RootNavigator — top-level navigation tree.
 *
 *   NavigationContainer
 *     AppProvider (global state)
 *       GestureHandlerRootView
 *         TabNavigator (bottom tabs)
 */

import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider } from '@/context/AppContext';
import TabNavigator from './TabNavigator';

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <AppProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <TabNavigator />
        </GestureHandlerRootView>
      </AppProvider>
    </NavigationContainer>
  );
}
