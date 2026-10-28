/**
 * Learn more about light and dark modes:
 * https://docs.expo.dev/guides/color-schemes/
 */

import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export function useTheme() {
  const scheme = useColorScheme();
  // Seit RN 0.88 liefert useColorScheme nur noch 'light', 'dark' oder null;
  // null heisst, die Plattform kennt kein Schema - dann bleibt es hell.
  const theme = scheme ?? 'light';

  return Colors[theme];
}
