import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { fetchAppSettings } from "@/lib/backend";
import type { AppSettings } from "@/lib/types";

type SettingsContextValue = {
  settings: AppSettings | null;
  loading: boolean;
  apiOnline: boolean;
  apiNeedsRestart: boolean;
  refresh: () => Promise<void>;
  flash: string | null;
  flashError: boolean;
  setFlash: (message: string | null, isError?: boolean) => void;
};

const SettingsContext = createContext<SettingsContextValue | null>(null);

export function SettingsProvider({ children }: { children: ReactNode }) {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [apiOnline, setApiOnline] = useState(false);
  const [apiNeedsRestart, setApiNeedsRestart] = useState(false);
  const [loading, setLoading] = useState(true);
  const [flash, setFlashState] = useState<string | null>(null);
  const [flashError, setFlashError] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await fetchAppSettings();
    setApiOnline(result.ok || result.needsRestart);
    setApiNeedsRestart(result.needsRestart);
    setSettings(result.settings);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const setFlash = useCallback((message: string | null, isError = false) => {
    setFlashState(message);
    setFlashError(isError);
  }, []);

  const value = useMemo(
    () => ({
      settings,
      loading,
      apiOnline,
      apiNeedsRestart,
      refresh,
      flash,
      flashError,
      setFlash,
    }),
    [settings, loading, apiOnline, apiNeedsRestart, refresh, flash, flashError, setFlash],
  );

  return <SettingsContext.Provider value={value}>{children}</SettingsContext.Provider>;
}

export function useAppSettings() {
  const ctx = useContext(SettingsContext);
  if (!ctx) {
    throw new Error("useAppSettings must be used inside SettingsProvider");
  }
  return ctx;
}
