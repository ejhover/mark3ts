import React, { createContext, useState, useContext, useEffect } from 'react';
import { appClient } from '@/api/appClient';

const AuthContext = createContext();

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoadingAuth, setIsLoadingAuth] = useState(true);
  const [isLoadingPublicSettings, setIsLoadingPublicSettings] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [appPublicSettings, setAppPublicSettings] = useState(null);

  useEffect(() => {
    checkAppState();
  }, []);

  const checkAppState = async () => {
    try {
      setIsLoadingPublicSettings(true);
      setAuthError(null);
      // Standalone mode: no backend, use local auth stub
      setAppPublicSettings({ id: 'local', public_settings: {} });
      const currentUser = await appClient.auth.me();
      setUser(currentUser);
      setIsAuthenticated(true);
    } catch (error) {
      console.error('Auth check failed:', error);
      setAuthError({ type: 'unknown', message: error.message || 'Auth failed' });
    } finally {
      setIsLoadingAuth(false);
      setIsLoadingPublicSettings(false);
    }
  };

  const logout = (shouldRedirect = true) => {
    setUser(null);
    setIsAuthenticated(false);
    if (shouldRedirect) {
      appClient.auth.logout(window.location.href);
    } else {
      appClient.auth.logout();
    }
  };

  const navigateToLogin = () => {
    appClient.auth.redirectToLogin(window.location.href);
  };

  return (
    <AuthContext.Provider value={{
      user,
      isAuthenticated,
      isLoadingAuth,
      isLoadingPublicSettings,
      authError,
      appPublicSettings,
      logout,
      navigateToLogin,
      checkAppState
    }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
