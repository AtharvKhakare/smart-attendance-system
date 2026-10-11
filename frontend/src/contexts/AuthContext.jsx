import { createContext, useContext, useMemo, useState } from 'react';
import { api, setAccessToken } from '../services/api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [token, setToken] = useState(null);
  const [busy, setBusy] = useState(false);

  async function login(email, password) {
    setBusy(true);
    try {
      const { data } = await api.post('/auth/login', { email, password });
      setAccessToken(data.access_token);
      setToken(data.access_token);
      setUser(data.user);
      return data.user;
    } finally {
      setBusy(false);
    }
  }

  async function logout() {
    try {
      if (token) await api.post('/auth/logout');
    } catch {
      // Clear the in-memory session even if the API is temporarily unreachable.
    } finally {
      setAccessToken(null);
      setToken(null);
      setUser(null);
    }
  }

  const value = useMemo(() => ({ user, token, busy, login, logout }), [user, token, busy]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}
