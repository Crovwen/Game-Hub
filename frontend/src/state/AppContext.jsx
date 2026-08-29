import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { api, setAuthToken } from '../services/api';
import { getInitData, initTelegramWebApp } from '../telegram/webApp';
import { MatchSocket } from '../services/ws';

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const [user, setUser] = useState(null);
  const [status, setStatus] = useState('loading'); // loading | ready | error
  const [error, setError] = useState(null);
  const [socket, setSocket] = useState(null);

  const refreshUser = useCallback(async () => {
    const me = await api.me();
    setUser(me);
    return me;
  }, []);

  useEffect(() => {
    initTelegramWebApp();

    async function boot() {
      try {
        const initData = getInitData();
        if (!initData) {
          // Not running inside Telegram (e.g. plain browser during dev).
          setStatus('error');
          setError('این برنامه باید از داخل تلگرام باز شود.');
          return;
        }
        const { token, user: loggedInUser } = await api.loginWithTelegram(initData);
        setAuthToken(token);
        setUser(loggedInUser);

        const s = new MatchSocket(token);
        s.connect();
        setSocket(s);

        setStatus('ready');
      } catch (err) {
        setStatus('error');
        setError(err.message);
      }
    }

    boot();
  }, []);

  return (
    <AppContext.Provider value={{ user, setUser, status, error, refreshUser, socket }}>
      {children}
    </AppContext.Provider>
  );
}

export function useApp() {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used within AppProvider');
  return ctx;
}
