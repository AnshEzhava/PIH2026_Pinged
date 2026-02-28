import React from "react";
import { NavigationContainer, DarkTheme, DefaultTheme } from "@react-navigation/native";
import { GestureHandlerRootView } from "react-native-gesture-handler";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { useColorScheme } from "react-native";

import { AppProvider } from "@/context/AppContext";
import TabNavigator from "./TabNavigator";
import ChatbotScreen from "@/screens/ChatbotScreen";

export default function RootNavigator() {
  const scheme = useColorScheme();

  return (
    <SafeAreaProvider>
      <NavigationContainer theme={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppProvider>
          <GestureHandlerRootView style={{ flex: 1 }}>
            <TabNavigator />
            <ChatbotScreen />
          </GestureHandlerRootView>
        </AppProvider>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
