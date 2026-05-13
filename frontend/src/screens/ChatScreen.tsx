// The headline screen. A scrolling thread of bubbles, a typing indicator
// when the agent is mid-thought, and a docked input at the bottom. When
// the conversation is empty we surface a small set of suggested prompts
// so the user always has a clear way in.
import { useEffect, useRef } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Text,
  View,
} from 'react-native';

import { ChatBubble } from '@/components/ChatBubble';
import { ChatInput } from '@/components/ChatInput';
import { ScreenContainer } from '@/components/ScreenContainer';
import { SuggestedPromptChips } from '@/components/SuggestedPromptChips';
import { TypingIndicator } from '@/components/TypingIndicator';
import { useChatStore, type ChatMessage } from '@/stores/useChatStore';
import { colors } from '@/theme/colors';
import { type } from '@/theme/typography';

export function ChatScreen() {
  const messages = useChatStore((s) => s.messages);
  const isTyping = useChatStore((s) => s.isTyping);
  const sendMessage = useChatStore((s) => s.sendMessage);

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Keep the latest message visible without yanking the user away from
  // scrollback when they're reading older history. This biases to the
  // common case: new messages while pinned to bottom.
  useEffect(() => {
    if (messages.length === 0 && !isTyping) return;
    const t = setTimeout(() => {
      listRef.current?.scrollToEnd({ animated: true });
    }, 60);
    return () => clearTimeout(t);
  }, [messages.length, isTyping]);

  const renderItem = ({ item }: { item: ChatMessage }) => (
    <ChatBubble message={item} />
  );

  return (
    <ScreenContainer background={colors.bg.primary}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            paddingHorizontal: 20,
            paddingTop: 6,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.bg.primary,
          }}
        >
          <Text style={[type.title, { color: colors.text.primary }]}>
            AI Host
          </Text>
          <Text style={[type.caption, { color: colors.text.secondary }]}>
            Tell me what you'd like to eat tonight.
          </Text>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          {messages.length === 0 ? (
            <View
              style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 12 }}
            >
              <View
                style={{
                  paddingHorizontal: 24,
                  paddingBottom: 16,
                  gap: 8,
                }}
              >
                <Text style={[type.heading, { color: colors.text.primary }]}>
                  How can I help?
                </Text>
                <Text style={[type.caption, { color: colors.text.secondary }]}>
                  Ask about dishes, build a cart, or just see what's good
                  tonight.
                </Text>
              </View>
              <SuggestedPromptChips onSelect={sendMessage} />
            </View>
          ) : (
            <FlatList
              ref={listRef}
              data={messages}
              keyExtractor={(m) => m.id}
              renderItem={renderItem}
              contentContainerStyle={{ paddingVertical: 12, gap: 4 }}
              ListFooterComponent={
                isTyping ? (
                  <View style={{ paddingHorizontal: 18, paddingTop: 6 }}>
                    <TypingIndicator />
                  </View>
                ) : null
              }
              onContentSizeChange={() =>
                listRef.current?.scrollToEnd({ animated: true })
              }
              testID="chat-list"
            />
          )}

          <ChatInput onSend={sendMessage} disabled={isTyping} />
        </KeyboardAvoidingView>
      </View>
    </ScreenContainer>
  );
}
