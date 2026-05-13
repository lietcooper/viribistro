// LoginScreen — first impression. Bistro aesthetic: a generous serif
// wordmark up top, then a tight form column with an unmistakable primary
// CTA. Google OAuth is offered as a secondary option, and the bottom of
// the column carries the "create an account" link.
import { useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  Text,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';

import { FormInput } from '@/components/FormInput';
import { GoogleButton } from '@/components/GoogleButton';
import { PrimaryButton } from '@/components/PrimaryButton';
import { ScreenContainer } from '@/components/ScreenContainer';
import { openGoogleOAuth } from '@/lib/oauth';
import { useAuthStore } from '@/stores/useAuthStore';
import { colors } from '@/theme/colors';
import { type } from '@/theme/typography';
import type { AuthStackParamList } from '@/navigation/AuthStack';

type Props = NativeStackScreenProps<AuthStackParamList, 'Login'>;

export function LoginScreen({ navigation }: Props) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);

  const login = useAuthStore((s) => s.login);

  const handleGoogleSignIn = async () => {
    setGoogleRedirecting(true);
    setError(null);
    try {
      await openGoogleOAuth();
      // On web the page is already navigating away — this line is only
      // reached on native after the system browser opens successfully.
      // The "redirecting" UI stays until the user returns and the OAuth
      // callback redirects them back into the app via deep-link.
    } catch {
      // openGoogleOAuth already surfaced a toast; clear the in-flight
      // flag so the button isn't permanently stuck in its loading state.
      setGoogleRedirecting(false);
    }
  };

  const submit = async () => {
    setError(null);
    if (!email || !password) {
      setError('Email and password are required');
      return;
    }
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      // RootNavigator swaps to MainTabs on token presence — no nav call
      // needed here.
    } catch (err) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })?.response
        ?.data?.message;
      setError(apiMessage ?? 'Invalid email or password');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ScreenContainer>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <ScrollView
          contentContainerStyle={{
            flexGrow: 1,
            justifyContent: 'center',
            paddingHorizontal: 20,
            paddingVertical: 32,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <View style={{ marginBottom: 36, alignItems: 'flex-start' }}>
            <Text style={[type.hero, { color: colors.brand.primary }]}>Bistro</Text>
            <Text style={[type.caption, { color: colors.text.secondary, marginTop: 4 }]}>
              Conversational ordering, beautifully served.
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            <FormInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              testID="login-email"
            />
            <FormInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password"
              placeholder="••••••••"
              testID="login-password"
              error={error}
            />
          </View>

          <View style={{ marginTop: 24, gap: 12 }}>
            <PrimaryButton
              label="Sign in"
              onPress={submit}
              loading={submitting}
              fullWidth
              testID="login-submit"
            />
            <GoogleButton
              onPress={handleGoogleSignIn}
              loading={googleRedirecting}
              testID="login-google"
            />
          </View>

          <Pressable
            onPress={() => navigation.navigate('Signup')}
            style={{ marginTop: 28, alignItems: 'center' }}
            testID="login-go-signup"
          >
            <Text style={[type.label, { color: colors.text.secondary }]}>
              Don't have an account?{' '}
              <Text style={{ color: colors.brand.primary }}>Sign up</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
