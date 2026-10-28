import * as SecureStore from "expo-secure-store";
const key = "buildwatch.welcome.v1";
export async function hasChosenAccess() {
  return (await SecureStore.getItemAsync(key)) === "yes";
}
export async function rememberAccessChoice() {
  await SecureStore.setItemAsync(key, "yes");
}
export async function forgetAccessChoice() {
  await SecureStore.deleteItemAsync("buildwatch.welcome.v1");
}
