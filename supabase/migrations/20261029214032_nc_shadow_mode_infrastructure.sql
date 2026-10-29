-- Private, NC-only shadow metadata. No publication, archiving or lifecycle calls.
CREATE TABLE buildwatch.shadow_control(id int PRIMARY KEY CHECK(id=1),schedule_enabled boolean NOT NULL DEFAULT false);
INSERT INTO buildwatch.shadow_control VALUES(1,false);
CREATE TABLE buildwatch.shadow_cache(url text PRIMARY KEY,body text NOT NULL CHECK(octet_length(body)<=200000),hash text NOT NULL,status int NOT NULL,etag text,modified text,checked timestamptz NOT NULL DEFAULT now());
CREATE TABLE buildwatch.shadow_state(source_id text PRIMARY KEY CHECK(source_id IN('apex','chapel','raleigh')),cursor int NOT NULL DEFAULT 8 CHECK(cursor>=8),updated timestamptz NOT NULL DEFAULT now());
CREATE TABLE buildwatch.shadow_findings(id text PRIMARY KEY,source_id text NOT NULL,external_id text NOT NULL,data jsonb NOT NULL,created timestamptz NOT NULL DEFAULT now());
CREATE TABLE buildwatch.shadow_run_findings(run_id uuid NOT NULL REFERENCES buildwatch.maintenance_runs(id),finding_id text NOT NULL REFERENCES buildwatch.shadow_findings(id),PRIMARY KEY(run_id,finding_id));
CREATE INDEX shadow_run_finding_lookup ON buildwatch.shadow_run_findings(finding_id);
DO $ddl$ DECLARE t text;BEGIN FOREACH t IN ARRAY ARRAY['shadow_control','shadow_cache','shadow_state','shadow_findings','shadow_run_findings'] LOOP EXECUTE format('ALTER TABLE buildwatch.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('REVOKE ALL ON buildwatch.%I FROM PUBLIC,anon,authenticated,buildwatch_worker',t);END LOOP;END $ddl$;
CREATE OR REPLACE FUNCTION public.buildwatch_shadow(action text,input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,buildwatch,extensions AS $fn$
#variable_conflict use_column
DECLARE r maintenance_runs%ROWTYPE;c maintenance_control%ROWTYPE;v jsonb;ids text[];p jsonb;pid text;u text;sid text;token uuid;month_key date=date_trunc('month',now())::date;
BEGIN
 SELECT * INTO c FROM maintenance_control WHERE id=1;
 IF c.writes_enabled OR c.schedule_enabled OR c.pilot_approved THEN PERFORM bw_fail(403,'Shadow validation requires production gates off.');END IF;
 IF octet_length(input::text)>240000 THEN PERFORM bw_fail(413,'Shadow input ceiling exceeded.');END IF;
 IF action='claim' THEN
  IF input->>'state' IS DISTINCT FROM 'NC' OR input->>'dryRun' IS DISTINCT FROM 'true' OR coalesce(input->>'key','') NOT LIKE 'nc-shadow:%' OR (input->>'scheduled'='true' AND NOT coalesce((SELECT schedule_enabled FROM shadow_control WHERE id=1),false)) THEN PERFORM bw_fail(403,'Only NC shadow runs are authorized; scheduling needs separate activation.');END IF;
  PERFORM pg_advisory_xact_lock(72644330);
  IF NOT EXISTS(SELECT 1 FROM maintenance_states WHERE state='NC' AND active) THEN PERFORM bw_fail(403,'NC inactive.');END IF;
  IF pg_database_size(current_database())>c.database_ceiling THEN PERFORM bw_fail(409,'Database safety ceiling reached.');END IF;
  IF EXISTS(SELECT 1 FROM maintenance_runs WHERE status='running' AND lease_until>now()) THEN PERFORM bw_fail(409,'Another maintenance run owns the lease.');END IF;
  SELECT * INTO r FROM maintenance_runs WHERE request_key=input->>'key' FOR UPDATE;
  IF r.status IN('completed','awaiting_review') THEN RETURN '{"status":"skipped"}';END IF;
  INSERT INTO maintenance_monthly(month) VALUES(month_key) ON CONFLICT DO NOTHING;
  IF EXISTS(SELECT 1 FROM maintenance_monthly WHERE month=month_key AND(requests_reserved+16>c.monthly_requests OR seconds_reserved+120>c.monthly_seconds)) THEN PERFORM bw_fail(429,'Existing monthly budget exhausted; do not raise it automatically.');END IF;
  UPDATE maintenance_monthly SET requests_reserved=requests_reserved+16,seconds_reserved=seconds_reserved+120 WHERE month=month_key;
  UPDATE maintenance_runs SET status='partially_completed',error='Expired lease retained for explicit retry' WHERE status='running' AND lease_until<=now();
  IF r.id IS NULL THEN INSERT INTO maintenance_runs(state,mode,dry_run,request_key) VALUES('NC','weekly',true,input->>'key') RETURNING * INTO r;END IF;
  token=gen_random_uuid();UPDATE maintenance_runs SET status='running',started=coalesce(started,now()),heartbeat=now(),lease=token,lease_until=now()+interval '180 seconds',attempts=attempts+1,github_url=input->>'githubURL',error=NULL WHERE id=r.id RETURNING * INTO r;
  RETURN jsonb_build_object('run',to_jsonb(r),'maxRequests',16,'maxSeconds',120,'maxRecords',48,'cursors',coalesce((SELECT jsonb_object_agg(source_id,cursor) FROM shadow_state),'{}'));
 END IF;
 SELECT * INTO r FROM maintenance_runs WHERE id=(input->>'runId')::uuid FOR UPDATE;
 IF r.id IS NULL OR NOT r.dry_run OR r.state<>'NC' OR r.request_key NOT LIKE 'nc-shadow:%' OR r.status<>'running' OR r.lease IS DISTINCT FROM (input->>'lease')::uuid OR r.lease_until<now() THEN PERFORM bw_fail(403,'Valid NC shadow lease required.');END IF;
 sid=input->>'sourceId';IF sid IS NOT NULL AND sid NOT IN('apex','chapel','raleigh') THEN PERFORM bw_fail(400,'Unsupported shadow source.');END IF;
 IF action IN('cache_read','cache_write') THEN
  u=input->>'url';IF NOT (u~'^https://services1[.]arcgis[.]com/nry3yyvaEfskMEXA/arcgis/rest/services/Development/FeatureServer/0([?]|/query[?])' OR u~'^https://gisweb[.]townofchapelhill[.]org/arcgis/rest/services/MapServices/CurrentDevelopmentActivity/FeatureServer/0([?]|/query[?])' OR u~'^https://services[.]arcgis[.]com/v400IkDOw1ad7Yad/ArcGIS/rest/services/Building_Permits/FeatureServer/0([?]|/query[?])' OR u IN('https://services1.arcgis.com/robots.txt','https://gisweb.townofchapelhill.org/robots.txt','https://services.arcgis.com/robots.txt')) THEN PERFORM bw_fail(400,'Unregistered shadow URL.');END IF;
  IF action='cache_read' THEN RETURN coalesce((SELECT to_jsonb(x) FROM shadow_cache x WHERE url=u),'{}');END IF;
  IF octet_length(input->>'body')>200000 THEN PERFORM bw_fail(413,'Persistent cache entry exceeds 200 KB.');END IF;
  IF coalesce((SELECT sum(octet_length(body)) FROM shadow_cache WHERE url<>u),0)+octet_length(input->>'body')>5000000 THEN PERFORM bw_fail(409,'Private cache ceiling reached; retain work for review.');END IF;
  INSERT INTO shadow_cache VALUES(u,input->>'body',input->>'hash',(input->>'status')::int,input->>'etag',input->>'modified',now()) ON CONFLICT(url) DO UPDATE SET body=excluded.body,hash=excluded.hash,status=excluded.status,etag=excluded.etag,modified=excluded.modified,checked=excluded.checked;
  RETURN '{"saved":true}';
 ELSIF action='context' THEN
  IF length(coalesce(input->>'externalId',''))>160 OR length(coalesce(input->>'name',''))>300 THEN PERFORM bw_fail(400,'Bounded identity required.');END IF;
  IF sid='apex' THEN SELECT array_agg(DISTINCT bw_canonical(project_id)) INTO ids FROM maintenance_refs WHERE source_id='source-8ad50df7b7918cceaf0e16245fd827' AND external_id=input->>'externalId';
  ELSIF sid='chapel' THEN SELECT array_agg(DISTINCT bw_canonical(x.id)) INTO ids FROM project_profiles x WHERE x.data::jsonb->>'state'='NC' AND x.data::jsonb->>'city'='Chapel Hill' AND split_part(lower(x.data::jsonb->>'address'),',',1)=split_part(lower(input->>'address'),',',1) AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(x.data::jsonb->'sources','[]')) s WHERE s->>'url'=input->>'projectPage');
  ELSE SELECT array_agg(DISTINCT bw_canonical(x.id)) INTO ids FROM project_profiles x WHERE x.data::jsonb->>'state'='NC' AND x.data::jsonb->>'city'='Raleigh' AND coalesce(x.data::jsonb->'permitNumbers','[]') ? (input->>'permitNumber');END IF;
  IF cardinality(ids)=1 THEN pid=ids[1];p=bw_project(pid);END IF;
  RETURN jsonb_build_object('ids',coalesce(to_jsonb(ids),'[]'),'project',p,'activity',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM(SELECT type,event_date,source_url,description FROM project_activity WHERE project_id=pid ORDER BY occurred_at DESC LIMIT 200) a),'[]'),'activityComplete',(SELECT count(*)<=200 FROM project_activity WHERE project_id=pid),'approvalPolicy',(SELECT to_jsonb(a) FROM approval_policy a WHERE project_id=pid),'candidates',coalesce((SELECT jsonb_agg(to_jsonb(a)) FROM(SELECT x.id,x.data::jsonb->>'name' name,EXISTS(SELECT 1 FROM archived_inventory WHERE id=x.id) archived FROM project_profiles x WHERE x.data::jsonb->>'state'='NC' AND (lower(x.data::jsonb->>'name')=lower(input->>'name') OR (length(coalesce(input->>'address',''))>8 AND split_part(lower(x.data::jsonb->>'address'),',',1)=split_part(lower(input->>'address'),',',1))) LIMIT 5) a),'[]'));
 ELSIF action='finding' THEN
  IF sid IS NULL OR octet_length((input->'finding')::text)>20000 OR length(input->>'id')<>64 THEN PERFORM bw_fail(400,'Invalid private finding.');END IF;
  INSERT INTO shadow_findings(id,source_id,external_id,data) VALUES(input->>'id',sid,input->>'externalId',input->'finding') ON CONFLICT DO NOTHING;
  INSERT INTO shadow_run_findings VALUES(r.id,input->>'id') ON CONFLICT DO NOTHING;RETURN '{"saved":true}';
 ELSIF action='checkpoint' THEN
  IF sid IS NOT NULL THEN INSERT INTO shadow_state VALUES(sid,greatest(8,(input->>'cursor')::int),now()) ON CONFLICT(source_id) DO UPDATE SET cursor=excluded.cursor,updated=excluded.updated;END IF;
  UPDATE maintenance_runs SET checkpoint=input->'checkpoint',stats=input->'stats',heartbeat=now() WHERE id=r.id;RETURN '{"saved":true}';
 ELSIF action='finish' THEN
  IF input->>'status' NOT IN('completed','awaiting_review','partially_completed','failed') THEN PERFORM bw_fail(400,'Invalid shadow outcome.');END IF;
  UPDATE maintenance_runs SET status=input->>'status',stats=input->'stats',finished=now(),heartbeat=now(),lease_until=now(),error=left(input->>'error',1000) WHERE id=r.id;RETURN '{"saved":true}';
 END IF;
 PERFORM bw_fail(404,'Shadow mode has no publication, merge, expiration or archive operation.');
