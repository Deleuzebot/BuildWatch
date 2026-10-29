CREATE OR REPLACE FUNCTION public.buildwatch_shadow_admin(identity jsonb,input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,buildwatch AS $fn$
DECLARE actor jsonb; rid uuid; BEGIN
 actor=bw_actor(identity,'admin');
 IF input->>'runId' IS NOT NULL THEN
  IF input->>'runId' !~ '^[a-f0-9-]{36}$' THEN PERFORM bw_fail(400,'Invalid shadow run.'); END IF;
  rid=(input->>'runId')::uuid;
  IF NOT EXISTS(SELECT 1 FROM maintenance_runs WHERE id=rid AND dry_run AND request_key LIKE 'nc-shadow:%') THEN PERFORM bw_fail(404,'Shadow run not found.'); END IF;
 END IF;
 RETURN jsonb_build_object('control',(SELECT to_jsonb(c) FROM shadow_control c WHERE id=1),'runs',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY created DESC) FROM (SELECT id,created,status,stats FROM maintenance_runs WHERE dry_run AND request_key LIKE 'nc-shadow:%' ORDER BY created DESC LIMIT 10) r),'[]'),'run',(SELECT to_jsonb(r) FROM maintenance_runs r WHERE r.id=rid),'findings',coalesce((SELECT jsonb_agg(f.data||jsonb_build_object('id',f.id) ORDER BY f.source_id,f.external_id) FROM shadow_findings f JOIN shadow_run_findings s ON s.finding_id=f.id WHERE s.run_id=rid),'[]'));
END $fn$;
DO $copy$ DECLARE f text;BEGIN SELECT pg_get_functiondef('public.buildwatch_shadow_admin(jsonb,jsonb)'::regprocedure) INTO f;f=replace(f,'public.buildwatch_shadow_admin','buildwatch_audit.buildwatch_shadow_admin');f=regexp_replace(f,'\mbuildwatch\M','buildwatch_audit','g');EXECUTE f;END $copy$;
