import React from 'react';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Search, FlaskConical } from 'lucide-react-native';

import SearchStack from './SearchStack';
import ResultsStack from './ResultsStack';

export type TabParamList = {
  SearchTab: undefined;
  ResultsTab: undefined;
};

const Tab = createBottomTabNavigator<TabParamList>();

const ACCENT = '#2563EB';
const MUTED_FG = '#9CA3AF';

export default function TabNavigator() {
  return (
    <Tab.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: ACCENT,
        tabBarInactiveTintColor: MUTED_FG,
        tabBarStyle: {
          borderTopWidth: 1,
          borderTopColor: '#E5E7EB',
          backgroundColor: '#FFFFFF',
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
