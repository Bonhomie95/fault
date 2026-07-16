import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

/**
 * The juror id, kept where the platform keeps secrets.
 *
 * expo-secure-store has no web implementation, so the browser build (used for
 * previewing the 3D work) falls back to localStorage. That is not secure
 * storage and is not meant to be: on web this is a dev surface, and the id is
 * a save-file handle, not a credential.
 */
export const storage = {
  async get(key: string): Promise<string | null> {
    if (Platform.OS === 'web') {
      try {
        return globalThis.localStorage?.getItem(key) ?? null;
      } catch {
        return null;
      }
    }
    return SecureStore.getItemAsync(key);
  },

  async set(key: string, value: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.setItem(key, value);
      } catch {
        /* private mode — the juror will have to swear in again */
      }
      return;
    }
    return SecureStore.setItemAsync(key, value);
  },

  async remove(key: string): Promise<void> {
    if (Platform.OS === 'web') {
      try {
        globalThis.localStorage?.removeItem(key);
      } catch {
        /* nothing to remove */
      }
      return;
    }
    return SecureStore.deleteItemAsync(key);
  },
};
