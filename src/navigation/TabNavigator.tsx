import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Search, FlaskConical } from 'lucide-react-native';

import SearchStack from './SearchStack';
import ResultsStack from './ResultsStack';
import { useThemeColors } from '@/theme';

export type TabParamList = {
  SearchTab: undefined;
  ResultsTab: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

export default function TabNavigator() {
  const C = useThemeColors();

  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: C.accent,
        tabBarInactiveTintColor: C.textMuted,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: C.border,
          backgroundColor: C.card,
        },
      }}
    >
      <Tab.Screen
        name="SearchTab"
        component={SearchStack}
        options={{
          title: 'Search',
          tabBarIcon: ({ color, size }) => (
            <Search color={color} size={size} />
          ),
        }}
      />
      <Tab.Screen
        name="ResultsTab"
        component={ResultsStack}
        options={{
          title: 'Results',
          tabBarIcon: ({ color, size }) => (
            <FlaskConical color={color} size={size} />
          ),
        }}
      />
    </Tab.Navigator>
  );
}
