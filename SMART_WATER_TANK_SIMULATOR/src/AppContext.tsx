// ============================================================================
// SMART WATER TANK SIMULATOR — APP CONTEXT & SHARED ARCHITECTURE (1.3)
// Single Source of Truth for Settings, Global Step Size h, Solvers Cache, and Toast
// ============================================================================

import React, { createContext, useContext, useState, useEffect, useMemo, useCallback } from 'react';
import {
  SectionId,
  SystemSettings,
  ODEModelParams,
  ODEResult,
  RootFindingParams,
  RootFindingResult,
  LinearSystemResult,
} from './types';
import {
  DEFAULT_SETTINGS,
  DEFAULT_MATRIX,
  solveEuler,
  solveModifiedEuler,
  solveRK4,
  solveBisection,
  solveFalsePosition,
  solveNewtonRaphson,
  solveGaussianElimination,
  solveGaussJordan,
} from './solvers';

interface AppContextType {
  // Theme & Navigation
  theme: 'light' | 'dark';
  setTheme: (t: 'light' | 'dark') => void;
  toggleTheme: () => void;
  activeSection: SectionId;
  setActiveSection: (s: SectionId) => void;
  isSoundMuted: boolean;
  setIsSoundMuted: (m: boolean) => void;

  // Single Source of Truth: Settings
  settings: SystemSettings;
  updateSettings: (newSettings: Partial<SystemSettings>) => void;
  saveSettings: () => void;
  discardSettings: () => void;
  resetSettingsToFactory: () => void;
  isSettingsDirty: boolean;
  pendingSettings: SystemSettings;
  setPendingSettings: React.Dispatch<React.SetStateAction<SystemSettings>>;

  // Single Global Step Size h
  globalStepSize: number;
  setGlobalStepSize: (h: number) => void;

  // Shared ODE Solvers Cache (Euler, Heun, RK4, Reference)
  odeResults: {
    euler: ODEResult;
    heun: ODEResult;
    rk4: ODEResult;
  };

  // Shared 3x3 Hydraulic Linear System State
  manifoldParams: {
    totalOutflow: number;
    diffPipeAB: number;
    ratioBC: number;
  };
  setManifoldParams: (p: { totalOutflow: number; diffPipeAB: number; ratioBC: number }) => void;
  linearSystemResults: {
    gaussian: LinearSystemResult;
    gaussJordan: LinearSystemResult;
  };

  // Toast Notifications
  toast: string | null;
  showToast: (msg: string) => void;
}

const AppContext = createContext<AppContextType | null>(null);

const SETTINGS_STORAGE_KEY = 'tank_dashboard_settings_v2';
const THEME_STORAGE_KEY = 'tank_dashboard_theme';

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  // 1. Theme State
  const [theme, setThemeState] = useState<'light' | 'dark'>(() => {
    const saved = localStorage.getItem(THEME_STORAGE_KEY);
    if (saved === 'dark' || saved === 'light') return saved;
    return typeof window !== 'undefined' &&
      window.matchMedia('(prefers-color-scheme: dark)').matches
      ? 'dark'
      : 'light';
  });

  const setTheme = useCallback((t: 'light' | 'dark') => {
    setThemeState(t);
    localStorage.setItem(THEME_STORAGE_KEY, t);
    const root = document.documentElement;
    if (t === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, []);

  const toggleTheme = useCallback(() => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  }, [theme, setTheme]);

  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
  }, [theme]);

  // 2. Navigation & Sound
  const [activeSection, setActiveSection] = useState<SectionId>('dashboard');
  const [isSoundMuted, setIsSoundMuted] = useState<boolean>(true);

  // 3. Settings State (Persisted in localStorage)
  const [savedSettings, setSavedSettings] = useState<SystemSettings>(() => {
    try {
      const stored = localStorage.getItem(SETTINGS_STORAGE_KEY);
      if (stored) {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch (e) {
      console.warn('Failed to parse stored settings:', e);
    }
    return DEFAULT_SETTINGS;
  });

  const [pendingSettings, setPendingSettings] = useState<SystemSettings>(savedSettings);

  const isSettingsDirty = useMemo(() => {
    return JSON.stringify(savedSettings) !== JSON.stringify(pendingSettings);
  }, [savedSettings, pendingSettings]);

  const updateSettings = useCallback((newPartial: Partial<SystemSettings>) => {
    setPendingSettings((prev) => ({ ...prev, ...newPartial }));
  }, []);

  const saveSettings = useCallback(() => {
    setSavedSettings(pendingSettings);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(pendingSettings));
  }, [pendingSettings]);

  const discardSettings = useCallback(() => {
    setPendingSettings(savedSettings);
  }, [savedSettings]);

  const resetSettingsToFactory = useCallback(() => {
    setSavedSettings(DEFAULT_SETTINGS);
    setPendingSettings(DEFAULT_SETTINGS);
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_SETTINGS));
  }, []);

  // 4. Global Step Size h (defaults to settings.defaultStepSize)
  const [globalStepSize, setGlobalStepSize] = useState<number>(savedSettings.defaultStepSize || 1.0);

  // Sync global step size when settings change
  useEffect(() => {
    if (savedSettings.defaultStepSize && savedSettings.defaultStepSize !== globalStepSize) {
      setGlobalStepSize(savedSettings.defaultStepSize);
    }
  }, [savedSettings.defaultStepSize]);

  // 5. Shared ODE Solvers Cache (Euler, Modified Euler, RK4)
  const odeParams: ODEModelParams = useMemo(() => ({
    v0: savedSettings.initialVolume,
    duration: savedSettings.defaultDuration,
    stepSize: globalStepSize,
    qIn: savedSettings.inflowRate,
    qOut: savedSettings.outflowRate,
    torricelliK: savedSettings.torricelliK,
    model: savedSettings.physicsModel,
  }), [savedSettings, globalStepSize]);

  const odeResults = useMemo(() => {
    return {
      euler: solveEuler(odeParams),
      heun: solveModifiedEuler(odeParams),
      rk4: solveRK4(odeParams),
    };
  }, [odeParams]);

  // 6. Shared Hydraulic Manifold State (Linear Systems)
  const [manifoldParams, setManifoldParams] = useState({
    totalOutflow: 8,
    diffPipeAB: 1,
    ratioBC: 3,
  });

  const currentAugMatrix = useMemo(() => [
    [1, 1, 1, manifoldParams.totalOutflow],
    [1, -1, 0, manifoldParams.diffPipeAB],
    [0, 1, -manifoldParams.ratioBC, 0],
  ], [manifoldParams]);

  const linearSystemResults = useMemo(() => ({
    gaussian: solveGaussianElimination(currentAugMatrix),
    gaussJordan: solveGaussJordan(currentAugMatrix),
  }), [currentAugMatrix]);

  // 7. Toast notification helper
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    setTimeout(() => {
      setToast((curr) => (curr === msg ? null : curr));
    }, 3200);
  }, []);

  const value = {
    theme,
    setTheme,
    toggleTheme,
    activeSection,
    setActiveSection,
    isSoundMuted,
    setIsSoundMuted,
    settings: savedSettings,
    updateSettings,
    saveSettings,
    discardSettings,
    resetSettingsToFactory,
    isSettingsDirty,
    pendingSettings,
    setPendingSettings,
    globalStepSize,
    setGlobalStepSize,
    odeResults,
    manifoldParams,
    setManifoldParams,
    linearSystemResults,
    toast,
    showToast,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
