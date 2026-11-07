CREATE OR REPLACE FUNCTION public.buildwatch_supabase_identity(input jsonb) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,buildwatch AS $$
DECLARE uid uuid=(input->>'authUserId')::uuid; sid uuid=(input->>'sessionId')::uuid; email_value text; provider_value text;
BEGIN
 IF NOT EXISTS(SELECT 1 FROM auth.sessions WHERE id=sid AND user_id=uid AND (not_after IS NULL OR not_after>statement_timestamp())) THEN
  PERFORM buildwatch.bw_fail(401,'A live BuildWatch session is required.');
 END IF;
 SELECT lower(email) INTO email_value FROM auth.users WHERE id=uid AND email_confirmed_at IS NOT NULL;
 IF email_value IS NULL THEN PERFORM buildwatch.bw_fail(401,'Verify your BuildWatch email before signing in.');END IF;
 IF EXISTS(SELECT 1 FROM buildwatch.admin_login_bindings WHERE auth_user_id=uid) THEN
  IF input->>'passwordAuthenticated' IS DISTINCT FROM 'true' THEN PERFORM buildwatch.bw_fail(401,'Use the administrator password and Duo login. Google accounts cannot open administrator access.');END IF;
  IF input->>'mfa' IS DISTINCT FROM 'true' THEN PERFORM buildwatch.bw_fail(401,'Verify your BuildWatch Duo code to open the administrator account.');END IF;
  RETURN public.buildwatch_admin_security('resolve','{}',input);
 END IF;
 -- No email-based account merge. Privileges remain in BuildWatch's existing users table.
 SELECT provider INTO provider_value FROM auth.identities WHERE user_id=uid ORDER BY created_at LIMIT 1;
 RETURN jsonb_build_object('subject','supabase|'||uid::text,'email',email_value,'name',email_value,'verified',true,
  'methods',jsonb_build_array(CASE WHEN provider_value='google' THEN 'supabase-google' ELSE 'supabase-email' END),
  'mfa',coalesce((input->>'mfa')::boolean,false),'authenticatedAt',coalesce((input->>'authenticatedAt')::bigint,0));
END $$;
REVOKE ALL ON FUNCTION public.buildwatch_supabase_identity(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_supabase_identity(jsonb) TO service_role;
NOTIFY pgrst,'reload schema';
