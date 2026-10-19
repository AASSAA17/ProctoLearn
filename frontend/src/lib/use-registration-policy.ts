'use client';

import { useCallback, useEffect, useState } from 'react';
import { API_URL } from './api';

export type RegistrationPolicy = { registrationOpen: boolean; invitationRequired: boolean };

export function useRegistrationPolicy() {
  const [policy, setPolicy] = useState<RegistrationPolicy | null>(null);
  const [error, setError] = useState(false);
  const [revision, setRevision] = useState(0);
  const retry = useCallback(() => { setPolicy(null); setError(false); setRevision(n => n + 1); }, []);
  useEffect(() => {
    const controller = new AbortController();
    fetch(`${API_URL}/auth/registration-policy`, { cache: 'no-store', signal: controller.signal })
      .then(async response => { if (!response.ok) throw new Error('Policy unavailable'); return response.json(); })
      .then((value: RegistrationPolicy) => {
        if (typeof value.invitationRequired !== 'boolean' || value.registrationOpen !== !value.invitationRequired) throw new Error('Invalid policy');
        if (!controller.signal.aborted) { setPolicy(value); setError(false); }
      })
      .catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [revision]);
  return { policy, error, retry };
}
