import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AppProvider } from '@/context/AppContext';
import TabNavigator from './TabNavigator';
import ChatbotScreen from '@/screens/ChatbotScreen';

export default function RootNavigator() {
  return (
    <NavigationContainer>
      <AppProvider>
        <GestureHandlerRootView style={{ flex: 1 }}>
          <TabNavigator />
          <ChatbotScreen />
        </GestureHandlerRootView>
      </AppProvider>
    </NavigationContainer>
  );
}
