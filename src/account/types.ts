export type Role = "user" | "collaborator" | "admin";
export type Preferences = {
  enabled: boolean;
  updates: boolean;
  meetings: boolean;
  reminders: boolean;
};
export type Account = {
  id: string;
  email: string;
  name: string;
  role: Role;
  verified: boolean;
  plus: boolean;
  expires: number;
  store: string;
  managementURL: string | null;
  preferences: Preferences;
  methods: string[];
  mfa: boolean;
};
export type Capabilities = {
  auth: boolean;
  billing: boolean;
  push: boolean;
  linking: boolean;
  deletion: boolean;
  privacyURL: string | null;
  termsURL: string | null;
};
export type Follow = { projectId: string; active: boolean; name: string; terminal?:string };
export type InboxItem = {
  id: string;
  projectId: string;
  title: string;
  body: string;
  created: number;
  read: boolean;
};
