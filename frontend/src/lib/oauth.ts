// Single entry-point for kicking off OAuth flows. Lives behind an
// indirection so unit tests can swap the redirect with a spy without
// having to mock window or expo-linking globally.
//
// On web the redirect navigates the whole tab away — `openGoogleOAuth`
// never resolves to the caller. Callers should set a transient
// "redirecting" UI flag synchronously before invoking and rely on the
// page transition to unmount the form.
import { Linking, Platform } from 'react-native';

import { useToastStore } from '@/stores/useToastStore';
import { getApiBaseUrl } from './env';

export function openGoogleOAuth(): void {
  const url = `${getApiBaseUrl()}/auth/google`;
  if (Platform.OS === 'web' && typeof window !== 'undefined') {
    window.location.assign(url);
    return;
  }
  Linking.openURL(url).catch((err) => {
    // Surface the failure rather than silently no-op.
    console.warn('[oauth] Linking.openURL failed:', err);
    useToastStore
      .getState()
      .show("Couldn't open Google sign-in — please try again.", 'error');
  });
}

// Called once on app boot. If the user just returned from an OAuth
// redirect carrying an error param (e.g. ?oauth_error=denied), surface
// it as a toast and strip the param from the URL so a reload doesn't
// resurface the same message.
export function consumeOAuthRedirectStatus(): void {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return;
  try {
    const url = new URL(window.location.href);
    const error = url.searchParams.get('oauth_error');
    if (!error) return;

    useToastStore.getState().show(decodeURIComponent(error), 'error');
    url.searchParams.delete('oauth_error');
    window.history.replaceState({}, '', url.toString());
  } catch (err) {
    console.warn('[oauth] failed to read redirect status:', err);
  }
}
