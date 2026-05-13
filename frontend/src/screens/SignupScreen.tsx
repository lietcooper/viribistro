// Mirrors LoginScreen with an extra "Name" field. The submit handler
// posts to /auth/register via useAuthStore.register; success populates
// the store and RootNavigator swaps to MainTabs.
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

type Props = NativeStackScreenProps<AuthStackParamList, 'Signup'>;

export function SignupScreen({ navigation }: Props) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [googleRedirecting, setGoogleRedirecting] = useState(false);

  const register = useAuthStore((s) => s.register);

  const handleGoogleSignIn = () => {
    setGoogleRedirecting(true);
    setError(null);
    openGoogleOAuth();
  };

  const submit = async () => {
    setError(null);
    if (!name || !email || !password) {
      setError('Name, email and password are all required');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setSubmitting(true);
    try {
      await register(email.trim(), password, name.trim());
    } catch (err) {
      const apiMessage = (err as { response?: { data?: { message?: string } } })
        ?.response?.data?.message;
      setError(apiMessage ?? 'Could not create your account');
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
            <Text style={[type.hero, { color: colors.brand.primary }]}>
              Welcome
            </Text>
            <Text
              style={[type.caption, { color: colors.text.secondary, marginTop: 4 }]}
            >
              Create an account to start ordering with the AI host.
            </Text>
          </View>

          <View style={{ gap: 16 }}>
            <FormInput
              label="Name"
              value={name}
              onChangeText={setName}
              autoCapitalize="words"
              placeholder="Alex Tomlinson"
              testID="signup-name"
            />
            <FormInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              autoCapitalize="none"
              autoComplete="email"
              keyboardType="email-address"
              placeholder="you@example.com"
              testID="signup-email"
            />
            <FormInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoComplete="password-new"
              placeholder="At least 8 characters"
              testID="signup-password"
              error={error}
            />
          </View>

          <View style={{ marginTop: 24, gap: 12 }}>
            <PrimaryButton
              label="Create account"
              onPress={submit}
              loading={submitting}
              fullWidth
              testID="signup-submit"
            />
            <GoogleButton
              onPress={handleGoogleSignIn}
              loading={googleRedirecting}
              testID="signup-google"
            />
          </View>

          <Pressable
            onPress={() => navigation.navigate('Login')}
            style={{ marginTop: 28, alignItems: 'center' }}
            testID="signup-go-login"
          >
            <Text style={[type.label, { color: colors.text.secondary }]}>
              Already have an account?{' '}
              <Text style={{ color: colors.brand.primary }}>Sign in</Text>
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenContainer>
  );
}
