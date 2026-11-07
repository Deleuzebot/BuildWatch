export type Identity = {
  subject: string;
  email: string;
  name: string;
  verified: boolean;
  methods: string[];
  mfa: boolean;
  authenticatedAt: number;
  mfaAuthenticatedAt?: number;
};
export type Verify = (token: string) => Promise<Identity>;
// The local SQLite account service is retained for isolated tests only.
// Production accounts use server/supabase/admin-auth.ts and never an external issuer.
export function verifier(): Verify {return async()=>{throw Object.assign(Error('Use the Supabase BuildWatch backend to sign in.'),{status:410});};}
export async function management(_path:string,_method='GET',_body?:unknown):Promise<any>{throw Object.assign(Error('Legacy identity management is retired.'),{status:410});}
