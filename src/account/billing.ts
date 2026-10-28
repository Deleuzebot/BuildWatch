let configured = false;
export const billingConfigured = !!process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY;
async function purchases(id: string) {
  const { default: P } = await import("react-native-purchases");
  if (!configured) {
    P.configure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_IOS_KEY!,
      appUserID: id,
    });
    configured = true;
  } else await P.logIn(id);
  return P;
}
export async function buy(id: string) {
  const P = await purchases(id),
    offerings = await P.getOfferings();
  const item = offerings.current?.monthly;
  if (!item) throw new Error("The monthly subscription is not configured.");
  await P.purchasePackage(item);
}
export async function restore(id: string) {
  await (await purchases(id)).restorePurchases();
}
export async function clearBillingIdentity() {
  if (configured) {
    const { default: P } = await import("react-native-purchases");
    if (!(await P.isAnonymous())) await P.logOut();
  }
}
