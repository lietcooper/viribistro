// The fixed-bottom input bar for the chat screen. The send button
// disables itself when the field is empty or while the agent is typing.
import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable, TextInput, View } from 'react-native';

import { colors } from '@/theme/colors';

interface ChatInputProps {
  disabled?: boolean;
  onSend: (text: string) => void;
}

export function ChatInput({ disabled, onSend }: ChatInputProps) {
  const [text, setText] = useState('');

  const canSend = !disabled && text.trim().length > 0;

  const submit = () => {
    if (!canSend) return;
    onSend(text);
    setText('');
  };

  return (
    <View
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        paddingHorizontal: 12,
        paddingTop: 10,
        paddingBottom: 14,
        backgroundColor: colors.bg.elevated,
        borderTopWidth: 1,
        borderTopColor: colors.border,
      }}
    >
      <View
        style={{
          flex: 1,
          backgroundColor: colors.bg.secondary,
          borderRadius: 24,
          paddingHorizontal: 16,
          paddingVertical: 4,
        }}
      >
        <TextInput
          testID="chat-input"
          value={text}
          onChangeText={setText}
          onSubmitEditing={submit}
          editable={!disabled}
          placeholder="Ask me anything…"
          placeholderTextColor={colors.text.tertiary}
          returnKeyType="send"
          blurOnSubmit={false}
          multiline
          style={{
            fontFamily: 'DMSans-Regular',
            fontSize: 15,
            color: colors.text.primary,
            paddingVertical: 8,
            maxHeight: 96,
          }}
        />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Send"
        testID="chat-send"
        onPress={submit}
        disabled={!canSend}
        style={{
          width: 40,
          height: 40,
          borderRadius: 999,
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: canSend ? colors.brand.primary : colors.bg.secondary,
          opacity: canSend ? 1 : 0.6,
        }}
      >
        <Ionicons
          name="arrow-up"
          size={20}
          color={canSend ? colors.text.inverse : colors.text.tertiary}
        />
      </Pressable>
    </View>
  );
}
