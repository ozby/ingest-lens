import React, { createContext, useContext, useEffect, useState } from "react";
import { IUser } from "@repo/types";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";

interface AuthContextType {
  user: IUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string, email: string) => Promise<void>;
  logout: () => void;
}

type AuthProviderProps = {
  children: React.ReactNode;
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  isLoading: true,
  isAuthenticated: false,
  login: async () => {},
  register: async () => {},
  logout: () => {},
});

export function useAuth(): AuthContextType {
  return useContext(AuthContext);
}

type ApiService = (typeof import("../services/api"))["default"];

let cachedApiService: ApiService | null = null;

async function loadApiService(): Promise<ApiService> {
  if (cachedApiService) {
    return cachedApiService;
  }

  const { default: apiService } = await import("../services/api");
  cachedApiService = apiService;
  return apiService;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<IUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    const initAuth = async () => {
      const token = localStorage.getItem("authToken");
      if (token) {
        try {
          const apiService = await loadApiService();
          const user = await apiService.getCurrentUser();
          setUser(user);
        } catch (error) {
          console.error("Failed to fetch user", error);
          const apiService = await loadApiService();
          apiService.clearToken();
        }
      }
      setIsLoading(false);
    };

    initAuth();
  }, []);

  const login = async (username: string, password: string) => {
    try {
      setIsLoading(true);
      const apiService = await loadApiService();
      const { user } = await apiService.login({ username, password });
      setUser(user);
      toast.success("Login successful");
      navigate("/dashboard");
    } catch (error) {
      console.error("Login failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (username: string, password: string, email: string) => {
    try {
      setIsLoading(true);
      const apiService = await loadApiService();
      const { user } = await apiService.register({ username, password, email });
      setUser(user);
      toast.success("Registration successful");
      navigate("/dashboard");
    } catch (error) {
      console.error("Registration failed", error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  };

  const logout = () => {
    cachedApiService?.clearToken();
    setUser(null);
    navigate("/");
    toast.success("Logged out successfully");
    localStorage.removeItem("authToken");
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        isLoading,
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
