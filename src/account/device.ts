import * as SecureStore from "expo-secure-store";
import Constants from "expo-constants";
import { api } from "./http";
let registered: string | null = null;
export async function enablePush() {
  const N = await import("expo-notifications");
  const projectId = Constants.expoConfig?.extra?.eas?.projectId;
  if (!projectId)
    throw new Error("An EAS project ID is required for device notifications.");
  N.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  const permission = await N.requestPermissionsAsync();
  if (!permission.granted)
    throw new Error(
      "Device notifications were not allowed. You can change this in iPhone Settings.",
    );
  registered = (await N.getExpoPushTokenAsync({ projectId })).data;
  await SecureStore.setItemAsync("buildwatch.push", registered);
  await api("/api/devices", "POST", { token: registered });
}
export async function unregisterDevice() {
  const token =
    registered || (await SecureStore.getItemAsync("buildwatch.push"));
  if (token) {
    await api("/api/devices", "DELETE", { token });
    registered = null;
    await SecureStore.deleteItemAsync("buildwatch.push");
  }
}
