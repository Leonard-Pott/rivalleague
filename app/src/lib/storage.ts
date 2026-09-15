import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";

// SecureStore gibt es im Browser nicht - fuer "expo start --web" reicht localStorage.
const web = {
  getItem: async (k: string) => globalThis.localStorage?.getItem(k) ?? null,
  setItem: async (k: string, v: string) => globalThis.localStorage?.setItem(k, v),
  deleteItem: async (k: string) => globalThis.localStorage?.removeItem(k),
};

const native = {
  getItem: (k: string) => SecureStore.getItemAsync(k),
  setItem: (k: string, v: string) => SecureStore.setItemAsync(k, v),
  deleteItem: (k: string) => SecureStore.deleteItemAsync(k),
};

export const store = Platform.OS === "web" ? web : native;
