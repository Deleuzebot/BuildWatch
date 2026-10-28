import ArchivedProjects from './ArchivedProjects';
import AutomationManagement from './AutomationManagement';
import AdministratorAccess from './AdministratorAccess';
import {useLayoutPreference} from '../lib/LayoutPreference';
import React, { useEffect, useRef, useState } from "react";
import {
  Modal,
  ScrollView,
  Pressable,
  Text,
  TextInput,
  View,
  Switch,
  StyleSheet,
  Linking,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useSession } from "./Session";
import { api } from "./http";
import { login, authConfigured } from "./auth";
import { providerEnabled } from "./providers";
import { buy, restore, billingConfigured } from "./billing";
import { enablePush } from "./device";
import { invitationToken } from "./resume";
import type { Follow, InboxItem } from "./types";
import type { Project } from "../data/projects";
import ResearchReview from './ResearchReview';
import DuplicateManagement,{ClassificationCandidates} from './duplicates/DuplicateManagement';
import { statuses } from "../data/projects";
export type Panel =
  | "Settings"
  | "Account"
  | "Administrator Security"
  | "Login"
  | "My Following"
  | "Notifications"
  | "BuildWatch Plus"
  | "Help & Feedback"
  | "Suggest an Update"
  | "Edit Map"
  | "Project Management"
  | "Admin Dashboard"
  | "Automation Management"
  | "Manage Users"
  | "Invite Collaborators"
  | "Review Submissions"
  | "Editing History"
  | "Potential Duplicates"
  | "Classification Review"
  | "Proposed Map Updates"
  | "Archived Projects";
