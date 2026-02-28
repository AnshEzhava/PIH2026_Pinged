import React, { useState, useRef, useCallback, useEffect } from 'react';
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
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withSequence,
  withTiming,
  withDelay,
} from 'react-native-reanimated';
import { Sparkles, Send, X } from 'lucide-react-native';

import { chatWithGemini } from '@/services/index';
import { useAppContext } from '@/context/AppContext';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

const ACCENT = '#2563EB';
const MUTED_FG = '#9CA3AF';
const BORDER = '#E5E7EB';

export default function ChatbotScreen() {
  const { selectedDrug, selectedDisease, showChatbot, setShowChatbot } = useAppContext();

  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const listRef = useRef<FlatList<Message>>(null);

  // Reinitialise greeting when drug/disease change
  useEffect(() => {
    if (selectedDrug && selectedDisease) {
      setMessages([
        {
          role: 'assistant',
          content: `Hi! I can answer questions about ${selectedDrug.drug_name} and ${selectedDisease.disease_name}. What would you like to know?`,
        },
      ]);
    }
  }, [selectedDrug, selectedDisease]);

  const suggestedQuestions = selectedDrug && selectedDisease
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

      if (!questionOverride) setInput('');
      setMessages(prev => [...prev, { role: 'user', content: text }]);
      setLoading(true);

      try {
        const resp = await chatWithGemini(
          selectedDrug.drug_name,
          selectedDisease.disease_name,
          selectedDrug.drug_type ?? 'Unknown',
          selectedDrug.mechanism ?? 'Unknown',
          text,
        );
        // API returns `response` field; handle potential `answer` field too
        const answer =
          (resp as unknown as { answer?: string }).answer ??
          resp.response ??
          'No response received.';
        setMessages(prev => [...prev, { role: 'assistant', content: answer }]);
      } catch {
        setMessages(prev => [
          ...prev,
          {
            role: 'assistant',
            content:
              'Sorry, I encountered an error. Please try again or check your API connection.',
          },
        ]);
      } finally {
        setLoading(false);
      }
    },
    [input, loading, selectedDrug, selectedDisease],
  );

  const renderItem = useCallback(({ item }: { item: Message }) => (
    <MessageBubble message={item} />
  ), []);

  if (!selectedDrug || !selectedDisease) return null;

  return (
    <Modal
      visible={showChatbot}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={() => setShowChatbot(false)}
    >
      <KeyboardAvoidingView
        style={{ flex: 1, backgroundColor: '#FFFFFF' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <View
          style={{
            paddingTop: Platform.OS === 'ios' ? 20 : 16,
            paddingBottom: 12,
            paddingHorizontal: 16,
            borderBottomWidth: 1,
            borderBottomColor: BORDER,
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            backgroundColor: 'rgba(37,99,235,0.04)',
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
            <Sparkles size={18} color={ACCENT} />
            <View>
              <Text style={{ fontSize: 15, fontWeight: '600', color: '#111827' }}>
                AI Assistant
              </Text>
              <Text style={{ fontSize: 11, color: MUTED_FG }}>
                Ask me about {selectedDrug.drug_name} and {selectedDisease.disease_name}
              </Text>
            </View>
          </View>
          <Pressable
            onPress={() => setShowChatbot(false)}
            style={({ pressed }) => ({
              padding: 6,
              borderRadius: 6,
              backgroundColor: pressed ? '#F3F4F6' : 'transparent',
            })}
          >
            <X size={18} color={MUTED_FG} />
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
          ListHeaderComponent={loading ? <TypingIndicator /> : null}
        />

        {messages.length <= 1 && (
          <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: BORDER, backgroundColor: 'rgba(249,250,251,0.5)' }}>
            <Text style={{ fontSize: 11, fontWeight: '500', color: MUTED_FG, marginBottom: 6 }}>
              Suggested questions:
            </Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false}>
              <View style={{ flexDirection: 'row', gap: 6 }}>
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
                      borderColor: pressed ? ACCENT : BORDER,
                      backgroundColor: pressed ? 'rgba(37,99,235,0.05)' : '#FFFFFF',
                      opacity: loading ? 0.5 : 1,
                    })}
                  >
                    <Text style={{ fontSize: 11, color: '#374151' }}>{q}</Text>
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
            paddingBottom: Platform.OS === 'ios' ? 28 : 12,
            borderTopWidth: 1,
            borderTopColor: BORDER,
          }}
        >
          <View style={{ flexDirection: 'row', alignItems: 'flex-end', gap: 8 }}>
            <TextInput
              style={{
                flex: 1,
                borderWidth: 1,
                borderColor: BORDER,
                borderRadius: 10,
                paddingHorizontal: 12,
                paddingVertical: 8,
                fontSize: 13,
                color: '#111827',
                maxHeight: 80,
                minHeight: 40,
              }}
              placeholder="Ask a question about the drug or disease…"
              placeholderTextColor={MUTED_FG}
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
                    ? '#E5E7EB'
                    : pressed
                    ? 'rgba(37,99,235,0.85)'
                    : ACCENT,
                alignItems: 'center',
                justifyContent: 'center',
              })}
            >
              <Send size={16} color={!input.trim() || loading ? MUTED_FG : '#FFFFFF'} />
            </Pressable>
          </View>
          <Text style={{ fontSize: 10, color: MUTED_FG, marginTop: 6 }}>
            Focused on {selectedDrug.drug_name} and {selectedDisease.disease_name}
          </Text>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function MessageBubble({ message }: { message: Message }) {
  const isUser = message.role === 'user';
  return (
    <View
      style={{
        alignItems: isUser ? 'flex-end' : 'flex-start',
        marginBottom: 4,
      }}
    >
      <View
        style={{
          maxWidth: '82%',
          borderRadius: 12,
          paddingHorizontal: 14,
          paddingVertical: 10,
          backgroundColor: isUser ? ACCENT : '#F3F4F6',
        }}
      >
        <Text
          style={{
            fontSize: 13,
            lineHeight: 20,
            color: isUser ? '#FFFFFF' : '#111827',
          }}
        >
          {message.content}
        </Text>
      </View>
    </View>
  );
}

function TypingIndicator() {
  const dots = [0, 150, 300].map(delay => {
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
    const style = useAnimatedStyle(() => ({ transform: [{ translateY: y.value }] }));
    return style;
  });

  return (
    <View style={{ alignItems: 'flex-start', marginBottom: 4 }}>
      <View
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          gap: 5,
          backgroundColor: '#F3F4F6',
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
                backgroundColor: ACCENT,
              },
              style,
            ]}
          />
        ))}
      </View>
    </View>
  );
}
