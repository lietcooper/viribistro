// Called once at the App root. Tries to refresh the access token via
// the httpOnly cookie the backend may have already set in a previous
// session. Returns a `ready` flag so the navigator can hold its render
// behind a splash until the answer comes back.
//
// `useAuthStore.bootstrap()` already updates the store; this hook only
// keeps a local "we've finished trying" flag.
import { useEffect, useState } from 'react';

import { useAuthStore } from '@/stores/useAuthStore';

export function useBootstrapAuth(): { ready: boolean } {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await useAuthStore.getState().bootstrap();
      } catch {
        // bootstrap swallows its own errors already — defensive only.
      } finally {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return { ready };
}
