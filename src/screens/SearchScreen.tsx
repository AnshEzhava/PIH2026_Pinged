import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  Text,
  TextInput,
  FlatList,
  Pressable,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, { FadeInLeft, FadeIn } from "react-native-reanimated";
import { Search, ChevronDown, ChevronUp } from "lucide-react-native";
import { useNavigation } from "@react-navigation/native";
import type { BottomTabNavigationProp } from "@react-navigation/bottom-tabs";

import { getPopularDiseases, searchDiseases } from "@/services/index";
import { useAppContext } from "@/context/AppContext";
import type { Disease } from "@/types/index";
import type { TabParamList } from "@/navigation/TabNavigator";

const ACCENT = "#2563EB";
const MUTED_FG = "#9CA3AF";
const BORDER = "#E5E7EB";
const MUTED_BG = "#F9FAFB";

export default function SearchScreen() {
  const { selectedDisease, selectDisease, loading, error, clearError } =
    useAppContext();
  const navigation = useNavigation<BottomTabNavigationProp<TabParamList>>();
  const insets = useSafeAreaInsets();

  const [diseases, setDiseases] = useState<Disease[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const [advancedExpanded, setAdvancedExpanded] = useState(false);
  const [directId, setDirectId] = useState("");

  useEffect(() => {
    getPopularDiseases()
      .then(setDiseases)
      .catch(() => setDiseases([]));
  }, []);

  const handleSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length < 2) {
      getPopularDiseases()
        .then(setDiseases)
        .catch(() => {});
      return;
    }
    setSearching(true);
    try {
      const results = await searchDiseases(query);
      setDiseases(results);
    } catch {
      // keep existing list on error
    } finally {
      setSearching(false);
    }
  }, []);

  const handleSelect = useCallback(
    async (disease: Disease) => {
      await selectDisease(disease);
      navigation.navigate("ResultsTab");
    },
    [selectDisease, navigation],
  );

  const handleDirectIdSubmit = useCallback(() => {
    if (directId.trim()) {
      handleSelect({
        disease_id: directId.trim(),
        disease_name: directId.trim(),
      });
      setDirectId("");
    }
  }, [directId, handleSelect]);

  const renderItem = useCallback(
    ({ item, index }: { item: Disease; index: number }) => {
      const isSelected = selectedDisease?.disease_id === item.disease_id;
      return (
        <Animated.View entering={FadeInLeft.delay(index * 30).duration(200)}>
          <Pressable
            onPress={() => handleSelect(item)}
            style={({ pressed }) => ({
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderRadius: 6,
              marginBottom: 2,
              backgroundColor: pressed
                ? "#F3F4F6"
                : isSelected
                  ? "rgba(37,99,235,0.05)"
                  : "transparent",
            })}
          >
            <View
              style={{
                flexDirection: "row",
                alignItems: "flex-start",
                justifyContent: "space-between",
              }}
            >
              <View style={{ flex: 1 }}>
                <Text
                  style={{
                    fontSize: 12,
                    fontWeight: "500",
                    color: isSelected ? ACCENT : "#374151",
                  }}
                >
                  {item.disease_name}
                </Text>
                <Text
                  style={{
                    fontSize: 9,
                    color: MUTED_FG,
                    marginTop: 2,
                    fontFamily: Platform.OS === "ios" ? "Courier" : "monospace",
                    opacity: 0.6,
                  }}
                >
                  {item.disease_id}
                </Text>
              </View>
              {isSelected && (
                <Animated.View
                  entering={FadeIn.duration(150)}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 3,
                    backgroundColor: ACCENT,
                    marginLeft: 8,
                    marginTop: 6,
                  }}
                />
              )}
            </View>
          </Pressable>
        </Animated.View>
      );
    },
    [selectedDisease, handleSelect],
  );

  return (
    <KeyboardAvoidingView
      style={{ flex: 1, backgroundColor: "#FFFFFF" }}
      behavior={Platform.OS === "ios" ? "padding" : "height"}
    >
      <View
        style={{
          paddingHorizontal: 16,
          paddingTop: insets.top + 8,
          paddingBottom: 12,
          borderBottomWidth: 1,
          borderBottomColor: BORDER,
        }}
      >
        <Text style={{ fontSize: 16, fontWeight: "700", color: "#111827" }}>
          Disease Context
        </Text>
        <Text
          style={{
            fontSize: 10,
            color: MUTED_FG,
            marginTop: 2,
            lineHeight: 16,
          }}
        >
          Select a condition to explore
        </Text>
      </View>

      {error && (
        <Pressable
          onPress={clearError}
          style={{
            backgroundColor: "#FEF2F2",
            borderColor: "#FECACA",
            borderWidth: 1,
            borderRadius: 8,
            paddingHorizontal: 16,
            paddingVertical: 10,
            marginHorizontal: 12,
            marginTop: 8,
          }}
        >
          <Text style={{ fontSize: 12, color: "#B91C1C" }}>{error}</Text>
          <Text style={{ fontSize: 10, color: "#EF4444", marginTop: 2 }}>
            Tap to dismiss
          </Text>
        </Pressable>
      )}

      {loading.predict && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 16,
            paddingTop: 8,
            gap: 6,
          }}
        >
          <ActivityIndicator size="small" color={ACCENT} />
          <Text style={{ fontSize: 11, color: MUTED_FG, fontWeight: "500" }}>
            Scoring candidates…
          </Text>
        </View>
      )}

      <View style={{ paddingHorizontal: 12, paddingVertical: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            backgroundColor: MUTED_BG,
            borderWidth: 1,
            borderColor: BORDER,
            borderRadius: 6,
            paddingHorizontal: 10,
          }}
        >
          <Search size={14} color={MUTED_FG} style={{ marginRight: 6 }} />
          <TextInput
            style={{
              flex: 1,
              fontSize: 12,
              paddingVertical: 8,
              color: "#111827",
              fontFamily: "System",
            }}
            placeholder="Search diseases..."
            placeholderTextColor={MUTED_FG}
            value={searchQuery}
            onChangeText={handleSearch}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && (
            <ActivityIndicator
              size="small"
              color={ACCENT}
              style={{ marginLeft: 6 }}
            />
          )}
        </View>
      </View>

      <FlatList
        data={diseases}
        keyExtractor={(item) => item.disease_id}
        renderItem={renderItem}
        style={{ flex: 1, paddingHorizontal: 8 }}
        ListEmptyComponent={
          !searching ? (
            <Text
              style={{
                textAlign: "center",
                paddingVertical: 24,
                fontSize: 12,
                color: MUTED_FG,
              }}
            >
              No diseases found
            </Text>
          ) : null
        }
        keyboardShouldPersistTaps="handled"
      />

      <View
        style={{
          borderTopWidth: 1,
          borderTopColor: BORDER,
          paddingHorizontal: 12,
          paddingVertical: 8,
        }}
      >
        <Pressable
          onPress={() => setAdvancedExpanded((v) => !v)}
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <View>
            <Text style={{ fontSize: 12, fontWeight: "600", color: "#111827" }}>
              Advanced Input
            </Text>
            <Text style={{ fontSize: 10, color: MUTED_FG, marginTop: 1 }}>
              Molecular/genetic data
            </Text>
          </View>
          {advancedExpanded ? (
            <ChevronUp size={14} color={MUTED_FG} />
          ) : (
            <ChevronDown size={14} color={MUTED_FG} />
          )}
        </Pressable>

        {advancedExpanded && (
          <View style={{ marginTop: 8 }}>
            <Text style={{ fontSize: 10, color: MUTED_FG, marginBottom: 4 }}>
              Disease ID (EFO/MONDO)
            </Text>
            <TextInput
              style={{
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 6,
                paddingHorizontal: 8,
                paddingVertical: 6,
                fontSize: 12,
                color: "#111827",
                backgroundColor: "#FFFFFF",
              }}
              placeholder="e.g. MONDO_0005180"
              placeholderTextColor={MUTED_FG}
              value={directId}
              onChangeText={setDirectId}
              onSubmitEditing={handleDirectIdSubmit}
              returnKeyType="go"
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
