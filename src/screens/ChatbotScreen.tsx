import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  Pressable,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Modal,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from "react-native-reanimated";
import { Sparkles, Send, X } from "lucide-react-native";

import { chatWithGemini } from "@/services/index";
import { useAppContext } from "@/context/AppContext";
import { useThemeColors, type AppColors } from "@/theme/colors";

interface Message {
  role: "user" | "assistant";
  content: string;
}

export default function ChatbotScreen() {
  const C = useThemeColors();
  const { selectedDrug, selectedDisease, showChatbot, setShowChatbot } =
    useAppContext();
  const insets = useSafeAreaInsets();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  // Reinitialise greeting when drug/disease change
  useEffect(() => {
    if (selectedDrug && selectedDisease) {
      setMessages([
        {
          role: "assistant",
          content: `Hi! I can answer questions about ${selectedDrug.drug_name} and ${selectedDisease.disease_name}. What would you like to know?`,
        },
      ]);
    }
  }, [selectedDrug, selectedDisease]);

  const suggestedQuestions =
    selectedDrug && selectedDisease
      ? [
          `How does ${selectedDrug.drug_name} work?`,
          `What are the side effects of ${selectedDrug.drug_name}?`,
          `Why is ${selectedDrug.drug_name} being considered for ${selectedDisease.disease_name}?`,
          `What is the mechanism of action?`,
          `Are there any contraindications?`,
          `What clinical evidence exists?`,
        ]
      : [];

  const handleSend = useCallback(
    async (questionOverride?: string) => {
      const text = (questionOverride ?? input).trim();
      if (!text || loading || !selectedDrug || !selectedDisease) return;

      if (!questionOverride) setInput("");
      setMessages((prev) => [...prev, { role: "user", content: text }]);
      setLoading(true);

      try {
        const resp = await chatWithGemini(
          selectedDrug.drug_name,
          selectedDisease.disease_name,
          selectedDrug.drug_type ?? "Unknown",
          selectedDrug.mechanism ?? "Unknown",
          text,
        );
        const answer =
          (resp as unknown as { answer?: string }).answer ??
          resp.response ??
          "No response received.";
        setMessages((prev) => [
          ...prev,
          { role: "assistant", content: answer },
        ]);
      } catch {
        setMessages((prev) => [
          ...prev,
          {
            role: "assistant",
            content:
              "Sorry, I encountered an error. Please try again or check your API connection.",
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, selectedDrug, selectedDisease],
  );

  const renderItem = useCallback(
    ({ item }: { item: Message }) => <MessageBubble message={item} colors={C} />,
    [C],
  );

  if (!selectedDrug || !selectedDisease) return null;

  return (
    <Modal
      visible={showChatbot}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowChatbot(false)}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: C.background }}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <View
          style={{
            paddingTop: insets.top + 8,
            paddingBottom: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: C.border,
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
            backgroundColor: C.chatHeaderBg,
          }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Sparkles size={18} color={C.accent} />
            <View>
              <Text
                style={{ fontSize: 15, fontWeight: "600", color: C.textPrimary }}
              >
                AI Assistant
              </Text>
              <Text style={{ fontSize: 11, color: C.textMuted }}>
                Ask me about {selectedDrug.drug_name} and{" "}
                {selectedDisease.disease_name}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setShowChatbot(false)}
            style={({ pressed }) => ({
              padding: 6,
              borderRadius: 6,
              backgroundColor: pressed ? C.cardPressed : "transparent",
            })}
          >
            <X size={18} color={C.textMuted} />
          </Pressable>
        </View>

        <FlatList
          ref={listRef}
          data={[...messages].reverse()}
          keyExtractor={(_, i) => String(i)}
          renderItem={renderItem}
          inverted
          contentContainerStyle={{ padding: 16, gap: 12 }}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={loading ? <TypingIndicator colors={C} /> : null}
        />

        {messages.length <= 1 && (
          <View
            style={{
              paddingHorizontal: 12,
              paddingVertical: 8,
              borderTopWidth: 1,
              borderTopColor: C.border,
              backgroundColor: C.suggestionsBg,
            }}
          >
            <Text
              style={{
                fontSize: 11,
                fontWeight: "500",
                color: C.textMuted,
                marginBottom: 6,
              }}
            >
              Suggested questions:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 6 }}>
                {suggestedQuestions.slice(0, 4).map((q, i) => (
                  <Pressable
                    key={i}
                    onPress={() => handleSend(q)}
                    disabled={loading}
                    style={({ pressed }) => ({
                      paddingHorizontal: 10,
                      paddingVertical: 5,
                      borderRadius: 20,
                      borderWidth: 1,
                      borderColor: pressed ? C.accent : C.border,
                      backgroundColor: pressed
                        ? C.accentSubtle
                        : C.selectedBg,
                      opacity: loading ? 0.5 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 11, color: C.textSecondary }}>{q}</Text>
                  </Pressable>
                ))}
              </View>
            </ScrollView>
          </View>
        )}

        <View
          style={{
            paddingHorizontal: 12,
            paddingTop: 10,
            paddingBottom: Platform.OS === "ios" ? 28 : 12,
            borderTopWidth: 1,
            borderTopColor: C.border,
          }}
        >
          <View
            style={{ flexDirection: "row", alignItems: "flex-end", gap: 8 }}
          >
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: C.border,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 13,
                color: C.textPrimary,
                backgroundColor: C.card,
                maxHeight: 80,
                minHeight: 40,
              }}
              placeholder="Ask a question about the drug or disease…"
              placeholderTextColor={C.textMuted}
              value={input}
              onChangeText={setInput}
              multiline
              returnKeyType="send"
              onSubmitEditing={() => handleSend()}
              blurOnSubmit
              editable={!loading}
            />
            <Pressable
              onPress={() => handleSend()}
              disabled={!input.trim() || loading}
              style={({ pressed }) => ({
                width: 40,
                height: 40,
                borderRadius: 10,
                backgroundColor:
                  !input.trim() || loading
                    ? C.accentDisabled
                    : pressed
                      ? C.accentPressed
                      : C.accent,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Send
                size={16}
                color={!input.trim() || loading ? C.textMuted : "#FFFFFF"}
              />
            </Pressable>
          </View>
          <Text style={{ fontSize: 10, color: C.textMuted, marginTop: 6 }}>
            Focused on {selectedDrug.drug_name} and{" "}
            {selectedDisease.disease_name}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MessageBubble({ message, colors }: { message: Message; colors: AppColors }) {
  const isUser = message.role === "user";
  return (
    <View
      style={{
        alignItems: isUser ? "flex-end" : "flex-start",
        marginBottom: 4,
      }}
    >
      <View
        style={{
          maxWidth: "82%",
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: isUser ? colors.accent : colors.backgroundMuted,
        }}
      >
        <Text
          style={{
            fontSize: 13,
            lineHeight: 20,
            color: isUser ? "#FFFFFF" : colors.textPrimary,
          }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator({ colors }: { colors: AppColors }) {
  const dots = [0, 150, 300].map((delay) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const y = useSharedValue(0);
    useEffect(() => {
      y.value = withDelay(
        delay,
        withRepeat(
          withSequence(
            withTiming(-5, { duration: 300 }),
            withTiming(0, { duration: 300 }),
          ),
          -1,
        ),
      );
    }, [y, delay]);
    // eslint-disable-next-line react-hooks/rules-of-hooks
    const style = useAnimatedStyle(() => ({
      transform: [{ translateY: y.value }],
    }));
    return style;
  });

  return (
    <View style={{ alignItems: "flex-start", marginBottom: 4 }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 5,
          backgroundColor: colors.backgroundMuted,
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 12,
        }}
      >
        {dots.map((style, i) => (
          <Animated.View
            key={i}
            style={[
              {
                width: 7,
                height: 7,
                borderRadius: 3.5,
                backgroundColor: colors.accent,
              },
              style,
            ]}
          />
        ))}
      </View>
    </View>
  );
}
