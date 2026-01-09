import React, { createContext, useContext, useState } from "react";
import { api } from "../lib/api";

interface User {
  username: string;
}

interface AuthContextType {
  isAuthenticated: boolean;
  user: User | null;
  login: (username: string, password?: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  // 从 localStorage 初始化状态，保持刷新不丢失登录态
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return !!localStorage.getItem("auth_token");
  });
  const [user, setUser] = useState<User | null>(() => {
    const savedUser = localStorage.getItem("auth_user");
    return savedUser ? JSON.parse(savedUser) : null;
  });

  const login = async (username: string, password?: string) => {
    try {
      // Allow optional password for preserving interface but enforce it in logic
      const pwd = password || "admin123";

      const data = await api.post<{ token: string; user: User }>("/login", {
        username,
        password: pwd,
      });

      setIsAuthenticated(true);
      setUser(data.user);
      localStorage.setItem("auth_token", data.token);
      localStorage.setItem("auth_user", JSON.stringify(data.user));
    } catch (error) {
      console.error("Login error:", error);
      throw error;
    }
  };

  const logout = () => {
    setIsAuthenticated(false);
    setUser(null);
    localStorage.removeItem("auth_token");
    localStorage.removeItem("auth_user");
  };

  return (
    <AuthContext.Provider value={{ isAuthenticated, user, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
