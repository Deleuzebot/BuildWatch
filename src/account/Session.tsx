import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useRef,
} from "react";
import { AppState } from "react-native";
import type { Account, Capabilities } from "./types";
import { clearBillingIdentity } from "./billing";
import { unregisterDevice } from "./device";
import { api } from "./http";
import { accessToken, login, logout, authConfigured } from "./auth";
const empty: Capabilities = {
  auth: false,
  billing: false,
  push: false,
  linking: false,
  deletion: false,
  privacyURL: null,
  termsURL: null,
};
const Context = createContext<{
  account: Account | null;
  capabilities: Capabilities;
  error: string;
  refresh: () => Promise<void>;
  signIn: (connection?: string, fresh?: boolean) => Promise<void>;
  signOut: () => Promise<void>;
}>({
  account: null,
  capabilities: empty,
  error: "",
  refresh: async () => {},
  signIn: async () => {},
  signOut: async () => {},
});
export function SessionProvider({ children }: { children: React.ReactNode }) {
  const [account, setAccount] = useState<Account | null>(null),
    [capabilities, setCapabilities] = useState(empty),
    [error, setError] = useState("");
  const epoch = useRef(0);
  async function refresh() {
    const version = ++epoch.current;
    try {
      const config = await api("/api/config");
      if (version !== epoch.current) return;
      setCapabilities(config);
      if (authConfigured && (await accessToken())) {
        const result = await api("/api/me");
        if (version !== epoch.current) return;
        setAccount(result);
      } else setAccount(null);
      setError("");
    } catch (e) {
      if (version !== epoch.current) return;
      setAccount(null);
      setError(e instanceof Error ? e.message : "Account unavailable.");
    }
  }
  useEffect(() => {
    void refresh();
    const interval = setInterval(() => void refresh(), 60000);
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") void refresh();
    });
    return () => {
      clearInterval(interval);
      sub.remove();
    };
  }, []);
  return (
    <Context.Provider
      value={{
        account,
        capabilities,
        error,
        refresh,
        signIn: async (connection, fresh) => {
          await login(connection, fresh);
          await refresh();
        },
        signOut: async () => {
          epoch.current++;
          try {
            await unregisterDevice();
          } finally {
            epoch.current++;
            setAccount(null);
            try {
              await clearBillingIdentity();
            } finally {
              await logout();
            }
          }
        },
      }}
    >
      {children}
    </Context.Provider>
  );
}
export function useSession() {
  return useContext(Context);
}
