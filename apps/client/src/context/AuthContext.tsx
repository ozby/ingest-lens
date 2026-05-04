import React, { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { signIn, signUp, signOut, useSession } from "@webpresso/webpresso/auth/react";

export type AuthUser = {
  id: string;
  name: string;
  email: string;
};

interface AuthContextType {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string, name: string) => Promise<void>;
  logout: () => Promise<void>;
}

type AuthProviderProps = {
  children: React.ReactNode;
};

const AuthContext = React.createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: async () => {},
});

export function useAuth(): AuthContextType {
  return React.useContext(AuthContext);
}

export function AuthProvider({ children }: AuthProviderProps) {
  const navigate = useNavigate();
  const session = useSession();

  const user: AuthUser | null = session.data
    ? { id: session.data.user.id, name: session.data.user.name, email: session.data.user.email }
    : null;

  const login = async (email: string, password: string) => {
    const result = await signIn({ email, password });
    if (result.error) {
      throw new Error(result.error);
    }
    toast.success("Login successful");
    navigate("/dashboard");
  };

  const register = async (email: string, password: string, name: string) => {
    const result = await signUp({ email, password, name });
    if (result.error) {
      throw new Error(result.error);
    }
    toast.success("Registration successful");
    navigate("/dashboard");
  };

  const logout = async () => {
    await signOut();
    toast.success("Logged out successfully");
    navigate("/");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading: session.isPending,
        isAuthenticated: !!user,
        login,
        register,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// Protected route component
export function RequireAuth({ children }: AuthProviderProps) {
  const { isAuthenticated, isLoading } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      navigate("/");
    }
  }, [isAuthenticated, isLoading, navigate]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="animate-pulse-soft text-lg">Loading...</div>
      </div>
    );
  }

  return isAuthenticated ? <>{children}</> : null;
}
