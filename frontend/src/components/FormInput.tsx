// A labelled text input that handles focused / error styling. Used in
// both auth screens — Login and Signup — so the visual language is
// identical across the auth flow.
import { useState } from 'react';
import { Text, TextInput, View, type TextInputProps } from 'react-native';

import { colors } from '@/theme/colors';

interface FormInputProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | null;
  testID?: string;
}

export function FormInput({ label, error, testID, ...rest }: FormInputProps) {
  const [focused, setFocused] = useState(false);

  const borderColor = error ? colors.error : focused ? colors.brand.primary : colors.border;

  return (
    <View className="w-full">
      <Text
        style={{
          fontFamily: 'DMSans-Medium',
          fontSize: 14,
          lineHeight: 20,
          color: colors.text.secondary,
          marginBottom: 6,
        }}
      >
        {label}
      </Text>
      <TextInput
        testID={testID}
        placeholderTextColor={colors.text.tertiary}
        onFocus={(e) => {
          setFocused(true);
          rest.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocused(false);
          rest.onBlur?.(e);
        }}
        style={{
          backgroundColor: colors.bg.secondary,
          borderWidth: 1,
          borderColor,
          borderRadius: 12,
          paddingHorizontal: 16,
          paddingVertical: 14,
          fontFamily: 'DMSans-Regular',
          fontSize: 16,
          color: colors.text.primary,
        }}
        {...rest}
      />
      {error ? (
        <Text
          style={{
            fontFamily: 'DMSans-Regular',
            fontSize: 12,
            lineHeight: 18,
            color: colors.error,
            marginTop: 6,
          }}
        >
          {error}
        </Text>
      ) : null}
    </View>
  );
}
