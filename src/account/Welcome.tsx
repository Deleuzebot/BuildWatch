import React, { createContext, useContext, useEffect, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { SafeAreaProvider, SafeAreaView } from "react-native-safe-area-context";
import { StatusBar } from "expo-status-bar";
import { useSession } from "./Session";
import { authConfigured } from "./auth";
import { providerEnabled } from "./providers";
import {
  hasChosenAccess,
  rememberAccessChoice,
  forgetAccessChoice,
} from "./welcomeStorage";
const WelcomeContext = createContext({ showWelcome: () => {} });
export function useWelcome() {
  return useContext(WelcomeContext);
}
export default function WelcomeGate({
  children,
}: {
  children: React.ReactNode;
}) {
  const { account, capabilities, signIn } = useSession();
  const [chosen, setChosen] = useState<boolean | null>(null),
    [reopened, setReopened] = useState(false),
    [busy, setBusy] = useState<string | null>(null),
    [error, setError] = useState("");
  useEffect(() => {
    void hasChosenAccess()
      .then(setChosen)
      .catch(() => setChosen(false));
  }, []);
  useEffect(() => {
    if (account) {
      setChosen(true);
      setReopened(false);
      void rememberAccessChoice().catch(() => {});
    }
  }, [account?.id]);
  async function guest() {
    await rememberAccessChoice().catch(() => {});
    setChosen(true);
    setReopened(false);
  }
  async function enter(connection: string) {
    setBusy(connection);
    setError("");
    try {
      await signIn(connection);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Sign-in could not be completed.",
      );
    } finally {
      setBusy(null);
    }
  }
  const enabled = authConfigured && capabilities.auth;
  if ((chosen || account) && !reopened)
    return (
      <WelcomeContext.Provider
        value={{
          showWelcome: () => {
            void forgetAccessChoice().catch(() => {});
            setChosen(false);
            setError("");
            setReopened(true);
          },
        }}
      >
        {children}
      </WelcomeContext.Provider>
    );
  return (
    <SafeAreaProvider>
      <SafeAreaView style={s.page}>
        <StatusBar style="dark" />
        <ScrollView contentContainerStyle={s.scroll}>
          <View style={s.content}>
            <Text style={s.eyebrow}>YOUR NEIGHBORHOOD, IN PROGRESS</Text>
            <Text style={s.brand}>
              BuildWatch<Text style={{ color: "#D36D43" }}>.</Text>
            </Text>
            <View style={s.art} accessibilityElementsHidden>
              <View style={s.orbit} />
              <Text style={s.pin}>◎</Text>
              <View style={s.city}>
                <View style={[s.building, { height: 34 }]} />
                <View style={[s.building, { height: 70 }]} />
                <View style={[s.building, { height: 49 }]} />
              </View>
            </View>
            <Text accessibilityRole="header" style={s.title}>
              See what’s taking shape.
            </Text>
            <Text style={s.body}>
              Explore development projects, follow their progress, and discover
              upcoming public meetings.
            </Text>
            <View style={s.card}>
              <Text style={s.cardTitle}>How would you like to explore?</Text>
              <Pressable
                accessibilityRole="button"
                onPress={() => void guest()}
                style={s.guest}
              >
                <Text style={s.guestTitle}>Continue as Guest</Text>
                <Text style={s.guestDetail}>
                  Explore the entire public map. No account required.
                </Text>
              </Pressable>
              <Text style={s.divider}>OR CONTINUE WITH YOUR ACCOUNT</Text>
              {[
                ["Google", "google-oauth2"],
                ["Apple", "apple"],
              ].map(([label, connection]) => (
                <Pressable
                  key={connection}
                  accessibilityRole="button"
                  accessibilityLabel={`Continue with ${label}`}
                  disabled={!enabled || !providerEnabled(connection) || busy !== null}
                  onPress={() => void enter(connection)}
                  style={[
                    s.provider,
                    (!enabled || !providerEnabled(connection) || busy !== null) && s.unavailable,
                  ]}
                >
                  {busy === connection ? (
                    <ActivityIndicator color="#163A30" />
                  ) : (
                    <Text style={s.providerText}>Continue with {label}{enabled && !providerEnabled(connection) ? " (coming soon)" : ""}</Text>
                  )}
                </Pressable>
              ))}
              {!enabled && (
                <Text style={s.notice}>
                  Google and Apple sign-in are not connected yet. You can
                  explore as a guest now.
                </Text>
              )}
              {!!error && (
                <Text accessibilityRole="alert" style={s.notice}>
                  {error}
                </Text>
              )}
              <Text style={s.small}>
                New and returning users use the same options. Follow one development
                free, or continue as a guest and open Account later.
              </Text>
              {chosen === null && (
                <Text style={s.small}>Checking your saved preference…</Text>
              )}
            </View>
            <Text style={s.footer}>
              Everyone can explore. Authorized collaborators maintain the map.
            </Text>
          </View>
        </ScrollView>
      </SafeAreaView>
    </SafeAreaProvider>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F6F7F2" },
  scroll: { flexGrow: 1, padding: 24, justifyContent: "center" },
  content: { width: "100%", maxWidth: 500, alignSelf: "center", gap: 15 },
  eyebrow: {
    fontSize: 10,
    fontWeight: "700",
    letterSpacing: 1.5,
    color: "#56706A",
  },
  brand: {
    fontSize: 38,
    fontWeight: "800",
    letterSpacing: -1.4,
    color: "#102D2B",
  },
  title: {
    fontSize: 31,
    lineHeight: 37,
    fontWeight: "800",
    letterSpacing: -0.8,
    color: "#163A30",
  },
  body: { fontSize: 16, lineHeight: 25, color: "#526B5B" },
  card: {
    padding: 23,
    borderRadius: 22,
    backgroundColor: "#FFFFFF",
    borderWidth: 1,
    borderColor: "#DBE4D7",
    gap: 14,
  },
  cardTitle: { fontSize: 18, fontWeight: "700", color: "#163A30" },
  guest: { padding: 17, borderRadius: 12, backgroundColor: "#164A37", gap: 6 },
  guestTitle: { fontSize: 17, fontWeight: "700", color: "white" },
  guestDetail: { fontSize: 12, lineHeight: 18, color: "#DCE9DD" },
  divider: {
    fontSize: 9,
    fontWeight: "700",
    letterSpacing: 1,
    color: "#698070",
    textAlign: "center",
    marginTop: 4,
  },
  provider: {
    padding: 16,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#C8D9C8",
    alignItems: "center",
    backgroundColor: "#F6F9F2",
  },
  providerText: { fontSize: 15, fontWeight: "700", color: "#163A30" },
  unavailable: { opacity: 0.5 },
  notice: {
    fontSize: 13,
    lineHeight: 20,
    color: "#815B2B",
    padding: 12,
    borderRadius: 10,
    backgroundColor: "#F4ECDC",
  },
  small: { fontSize: 12, lineHeight: 19, color: "#667B6C" },
  footer: {
    fontSize: 11,
    lineHeight: 18,
    color: "#6D7D71",
    textAlign: "center",
  },
  art: {
    height: 105,
    backgroundColor: "#E4ECDF",
    borderRadius: 18,
    overflow: "hidden",
    justifyContent: "center",
    alignItems: "center",
  },
  orbit: {
    position: "absolute",
    width: 190,
    height: 190,
    borderRadius: 95,
    borderWidth: 24,
    borderColor: "#D4E1CE",
    left: 30,
    top: -40,
  },
  pin: {
    fontSize: 62,
    color: "#C96D45",
    position: "absolute",
    right: 68,
    top: 5,
  },
  city: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 9,
    position: "absolute",
    left: 82,
    bottom: 0,
  },
  building: {
    width: 33,
    backgroundColor: "#50765B",
    borderTopLeftRadius: 5,
    borderTopRightRadius: 5,
  },
});
