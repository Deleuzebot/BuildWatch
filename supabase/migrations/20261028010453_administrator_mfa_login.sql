SET search_path=buildwatch,pg_catalog;
CREATE TABLE IF NOT EXISTS buildwatch.admin_login_bindings(
 auth_user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
 user_id text NOT NULL UNIQUE REFERENCES buildwatch.users(id) ON DELETE CASCADE,
 created bigint NOT NULL,last_used bigint
);
ALTER TABLE buildwatch.admin_login_bindings ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON buildwatch.admin_login_bindings FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.buildwatch_admin_security(action text,identity jsonb DEFAULT '{}',input jsonb DEFAULT '{}') RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,buildwatch AS $$
#variable_conflict use_column
DECLARE owner jsonb;uid uuid;sid uuid;account_id text;linked_id text;auth_email text;factor_count integer;now_ms bigint=buildwatch.bw_now();
BEGIN
 IF action='resolve' THEN
  uid=(input->>'authUserId')::uuid;sid=(input->>'sessionId')::uuid;
  SELECT b.user_id INTO account_id FROM buildwatch.admin_login_bindings b
   JOIN buildwatch.users u ON u.id=b.user_id
   WHERE b.auth_user_id=uid AND u.role='admin' AND u.disabled=0 AND u.verified=1;
  IF account_id IS NULL THEN PERFORM buildwatch.bw_fail(403,'This Supabase login is not linked to an active administrator.');END IF;
 ELSIF action IN('status','authorize_setup','link') THEN
  owner=buildwatch.bw_actor(identity,'admin');account_id=owner->>'id';
  IF action='status' THEN RETURN jsonb_build_object('linked',EXISTS(SELECT 1 FROM buildwatch.admin_login_bindings WHERE user_id=account_id),'accountId',account_id,'provider',CASE WHEN identity->'methods' ? 'supabase-admin' THEN 'supabase' ELSE 'auth0' END);END IF;
  IF identity->'methods' ? 'supabase-admin' OR coalesce((identity->>'authenticatedAt')::bigint,0)<now_ms-900000 OR coalesce((identity->>'authenticatedAt')::bigint,0)>now_ms+30000 THEN PERFORM buildwatch.bw_fail(403,'Sign in again with your original Auth0 MFA before linking administrator access.');END IF;
  IF action='authorize_setup' THEN
   IF EXISTS(SELECT 1 FROM buildwatch.admin_login_bindings WHERE user_id=account_id) THEN PERFORM buildwatch.bw_fail(409,'Administrator login is already linked. Use its password and authenticator to sign in.');END IF;
   RETURN jsonb_build_object('email',owner->>'email','accountId',account_id);
  END IF;
  uid=(input->>'authUserId')::uuid;sid=(input->>'sessionId')::uuid;
 ELSE PERFORM buildwatch.bw_fail(404,'Unknown administrator security operation.');END IF;
 IF NOT EXISTS(SELECT 1 FROM auth.sessions s JOIN auth.mfa_factors f ON f.id=s.factor_id AND f.user_id=s.user_id
   WHERE s.id=sid AND s.user_id=uid AND s.aal='aal2' AND (s.not_after IS NULL OR s.not_after>statement_timestamp()) AND f.factor_type='totp' AND f.status='verified') THEN
  PERFORM buildwatch.bw_fail(403,'A live administrator session verified by an enrolled authenticator is required.');END IF;
 SELECT lower(email) INTO auth_email FROM auth.users WHERE id=uid AND email_confirmed_at IS NOT NULL;
 IF auth_email IS NULL THEN PERFORM buildwatch.bw_fail(403,'A verified administrator identity is required.');END IF;
 IF action='link' THEN
  IF auth_email<>lower(owner->>'email') THEN PERFORM buildwatch.bw_fail(403,'Use your verified administrator email for both sign-ins. Email alone never grants access.');END IF;
  SELECT count(*) INTO factor_count FROM auth.mfa_factors WHERE user_id=uid AND factor_type='totp' AND status='verified';
  IF factor_count<2 THEN PERFORM buildwatch.bw_fail(403,'Verify a primary and backup authenticator before linking.');END IF;
  PERFORM pg_advisory_xact_lock(72644323);
  SELECT user_id INTO linked_id FROM buildwatch.admin_login_bindings WHERE auth_user_id=uid;
  IF linked_id IS NOT NULL AND linked_id<>account_id THEN PERFORM buildwatch.bw_fail(409,'That identity is already linked to another account.');END IF;
  IF EXISTS(SELECT 1 FROM buildwatch.admin_login_bindings WHERE user_id=account_id AND auth_user_id<>uid) THEN PERFORM buildwatch.bw_fail(409,'An administrator identity is already linked. Recovery requires the protected operator procedure.');END IF;
  INSERT INTO buildwatch.admin_login_bindings VALUES(uid,account_id,now_ms,NULL) ON CONFLICT DO NOTHING;
  IF linked_id IS NULL THEN INSERT INTO buildwatch.role_audit VALUES(gen_random_uuid()::text,account_id,account_id,'Supabase administrator MFA identity linked; role unchanged',now_ms);END IF;
  RETURN jsonb_build_object('linked',true,'accountId',account_id);
 END IF;
 UPDATE buildwatch.admin_login_bindings SET last_used=now_ms WHERE auth_user_id=uid AND (last_used IS NULL OR last_used<now_ms-300000);
 SELECT to_jsonb(u) INTO owner FROM buildwatch.users u WHERE id=account_id;
 RETURN jsonb_build_object('subject',owner->>'subject','email',owner->>'email','name',owner->>'name','verified',true,'methods',jsonb_build_array('supabase-admin'),'mfa',true,'authenticatedAt',coalesce((input->>'authenticatedAt')::bigint,0));
END $$;
REVOKE ALL ON FUNCTION public.buildwatch_admin_security(text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_admin_security(text,jsonb,jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
