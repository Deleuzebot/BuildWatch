import * as SecureStore from "expo-secure-store";
export async function rememberProject(id: string) {
  await SecureStore.setItemAsync("buildwatch.resume", id);
}
export async function consumeProject() {
  const id = await SecureStore.getItemAsync("buildwatch.resume");
  await SecureStore.deleteItemAsync("buildwatch.resume");
  return id;
}
export function invitationToken() {
  return "";
}
