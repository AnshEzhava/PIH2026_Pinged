import { useColorScheme } from 'react-native';

// ---------------------------------------------------------------------------
// Palette type
// ---------------------------------------------------------------------------
export interface AppColors {
  // Backgrounds
  background: string;
  backgroundSubtle: string;
  backgroundMuted: string;

  // Surfaces / cards
  card: string;
  cardPressed: string;

  // Text
  textPrimary: string;
  textSecondary: string;
  textMuted: string;

  // Borders
  border: string;
  borderLight: string;

  // Accent / brand
  accent: string;
  accentPressed: string;
  accentSubtle: string;
  accentSubtleAlt: string;
  accentBorder: string;
  accentDisabled: string;

  // Selected pill / suggested-question bg
  selectedBg: string;

  // Chatbot header / suggestions
  chatHeaderBg: string;
  suggestionsBg: string;

  // Confidence / semantic
  confidenceHigh: string;
  confidenceMed: string;

  // Error
  errorBg: string;
  errorBorder: string;
  errorText: string;
  errorSub: string;

  // Warning / guardrail
  warningBg: string;
  warningBorder: string;
  warningText: string;
  warningTextDark: string;
  warningIcon: string;
  warningBullet: string;

  // Molecular target tags
  tagBg: string;
  tagBorder: string;
  tagText: string;

  // Network graph
  networkEdge: string;
  networkEdgeLabel: string;
  networkNodeStroke: string;
  networkNodeLabel: string;
  networkLegendLabel: string;

  // Bottom sheet handle
  sheetHandle: string;

  // BottomSheet background
  sheetBackground: string;
}

// ---------------------------------------------------------------------------
// Light palette
// ---------------------------------------------------------------------------
export const lightColors: AppColors = {
  background: '#FFFFFF',
  backgroundSubtle: '#F9FAFB',
  backgroundMuted: '#F3F4F6',

  card: '#FFFFFF',
  cardPressed: '#F3F4F6',

  textPrimary: '#111827',
  textSecondary: '#374151',
  textMuted: '#9CA3AF',

  border: '#E5E7EB',
  borderLight: '#F3F4F6',

  accent: '#2563EB',
  accentPressed: 'rgba(37,99,235,0.85)',
  accentSubtle: 'rgba(37,99,235,0.05)',
  accentSubtleAlt: 'rgba(37,99,235,0.04)',
  accentBorder: 'rgba(37,99,235,0.3)',
  accentDisabled: '#E5E7EB',

  selectedBg: '#FFFFFF',

  chatHeaderBg: 'rgba(37,99,235,0.04)',
  suggestionsBg: 'rgba(249,250,251,0.5)',

  confidenceHigh: '#059669',
  confidenceMed: '#D97706',

  errorBg: '#FEF2F2',
  errorBorder: '#FECACA',
  errorText: '#B91C1C',
  errorSub: '#EF4444',

  warningBg: '#FFFBEB',
  warningBorder: '#FDE68A',
  warningText: '#92400E',
  warningTextDark: '#78350F',
  warningIcon: '#D97706',
  warningBullet: '#D97706',

  tagBg: '#F3F4F6',
  tagBorder: '#E5E7EB',
  tagText: '#374151',

  networkEdge: '#E5E5E5',
  networkEdgeLabel: '#A3A3A3',
  networkNodeStroke: '#FFFFFF',
  networkNodeLabel: '#404040',
  networkLegendLabel: '#6B7280',

  sheetHandle: '#D1D5DB',
  sheetBackground: '#FFFFFF',
};

// ---------------------------------------------------------------------------
// Dark palette
// ---------------------------------------------------------------------------
export const darkColors: AppColors = {
  background: '#0F172A',
  backgroundSubtle: '#1E293B',
  backgroundMuted: '#334155',

  card: '#1E293B',
  cardPressed: '#334155',

  textPrimary: '#F1F5F9',
  textSecondary: '#CBD5E1',
  textMuted: '#64748B',

  border: '#334155',
  borderLight: '#1E293B',

  accent: '#3B82F6',
  accentPressed: 'rgba(59,130,246,0.85)',
  accentSubtle: 'rgba(59,130,246,0.12)',
  accentSubtleAlt: 'rgba(59,130,246,0.08)',
  accentBorder: 'rgba(59,130,246,0.4)',
  accentDisabled: '#334155',

  selectedBg: '#1E293B',

  chatHeaderBg: 'rgba(59,130,246,0.08)',
  suggestionsBg: 'rgba(15,23,42,0.6)',

  confidenceHigh: '#34D399',
  confidenceMed: '#FBBF24',

  errorBg: '#450a0a',
  errorBorder: '#7f1d1d',
  errorText: '#FCA5A5',
  errorSub: '#F87171',

  warningBg: '#422006',
  warningBorder: '#92400E',
  warningText: '#FDE68A',
  warningTextDark: '#FEF3C7',
  warningIcon: '#FBBF24',
  warningBullet: '#FBBF24',

  tagBg: '#1E293B',
  tagBorder: '#334155',
  tagText: '#CBD5E1',

  networkEdge: '#334155',
  networkEdgeLabel: '#64748B',
  networkNodeStroke: '#0F172A',
  networkNodeLabel: '#CBD5E1',
  networkLegendLabel: '#94A3B8',

  sheetHandle: '#475569',
  sheetBackground: '#1E293B',
};

// ---------------------------------------------------------------------------
// Hook — call in any component to get the current palette
// ---------------------------------------------------------------------------
export function useThemeColors(): AppColors {
  const scheme = useColorScheme();
  return scheme === 'dark' ? darkColors : lightColors;
}
