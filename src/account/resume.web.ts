export async function rememberProject(id: string) {
  sessionStorage.setItem("buildwatch.resume", id);
}
export async function consumeProject() {
  const id = sessionStorage.getItem("buildwatch.resume");
  sessionStorage.removeItem("buildwatch.resume");
  return id;
}
const token = new URLSearchParams(window.location.search).get("invite");
if (token) sessionStorage.setItem("buildwatch.invite", token);
export function invitationToken() {
  return sessionStorage.getItem("buildwatch.invite") || "";
}
