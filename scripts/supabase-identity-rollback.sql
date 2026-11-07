BEGIN;

DO $$
DECLARE uid uuid=gen_random_uuid();sid uuid=gen_random_uuid();value jsonb;admin_row record;
BEGIN
 INSERT INTO auth.users(id,email,email_confirmed_at,created_at,updated_at) VALUES(uid,'buildwatch-rollback-fixture@example.invalid',now(),now(),now());
 INSERT INTO auth.sessions(id,user_id,aal,created_at,updated_at) VALUES(sid,uid,'aal1',now(),now());
 value=public.buildwatch_supabase_identity(jsonb_build_object('authUserId',uid,'sessionId',sid,'mfa',false,'authenticatedAt',0));
 IF value->>'subject'<>'supabase|'||uid::text OR value->>'mfa'<>'false' THEN RAISE EXCEPTION 'ordinary identity mismatch';END IF;
 IF EXISTS(SELECT 1 FROM buildwatch.users WHERE subject='supabase|'||uid::text) THEN RAISE EXCEPTION 'identity resolution must not create accounts';END IF;
 BEGIN
  PERFORM public.buildwatch_supabase_identity(jsonb_build_object('authUserId',uid,'sessionId',gen_random_uuid(),'mfa',true));
  RAISE EXCEPTION 'missing session accepted';
 EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'BW401:%' THEN RAISE;END IF;END;
 FOR admin_row IN SELECT b.auth_user_id,s.id FROM buildwatch.admin_login_bindings b JOIN auth.sessions s ON s.user_id=b.auth_user_id WHERE s.aal='aal2' LIMIT 1 LOOP
  BEGIN
   PERFORM public.buildwatch_supabase_identity(jsonb_build_object('authUserId',admin_row.auth_user_id,'sessionId',admin_row.id,'mfa',false));
   RAISE EXCEPTION 'administrator MFA bypass';
  EXCEPTION WHEN OTHERS THEN IF SQLERRM NOT LIKE 'BW401:%' THEN RAISE;END IF;END;
  value=public.buildwatch_supabase_identity(jsonb_build_object('authUserId',admin_row.auth_user_id,'sessionId',admin_row.id,'mfa',true,'authenticatedAt',(extract(epoch from now())*1000)::bigint));
  IF NOT (value->'methods' ? 'supabase-admin') OR value->>'mfa'<>'true' THEN RAISE EXCEPTION 'existing administrator binding lost';END IF;
 END LOOP;
END $$;
ROLLBACK;
