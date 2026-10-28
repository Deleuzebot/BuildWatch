/** Only advertise identity connections explicitly enabled by the operator. */
export function providerEnabled(connection: string) {
  if (connection === "apple") return process.env.EXPO_PUBLIC_AUTH0_APPLE_ENABLED === "true";
  return true;
}