export function Action({
  title,
  onPress,
  disabled = false,
}: {
  title: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={[s.button, disabled && { opacity: 0.45 }]}
    >
      <Text style={s.buttonText}>{title}</Text>
    </Pressable>
  );
}
export function Field({
  label,
  value,
  onChange,
  multiline = false,
  secure = false,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  multiline?: boolean;
  secure?: boolean;
}) {
  return (
    <View style={{ gap: 7 }}>
      <Text style={s.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChange}
        multiline={multiline}
        secureTextEntry={secure}
        autoCapitalize="none"
        style={[s.input, multiline && { minHeight: 100 }]}
      />
    </View>
  );
}
export default function AccountPanel({
  initial,
  project,
  onClose,
  onProject,
  onEdit,
}: {
  initial: Panel;
  project?: Project;
  onClose: () => void;
  onProject: (id: string) => void;
  onEdit: (project: Project | null) => void;
}) {
  const session = useSession(),
    { account, capabilities } = session;
  const layout=useLayoutPreference();
  const [screen, setScreen] = useState<Panel>(initial),
    [message, setMessage] = useState(""),
    [busy, setBusy] = useState(false);
  const [name, setName] = useState(account?.name || ""),
    [confirm, setConfirm] = useState(""),
    [invite, setInvite] = useState(invitationToken()),
    [email, setEmail] = useState(""),
    [inviteURL, setInviteURL] = useState("");
  const [editSearch, setEditSearch] = useState("");
  const [editCursor,setEditCursor]=useState<string|null>(null);
  const editRequest=useRef(0);
  async function loadEditable(cursor:string|null=null){
    const request=++editRequest.current;
    const page=await api('/api/management/map?'+new URLSearchParams({paged:'1',search:editSearch.trim(),...(cursor?{cursor}:{})}).toString());
    if(request!==editRequest.current)return;
    setItems(old=>cursor?[...old,...page.items]:page.items);setEditCursor(page.nextCursor);
  }
  useEffect(()=>{
    if(screen!=="Edit Map"||!account)return;
    const timer=setTimeout(()=>{void loadEditable().catch(e=>setMessage(e instanceof Error?e.message:'Could not load projects.'));},250);
    return()=>{clearTimeout(timer);editRequest.current++;};
  },[screen,account?.id,editSearch]);
  const [history, setHistory] = useState<any[] | null>(null);
  const [items, setItems] = useState<any[]>([]),
    [kind, setKind] = useState("support"),
    [body, setBody] = useState(""),
    [description, setDescription] = useState(""),
    [proposedStatus, setProposedStatus] = useState(""),
    [source, setSource] = useState("");
  const [review, setReview] = useState<any | null>(null),
    [patch, setPatch] = useState("");
  async function run(work: () => Promise<void>) {
    if (busy) return;
    setBusy(true);
    setMessage("");
    try {
      await work();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed.");
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    if (!account) {
      setItems([]);
      return;
    }
    if(screen==="Edit Map"){await loadEditable();return;}
    const endpoints: Partial<Record<Panel, string>> = {
      "My Following": "/api/follows",
      Notifications: "/api/notifications",
      "Project Management": "/api/management/projects",
      "Edit Map": "/api/management/map",
      "Manage Users": "/api/admin/users",
      "Invite Collaborators": "/api/admin/invitations",
      "Review Submissions": "/api/admin/submissions",
      "Editing History": "/api/admin/history",
    };
    const endpoint = endpoints[screen];
    if (endpoint) {
      const result = await api(endpoint);
      setItems(
        screen === "Editing History"
          ? [
              ...result.projects.map((r: any) => ({ ...r, kind: "project" })),
              ...result.roles.map((r: any) => ({ ...r, kind: "role" })),
            ]
          : result,
      );
    }
  }
  useEffect(() => {
    void run(load);
  }, [screen, account?.id]);
  useEffect(() => {
    if (account && screen === "Login") onClose();
  }, [account?.id]);
  const admin = account?.role === "admin";
  const editor = (admin && account?.mfa) || account?.role === "collaborator";
  const authUI = (
    <View style={s.card}>
      <Text style={s.h2}>Account</Text>
      <Text style={s.body}>
        Browse freely, or continue with your account to follow one development free and suggest
        corrections.
      </Text>
      {!authConfigured || !capabilities.auth ? (
        <Text style={s.notice}>
          Account sign-in is not available yet. The administrator must configure
          the identity service. You can continue exploring the map.
        </Text>
      ) : (
        <>
          {[
            ["Continue with Google", "google-oauth2"],
            ["Continue with Apple", "apple"],
            [
              "Continue with Email",
              process.env.EXPO_PUBLIC_AUTH0_EMAIL_CONNECTION ||
                "Username-Password-Authentication",
            ],
          ].filter(([, connection]) => providerEnabled(connection)).map(([title, connection]) => (
            <Action
              key={title}
              title={title}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await session.signIn(connection);
                })
              }
            />
          ))}
          <Text style={s.body}>
            New here? The same options create your account. Returning users
            continue to their existing account.
          </Text>
        </>
      )}
      <Action title="Continue as Guest" onPress={onClose} />
      {Platform.OS==='web'&&<Action title="Administrator login" onPress={()=>setScreen('Administrator Security')}/>}
    </View>
  );
  const accountUI = account ? (
    <>
      <View style={s.card}>
        <Text style={s.h2}>Account</Text>
        <Text style={s.body}>
          {account.email}
          {account.verified ? " · Verified" : " · Email not verified"}
        </Text>
        <Text style={s.body}>
          Role: {account.role} ·{" "}
          {account.plus
            ? "Plus tracking enabled"
            : "Free · one active development"}
        </Text>
        <Field label="Profile name" value={name} onChange={setName} />
        <Action
          title="Save profile"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await api("/api/me", "PATCH", { name });
              await session.refresh();
              setMessage("Profile saved.");
            })
          }
        />
        <Text style={s.label}>Connected sign-in methods</Text>
        <Text style={s.body}>
          {account.methods
            .map(
              (method) =>
                (
                  ({
                    auth0: "Email and password",
                    "google-oauth2": "Google",
                    apple: "Apple",
                    'supabase-admin': 'Supabase administrator · password and authenticator',
                  }) as Record<string, string>
                )[method] || method,
            )
            .join(", ") || "Sign-in provider"}
        </Text>
        <Action
          title={account.methods.includes('supabase-admin')?'Administrator security':'Sign in again / complete MFA'}
          disabled={busy}
          onPress={() => account.methods.includes('supabase-admin')?setScreen('Administrator Security'):void run(async () => session.signIn(undefined, true))}
        />
        {capabilities.linking&&!account.methods.includes('supabase-admin') ? (
          <>
            <Text style={s.body}>
              To link another method, first sign in again, then authenticate the
              other account. Accounts are never joined merely because their
              emails match.
            </Text>
            {[
              ["Link Google", "google-oauth2"],
              ["Link Apple", "apple"],
              [
                "Link Email",
                process.env.EXPO_PUBLIC_AUTH0_EMAIL_CONNECTION ||
                  "Username-Password-Authentication",
              ],
            ].filter(([, connection]) => providerEnabled(connection)).map(([title, connection]) => (
              <Action
                key={title}
                title={title}
                disabled={busy}
                onPress={() =>
                  void run(async () => {
                    const secondaryToken = await login(connection, true, true);
                    await api("/api/account/link", "POST", { secondaryToken });
                    setMessage(
                      "Method linked. Log out and sign in again to refresh connected methods.",
                    );
                  })
                }
              />
            ))}
          </>
        ) : (
          <Text style={s.notice}>
            Account linking is unavailable until identity management is
            configured.
          </Text>
        )}
        {account.methods.includes("auth0") && (
          <Action
            title="Send password reset email"
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await api("/api/account/password", "POST");
                setMessage("Check your email for password-reset instructions.");
              })
            }
          />
        )}
        <Action
          title="Log out"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await session.signOut();
              onClose();
            })
          }
        />
      </View>
      <View style={s.card}>
        <Text style={s.h2}>Delete account</Text>
        <Text style={s.body}>
          Removes your profile, follows, device registrations, and private
          notification history. Public project edits remain anonymized. Cancel
          any store subscription separately to stop billing.
        </Text>
        {capabilities.deletion && account.role !== "admin" ? (
          <>
            <Field
              label="Type DELETE to confirm"
              value={confirm}
              onChange={setConfirm}
            />
            <Action
              title="Permanently delete my account"
              disabled={busy || confirm !== "DELETE"}
              onPress={() =>
                void run(async () => {
                  await api("/api/me", "DELETE", { confirm });
                  await session.signOut();
                  onClose();
                })
              }
            />
          </>
        ) : (
          <Text style={s.notice}>
            {account.role === "admin"
              ? "The sole administrator is protected from deletion; transfer ownership through the server operator first."
              : "Account deletion needs identity-management configuration."}
          </Text>
        )}
      </View>
    </>
  ) : (
    authUI
  );
  const subscription = (
    <View style={s.card}>
      <Text style={s.h2}>BuildWatch Plus</Text>
      <Text style={s.price}>$9.99 / month</Text>
      <Text style={s.body}>
        Unlimited followed developments, personalized tracking, project-update
        notifications, public-meeting updates, and meeting reminders.
      </Text>
      <Text style={s.body}>
        Current plan: {account?.plus ? "Plus benefits active" : "Free"}
        {account?.expires
          ? ` · Paid access through ${new Date(account.expires).toLocaleDateString()}`
          : ""}
      </Text>
      <Text style={s.body}>
        After paid access expires, all saved developments are retained. One
        remains actively tracked; you can choose which one in My Following.
      </Text>
      {!account ? (
        <Action title="Sign in to upgrade" onPress={() => setScreen("Login")} />
      ) : account.role !== "user" ? (
        <Text style={s.notice}>
          Your {account.role} role includes Plus tracking benefits at no charge.
        </Text>
      ) : capabilities.billing && billingConfigured ? (
        <>
          {!account.plus && (
            <Action
              title="View monthly subscription checkout"
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await buy(account.id);
                  await api("/api/billing/sync", "POST");
                  await session.refresh();
                  setMessage("Purchase checked with the billing server.");
                })
              }
            />
          )}
          <Action
            title={
              Platform.OS === "web"
                ? "Refresh subscription"
                : "Restore purchases"
            }
            disabled={busy}
            onPress={() =>
              void run(async () => {
                await restore(account.id);
                await api("/api/billing/sync", "POST");
                await session.refresh();
                setMessage("Purchases refreshed.");
              })
            }
          />
        </>
      ) : (
        <Text style={s.notice}>
          Purchasing is not enabled. Store products and billing verification
          must be configured and tested first. No payment will be taken here.
        </Text>
      )}
      {account?.managementURL && (
        <Action
          title="Manage or cancel subscription"
          onPress={() => void Linking.openURL(account.managementURL!)}
        />
      )}
      <Text style={s.body}>
        iPhone purchases: manage or cancel in Apple Settings → your name →
        Subscriptions. Web purchases: use your billing provider’s management
        portal. Deleting BuildWatch does not cancel a subscription. The checkout
        shows your localized store price and renewal terms.
      </Text>
    </View>
  );
  const prefs = account && (
    <View style={s.card}>
      <Text style={s.h2}>Notifications</Text>
      <Text style={s.body}>
        In-app updates are created from changes to actively followed projects.
        Meeting reminders are created within 24 hours of a meeting.
      </Text>
      {(["enabled", "updates", "meetings", "reminders"] as const).map((key) => (
        <View key={key} style={s.toggle}>
          <Text style={[s.label, { flex: 1 }]}>
            {
              {
                enabled: "Enable notifications",
                updates: "Development updates",
                meetings: "Public meeting updates",
                reminders: "Meeting reminders",
              }[key]
            }
          </Text>
          <Switch
            accessibilityLabel={key}
            disabled={busy}
            value={account.preferences[key]}
            onValueChange={(value) =>
              void run(async () => {
                await api("/api/me", "PATCH", {
                  preferences: { ...account.preferences, [key]: value },
                });
                await session.refresh();
              })
            }
          />
        </View>
      ))}
      {capabilities.push && Platform.OS !== "web" ? (
        <Action
          title="Enable notifications on this iPhone"
          disabled={busy}
          onPress={() =>
            void run(async () => {
              await enablePush();
              setMessage("This device is registered for notifications.");
            })
          }
        />
      ) : (
        <Text style={s.notice}>
          Device push delivery is not activated for this app. Use the in-app
          Notifications inbox. No device permission is requested automatically.
        </Text>
      )}
    </View>
  );
  const editableMatches = screen === "Edit Map" ? items as Project[] : [];
  return (
    <Modal visible animationType="slide" onRequestClose={onClose}>
      <SafeAreaView style={s.page}>
        <View style={s.top}>
          <Text style={s.title}>{screen === "Login" ? "Account" : screen}</Text>
          <Action title="Done" onPress={onClose} />
        </View>
        <ScrollView
          contentContainerStyle={s.content}
          keyboardShouldPersistTaps="handled"
        >
          {!!session.error && <Text style={s.notice}>{session.error}</Text>}
          {!!message && (
            <Text accessibilityRole="alert" style={s.notice}>
              {message}
            </Text>
          )}
          {screen === "Login" && authUI}
          {screen === 'Administrator Security'&&<AdministratorAccess/>}
          {(screen === "Settings" || screen === "Account") && (
            <>
              {screen==='Settings'&&<View style={s.card}>
                <Text style={s.h2}>Display</Text>
                <Text style={s.body}>Current layout: {layout.mobile?'Phone version':'Web version'}. Saved on this device.</Text>
                <Action title={layout.mobile?'Switch to web version':'Switch to phone version'} onPress={()=>layout.choose(layout.mobile?'web':'phone')}/>
                {layout.preference!=='auto'&&<Action title="Use automatic layout" onPress={()=>layout.choose('auto')}/>}
                {!!layout.error&&<Text accessibilityRole="alert" style={s.notice}>{layout.error}</Text>}
              </View>}
              {accountUI}
              {admin&&Platform.OS==='web'&&<Action title="Set up or manage free administrator MFA" onPress={()=>setScreen('Administrator Security')}/>}
              {screen === "Settings" && (
                <>
                  {prefs}
                  {subscription}
                  <Action
                    title="Help & Feedback"
                    onPress={() => setScreen("Help & Feedback")}
                  />
                  {capabilities.privacyURL ? (
                    <Action
                      title="Privacy Policy"
                      onPress={() =>
                        void Linking.openURL(capabilities.privacyURL!)
                      }
                    />
                  ) : (
                    <Text style={s.notice}>
                      Privacy policy has not been published yet.
                    </Text>
                  )}
                  {capabilities.termsURL ? (
                    <Action
                      title="Terms of Service"
                      onPress={() =>
                        void Linking.openURL(capabilities.termsURL!)
                      }
                    />
                  ) : (
                    <Text style={s.notice}>
                      Terms of service have not been published yet.
                    </Text>
                  )}
                </>
              )}
              {account && (
                <View style={s.card}>
                  <Text style={s.h2}>Accept a collaborator invitation</Text>
                  <Field
                    label="Invitation token"
                    value={invite}
                    onChange={setInvite}
                  />
                  <Action
                    title="Accept invitation"
                    disabled={busy || !invite.trim()}
                    onPress={() =>
                      void run(async () => {
                        await api("/api/invitations/accept", "POST", {
                          token: invite,
                        });
                        setInvite("");
                        await session.refresh();
                        setMessage("Collaborator access granted.");
                      })
                    }
                  />
                </View>
              )}
            </>
          )}
          {screen === "BuildWatch Plus" && subscription}
          {screen === "My Following" &&
            (account ? (
              <>
                <Text style={s.body}>
                  Saved developments remain here when Plus expires. Only active
                  developments generate updates.
                </Text>
                {items.length === 0 && (
                  <Text style={s.body}>
                    You are not following any developments yet.
                  </Text>
                )}
                {(items as Follow[]).map((item) => (
                  <View key={item.projectId} style={s.card}>
                    <Text style={s.h2}>{item.name}</Text>
                    <Text style={s.body}>
                      {item.terminal ? `${item.terminal} · tracking ended` : item.active
                        ? "Actively tracking"
                        : "Saved · tracking paused"}
                    </Text>
                    {!item.terminal && <Action
                      title="View development"
                      onPress={() => onProject(item.projectId)}
                    />}
                    {!item.active && !item.terminal && (
                      <Action
                        title="Make this my active development"
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            await api(
                              `/api/follows/${item.projectId}/activate`,
                              "POST",
                            );
                            await load();
                          })
                        }
                      />
                    )}
                    <Action
                      title="Unfollow"
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await api(`/api/follows/${item.projectId}`, "DELETE");
                          await load();
                        })
                      }
                    />
                  </View>
                ))}
              </>
            ) : (
              authUI
            ))}
          {screen === "Notifications" &&
            (account ? (
              <>
                {prefs}
                <Action
                  title="Mark all as read"
                  disabled={busy}
                  onPress={() =>
                    void run(async () => {
                      await api("/api/notifications/read", "POST");
                      await load();
                    })
                  }
                />
                {items.length === 0 && (
                  <Text style={s.body}>
                    No updates yet. Follow a development to receive future
                    updates.
                  </Text>
                )}
                {(items as InboxItem[]).map((item) => (
                  <View key={item.id} style={s.card}>
                    <Text style={s.h2}>
                      {item.title}
                      {item.read ? "" : " · New"}
                    </Text>
                    <Text style={s.body}>{item.body}</Text>
                    <Text style={s.body}>
                      {new Date(item.created).toLocaleString()}
                    </Text>
                    <Action
                      title="Open development"
                      onPress={() => onProject(item.projectId)}
                    />
                  </View>
                ))}
              </>
            ) : (
              authUI
            ))}
          {(screen === "Help & Feedback" || screen === "Suggest an Update") &&
            (account ? (
              <View style={s.card}>
                <Text style={s.h2}>
                  {screen === "Suggest an Update"
                    ? project?.name
                    : "Contact BuildWatch"}
                </Text>
                <Text style={s.body}>
                  Your message goes privately to the administrator. Corrections
                  require review before the map changes.
                </Text>
                {screen === "Help & Feedback" && (
                  <View style={s.wrap}>
                    {[
                      ["Contact Support", "support"],
                      ["Report a Bug", "bug"],
                      ["Suggest a Feature", "feature"],
                      ["Ask a Question", "question"],
                    ].map(([label, value]) => (
                      <Action
                        title={`${kind === value ? "✓ " : ""}${label}`}
                        key={value}
                        onPress={() => setKind(value)}
                      />
                    ))}
                  </View>
                )}
                <Field
                  label="Your message and relevant meeting information"
                  value={body}
                  onChange={setBody}
                  multiline
                />
                {screen === "Suggest an Update" && (
                  <>
                    <Field
                      label="Proposed description (optional)"
                      value={description}
                      onChange={setDescription}
                      multiline
                    />
                    <Text style={s.label}>Proposed status (optional)</Text>
                    <View style={s.wrap}>
                      {statuses.map((status) => (
                        <Action
                          key={status}
                          title={`${proposedStatus === status ? "✓ " : ""}${status}`}
                          onPress={() =>
                            setProposedStatus(
                              proposedStatus === status ? "" : status,
                            )
                          }
                        />
                      ))}
                    </View>
                    <Field
                      label="Public source or document HTTPS link (optional)"
                      value={source}
                      onChange={setSource}
                    />
                  </>
                )}
                <Action
                  title="Submit privately for review"
                  disabled={busy || !body.trim()}
                  onPress={() =>
                    void run(async () => {
                      const patch: any = {};
                      if (description.trim()) patch.description = description;
                      if (proposedStatus) patch.status = proposedStatus;
                      if (source.trim())
                        patch.sources = [
                          ...(project?.sources || []),
                          { title: "Submitted source", url: source },
                        ];
                      await api("/api/submissions", "POST", {
                        kind:
                          screen === "Suggest an Update" ? "correction" : kind,
                        projectId: project?.id,
                        body,
                        patch: Object.keys(patch).length ? patch : undefined,
                      });
                      setBody("");
                      setDescription("");
                      setSource("");
                      setProposedStatus("");
                      setMessage(
                        "Submitted privately to the administrator. Thank you.",
                      );
                    })
                  }
                />
              </View>
            ) : (
              authUI
            ))}
          {screen === "Edit Map" &&
            (editor ? (
              <>
                <View style={s.card}>
                  <Text style={s.h2}>Maintain the shared development map</Text>
                  <Text style={s.body}>
                    Add a location pin or update an existing development.
                    Publishing updates the shared map and records your account
                    and the project revision.
                  </Text>
                  <Action
                    title="+ Add development"
                    onPress={() => onEdit(null)}
                  />
                  <Field
                    label="Search developments to edit"
                    value={editSearch}
                    onChange={setEditSearch}
                  />
                  <Action
                    title="Refresh project list"
                    disabled={busy}
                    onPress={() => void run(load)}
                  />
                </View>
                {editableMatches.map((p) => (
                    <View key={p.id} style={s.card}>
                      <Text style={s.h2}>{p.name}</Text>
                      <Text style={s.body}>
                        {p.address} · {p.neighborhood}
                      </Text>
                      <Text style={s.body}>
                        {p.status} · Revision {p.revision || 1}
                      </Text>
                      <View style={s.wrap}>
                        <Action
                          title={`Edit ${p.name}`}
                          onPress={() => onEdit(p)}
                        />
                        <Action
                          title={`History for ${p.name}`}
                          disabled={busy}
                          onPress={() =>
                            void run(async () =>
                              setHistory(
                                await api(`/api/projects/${p.id}/history`),
                              ),
                            )
                          }
                        />
                      </View>
                    </View>
                  ))}
                {editCursor && <Action title="Show more matching developments" disabled={busy} onPress={() => void run(()=>loadEditable(editCursor))} />}
                {history && (
                  <View style={s.card}>
                    <Text style={s.h2}>Saved editing history</Text>
                    {!history.length && (
                      <Text style={s.body}>
                        No edits have been published since this project was
                        imported.
                      </Text>
                    )}
                    {history.map((row) => (
                      <View key={row.id}>
                        <Text style={s.label}>
                          Revision {JSON.parse(row.after_data).revision} ·{" "}
                          {new Date(row.created).toLocaleString()}
                        </Text>
                        <Text style={s.body}>Editor: {row.actor}</Text>
                        <Text style={s.body}>
                          {JSON.parse(row.after_data).name} ·{" "}
                          {JSON.parse(row.after_data).status}
                        </Text>
                      </View>
                    ))}
                    <Action
                      title="Close history"
                      onPress={() => setHistory(null)}
                    />
                  </View>
                )}
              </>
            ) : (
              <View style={s.card}>
                <Text style={s.notice}>
                  A verified collaborator account or an administrator session
                  with MFA is required to modify the map.
                </Text>
                {admin && (
                  <Action
                    title="Complete administrator verification"
                    disabled={busy}
                    onPress={() =>
                      void run(() => session.signIn(undefined, true))
                    }
                  />
                )}
              </View>
            ))}
          {screen === "Project Management" &&
            (editor ? (
              <>
                {items.length === 0 && (
                  <Text style={s.body}>
                    Projects you publish or edit will appear here.
                  </Text>
                )}
                {items.map((p) => (
                  <View key={p.id} style={s.card}>
                    <Text style={s.h2}>{p.name}</Text>
                    <Text style={s.body}>{p.status}</Text>
                    <Action
                      title="Open project and editing tools"
                      onPress={() => onProject(p.id)}
                    />
                  </View>
                ))}
              </>
            ) : (
              <Text style={s.notice}>Collaborator access is required.</Text>
            ))}
          {screen === "Admin Dashboard" &&
            (admin ? (
              <>
                {!account?.mfa && (
                  <Text style={s.notice}>
                    Sign in again with MFA to use administrator tools.
                  </Text>
                )}
                {!account?.mfa && (
                  <Action
                    title="Complete administrator verification"
                    disabled={busy}
                    onPress={() =>
                      void run(() => session.signIn(undefined, true))
                    }
                  />
                )}
                {(
                  [
                    "Edit Map",
                    "Manage Users",
                    "Invite Collaborators",
                    "Review Submissions",
                    "Editing History",
                    "Archived Projects",
                    "Automation Management",
                    "Proposed Map Updates",
                    "Potential Duplicates",
                    "Classification Review",
                  ] as Panel[]
                ).map((label) => (
                  <Action
                    key={label}
                    title={label}
                    onPress={() => setScreen(label)}
                  />
                ))}
              </>
            ) : (
              <Text style={s.notice}>Administrator access is required.</Text>
            ))}
          {screen === "Automation Management" && (admin && account?.mfa ? <AutomationManagement onReview={()=>setScreen("Proposed Map Updates")} onDuplicates={()=>setScreen("Potential Duplicates")} onArchives={()=>setScreen("Archived Projects")}/> : <Text style={s.notice}>An administrator session with MFA is required.</Text>)}
          {screen === "Archived Projects" && (admin && account?.mfa ? <ArchivedProjects onDuplicates={()=>setScreen("Potential Duplicates")}/> : <Text style={s.notice}>An administrator session with MFA is required.</Text>)}
          {screen === "Proposed Map Updates" && (admin && account?.mfa ? <ResearchReview onAdd={()=>onEdit(null)} onDuplicates={()=>setScreen("Potential Duplicates")} onEdit={id=>void run(async()=>{const record=await api('/api/admin/records/'+id);onEdit(record.profile);})}/> : <Text style={s.notice}>An administrator session with MFA is required. Open Admin Dashboard to complete verification.</Text>)}
          {(screen === "Potential Duplicates" || screen === "Classification Review") && (admin && account?.mfa ? (screen === "Potential Duplicates" ? <DuplicateManagement/> : <ClassificationCandidates/>) : <Text style={s.notice}>An administrator session with MFA is required. Open Admin Dashboard to complete verification.</Text>)}
          {screen === "Manage Users" &&
            admin &&
            items.map((u) => (
              <View key={u.id} style={s.card}>
                <Text style={s.h2}>{u.name}</Text>
                <Text style={s.body}>
                  {u.email} · {u.role}
                  {u.disabled ? " · Disabled" : ""}
                </Text>
                {u.role !== "admin" && (
                  <>
                    <Action
                      title={
                        u.role === "collaborator"
                          ? "Revoke collaborator access"
                          : "Grant collaborator access"
                      }
                      disabled={busy || !u.verified}
                      onPress={() =>
                        void run(async () => {
                          await api(`/api/admin/users/${u.id}`, "PATCH", {
                            role:
                              u.role === "collaborator"
                                ? "user"
                                : "collaborator",
                          });
                          await load();
                        })
                      }
                    />
                    <Action
                      title={u.disabled ? "Enable account" : "Disable account"}
                      disabled={busy}
                      onPress={() =>
                        void run(async () => {
                          await api(`/api/admin/users/${u.id}`, "PATCH", {
                            disabled: !u.disabled,
                          });
                          await load();
                        })
                      }
                    />
                  </>
                )}
              </View>
            ))}
          {screen === "Invite Collaborators" && admin && (
            <>
              <View style={s.card}>
                <Text style={s.body}>
                  Invite a verified email address. Links are single-use and
                  expire after seven days by default. Share the generated link
                  privately with the intended collaborator.
                </Text>
                <Field
                  label="Collaborator email"
                  value={email}
                  onChange={setEmail}
                />
                <Action
                  title="Create invitation"
                  disabled={busy || !email.trim()}
                  onPress={() =>
                    void run(async () => {
                      const result = await api(
                        "/api/admin/invitations",
                        "POST",
                        { email },
                      );
                      setInviteURL(result.url);
                      await load();
                    })
                  }
                />
                {!!inviteURL && (
                  <Text selectable style={s.body}>
                    {inviteURL}
                  </Text>
                )}
              </View>
              {items.map((i, index) => (
                <View key={index} style={s.card}>
                  <Text style={s.body}>
                    {i.email} ·{" "}
                    {i.accepted
                      ? "Accepted"
                      : new Date(i.expires).toLocaleString()}
                  </Text>
                </View>
              ))}
            </>
          )}
          {screen === "Review Submissions" && admin && (
            <>
              {items.length === 0 && (
                <Text style={s.body}>
                  No corrections or feedback have been submitted.
                </Text>
              )}
              {items.map((item) => (
                <View key={item.id} style={s.card}>
                  <Text style={s.h2}>
                    {item.kind} · {item.status}
                  </Text>
                  <Text style={s.body}>{item.email || "Deleted account"}</Text>
                  <Text style={s.body}>{item.body}</Text>
                  {item.patch && (
                    <Text selectable style={s.body}>
                      {item.patch}
                    </Text>
                  )}
                  {item.status === "pending" && (
                    <>
                      {item.kind === "correction" && (
                        <Action
                          title="Review proposed changes"
                          onPress={() => {
                            setReview(item);
                            setPatch(item.patch || "{}");
                          }}
                        />
                      )}
                      <Action
                        title={
                          item.kind === "correction"
                            ? "Reject correction"
                            : "Mark resolved"
                        }
                        disabled={busy}
                        onPress={() =>
                          void run(async () => {
                            await api(
                              `/api/admin/submissions/${item.id}`,
                              "POST",
                              {
                                action:
                                  item.kind === "correction"
                                    ? "reject"
                                    : "resolved",
                              },
                            );
                            await load();
                          })
                        }
                      />
                    </>
                  )}
                </View>
              ))}
              {review && (
                <View style={s.card}>
                  <Text style={s.h2}>Reviewed project fields</Text>
                  <Text style={s.body}>
                    Only these fields will change. Include new meetings or
                    sources as arrays. Verify the submission against its sources
                    before approval.
                  </Text>
                  <Field
                    label="Approved fields (JSON)"
                    value={patch}
                    onChange={setPatch}
                    multiline
                  />
                  <Action
                    title="Approve and publish correction"
                    disabled={busy}
                    onPress={() =>
                      void run(async () => {
                        await api(
                          `/api/admin/submissions/${review.id}`,
                          "POST",
                          { action: "approve", patch: JSON.parse(patch) },
                        );
                        setReview(null);
                        await load();
                        setMessage(
                          "Correction published and recorded in project history.",
                        );
                      })
                    }
                  />
                </View>
              )}
            </>
          )}
          {screen === "Editing History" &&
            admin &&
            items.map((item, index) => (
              <View key={index} style={s.card}>
                <Text style={s.h2}>
                  {item.kind === "role" ? "Permission change" : item.project_id}
                </Text>
                <Text style={s.body}>
                  By {item.actor} · {new Date(item.created).toLocaleString()}
                </Text>
                <Text selectable style={s.body}>
                  {item.action || item.after_data}
                </Text>
              </View>
            ))}
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
const s = StyleSheet.create({
  page: { flex: 1, backgroundColor: "#F6F7F2" },
  top: {
    padding: 18,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  title: { fontSize: 24, fontWeight: "800", color: "#163A30", flexShrink: 1 },
  content: {
    padding: 22,
    gap: 16,
    width: "100%",
    maxWidth: 850,
    alignSelf: "center",
  },
  card: {
    padding: 20,
    backgroundColor: "#FFFFFF",
    borderColor: "#DCE5D9",
    borderWidth: 1,
    borderRadius: 16,
    gap: 14,
  },
  h2: { fontSize: 20, fontWeight: "700", color: "#163A30" },
  body: { fontSize: 14, lineHeight: 22, color: "#486355" },
  label: { fontSize: 14, color: "#234D35", fontWeight: "600" },
  input: {
    padding: 13,
    fontSize: 16,
    color: "#173C30",
    backgroundColor: "#F7F9F3",
    borderWidth: 1,
    borderColor: "#CFDCCE",
    borderRadius: 10,
  },
  button: {
    padding: 13,
    backgroundColor: "#E3EBDD",
    borderRadius: 10,
    alignSelf: "flex-start",
  },
  buttonText: { color: "#164A37", fontWeight: "700", fontSize: 14 },
  notice: {
    padding: 14,
    color: "#78542B",
    backgroundColor: "#F3EBDC",
    borderRadius: 10,
    fontSize: 14,
    lineHeight: 22,
  },
  toggle: { flexDirection: "row", gap: 16, alignItems: "center" },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  price: { fontSize: 28, fontWeight: "800", color: "#164A37" },
});
