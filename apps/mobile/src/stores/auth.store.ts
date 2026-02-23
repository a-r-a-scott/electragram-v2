import { create } from "zustand";
import * as SecureStore from "expo-secure-store";

import type { User, Account, AuthTokens } from "@electragram/types";

const API_URL = process.env["EXPO_PUBLIC_API_URL"] ?? "https://api.electragram.com";
const TOKEN_KEY = "electragram_tokens";

interface AuthState {
  user: User | null;
  account: Account | null;
  tokens: AuthTokens | null;
  isInitialized: boolean;
  initialize: () => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>()((set, get) => ({
  user: null,
  account: null,
  tokens: null,
  isInitialized: false,

  initialize: async () => {
    try {
      const stored = await SecureStore.getItemAsync(TOKEN_KEY);
      if (stored) {
        const tokens = JSON.parse(stored) as AuthTokens;
        set({ tokens, isInitialized: true });
      } else {
        set({ isInitialized: true });
      }
    } catch {
      set({ isInitialized: true });
    }
  },

  signIn: async (email, password) => {
    const res = await fetch(`${API_URL}/auth/signin`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });

    if (!res.ok) {
      const err = (await res.json()) as { error: { message: string } };
      throw new Error(err.error.message);
    }

    const { data } = (await res.json()) as {
      data: { user: User; account: Account; tokens: AuthTokens };
    };

    await SecureStore.setItemAsync(TOKEN_KEY, JSON.stringify(data.tokens));
    set({ user: data.user, account: data.account, tokens: data.tokens });
  },

  signOut: async () => {
    const tokens = get().tokens;
    if (tokens) {
      await fetch(`${API_URL}/auth/signout`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken: tokens.refreshToken }),
      }).catch(() => undefined);
    }
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    set({ user: null, account: null, tokens: null });
  },
}));
