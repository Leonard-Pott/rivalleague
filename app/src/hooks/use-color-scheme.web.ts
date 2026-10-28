import { useSyncExternalStore } from 'react';
import { useColorScheme as useRNColorScheme } from 'react-native';

const nichtsAbonnieren = () => () => {};

/**
 * Beim statischen Rendern fuer das Web steht das Farbschema noch nicht fest,
 * deshalb erst nach der Hydration das echte Schema melden - sonst weicht die
 * erste Client-Darstellung vom ausgelieferten HTML ab. useSyncExternalStore
 * liefert genau diese Unterscheidung (Server-Snapshot vs. Client-Snapshot),
 * ohne im Effekt State zu setzen.
 */
export function useColorScheme() {
  const hydriert = useSyncExternalStore(
    nichtsAbonnieren,
    () => true,
    () => false,
  );
  const schema = useRNColorScheme();

  return hydriert ? schema : 'light';
}
