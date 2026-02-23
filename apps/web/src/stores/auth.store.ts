import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { User, Account, AuthTokens } from "@electragram/types";

interface AuthState {
  user: User | null;
  account: Account | null;
  tokens: AuthTokens | null;
  signIn: (email: string, password: string) => Promise<void>;
  signOut: () => Promise<void>;
  setAuth: (user: User, account: Account, tokens: AuthTokens) => void;
}

const API_URL = process.env["NEXT_PUBLIC_API_URL"] ?? "/api";

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      account: null,
      tokens: null,

      signIn: async (email, password) => {
        const res = await fetch(`${API_URL}/auth/signin`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        });
        if (!res.ok) {
          const err = await res.json() as { error: { message: string } };
          throw new Error(err.error.message);
        }
        const { data } = await res.json() as { data: { user: User; account: Account; tokens: AuthTokens } };
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
        set({ user: null, account: null, tokens: null });
      },

      setAuth: (user, account, tokens) => set({ user, account, tokens }),
    }),
    { name: "electragram-auth", partialize: (state) => ({ tokens: state.tokens }) }
  )
);
