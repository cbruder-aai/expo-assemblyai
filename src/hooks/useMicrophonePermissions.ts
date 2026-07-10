import { useCallback, useEffect, useState } from 'react';

import { sharedAudioSession, type AudioSession } from '../audio/AudioSession';
import type { PermissionResponse } from '../ExpoAssemblyAIModule.types';

/**
 * Microphone permission hook, shaped like Expo's own permission hooks.
 *
 * ```tsx
 * const [permission, requestPermission] = useMicrophonePermissions();
 * if (!permission?.granted) return <Button title="Allow mic" onPress={requestPermission} />;
 * ```
 */
export function useMicrophonePermissions(
  session: AudioSession = sharedAudioSession
): [PermissionResponse | null, () => Promise<PermissionResponse>] {
  const [permission, setPermission] = useState<PermissionResponse | null>(null);

  useEffect(() => {
    try {
      setPermission(session.getPermissions());
    } catch {
      setPermission(null);
    }
  }, [session]);

  const request = useCallback(async () => {
    const result = await session.requestPermissions();
    setPermission(result);
    return result;
  }, [session]);

  return [permission, request];
}
