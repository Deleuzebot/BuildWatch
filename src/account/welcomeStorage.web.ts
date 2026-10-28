const key = "buildwatch.welcome.v1";
export async function hasChosenAccess() {
  return localStorage.getItem(key) === "yes";
}
export async function rememberAccessChoice() {
  localStorage.setItem(key, "yes");
}
export async function forgetAccessChoice() {
  localStorage.removeItem("buildwatch.welcome.v1");
}
