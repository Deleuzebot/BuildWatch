import type { Store } from "./store";
const pending = new Map<string, Promise<void>>();
export async function syncBilling(store: Store, id: string) {
  if (!process.env.REVENUECAT_SECRET_KEY)
    throw Object.assign(new Error("Billing verification is not configured."), {
      status: 503,
    });
  if (pending.has(id)) return pending.get(id)!;
  const work = (async () => {
    const response = await fetch(
      `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(id)}`,
      {
        headers: {
          Authorization: `Bearer ${process.env.REVENUECAT_SECRET_KEY}`,
        },
        signal: AbortSignal.timeout(10000),
      },
    );
    if (!response.ok)
      throw Object.assign(
        new Error("Unable to verify purchases. Please retry."),
        { status: 502 },
      );
    const data = await response.json(),
      subscriber = data.subscriber;
    const entitlement =
      subscriber?.entitlements?.[
        process.env.REVENUECAT_ENTITLEMENT || "buildwatch_plus"
      ];
    const subscription = entitlement
      ? subscriber.subscriptions?.[entitlement.product_identifier]
      : null;
    const sandbox = subscription?.is_sandbox === true;
    const expires =
      entitlement && (!sandbox || process.env.BILLING_ALLOW_SANDBOX === "true")
        ? entitlement.expires_date === null
          ? 8640000000000000
          : Math.max(
              Date.parse(entitlement.expires_date) || 0,
              Date.parse(subscription?.grace_period_expires_date || "") || 0,
            )
        : 0;
    const url = subscriber?.management_url;
    const managementURL =
      typeof url === "string" && url.startsWith("https://") ? url : null;
    store.run(
      "INSERT INTO entitlements(user_id,expires,store,management_url,synced) VALUES(?,?,?,?,?) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires,store=excluded.store,management_url=excluded.management_url,synced=excluded.synced",
      id,
      Number.isFinite(expires) ? expires : 0,
      subscription?.store || "",
      managementURL,
      Date.now(),
    );
  })();
  pending.set(id, work);
  try {
    await work;
  } finally {
    pending.delete(id);
  }
}
