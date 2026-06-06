import React from "react";
import { createAuthClient } from "better-auth/react";

type AuthSession = {
  data: {
    user: {
      id: string;
      name: string;
      email: string;
    };
  } | null;
  isPending: boolean;
};

const authClient = createAuthClient({ basePath: "/auth" });

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) =>
  React.createElement(React.Fragment, null, children);

export function useSession(): AuthSession {
  const raw = authClient.useSession();

  if (raw.isPending) {
    return { data: null, isPending: true };
  }

  if (!raw.data) {
    return { data: null, isPending: false };
  }

  return {
    data: {
      user: {
        id: raw.data.user.id,
        name: raw.data.user.name,
        email: raw.data.user.email,
      },
    },
    isPending: false,
  };
}

export async function signIn(credentials: {
  email: string;
  password: string;
}): Promise<{ error?: string }> {
  const result = await authClient.signIn.email(credentials);
  if (result.error) {
    return { error: result.error.message ?? "Sign in failed" };
  }
  return {};
}

export async function signUp(credentials: {
  email: string;
  password: string;
  name: string;
}): Promise<{ error?: string }> {
  const result = await authClient.signUp.email(credentials);
  if (result.error) {
    return { error: result.error.message ?? "Sign up failed" };
  }
  return {};
}

export async function signOut(): Promise<void> {
  await authClient.signOut();
}
