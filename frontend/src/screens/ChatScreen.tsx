// The headline screen. A scrolling thread of bubbles, a typing indicator
// when the agent is mid-thought, and a docked input at the bottom. When
// the conversation is empty we surface a small set of suggested prompts
// so the user always has a clear way in.
import { useRef } from 'react';
import { Ionicons } from '@expo/vector-icons';
import {
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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
  const clearHistory = useChatStore((s) => s.clearHistory);

  const onNewChat = () => {
    const message = 'Start a new chat? Your cart will not be affected.';
    const proceed = () => {
      void clearHistory();
    };
    if (Platform.OS === 'web') {
      const g = globalThis as { confirm?: (m: string) => boolean };
      const ok = typeof g.confirm === 'function' ? g.confirm(message) : true;
      if (ok) proceed();
      return;
    }
    Alert.alert('New chat', message, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'New chat', style: 'destructive', onPress: proceed },
    ]);
  };

  const listRef = useRef<FlatList<ChatMessage>>(null);

  // Note: we used to also scrollToEnd from a useEffect on messages.length /
  // isTyping with a 60ms timeout. That raced with the FlatList's
  // onContentSizeChange below and caused jank on slower devices. The
  // onContentSizeChange path fires after layout, which is what we want.

  const renderItem = ({ item }: { item: ChatMessage }) => <ChatBubble message={item} />;

  // Only the most recent assistant message's suggestions are live. Older
  // ones are still in the store for history fidelity but render no chips,
  // so the user always sees one "what next" strip — never a stale one.
  const latestAssistant = [...messages].reverse().find((m) => m.role === 'assistant');
  const followups =
    !isTyping && latestAssistant?.suggestedReplies
      ? latestAssistant.suggestedReplies.filter((s) => s.trim().length > 0)
      : [];

  return (
    <ScreenContainer background={colors.bg.primary}>
      <View style={{ flex: 1 }}>
        <View
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20,
            paddingTop: 6,
            paddingBottom: 8,
            borderBottomWidth: 1,
            borderBottomColor: colors.border,
            backgroundColor: colors.bg.primary,
          }}
        >
          <View style={{ flex: 1, paddingRight: 12 }}>
            <Text style={[type.title, { color: colors.text.primary }]}>AI Host</Text>
            <Text style={[type.caption, { color: colors.text.secondary }]}>
              Tell me what you'd like to eat tonight.
            </Text>
          </View>
          <Pressable
            onPress={onNewChat}
            accessibilityRole="button"
            accessibilityLabel="Start a new chat"
            testID="chat-new"
            hitSlop={8}
            style={({ pressed }) => ({
              flexDirection: 'row',
              alignItems: 'center',
              gap: 4,
              paddingHorizontal: 10,
              paddingVertical: 6,
              borderRadius: 999,
              borderWidth: 1,
              borderColor: colors.border,
              backgroundColor: colors.bg.elevated,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Ionicons name="refresh-outline" size={14} color={colors.text.secondary} />
            <Text
              style={{
                fontFamily: 'DMSans-Medium',
                fontSize: 12,
                color: colors.text.secondary,
              }}
            >
              New chat
            </Text>
          </Pressable>
        </View>

        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          keyboardVerticalOffset={Platform.OS === 'ios' ? 60 : 0}
        >
          {messages.length === 0 ? (
            <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: 12 }}>
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
                  Ask about dishes, build a cart, or just see what's good tonight.
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
              onContentSizeChange={() => listRef.current?.scrollToEnd({ animated: true })}
              testID="chat-list"
            />
          )}

          {followups.length > 0 ? (
            <View style={{ paddingBottom: 8 }} testID="chat-followups">
              <SuggestedPromptChips onSelect={sendMessage} prompts={followups} />
            </View>
          ) : null}

          <ChatInput onSend={sendMessage} disabled={isTyping} />
        </KeyboardAvoidingView>
      </View>
    </ScreenContainer>
  );
}
