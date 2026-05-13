// Single entry-point for kicking off OAuth flows. Lives behind an
// indirection so unit tests can swap the redirect with a spy without
// having to mock window or expo-linking globally.
import { Linking, Platform } from 'react-native';

import { getApiBaseUrl } from './env';

export function openGoogleOAuth(): void {
  const url = `${getApiBaseUrl()}/auth/google`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  Linking.openURL(url);
}
