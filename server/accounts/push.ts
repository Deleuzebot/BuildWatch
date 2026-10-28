import type { Store } from "./store";
let running = false;
export async function deliver(store: Store) {
  if (running || process.env.PUSH_DELIVERY_ENABLED !== "true") return;
  running = true;
  const headers = {
    Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN || ""}`,
    "Content-Type": "application/json",
  };
  try {
    const now = Date.now();
    // Receipts are checked before retrying pending sends. A ticket is not proof of delivery.
    for (const row of store.all(
      "SELECT * FROM deliveries WHERE status='ticket' AND next_attempt<=? LIMIT 50",
      now,
    )) {
      try {
        const r = await fetch("https://exp.host/--/api/v2/push/getReceipts", {
          method: "POST",
          headers,
          body: JSON.stringify({ ids: [row.ticket] }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) continue;
        const d = await r.json();
        const receipt = d.data?.[row.ticket];
        if (!receipt) {
          store.run(
            "UPDATE deliveries SET next_attempt=? WHERE notification_id=? AND token=?",
            now + 900000,
            row.notification_id,
            row.token,
          );
          continue;
        }
        if (receipt.details?.error === "DeviceNotRegistered")
          store.run("DELETE FROM devices WHERE token=?", row.token);
        store.run(
          "UPDATE deliveries SET status=? WHERE notification_id=? AND token=?",
          receipt.status === "ok" ? "delivered" : "failed",
          row.notification_id,
          row.token,
        );
      } catch {
        /* retry receipt lookup later */
      }
    }
    for (const row of store.all(
      "SELECT d.*,n.user_id,n.project_id,n.kind,n.title,n.body,n.created,n.event_key FROM deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.status='pending' AND d.next_attempt<=? LIMIT 50",
      now,
    )) {
      const user = store.user(row.user_id),
        prefs = user ? JSON.parse(user.preferences) : {};
      const reminderIsCurrent =
        row.kind !== "reminders" ||
        store
          .project(row.project_id)
          ?.meetings.some(
            (meeting) =>
              `reminder:${row.project_id}:${meeting.id}:${meeting.startsAt}` ===
                row.event_key && Date.parse(meeting.startsAt) > now,
          );
      if (
        !reminderIsCurrent ||
        !user ||
        user.disabled ||
        !prefs.enabled ||
        !prefs[row.kind] ||
        !store.active(row.user_id, row.project_id) ||
        !store.one(
          "SELECT token FROM devices WHERE token=? AND user_id=?",
          row.token,
          row.user_id,
        ) ||
        now - row.created > 86400000
      ) {
        store.run(
          "UPDATE deliveries SET status='skipped' WHERE notification_id=? AND token=?",
          row.notification_id,
          row.token,
        );
        continue;
      }
      try {
        const r = await fetch("https://exp.host/--/api/v2/push/send", {
          method: "POST",
          headers,
          body: JSON.stringify({
            to: row.token,
            title: row.title,
            body: row.body,
            data: { projectId: row.project_id },
            sound: "default",
          }),
          signal: AbortSignal.timeout(10000),
        });
        if (!r.ok) throw new Error("Push service unavailable");
        const payload = await r.json();
        const ticket = payload.data;
        if (ticket?.status === "ok")
          store.run(
            "UPDATE deliveries SET status='ticket',ticket=?,next_attempt=? WHERE notification_id=? AND token=?",
            ticket.id,
            now + 900000,
            row.notification_id,
            row.token,
          );
        else {
          if (ticket?.details?.error === "DeviceNotRegistered")
            store.run("DELETE FROM devices WHERE token=?", row.token);
          throw new Error("Push ticket rejected");
        }
      } catch {
        store.run(
          "UPDATE deliveries SET attempts=attempts+1,status=?,next_attempt=? WHERE notification_id=? AND token=?",
          row.attempts >= 4 ? "failed" : "pending",
          now + Math.min(3600000, 60000 * 2 ** row.attempts),
          row.notification_id,
          row.token,
        );
      }
    }
  } finally {
    running = false;
  }
}
