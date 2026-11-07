const key = "buildwatch.welcome.v1";
export async function hasChosenAccess() {
  // Preview first-launch entry without clearing saved preferences or signing out.
  if (new URLSearchParams(window.location.search).get("welcome") === "1") return false;
  return localStorage.getItem(key) === "yes";
}
export async function rememberAccessChoice() {
  localStorage.setItem(key, "yes");
}
export async function forgetAccessChoice() {
  localStorage.removeItem("buildwatch.welcome.v1");
}
