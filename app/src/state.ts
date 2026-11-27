import { createContext, useContext } from "react";
import type { Persisted } from "./storage";

export interface AppState {
  persist: Persisted;
  setSettings: (patch: Partial<Persisted["settings"]>) => void;
  newSession: () => void;
  selectSession: (id: string) => void;
  deleteSession: (id: string) => void;
  addMessage: (role: "user" | "assistant", text: string, error?: boolean) => string;
  updateMessage: (id: string, text: string) => void;
  activeSession: () => Persisted["sessions"][number] | null;
}

export const Ctx = createContext<AppState | null>(null);
export const useApp = (): AppState => {
  const c = useContext(Ctx);
  if (!c) throw new Error("useApp must be used inside the App provider");
  return c;
};
