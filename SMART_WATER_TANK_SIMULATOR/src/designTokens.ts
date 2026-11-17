// ============================================================================
// SMART WATER TANK SIMULATOR — DESIGN TOKENS
// Strictly adhering to WCAG AA contrast standards & dark/light theme tokens
// ============================================================================

export const tokens = {
  // Theme Color System
  colors: {
    dark: {
      bgBase: '#0B1220',          // Page background
      bgSurface: '#111A2E',       // Cards
      bgElevated: '#172238',      // Inputs, table headers, hover
      border: 'rgba(255, 255, 255, 0.08)',
      borderStrong: 'rgba(255, 255, 255, 0.16)',
      textPrimary: '#F1F5F9',     // Main text (High contrast AAA)
      textSecondary: '#A9B4C7',   // Body & labels (WCAG AA 5.2:1)
      textMuted: '#7C8AA3',       // Tertiary only (WCAG AA 4.6:1)
      accent: '#3B82F6',          // Primary action
      success: '#22C55E',         // Green
      warning: '#F59E0B',         // Amber
      danger: '#EF4444',          // Red
      cardShadow: '0 8px 24px rgba(0, 0, 0, 0.35)',
      cardHighlight: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.06)',
    },
    light: {
      bgBase: '#F8FAFC',          // Light page background
      bgSurface: '#FFFFFF',       // Clean card surface
      bgElevated: '#F1F5F9',      // Inputs & table header
      border: 'rgba(0, 0, 0, 0.08)',
      borderStrong: 'rgba(0, 0, 0, 0.16)',
      textPrimary: '#0F172A',     // Primary text
      textSecondary: '#475569',   // Body & labels (WCAG AA 5.8:1)
      textMuted: '#64748B',       // Tertiary text
      accent: '#2563EB',          // Blue 600
      success: '#16A34A',         // Green
      warning: '#D97706',         // Amber
      danger: '#DC2626',          // Red
      cardShadow: '0 2px 8px rgba(0, 0, 0, 0.06)',
      cardHighlight: 'inset 0 1px 0 0 rgba(255, 255, 255, 0.9)',
    },
  },

  // Numerical Solvers Method Identity Colors
  solvers: {
    exact: {
      id: 'exact',
      name: 'Exact Reference',
      color: '#6366F1',           // Indigo 500
      dashArray: 'none',          // Solid
      strokeWidth: 2.5,
    },
    euler: {
      id: 'euler',
      name: 'Euler Method',
      order: 'O(h) — 1st Order',
      color: '#F59E0B',           // Amber 500
      dashArray: '3 3',           // Dotted
      strokeWidth: 2,
    },
    modEuler: {
      id: 'modEuler',
      name: 'Modified Euler (Heun)',
      order: 'O(h²) — 2nd Order',
      color: '#06B6D4',           // Cyan 500
      dashArray: '6 3',           // Dashed
      strokeWidth: 2,
    },
    rk4: {
      id: 'rk4',
      name: 'Runge-Kutta 4th Order (RK4)',
      order: 'O(h⁴) — 4th Order',
      color: '#22C55E',           // Green 500
      dashArray: '8 4',           // Long dash
      strokeWidth: 2.5,
    },
  },

  // 8px Spacing Grid
  spacing: {
    1: '4px',
    2: '8px',
    3: '12px',
    4: '16px',
    5: '20px',
    6: '24px',
    8: '32px',
  },

  // Typography
  typography: {
    base: '14px',
    label: '13px',
    tertiary: '12px',
    largeNumber: '34px',
    unit: '16px',
  },
} as const;

export type DesignTokens = typeof tokens;
