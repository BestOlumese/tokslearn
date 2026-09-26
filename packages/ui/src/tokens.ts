/**
 * Token values for places CSS variables can't reach (OG images, emails, the Expo app later).
 * Must match tokens.css. docs/17 §2: share tokens, not components, with mobile.
 */
export const colors = {
  canvas: '#F6F7F6',
  surface: '#FFFFFF',
  surfaceSunken: '#EEF0EF',
  border: '#E1E5E3',
  borderStrong: '#C7CDCA',
  ink: '#13181D',
  ink2: '#46505A',
  ink3: '#66707A',
  inkInverse: '#FFFFFF',
  brand: '#0E6B4E',
  brandHover: '#0B5941',
  brandPress: '#094A36',
  brandSoft: '#E6F2EC',
  brandInk: '#0A4F3A',
  accent: '#B86E0A',
  accentSoft: '#FCF1DF',
  accentInk: '#7A4905',
  info: '#1D5DA8',
  infoSoft: '#E7F0FA',
  success: '#0E6B4E',
  successSoft: '#E6F2EC',
  warning: '#9A5B00',
  warningSoft: '#FDF3E1',
  danger: '#B42318',
  dangerSoft: '#FDECEA',
  focus: '#1D5DA8',
} as const

export type ColorToken = keyof typeof colors

export const radius = { control: 6, card: 10, dialog: 12 } as const
export const spacing = [4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80] as const
