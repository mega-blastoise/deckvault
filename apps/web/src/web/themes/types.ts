export type ThemeName = 'nebula' | 'light' | 'catppuccin';

export interface ThemeContextValue {
  theme: ThemeName;
  setTheme: (theme: ThemeName) => void;
  toggleTheme: () => void;
  mounted: boolean;
}

export const THEME_STORAGE_KEY = '__theme';
export const DEFAULT_THEME: ThemeName = 'nebula';
