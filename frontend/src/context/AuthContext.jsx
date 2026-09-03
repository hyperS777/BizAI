import { createContext, useContext, useEffect, useState } from 'react';
import client from '../api/client';

export const AuthContext = createContext();

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  const fetchUser = async () => {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return null;
    }
    try {
      const response = await client.get('/auth/me');
      setUser(response.data);
      return response.data;
    } catch {
      localStorage.removeItem('token');
      setUser(null);
      return null;
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUser();
  }, []);

  const login = async (email, password) => {
    const formData = new URLSearchParams();
    formData.append('username', email);
    formData.append('password', password);
    const response = await client.post('/auth/login', formData, {
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
    localStorage.setItem('token', response.data.access_token);
    const authenticatedUser = await fetchUser();
    if (!authenticatedUser) {
      throw new Error('The API could not verify the signed-in user.');
    }
  };

  const logout = () => {
    localStorage.removeItem('token');
    setUser(null);
  };

  const role = user?.role?.name?.toLowerCase() || '';
  const can = (roles) => roles.includes(role);

  return (
    <AuthContext.Provider value={{ user, login, logout, loading, role, can }}>
      {children}
    </AuthContext.Provider>
  );
}
