import {
  createContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode
} from 'react';
import type { ThemeName, ThemeContextValue } from './types';
import { THEME_STORAGE_KEY, DEFAULT_THEME } from './types';

export const ThemeContext = createContext<ThemeContextValue | null>(null);

export interface ThemeProviderProps {
  children: ReactNode;
  defaultTheme?: ThemeName;
}

function getSystemTheme(): ThemeName {
  if (typeof window === 'undefined') return DEFAULT_THEME;
  return window.matchMedia('(prefers-color-scheme: light)').matches
    ? 'light'
    : 'nebula';
}

function isValidTheme(value: string | null): value is ThemeName {
  return value === 'nebula' || value === 'light' || value === 'catppuccin';
}

export function ThemeProvider({
  children,
  defaultTheme = DEFAULT_THEME
}: ThemeProviderProps) {
  const [theme, setThemeState] = useState<ThemeName>(defaultTheme);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);

    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (isValidTheme(stored)) {
      setThemeState(stored);
    } else {
      setThemeState(getSystemTheme());
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      document.documentElement.setAttribute('data-theme', theme);
      localStorage.setItem(THEME_STORAGE_KEY, theme);
    }
  }, [theme, mounted]);

  const setTheme = useCallback((newTheme: ThemeName) => {
    setThemeState(newTheme);
  }, []);

  const toggleTheme = useCallback(() => {
    setThemeState((prev) => (prev === 'nebula' ? 'light' : 'nebula'));
  }, []);

  const value: ThemeContextValue = {
    theme,
    setTheme,
    toggleTheme,
    mounted
  };

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
}