END $fn$;
REVOKE ALL ON FUNCTION public.buildwatch_shadow(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_shadow(text,jsonb) TO buildwatch_worker,service_role;
CREATE OR REPLACE FUNCTION public.buildwatch_shadow_admin(identity jsonb,input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,buildwatch AS $fn$
DECLARE actor jsonb;BEGIN actor=bw_actor(identity,'admin');RETURN jsonb_build_object('run',(SELECT to_jsonb(r) FROM maintenance_runs r WHERE r.id=(input->>'runId')::uuid AND r.dry_run AND r.request_key LIKE 'nc-shadow:%'),'findings',coalesce((SELECT jsonb_agg(f.data ORDER BY f.source_id,f.external_id) FROM shadow_findings f JOIN shadow_run_findings s ON s.finding_id=f.id WHERE s.run_id=(input->>'runId')::uuid),'[]'));END $fn$;
REVOKE ALL ON FUNCTION public.buildwatch_shadow_admin(jsonb,jsonb) FROM PUBLIC,anon,authenticated,buildwatch_worker;
GRANT EXECUTE ON FUNCTION public.buildwatch_shadow_admin(jsonb,jsonb) TO service_role;
-- Mirror definitions into the existing empty rollback-test namespace.
DO $audit$ DECLARE t text;signature text;body text;BEGIN
 FOREACH t IN ARRAY ARRAY['shadow_control','shadow_cache','shadow_state','shadow_findings','shadow_run_findings'] LOOP
  EXECUTE format('CREATE TABLE buildwatch_audit.%I (LIKE buildwatch.%I INCLUDING ALL)',t,t);EXECUTE format('ALTER TABLE buildwatch_audit.%I ENABLE ROW LEVEL SECURITY',t);EXECUTE format('GRANT SELECT,INSERT,UPDATE,DELETE ON buildwatch_audit.%I TO buildwatch_worker',t);EXECUTE format('CREATE POLICY worker_audit ON buildwatch_audit.%I TO buildwatch_worker USING(true) WITH CHECK(true)',t);
 END LOOP;
 FOREACH signature IN ARRAY ARRAY['public.buildwatch_shadow(text,jsonb)','public.buildwatch_shadow_admin(jsonb,jsonb)'] LOOP
  body=replace(pg_get_functiondef(signature::regprocedure),'buildwatch.','buildwatch_audit.');body=replace(body,'''buildwatch''','''buildwatch_audit''');body=replace(body,'FUNCTION public.','FUNCTION buildwatch_audit.');EXECUTE body;
 END LOOP;
END $audit$;
REVOKE ALL ON FUNCTION buildwatch_audit.buildwatch_shadow(text,jsonb),buildwatch_audit.buildwatch_shadow_admin(jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION buildwatch_audit.buildwatch_shadow(text,jsonb),buildwatch_audit.buildwatch_shadow_admin(jsonb,jsonb) TO buildwatch_worker;
-- Harden the separately confirmed milestone path against missing/mismatched IDs.
DO $guard$ DECLARE signature text;body text;BEGIN
 FOREACH signature IN ARRAY ARRAY['buildwatch.bw_guarded_milestone(text,jsonb)','buildwatch_audit.bw_guarded_milestone(text,jsonb)'] LOOP
  body=pg_get_functiondef(signature::regprocedure);
  body=replace(body,$a$m->>'type' IS NULL OR$a$,$b$a->>'FID' IS NULL OR data#>>'{evidence,externalId}' IS NULL OR m->>'type' IS NULL OR$b$);
  body=replace(body,$a$d=(m->>'date')::date;$a$,$b$IF NOT coalesce(a->>'FID' ~ '^\d{1,12}$' AND m->>'url' ~ ('[?&]objectIds='||(a->>'FID')||'(&|$)'),false) THEN PERFORM bw_fail(400,'The evidence URL must identify the exact application.');END IF;d=(m->>'date')::date;$b$);
  EXECUTE body;
 END LOOP;
END $guard$;
