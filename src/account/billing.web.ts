import type { Purchases } from "@revenuecat/purchases-js";
let instance: Purchases | null = null;
export const billingConfigured = !!process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY;
async function purchases(id: string) {
  const { Purchases: P } = await import("@revenuecat/purchases-js");
  if (!instance)
    instance = P.configure({
      apiKey: process.env.EXPO_PUBLIC_REVENUECAT_WEB_KEY!,
      appUserId: id,
    });
  else await instance.changeUser(id);
  return instance;
}
export async function buy(id: string) {
  const P = await purchases(id),
    offerings = await P.getOfferings();
  const item = offerings.current?.monthly;
  if (!item) throw new Error("The monthly subscription is not configured.");
  await P.purchase({ rcPackage: item });
}
export async function restore(id: string) {
  await (await purchases(id)).getCustomerInfo();
}
export async function clearBillingIdentity() {
  if (instance) await instance.changeUser(`guest-${crypto.randomUUID()}`);
}
