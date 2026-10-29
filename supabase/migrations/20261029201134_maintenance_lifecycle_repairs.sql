-- No backfill or public-record changes: legacy visibility remains unchanged until approved adoption.
CREATE TABLE buildwatch.maintenance_lifecycle(project_id text PRIMARY KEY REFERENCES buildwatch.projects(id),checked_run uuid REFERENCES buildwatch.maintenance_runs(id),source_id text REFERENCES buildwatch.maintenance_sources(id),checked_at timestamptz,movement_at bigint,evidence jsonb);
ALTER TABLE buildwatch.maintenance_lifecycle ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON buildwatch.maintenance_lifecycle FROM PUBLIC,anon,authenticated,buildwatch_worker;
CREATE OR REPLACE FUNCTION buildwatch.bw_refresh(pid text, derived jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'buildwatch', 'pg_catalog', 'extensions'
AS $function$
#variable_conflict use_column
<<bw_refresh>>
DECLARE p jsonb;rid bigint;r jsonb;e jsonb;origin_name text;events jsonb;policy_exists boolean;
BEGIN
 SELECT rowid INTO rid FROM projects WHERE id=pid;IF NOT FOUND THEN RETURN;END IF;
 IF derived IS NOT NULL THEN
  IF length(coalesce(derived->>'fingerprint',''))<>64 OR jsonb_typeof(derived->'normalized')<>'object' THEN PERFORM bw_fail(400,'Missing trusted project classification.');END IF;
  INSERT INTO project_categories VALUES(pid,derived->>'fingerprint',(derived->'normalized')::text,bw_now()) ON CONFLICT(project_id) DO UPDATE SET input=excluded.input,normalized=excluded.normalized,updated=excluded.updated WHERE project_categories.input<>excluded.input;
  r=derived->'road';
  IF r IS NOT NULL AND r<>'null'::jsonb AND r->>'road'='true' THEN
   INSERT INTO road_project_policy VALUES(pid,1,r::text,bw_now()) ON CONFLICT(project_id) DO UPDATE SET detail=excluded.detail,version=excluded.version,updated=excluded.updated WHERE road_project_policy.detail::jsonb IS DISTINCT FROM r;
   IF r->>'qualifies'='false' AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid) THEN
    INSERT INTO archived_projects(project_id,reason,archived_at,actor) VALUES(pid,'road_not_significant',bw_now(),'policy:major-roads');
    INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'archived','policy:major-roads',bw_now(),r::text);
   END IF;
  ELSE DELETE FROM road_project_policy WHERE project_id=pid;END IF;
  IF coalesce(r->>'road','false')<>'true' OR r->>'qualifies'='true' THEN
   IF EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid AND reason='road_not_significant') THEN
    DELETE FROM archived_projects WHERE project_id=pid AND reason='road_not_significant';
    INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'restored','policy:major-roads',bw_now(),'Verified scope qualifies; other archive policies still apply.');
   END IF;
  END IF;
 END IF;
 p=(SELECT data::jsonb FROM project_profiles WHERE id=pid);
 DELETE FROM map_meetings WHERE project_rid=rid;DELETE FROM map_types WHERE map_types.rid=bw_refresh.rid;DELETE FROM map_index WHERE id=pid;
 DELETE FROM policy_expiration_queue WHERE project_id=pid;DELETE FROM policy_permit_queue WHERE project_id=pid;
 IF p->>'status'='Approved' AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid) THEN
  INSERT INTO policy_expiration_queue SELECT project_id,due_at FROM approval_policy WHERE project_id=pid AND due_at IS NOT NULL ON CONFLICT(project_id) DO UPDATE SET due_at=excluded.due_at;
  IF p->>'evidenceType'='permit' AND p->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications WHERE project_id=pid) THEN INSERT INTO policy_permit_queue VALUES(pid) ON CONFLICT DO NOTHING;END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM project_relationships WHERE source_id=pid)
 AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid)
 AND coalesce(p->>'archived','false')<>'true' AND p->>'status' NOT IN ('Completed','Cancelled')
 AND NOT EXISTS(SELECT 1 FROM policy_permit_queue WHERE project_id=pid)
 AND NOT EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND p->>'status'='Approved' AND due_at<=bw_now() AND NOT EXISTS(SELECT 1 FROM maintenance_lifecycle ml WHERE ml.project_id=pid))
 AND NOT EXISTS(SELECT 1 FROM automation_project_policy WHERE project_id=pid AND classification<>'Public-Facing Development')
 AND NOT EXISTS(SELECT 1 FROM road_project_policy WHERE project_id=pid AND detail::jsonb->>'qualifies'='false') THEN
  INSERT INTO map_index(rid,id,latitude,longitude,x,y,status,state,searchtext,meetings)
  VALUES(rid,pid,(p->>'latitude')::float8,(p->>'longitude')::float8,((p->>'longitude')::float8+180)/360,
  (1-ln(tan(pi()/4+greatest(-85,least(85,(p->>'latitude')::float8))*pi()/360))/pi())/2,p->>'status',nullif(upper(trim(p->>'state')),''),
  lower(concat_ws(chr(31),p->>'name',p->>'address',p->>'neighborhood',p->>'category',p->>'secondaryCategories',p->>'subtype',p->>'city',coalesce(p->>'county','')||CASE WHEN length(trim(coalesce(p->>'county','')))>0 THEN ' County' ELSE '' END,p->>'state',p->>'jurisdiction',(SELECT string_agg(value,' ') FROM jsonb_array_elements_text(coalesce(p->'permitNumbers','[]'))))),jsonb_array_length(coalesce(p->'meetings','[]')));
  INSERT INTO map_types SELECT rid,type FROM (SELECT p->>'primaryCategory' type UNION SELECT jsonb_array_elements_text(coalesce(p->'secondaryCategories','[]'))) t WHERE type IS NOT NULL ON CONFLICT DO NOTHING;
  INSERT INTO map_meetings SELECT rid,m->>'id',floor(extract(epoch FROM (m->>'startsAt')::timestamptz)*1000)::bigint,m::text FROM jsonb_array_elements(coalesce(p->'meetings','[]')) m;
 END IF;
 IF derived IS NOT NULL THEN
  policy_exists=EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND approval_evidence IS NOT NULL);
  FOREACH origin_name IN ARRAY ARRAY['record','meeting','policy'] LOOP
   events=coalesce(derived->(origin_name||'Events'),'[]');
   IF origin_name='meeting' THEN DELETE FROM project_activity WHERE project_id=pid AND origin=origin_name AND event_key NOT IN(SELECT value->>'key' FROM jsonb_array_elements(events));END IF;
   -- Historical decisions are append-only, even when policy context is absent.
   FOR e IN SELECT * FROM jsonb_array_elements(events) LOOP
    IF EXISTS(SELECT 1 FROM project_activity a WHERE a.project_id=pid AND a.type=e->>'type' AND a.event_date=e->>'date' AND a.origin IN('record','policy') AND origin_name IN('record','policy')) THEN CONTINUE;END IF;
    INSERT INTO project_activity VALUES(gen_random_uuid()::text,pid,origin_name,e->>'key',e->>'type',e->>'date',(e->>'at')::bigint,e->>'description',e->>'url',bw_now())
     ON CONFLICT(project_id,origin,event_key) DO UPDATE SET event_date=excluded.event_date,occurred_at=excluded.occurred_at,description=excluded.description,source_url=excluded.source_url
     WHERE project_activity.event_date IS DISTINCT FROM excluded.event_date OR project_activity.description IS DISTINCT FROM excluded.description OR project_activity.source_url IS DISTINCT FROM excluded.source_url;
   END LOOP;
  END LOOP;
 END IF;
 UPDATE map_meta SET version=version+1 WHERE id=1;
END $function$
;
CREATE OR REPLACE FUNCTION public.buildwatch_maintenance_worker(action text, input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'buildwatch', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE control maintenance_control%ROWTYPE;st maintenance_states%ROWTYPE;r maintenance_runs%ROWTYPE;s maintenance_sources%ROWTYPE;doc maintenance_documents%ROWTYPE;f jsonb;p jsonb;old jsonb;outcome text;pid text;matches text[];n int;mut_id text;token uuid;v jsonb;remaining int;month_key date=date_trunc('month',now())::date;
BEGIN
 IF length(input::text)>128000 THEN PERFORM bw_fail(413,'Worker payload too large.');END IF;
 SELECT * INTO control FROM maintenance_control WHERE id=1;
 IF action='states' THEN RETURN jsonb_build_object('states',(SELECT jsonb_agg(to_jsonb(x)) FROM maintenance_states x),'control',to_jsonb(control),'bytes',pg_database_size(current_database()));END IF;
 IF action='requests' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT id,state,mode,dry_run,request_key FROM maintenance_runs WHERE status='queued' ORDER BY created LIMIT 10) q),'[]');END IF;
 IF action='claim' THEN
  PERFORM pg_advisory_xact_lock(72644330);
  SELECT * INTO st FROM maintenance_states WHERE state=input->>'state';IF st.state IS NULL THEN PERFORM bw_fail(400,'Unknown state.');END IF;
  IF NOT st.active THEN RETURN jsonb_build_object('status','skipped','reason','State inactive');END IF;
  IF input->>'mode' NOT IN('initial','weekly') THEN PERFORM bw_fail(400,'Invalid mode.');END IF;
  IF input->>'scheduled'='true' AND (NOT control.schedule_enabled OR NOT control.pilot_approved OR input->>'mode'='initial') THEN PERFORM bw_fail(403,'Live schedule is not approved.');END IF;
  IF input->>'dryRun'<>'true' AND (NOT control.writes_enabled OR NOT control.pilot_approved) THEN PERFORM bw_fail(403,'Live writes are disabled until pilot approval.');END IF;
  IF pg_database_size(current_database())>control.database_ceiling THEN PERFORM bw_fail(409,'Database safety ceiling reached.');END IF;
  SELECT * INTO r FROM maintenance_runs WHERE request_key=input->>'key' FOR UPDATE;
  IF r.id IS NULL AND input->>'scheduled'='true' THEN SELECT * INTO r FROM maintenance_runs WHERE state=st.state AND mode=input->>'mode' AND dry_run=coalesce((input->>'dryRun')::boolean,true) AND status IN('partially_completed','failed') ORDER BY created LIMIT 1 FOR UPDATE;END IF;
  IF r.status IN('completed','awaiting_review') THEN RETURN jsonb_build_object('status','skipped','reason','Cycle already processed','run',to_jsonb(r));END IF;
  IF EXISTS(SELECT 1 FROM maintenance_runs WHERE status='running' AND lease_until>now()) THEN PERFORM bw_fail(409,'Another maintenance worker holds the lease.');END IF;
  UPDATE maintenance_runs SET status='partially_completed',error='Worker lease expired; checkpoint retained' WHERE status='running' AND lease_until<=now();
  INSERT INTO maintenance_monthly(month) VALUES(month_key) ON CONFLICT DO NOTHING;
  IF EXISTS(SELECT 1 FROM maintenance_monthly WHERE month=month_key AND(seconds_reserved+st.max_seconds>control.monthly_seconds OR requests_reserved+st.max_requests>control.monthly_requests)) THEN PERFORM bw_fail(429,'Monthly worker budget exhausted. Deferred work is retained.');END IF;
  UPDATE maintenance_monthly SET seconds_reserved=seconds_reserved+st.max_seconds,requests_reserved=requests_reserved+st.max_requests WHERE month=month_key;
  token=gen_random_uuid();
  IF r.id IS NULL THEN INSERT INTO maintenance_runs(state,mode,dry_run,request_key) VALUES(st.state,input->>'mode',coalesce((input->>'dryRun')::boolean,true),input->>'key') RETURNING * INTO r;END IF;
  UPDATE maintenance_runs SET status='running',started=coalesce(started,now()),heartbeat=now(),lease=token,lease_until=now()+make_interval(secs=>st.max_seconds+60),attempts=attempts+1,github_url=input->>'githubURL',error=NULL WHERE id=r.id RETURNING * INTO r;
  RETURN jsonb_build_object('status','running','run',to_jsonb(r),'state',to_jsonb(st),'sources',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT ms.* FROM maintenance_sources ms WHERE ms.state=st.state AND enabled ORDER BY CASE WHEN EXISTS(SELECT 1 FROM maintenance_refs ref JOIN map_meetings m ON m.project_rid=(SELECT rowid FROM projects WHERE id=ref.project_id) WHERE ref.source_id=ms.id AND m.starts>bw_now() AND m.starts<bw_now()+1209600000) THEN 0 ELSE 1 END,last_success NULLS FIRST,id) x),'[]'));
 END IF;
 SELECT * INTO r FROM maintenance_runs WHERE id=(input->>'runId')::uuid FOR UPDATE;
 IF r.id IS NULL OR r.status<>'running' OR r.lease IS DISTINCT FROM (input->>'lease')::uuid OR r.lease_until<now() THEN PERFORM bw_fail(409,'Worker lease expired or invalid. Resume with a new claim.');END IF;
 SELECT * INTO st FROM maintenance_states WHERE state=r.state;
 IF action='checkpoint' THEN
  UPDATE maintenance_runs SET checkpoint=input->'checkpoint',stats=input->'stats',heartbeat=now() WHERE id=r.id;RETURN '{"saved":true}';
 ELSIF action='source' THEN
  SELECT * INTO s FROM maintenance_sources WHERE id=input->>'sourceId' AND state=r.state;IF s.id IS NULL THEN PERFORM bw_fail(400,'Unknown state source.');END IF;
  IF input ? 'config' THEN UPDATE maintenance_sources SET config=config||input->'config' WHERE id=s.id;END IF;
  IF input->>'error' IS NOT NULL THEN UPDATE maintenance_sources SET failures=failures+1,last_error=left(input->>'error',1000) WHERE id=s.id;
  ELSE UPDATE maintenance_sources SET successes=successes+1,last_success=now(),last_error=NULL WHERE id=s.id;END IF;RETURN '{"saved":true}';
 ELSIF action='document' THEN
  SELECT * INTO doc FROM maintenance_documents WHERE source_id=input->>'sourceId' AND url=input->>'url';RETURN coalesce(to_jsonb(doc),'{}');
 ELSIF action='cache' THEN
  IF NOT EXISTS(SELECT 1 FROM maintenance_sources WHERE id=input->>'sourceId' AND state=r.state) THEN PERFORM bw_fail(400,'Invalid source.');END IF;
  INSERT INTO maintenance_documents(source_id,url,hash,etag,modified,more,applied) VALUES(input->>'sourceId',input->>'url',input->>'hash',input->>'etag',input->>'modified',coalesce((input->>'more')::boolean,false),NOT r.dry_run) ON CONFLICT(source_id,url) DO UPDATE SET hash=excluded.hash,etag=excluded.etag,modified=excluded.modified,more=excluded.more,applied=excluded.applied,checked=now();RETURN '{"saved":true}';
 ELSIF action='match' THEN
  SELECT array_agg(DISTINCT bw_canonical(project_id)) INTO matches FROM maintenance_refs WHERE source_id=input->>'sourceId' AND external_id=input->>'externalId';
  RETURN jsonb_build_object('ids',coalesce(to_jsonb(matches),'[]'),'project',CASE WHEN cardinality(matches)=1 THEN bw_project(matches[1]) ELSE NULL END,'policy',(SELECT to_jsonb(ap) FROM approval_policy ap WHERE ap.project_id=matches[1]));
 ELSIF action='finding' THEN
  SELECT * INTO s FROM maintenance_sources WHERE id=input->>'sourceId' AND state=r.state;IF s.id IS NULL THEN PERFORM bw_fail(400,'Invalid source.');END IF;
  f=input->'finding';p=input->'project';pid=p->>'id';mut_id=input->>'id';
  IF EXISTS(SELECT 1 FROM maintenance_findings WHERE id=mut_id) THEN RETURN jsonb_build_object('outcome','unchanged','previousOutcome',(SELECT outcome FROM maintenance_findings WHERE id=mut_id));END IF;
  SELECT array_agg(DISTINCT bw_canonical(project_id)) INTO matches FROM maintenance_refs WHERE source_id=s.id AND external_id=f->>'externalId';
  old=CASE WHEN cardinality(matches)=1 THEN bw_project(matches[1]) ELSE NULL END;
  IF old IS NOT NULL THEN UPDATE maintenance_refs SET last_verified=now() WHERE source_id=s.id AND external_id=f->>'externalId';END IF;
  outcome=CASE WHEN coalesce((input->>'eligible')::boolean,false) AND s.autopublish AND s.authority='official' AND s.config->>'statusScope'='development' AND s.config->>'scopeVerified'='true' AND cardinality(matches)<=1 THEN 'eligible' ELSE 'awaiting_review' END;
  IF matches IS NULL AND input->>'eligible'='true' AND s.autopublish AND s.authority='official' AND s.config->>'statusScope'='development' AND s.config->>'scopeVerified'='true' THEN outcome='eligible';END IF;
  IF old IS NOT NULL AND(pid<>old->>'id' OR coalesce((p->>'revision')::bigint,0)<>coalesce((old->>'revision')::bigint,0)) THEN outcome='awaiting_review';END IF;
  -- Never republish archived, deleted, merged-away or terminal records.
  IF old->>'status' IN('Completed','Cancelled') OR old->>'archived'='true' OR EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid) OR EXISTS(SELECT 1 FROM deleted_project_ids WHERE project_id=pid) OR EXISTS(SELECT 1 FROM project_retirements WHERE project_id=pid) THEN outcome='excluded_archive';END IF;
  IF p->>'status' IN('Completed','Cancelled') AND NOT coalesce((s.config->>'terminalStatusVerified'='true' AND s.config->>'eventDateMeaning'='development_decision' AND f->>'eventDate' IS NOT NULL AND f->>'url' LIKE 'https://%' AND length(coalesce(f->>'quote',''))>0 AND ((p->>'status'='Completed' AND lower(trim(f->>'rawStatus'))='completed') OR (p->>'status'='Cancelled' AND lower(trim(f->>'rawStatus')) IN('cancelled','canceled')))),false) THEN outcome='awaiting_review';END IF;
  -- Cross-source candidates include archived records. Similarity only queues; never merges.
  IF old IS NULL AND p->>'latitude' IS NOT NULL AND EXISTS(SELECT 1 FROM projects x WHERE lower(x.data::jsonb->>'name')=lower(p->>'name') OR((x.data::jsonb->>'latitude')::float8 BETWEEN (p->>'latitude')::float8-0.001 AND (p->>'latitude')::float8+0.001 AND (x.data::jsonb->>'longitude')::float8 BETWEEN (p->>'longitude')::float8-0.001 AND (p->>'longitude')::float8+0.001 AND lower(x.data::jsonb->>'address')=lower(p->>'address'))) THEN outcome='potential_duplicate';END IF;
  IF outcome NOT IN('excluded_archive','potential_duplicate') AND old IS NOT NULL AND p->>'status'=old->>'status' AND p->'meetings'=old->'meetings' AND p->>'sourceStatusDate'=old->>'sourceStatusDate' THEN outcome='unchanged';END IF;
  IF old IS NOT NULL AND outcome<>'excluded_archive' AND input->'informationChange' IS NOT NULL AND input->'informationChange'<>'null'::jsonb AND s.authority='official' AND input#>>'{informationChange,before}'=old->>'description' AND input#>>'{informationChange,after}'=f->>'description' AND length(f->>'description')>=40 AND f->>'eventDate' IS NOT NULL AND f->>'url' LIKE 'https://%' THEN
   INSERT INTO research_batches VALUES('maintenance-'||r.id,now()::text,'{"mode":"github-maintenance","autoMerged":0}') ON CONFLICT DO NOTHING;
   v=jsonb_build_object('id',bw_hash(jsonb_build_array(s.id,f->>'externalId','information',f->>'description',old->'revision')),'kind','information','projectId',pid,'projectName',old->'name','jurisdiction',s.jurisdiction,'reason','Official source description changed; review substantive plan changes before replacing the public description.','before',jsonb_build_object('status',old->'status','revision',old->'revision','description',old->'description'),'patch',jsonb_build_object('description',f->'description'),'evidence',jsonb_build_object('url',f->'url','checkedAt',now(),'publishedAt',f->'publishedAt','eventDate',f->'eventDate','externalId',f->'externalId','summary',f->'quote'));
   INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(v->>'id','maintenance-'||r.id,'information',pid,v::text,bw_now()) ON CONFLICT DO NOTHING;
  END IF;
  -- Track explicit whole-development verification, never an HTTP response alone.
  IF NOT r.dry_run AND old IS NOT NULL AND input->>'eligible'='true' AND s.autopublish AND s.authority='official' AND s.config->>'scopeVerified'='true' AND s.config->>'statusScope'='development' AND outcome NOT IN('excluded_archive','potential_duplicate','awaiting_review') THEN
   INSERT INTO maintenance_lifecycle(project_id,checked_run,source_id,checked_at) VALUES(pid,r.id,s.id,now()) ON CONFLICT(project_id) DO UPDATE SET checked_run=excluded.checked_run,source_id=excluded.source_id,checked_at=excluded.checked_at;
  END IF;
  IF r.dry_run AND outcome='eligible' THEN outcome='would_publish';END IF;
  INSERT INTO maintenance_findings VALUES(mut_id,s.id,f->>'externalId',r.id,f,input->'confidence',now(),outcome,coalesce(old->>'id',pid));
  IF outcome='eligible' THEN
   IF NOT control.writes_enabled OR NOT control.pilot_approved THEN PERFORM bw_fail(403,'Live writes disabled.');END IF;
   IF p->>'state'<>r.state OR length(coalesce(f->>'quote',''))=0 OR f->>'url' NOT LIKE 'https://%' OR input#>>'{derived,normalized,primaryCategory}' IS NULL THEN PERFORM bw_fail(400,'Missing validated evidence or category.');END IF;
   IF old IS NOT NULL THEN
    -- Existing descriptions/identity are preserved; source scans update only documented milestones.
    p=old||jsonb_build_object('status',p->'status','sourceStatus',p->'sourceStatus','sourceStatusDate',p->'sourceStatusDate','meetings',p->'meetings','sources',p->'sources','reviewedAt',p->'reviewedAt');
   END IF;
   p=bw_publish(p,'automation:github',input->'derived');
   INSERT INTO maintenance_mutations VALUES(mut_id,r.id,pid,'publish',old,p,now(),NULL);
   INSERT INTO maintenance_refs(source_id,external_id,project_id,last_verified) VALUES(s.id,f->>'externalId',pid,now()) ON CONFLICT DO NOTHING;
   IF p->>'status'='Approved' AND f->>'eventDate' IS NOT NULL THEN
    INSERT INTO approval_policy(project_id,approval_date,approval_at,approval_evidence,schedules,expires_at,due_at,actor,updated)
    VALUES(pid,f->>'eventDate',floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint,jsonb_build_object('date',f->>'eventDate','url',f->>'url','quote',f->>'quote')::text,'[]',floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint+31536000000,floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint+31536000000,'automation:github',bw_now()) ON CONFLICT(project_id) DO UPDATE SET due_at=greatest(approval_policy.due_at,excluded.due_at),updated=bw_now() WHERE excluded.approval_at>approval_policy.approval_at;
    INSERT INTO maintenance_lifecycle(project_id,checked_run,source_id,checked_at,movement_at,evidence) VALUES(pid,r.id,s.id,now(),floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint,f) ON CONFLICT(project_id) DO UPDATE SET movement_at=greatest(maintenance_lifecycle.movement_at,excluded.movement_at),evidence=CASE WHEN excluded.movement_at>coalesce(maintenance_lifecycle.movement_at,0) THEN excluded.evidence ELSE maintenance_lifecycle.evidence END;
    PERFORM bw_refresh(pid,input->'derived');
   END IF;
   IF p->>'status' IN('Completed','Cancelled') THEN
    INSERT INTO archived_projects(project_id,reason,archived_at,actor,run_id) VALUES(pid,lower(p->>'status'),bw_now(),'automation:github',r.id::text) ON CONFLICT DO NOTHING;
    INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'archived','automation:github',bw_now(),jsonb_build_object('reason',p->>'status','evidence',f)::text);
    PERFORM bw_refresh(pid);
   END IF;
   UPDATE maintenance_findings SET outcome='published' WHERE id=mut_id;outcome='published';
  ELSIF NOT r.dry_run AND outcome IN('awaiting_review','potential_duplicate') THEN
   INSERT INTO research_batches VALUES('maintenance-'||r.id,now()::text,'{"mode":"github-maintenance","autoMerged":0}') ON CONFLICT DO NOTHING;
   v=jsonb_build_object('id',mut_id,'kind',CASE WHEN old IS NOT NULL AND f->>'status' IS NOT NULL THEN 'status' ELSE 'uncertain' END,'projectId',old->'id','projectName',f->'name','jurisdiction',s.jurisdiction,'reason',input->>'reason','before',jsonb_build_object('status',old->'status','revision',old->'revision'),'patch',jsonb_build_object('status',f->'status','sourceStatus',f->'rawStatus'),'evidence',jsonb_build_object('url',f->'url','checkedAt',now(),'publishedAt',f->'publishedAt','eventDate',f->'eventDate','externalId',f->'externalId','summary',f->'quote'));
   INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(mut_id,'maintenance-'||r.id,v->>'kind',old->>'id',v::text,bw_now()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('outcome',outcome);
 ELSIF action='expirations' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT p.id,l.approval_date,l.due_at FROM policy_expiration_queue q JOIN approval_policy l ON l.project_id=q.project_id JOIN project_profiles p ON p.id=q.project_id WHERE q.due_at<=bw_now() AND p.data::jsonb->>'status'='Approved' AND p.data::jsonb->>'state'=r.state AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=p.id) AND EXISTS(SELECT 1 FROM maintenance_lifecycle ml JOIN maintenance_sources ms ON ms.id=ml.source_id WHERE ml.project_id=p.id AND ml.checked_run=r.id AND ms.last_error IS NULL AND ms.last_success>=r.started) ORDER BY q.due_at,p.id LIMIT 100) x),'[]');
 ELSIF action='expire' THEN
  pid=input->>'projectId';old=bw_project(pid);
  IF NOT EXISTS(SELECT 1 FROM maintenance_lifecycle ml JOIN maintenance_sources ms ON ms.id=ml.source_id WHERE ml.project_id=pid AND ml.checked_run=r.id AND ms.last_error IS NULL AND ms.last_success>=r.started) THEN RETURN '{"outcome":"protected_unverified"}';END IF;
  IF old->>'state'<>r.state OR old->>'status'<>'Approved' OR NOT EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND due_at<=bw_now() AND approval_at IS NOT NULL AND(exception_until IS NULL OR exception_until<=bw_now())) THEN RETURN '{"outcome":"protected"}';END IF;
  IF r.dry_run THEN RETURN '{"outcome":"would_archive"}';END IF;
  IF NOT control.writes_enabled OR NOT control.pilot_approved THEN PERFORM bw_fail(403,'Live writes disabled.');END IF;
  INSERT INTO archived_projects(project_id,reason,archived_at,actor,run_id) VALUES(pid,'approved_expired',bw_now(),'automation:github',r.id::text) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n>0 THEN
   INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'archived','automation:github',bw_now(),'Documented approval has no movement or future schedule within 365 days.');
   INSERT INTO maintenance_mutations VALUES(bw_hash(to_jsonb(r.id::text||pid)),r.id,pid,'archive',old,NULL,now(),NULL);
   PERFORM bw_refresh(pid);
  END IF;RETURN jsonb_build_object('outcome',CASE WHEN n>0 THEN 'archived' ELSE 'unchanged' END);
 ELSIF action='quality' THEN
  RETURN jsonb_build_object('checkedAt',now(),'sample',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT m.project_id,m.kind,m.created,f.data->>'url' source,f.data->>'eventDate' event_date,f.confidence FROM maintenance_mutations m LEFT JOIN maintenance_findings f ON f.id=m.id WHERE m.run_id=r.id ORDER BY m.created DESC LIMIT 5) q),'[]'),'sourceFailures',(SELECT count(*) FROM maintenance_sources WHERE state=r.state AND last_error IS NOT NULL),'pendingEvidence',(SELECT count(*) FROM maintenance_findings WHERE run_id=r.id AND outcome IN('awaiting_review','potential_duplicate')));
 ELSIF action='finish' THEN
  IF input->>'status' NOT IN('completed','partially_completed','failed','awaiting_review','skipped') THEN PERFORM bw_fail(400,'Invalid run status.');END IF;
  UPDATE maintenance_runs SET status=input->>'status',stats=input->'stats',checkpoint=input->'checkpoint',finished=now(),heartbeat=now(),lease_until=now(),error=left(input->>'error',1000) WHERE id=r.id;
  IF input->>'status' IN('completed','awaiting_review') AND NOT r.dry_run AND input#>>'{stats,pilotSelection}' IS DISTINCT FROM 'true' THEN UPDATE maintenance_states SET last_success=now() WHERE state=r.state;END IF;
  RETURN jsonb_build_object('saved',true,'dryRun',r.dry_run);
 END IF;
 PERFORM bw_fail(404,'Unknown worker operation.');
END $function$
;
CREATE OR REPLACE FUNCTION buildwatch.bw_research_preview(pid text, actor_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'buildwatch', 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE r research_proposals%ROWTYPE;data jsonb;current_p jsonb;result jsonb;meeting jsonb;token text=gen_random_uuid()::text;BEGIN
 SELECT * INTO r FROM research_proposals WHERE id=pid FOR UPDATE;IF NOT FOUND THEN PERFORM bw_fail(404,'Research proposal not found.');END IF;
 data=r.data::jsonb;IF r.status NOT IN('pending','deferred') OR r.kind NOT IN('status','meeting','information') THEN PERFORM bw_fail(409,'This record needs manual classification or editing before publication.');END IF;
 current_p=bw_project(r.project_id);
 IF current_p IS NULL OR current_p->>'id'<>r.project_id OR current_p->>'archived'='true' OR current_p->'revision' IS DISTINCT FROM data->'before'->'revision' OR current_p->'status' IS DISTINCT FROM data->'before'->'status' THEN PERFORM bw_fail(409,'Project changed or was linked since research. Refresh this proposal.');END IF;
 result=current_p;
 IF r.kind='information' THEN
  IF data->'patch' IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(data->'patch') k WHERE k<>'description') OR length(coalesce(data#>>'{patch,description}',''))<40 OR current_p->'description' IS DISTINCT FROM data#>'{before,description}' OR data#>>'{evidence,url}' NOT LIKE 'https://%' THEN PERFORM bw_fail(400,'Invalid or stale information patch.');END IF;
  result=result||(data->'patch');
 ELSIF r.kind='status' THEN
  IF data->'patch' IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(data->'patch') k WHERE k NOT IN('status','sourceStatus')) THEN PERFORM bw_fail(400,'Invalid status patch.');END IF;result=result||(data->'patch');
 ELSE
  meeting=data->'meeting';IF meeting->>'id' IS NULL OR data->'evidence'->>'externalId' IS NULL THEN PERFORM bw_fail(400,'A meeting needs a stable official identifier.');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'meetings') m WHERE m->>'id'=meeting->>'id') THEN result=jsonb_set(result,'{meetings}',(SELECT jsonb_agg(CASE WHEN m->>'id'=meeting->>'id' THEN meeting ELSE m END ORDER BY ord) FROM jsonb_array_elements(result->'meetings') WITH ORDINALITY t(m,ord)));
  ELSE result=jsonb_set(result,'{meetings}',coalesce(result->'meetings','[]')||jsonb_build_array(meeting));END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(result->'sources','[]')) s WHERE s->>'url'=data->'evidence'->>'url') THEN result=jsonb_set(result,'{sources}',coalesce(result->'sources','[]')||jsonb_build_array(jsonb_build_object('title','Official evidence checked '||left(data->'evidence'->>'checkedAt',10),'url',data->'evidence'->'url')));END IF;
 result=jsonb_set(result,'{reviewedAt}',to_jsonb(left(data->'evidence'->>'checkedAt',10)));
 INSERT INTO research_previews VALUES(token,pid,actor_id,bw_hash(jsonb_build_array(r.data,r.revision,current_p)),result::text,bw_now()+600000,0);
 RETURN jsonb_build_object('token',token,'before',current_p,'after',result,'evidence',data->'evidence','notice',CASE WHEN result->>'status' IN('Completed','Cancelled') THEN 'Approval removes this development from the public map and notifies eligible followers. Original information remains in editing history.' ELSE 'Approval publishes only the changes shown and uses existing notification preferences.' END);
END $function$
;
CREATE OR REPLACE FUNCTION buildwatch.bw_research_api(u jsonb, method text, path text, input jsonb, q jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'buildwatch', 'pg_catalog'
AS $function$
#variable_conflict use_column
<<bw_research_api>>
DECLARE actor_id text=u->>'id';parts text[]=string_to_array(path,'/');pid text;token_id text;row research_proposals%ROWTYPE;data jsonb;value jsonb;current_p jsonb;result jsonb;source_id text;issuer text;external_id text;cid jsonb;
 page int=coalesce((q->>'page')::int,0);f_status text=coalesce(q->>'status','pending');kind text=coalesce(q->>'kind','all');search text=lower(trim(coalesce(q->>'search','')));total bigint;items jsonb;
BEGIN
 IF path='/api/admin/research' AND method='GET' THEN
  IF page<0 OR page>100000 OR f_status NOT IN('pending','deferred','dismissed','applied','duplicate_review','all') OR kind NOT IN('all','status','meeting','discovery','uncertain','information') OR length(search)>200 THEN PERFORM bw_fail(400,'Invalid review filters.');END IF;
  WITH eligible AS MATERIALIZED(SELECT * FROM research_proposals r WHERE(f_status='all' OR r.status=f_status) AND(kind='all' OR r.kind=kind) AND(search='' OR position(search IN lower(coalesce(r.data::jsonb->>'projectName','')||' '||coalesce(r.data::jsonb->>'jurisdiction','')))>0)),page_rows AS(SELECT id,kind,status,revision,updated,data::jsonb->>'projectName' name,data::jsonb->>'jurisdiction' jurisdiction,data::jsonb->>'reason' reason FROM eligible ORDER BY CASE kind WHEN 'meeting' THEN 0 WHEN 'status' THEN 1 WHEN 'uncertain' THEN 2 ELSE 3 END,updated DESC,id LIMIT 25 OFFSET page*25)
  SELECT(SELECT count(*) FROM eligible),coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO total,items FROM page_rows r;
  RETURN jsonb_build_object('items',items,'total',total,'page',page,'hasMore',(page+1)*25<total,'stats',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM(SELECT kind,status,count(*) count FROM research_proposals GROUP BY kind,status) s),'batches',(SELECT coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('summary',b.summary::jsonb)),'[]') FROM(SELECT * FROM research_batches ORDER BY created DESC LIMIT 5) b),'webResearch',bw_web_summary());
 END IF;
 IF path='__research_info' THEN RETURN bw_research_info(input->>'token',actor_id);END IF;
 IF path='/api/admin/research/commit' AND method='POST' THEN
  PERFORM pg_advisory_xact_lock(72644322);token_id=input->>'token';PERFORM 1 FROM research_previews WHERE token=token_id FOR UPDATE;
  value=bw_research_info(token_id,actor_id);PERFORM 1 FROM research_proposals WHERE id=value->>'proposalId' FOR UPDATE;
  result=bw_publish(input->'_project',actor_id,input->'_derived');UPDATE research_previews SET used=1 WHERE token=token_id;UPDATE research_proposals SET status='applied',revision=revision+1,updated=bw_now() WHERE id=value->>'proposalId';
  INSERT INTO research_audit VALUES(gen_random_uuid()::text,value->>'proposalId',actor_id,'applied','Individually approved from an evidence-backed confirmation preview.',bw_now());RETURN result;
 END IF;
 IF path~'^/api/admin/research/[a-f0-9]{64}(/(preview|decision|duplicate|meeting-target))?$' THEN
  pid=parts[5];SELECT * INTO row FROM research_proposals WHERE id=pid FOR UPDATE;IF NOT FOUND THEN PERFORM bw_fail(404,'Research proposal not found.');END IF;
  IF method='GET' AND parts[6] IS NULL THEN RETURN bw_research_detail(pid);END IF;
  IF method='POST' AND parts[6]='preview' THEN RETURN bw_research_preview(pid,actor_id);END IF;
  IF method='POST' THEN
   IF row.revision<>coalesce((input->>'revision')::bigint,-1) OR row.status IN('applied','duplicate_review') THEN PERFORM bw_fail(409,'Proposal changed or already processed.');END IF;
   data=row.data::jsonb;
   IF parts[6]='decision' THEN
    IF coalesce(input->>'status','') NOT IN('pending','deferred','dismissed') OR length(coalesce(input->>'note',''))>4000 THEN PERFORM bw_fail(400,'Invalid review decision.');END IF;
    UPDATE research_proposals SET status=input->>'status',revision=revision+1,updated=bw_now() WHERE id=pid;INSERT INTO research_audit VALUES(gen_random_uuid()::text,pid,actor_id,input->>'status',coalesce(input->>'note',''),bw_now());RETURN bw_research_detail(pid);
   ELSIF parts[6]='meeting-target' THEN
    current_p=bw_project(input->>'target');IF data->'meeting' IS NULL OR row.status='dismissed' OR current_p IS NULL OR NOT EXISTS(SELECT 1 FROM active_map_index WHERE id=current_p->>'id') THEN PERFORM bw_fail(400,'Choose an active development for this meeting.');END IF;
    source_id=bw_hash(jsonb_build_array(pid,current_p->'id',current_p->'revision'));value=data||jsonb_build_object('id',source_id,'kind','meeting','projectId',current_p->'id','before',jsonb_build_object('status',current_p->'status','revision',current_p->'revision'),'reason','Administrator selected this development for the official hearing. Inspect its case identifier before publishing.','parentProposal',pid);
    INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(source_id,row.batch_id,'meeting',current_p->>'id',value::text,bw_now()) ON CONFLICT DO NOTHING;
    INSERT INTO research_audit VALUES(gen_random_uuid()::text,source_id,actor_id,'association_prepared','Source proposal '||pid||'. No public change.',bw_now());UPDATE research_proposals SET status='deferred',revision=revision+1,updated=bw_now() WHERE id=pid;INSERT INTO research_audit VALUES(gen_random_uuid()::text,pid,actor_id,'association_prepared',source_id,bw_now());RETURN bw_research_detail(source_id);
   ELSIF parts[6]='duplicate' THEN
    current_p=bw_project(input->>'target');IF current_p IS NULL OR current_p->>'archived'='true' THEN PERFORM bw_fail(400,'Choose an existing public project ID.');END IF;
    source_id=row.project_id;
    IF source_id IS NULL THEN
     source_id='research-'||left(pid,32);issuer=coalesce(input->'_issuer',split_part(data->'evidence'->>'url','?',1));external_id=coalesce(data->'evidence'->>'externalId',pid);
     SELECT id INTO token_id FROM supporting_sources s WHERE s.issuer=bw_research_api.issuer AND s.external_id=bw_research_api.external_id;
     IF token_id IS NOT NULL THEN source_id=token_id;
     ELSE
      value=jsonb_build_object('id',source_id,'name',data->'projectName','description',data->'reason','address',coalesce(data#>>'{evidence,attributes,MainAddress}',data#>>'{evidence,attributes,Address}',data#>>'{evidence,attributes,location}','Address not supplied by source'),'category','Unclassified source record','status',NULL,
      'latitude',data#>'{evidence,geometry,y}','longitude',data#>'{evidence,geometry,x}','developer','Not supplied by source','homes',0,'completion','Not verified','neighborhood',coalesce(data->>'jurisdiction','NC'),'state','NC','jurisdiction',data->'jurisdiction','meetings','[]'::jsonb,'sources',jsonb_build_array(jsonb_build_object('title','Original source record '||external_id,'url',data->'evidence'->'url')),'sourceStatus',data->'evidence'->'sourceStatus','revision',1);
      INSERT INTO supporting_sources VALUES(source_id,value::text,issuer,external_id,data->'evidence'->>'url',bw_now());
     END IF;
    END IF;
    cid=bw_register(source_id,current_p->>'id','["Administrator flagged research proposal as a potential duplicate"]',jsonb_build_object('proposalId',pid,'sourceURL',data->'evidence'->'url'),actor_id);
    UPDATE research_proposals SET status='duplicate_review',revision=revision+1,updated=bw_now() WHERE id=pid;INSERT INTO research_audit VALUES(gen_random_uuid()::text,pid,actor_id,'duplicate_review',cid->>'id',bw_now());RETURN jsonb_build_object('candidateId',cid->'id');
   END IF;
  END IF;
 END IF;
 RETURN NULL;
END $function$
;
CREATE OR REPLACE VIEW buildwatch.active_map_index WITH(security_invoker=true) AS  SELECT rid,
    id,
    latitude,
    longitude,
    x,
    y,
    status,
    state,
    searchtext,
    meetings,
    geom
   FROM buildwatch.map_index m
  WHERE (status <> ALL (ARRAY['Completed'::text, 'Cancelled'::text])) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch.project_relationships r
          WHERE r.source_id = m.id)) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch.archived_projects a
          WHERE a.project_id = m.id)) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch.automation_project_policy a
          WHERE a.project_id = m.id AND a.classification <> 'Public-Facing Development'::text)) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch.approval_policy l
          WHERE l.project_id = m.id AND m.status = 'Approved'::text AND l.due_at <= buildwatch.bw_now() AND NOT EXISTS(SELECT 1 FROM buildwatch.maintenance_lifecycle ml WHERE ml.project_id=m.id))) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch.road_project_policy r
          WHERE r.project_id = m.id AND (r.detail::jsonb ->> 'qualifies'::text) = 'false'::text));
CREATE OR REPLACE VIEW buildwatch.archived_inventory WITH(security_invoker=true) AS  SELECT p.id,
    p.rowid,
    p.data,
    p.revision,
    COALESCE(a.reason,
        CASE
            WHEN COALESCE((p.data::jsonb ->> 'archived'::text)::boolean, false) THEN 'manual'::text
            WHEN (p.data::jsonb ->> 'evidenceType'::text) = 'permit'::text AND (p.data::jsonb ->> 'jurisdiction'::text) = 'NC DEQ construction stormwater'::text AND NOT (EXISTS ( SELECT 1
               FROM buildwatch.community_verifications v
              WHERE v.project_id = p.id)) THEN 'supporting_permit_only'::text
            ELSE 'approved_expired'::text
        END) AS archive_reason,
    a.archived_at,
    a.actor AS archive_actor,
    a.run_id
   FROM buildwatch.project_profiles p
     LEFT JOIN buildwatch.archived_projects a ON a.project_id = p.id
     LEFT JOIN buildwatch.approval_policy l ON l.project_id = p.id
  WHERE a.project_id IS NOT NULL OR COALESCE((p.data::jsonb ->> 'archived'::text)::boolean, false) OR (p.data::jsonb ->> 'status'::text) = 'Approved'::text AND (p.data::jsonb ->> 'evidenceType'::text) = 'permit'::text AND (p.data::jsonb ->> 'jurisdiction'::text) = 'NC DEQ construction stormwater'::text AND NOT (EXISTS ( SELECT 1
           FROM buildwatch.community_verifications v
          WHERE v.project_id = p.id)) OR (p.data::jsonb ->> 'status'::text) = 'Approved'::text AND l.due_at <= buildwatch.bw_now() AND NOT EXISTS(SELECT 1 FROM buildwatch.maintenance_lifecycle ml WHERE ml.project_id=p.id);

CREATE TABLE buildwatch_audit.maintenance_lifecycle(LIKE buildwatch.maintenance_lifecycle INCLUDING ALL);
ALTER TABLE buildwatch_audit.maintenance_lifecycle ENABLE ROW LEVEL SECURITY;
CREATE POLICY worker_audit ON buildwatch_audit.maintenance_lifecycle TO buildwatch_worker USING(true) WITH CHECK(true);
GRANT SELECT,INSERT,UPDATE,DELETE ON buildwatch_audit.maintenance_lifecycle TO buildwatch_worker;
CREATE OR REPLACE FUNCTION buildwatch_audit.bw_refresh(pid text, derived jsonb DEFAULT NULL::jsonb)
 RETURNS void
 LANGUAGE plpgsql
 SET search_path TO 'buildwatch_audit', 'pg_catalog', 'extensions'
AS $function$
#variable_conflict use_column
<<bw_refresh>>
DECLARE p jsonb;rid bigint;r jsonb;e jsonb;origin_name text;events jsonb;policy_exists boolean;
BEGIN
 SELECT rowid INTO rid FROM projects WHERE id=pid;IF NOT FOUND THEN RETURN;END IF;
 IF derived IS NOT NULL THEN
  IF length(coalesce(derived->>'fingerprint',''))<>64 OR jsonb_typeof(derived->'normalized')<>'object' THEN PERFORM bw_fail(400,'Missing trusted project classification.');END IF;
  INSERT INTO project_categories VALUES(pid,derived->>'fingerprint',(derived->'normalized')::text,bw_now()) ON CONFLICT(project_id) DO UPDATE SET input=excluded.input,normalized=excluded.normalized,updated=excluded.updated WHERE project_categories.input<>excluded.input;
  r=derived->'road';
  IF r IS NOT NULL AND r<>'null'::jsonb AND r->>'road'='true' THEN
   INSERT INTO road_project_policy VALUES(pid,1,r::text,bw_now()) ON CONFLICT(project_id) DO UPDATE SET detail=excluded.detail,version=excluded.version,updated=excluded.updated WHERE road_project_policy.detail::jsonb IS DISTINCT FROM r;
   IF r->>'qualifies'='false' AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid) THEN
    INSERT INTO archived_projects(project_id,reason,archived_at,actor) VALUES(pid,'road_not_significant',bw_now(),'policy:major-roads');
    INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'archived','policy:major-roads',bw_now(),r::text);
   END IF;
  ELSE DELETE FROM road_project_policy WHERE project_id=pid;END IF;
  IF coalesce(r->>'road','false')<>'true' OR r->>'qualifies'='true' THEN
   IF EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid AND reason='road_not_significant') THEN
    DELETE FROM archived_projects WHERE project_id=pid AND reason='road_not_significant';
    INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'restored','policy:major-roads',bw_now(),'Verified scope qualifies; other archive policies still apply.');
   END IF;
  END IF;
 END IF;
 p=(SELECT data::jsonb FROM project_profiles WHERE id=pid);
 DELETE FROM map_meetings WHERE project_rid=rid;DELETE FROM map_types WHERE map_types.rid=bw_refresh.rid;DELETE FROM map_index WHERE id=pid;
 DELETE FROM policy_expiration_queue WHERE project_id=pid;DELETE FROM policy_permit_queue WHERE project_id=pid;
 IF p->>'status'='Approved' AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid) THEN
  INSERT INTO policy_expiration_queue SELECT project_id,due_at FROM approval_policy WHERE project_id=pid AND due_at IS NOT NULL ON CONFLICT(project_id) DO UPDATE SET due_at=excluded.due_at;
  IF p->>'evidenceType'='permit' AND p->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications WHERE project_id=pid) THEN INSERT INTO policy_permit_queue VALUES(pid) ON CONFLICT DO NOTHING;END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM project_relationships WHERE source_id=pid)
 AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid)
 AND coalesce(p->>'archived','false')<>'true' AND p->>'status' NOT IN ('Completed','Cancelled')
 AND NOT EXISTS(SELECT 1 FROM policy_permit_queue WHERE project_id=pid)
 AND NOT EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND p->>'status'='Approved' AND due_at<=bw_now() AND NOT EXISTS(SELECT 1 FROM maintenance_lifecycle ml WHERE ml.project_id=pid))
 AND NOT EXISTS(SELECT 1 FROM automation_project_policy WHERE project_id=pid AND classification<>'Public-Facing Development')
 AND NOT EXISTS(SELECT 1 FROM road_project_policy WHERE project_id=pid AND detail::jsonb->>'qualifies'='false') THEN
  INSERT INTO map_index(rid,id,latitude,longitude,x,y,status,state,searchtext,meetings)
  VALUES(rid,pid,(p->>'latitude')::float8,(p->>'longitude')::float8,((p->>'longitude')::float8+180)/360,
  (1-ln(tan(pi()/4+greatest(-85,least(85,(p->>'latitude')::float8))*pi()/360))/pi())/2,p->>'status',nullif(upper(trim(p->>'state')),''),
  lower(concat_ws(chr(31),p->>'name',p->>'address',p->>'neighborhood',p->>'category',p->>'secondaryCategories',p->>'subtype',p->>'city',coalesce(p->>'county','')||CASE WHEN length(trim(coalesce(p->>'county','')))>0 THEN ' County' ELSE '' END,p->>'state',p->>'jurisdiction',(SELECT string_agg(value,' ') FROM jsonb_array_elements_text(coalesce(p->'permitNumbers','[]'))))),jsonb_array_length(coalesce(p->'meetings','[]')));
  INSERT INTO map_types SELECT rid,type FROM (SELECT p->>'primaryCategory' type UNION SELECT jsonb_array_elements_text(coalesce(p->'secondaryCategories','[]'))) t WHERE type IS NOT NULL ON CONFLICT DO NOTHING;
  INSERT INTO map_meetings SELECT rid,m->>'id',floor(extract(epoch FROM (m->>'startsAt')::timestamptz)*1000)::bigint,m::text FROM jsonb_array_elements(coalesce(p->'meetings','[]')) m;
 END IF;
 IF derived IS NOT NULL THEN
  policy_exists=EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND approval_evidence IS NOT NULL);
  FOREACH origin_name IN ARRAY ARRAY['record','meeting','policy'] LOOP
   events=coalesce(derived->(origin_name||'Events'),'[]');
   IF origin_name='meeting' THEN DELETE FROM project_activity WHERE project_id=pid AND origin=origin_name AND event_key NOT IN(SELECT value->>'key' FROM jsonb_array_elements(events));END IF;
   -- Historical decisions are append-only, even when policy context is absent.
   FOR e IN SELECT * FROM jsonb_array_elements(events) LOOP
    IF EXISTS(SELECT 1 FROM project_activity a WHERE a.project_id=pid AND a.type=e->>'type' AND a.event_date=e->>'date' AND a.origin IN('record','policy') AND origin_name IN('record','policy')) THEN CONTINUE;END IF;
    INSERT INTO project_activity VALUES(gen_random_uuid()::text,pid,origin_name,e->>'key',e->>'type',e->>'date',(e->>'at')::bigint,e->>'description',e->>'url',bw_now())
     ON CONFLICT(project_id,origin,event_key) DO UPDATE SET event_date=excluded.event_date,occurred_at=excluded.occurred_at,description=excluded.description,source_url=excluded.source_url
     WHERE project_activity.event_date IS DISTINCT FROM excluded.event_date OR project_activity.description IS DISTINCT FROM excluded.description OR project_activity.source_url IS DISTINCT FROM excluded.source_url;
   END LOOP;
  END LOOP;
 END IF;
 UPDATE map_meta SET version=version+1 WHERE id=1;
END $function$
;
CREATE OR REPLACE FUNCTION buildwatch_audit.buildwatch_maintenance_worker(action text, input jsonb DEFAULT '{}'::jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'buildwatch_audit', 'extensions'
AS $function$
#variable_conflict use_column
DECLARE control maintenance_control%ROWTYPE;st maintenance_states%ROWTYPE;r maintenance_runs%ROWTYPE;s maintenance_sources%ROWTYPE;doc maintenance_documents%ROWTYPE;f jsonb;p jsonb;old jsonb;outcome text;pid text;matches text[];n int;mut_id text;token uuid;v jsonb;remaining int;month_key date=date_trunc('month',now())::date;
BEGIN
 IF length(input::text)>128000 THEN PERFORM bw_fail(413,'Worker payload too large.');END IF;
 SELECT * INTO control FROM maintenance_control WHERE id=1;
 IF action='states' THEN RETURN jsonb_build_object('states',(SELECT jsonb_agg(to_jsonb(x)) FROM maintenance_states x),'control',to_jsonb(control),'bytes',pg_database_size(current_database()));END IF;
 IF action='requests' THEN RETURN coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT id,state,mode,dry_run,request_key FROM maintenance_runs WHERE status='queued' ORDER BY created LIMIT 10) q),'[]');END IF;
 IF action='claim' THEN
  PERFORM pg_advisory_xact_lock(72644330);
  SELECT * INTO st FROM maintenance_states WHERE state=input->>'state';IF st.state IS NULL THEN PERFORM bw_fail(400,'Unknown state.');END IF;
  IF NOT st.active THEN RETURN jsonb_build_object('status','skipped','reason','State inactive');END IF;
  IF input->>'mode' NOT IN('initial','weekly') THEN PERFORM bw_fail(400,'Invalid mode.');END IF;
  IF input->>'scheduled'='true' AND (NOT control.schedule_enabled OR NOT control.pilot_approved OR input->>'mode'='initial') THEN PERFORM bw_fail(403,'Live schedule is not approved.');END IF;
  IF input->>'dryRun'<>'true' AND (NOT control.writes_enabled OR NOT control.pilot_approved) THEN PERFORM bw_fail(403,'Live writes are disabled until pilot approval.');END IF;
  IF pg_database_size(current_database())>control.database_ceiling THEN PERFORM bw_fail(409,'Database safety ceiling reached.');END IF;
  SELECT * INTO r FROM maintenance_runs WHERE request_key=input->>'key' FOR UPDATE;
  IF r.id IS NULL AND input->>'scheduled'='true' THEN SELECT * INTO r FROM maintenance_runs WHERE state=st.state AND mode=input->>'mode' AND dry_run=coalesce((input->>'dryRun')::boolean,true) AND status IN('partially_completed','failed') ORDER BY created LIMIT 1 FOR UPDATE;END IF;
  IF r.status IN('completed','awaiting_review') THEN RETURN jsonb_build_object('status','skipped','reason','Cycle already processed','run',to_jsonb(r));END IF;
  IF EXISTS(SELECT 1 FROM maintenance_runs WHERE status='running' AND lease_until>now()) THEN PERFORM bw_fail(409,'Another maintenance worker holds the lease.');END IF;
  UPDATE maintenance_runs SET status='partially_completed',error='Worker lease expired; checkpoint retained' WHERE status='running' AND lease_until<=now();
  INSERT INTO maintenance_monthly(month) VALUES(month_key) ON CONFLICT DO NOTHING;
  IF EXISTS(SELECT 1 FROM maintenance_monthly WHERE month=month_key AND(seconds_reserved+st.max_seconds>control.monthly_seconds OR requests_reserved+st.max_requests>control.monthly_requests)) THEN PERFORM bw_fail(429,'Monthly worker budget exhausted. Deferred work is retained.');END IF;
  UPDATE maintenance_monthly SET seconds_reserved=seconds_reserved+st.max_seconds,requests_reserved=requests_reserved+st.max_requests WHERE month=month_key;
  token=gen_random_uuid();
  IF r.id IS NULL THEN INSERT INTO maintenance_runs(state,mode,dry_run,request_key) VALUES(st.state,input->>'mode',coalesce((input->>'dryRun')::boolean,true),input->>'key') RETURNING * INTO r;END IF;
  UPDATE maintenance_runs SET status='running',started=coalesce(started,now()),heartbeat=now(),lease=token,lease_until=now()+make_interval(secs=>st.max_seconds+60),attempts=attempts+1,github_url=input->>'githubURL',error=NULL WHERE id=r.id RETURNING * INTO r;
  RETURN jsonb_build_object('status','running','run',to_jsonb(r),'state',to_jsonb(st),'sources',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT ms.* FROM maintenance_sources ms WHERE ms.state=st.state AND enabled ORDER BY CASE WHEN EXISTS(SELECT 1 FROM maintenance_refs ref JOIN map_meetings m ON m.project_rid=(SELECT rowid FROM projects WHERE id=ref.project_id) WHERE ref.source_id=ms.id AND m.starts>bw_now() AND m.starts<bw_now()+1209600000) THEN 0 ELSE 1 END,last_success NULLS FIRST,id) x),'[]'));
 END IF;
 SELECT * INTO r FROM maintenance_runs WHERE id=(input->>'runId')::uuid FOR UPDATE;
 IF r.id IS NULL OR r.status<>'running' OR r.lease IS DISTINCT FROM (input->>'lease')::uuid OR r.lease_until<now() THEN PERFORM bw_fail(409,'Worker lease expired or invalid. Resume with a new claim.');END IF;
 SELECT * INTO st FROM maintenance_states WHERE state=r.state;
 IF action='checkpoint' THEN
  UPDATE maintenance_runs SET checkpoint=input->'checkpoint',stats=input->'stats',heartbeat=now() WHERE id=r.id;RETURN '{"saved":true}';
 ELSIF action='source' THEN
  SELECT * INTO s FROM maintenance_sources WHERE id=input->>'sourceId' AND state=r.state;IF s.id IS NULL THEN PERFORM bw_fail(400,'Unknown state source.');END IF;
  IF input ? 'config' THEN UPDATE maintenance_sources SET config=config||input->'config' WHERE id=s.id;END IF;
  IF input->>'error' IS NOT NULL THEN UPDATE maintenance_sources SET failures=failures+1,last_error=left(input->>'error',1000) WHERE id=s.id;
  ELSE UPDATE maintenance_sources SET successes=successes+1,last_success=now(),last_error=NULL WHERE id=s.id;END IF;RETURN '{"saved":true}';
 ELSIF action='document' THEN
  SELECT * INTO doc FROM maintenance_documents WHERE source_id=input->>'sourceId' AND url=input->>'url';RETURN coalesce(to_jsonb(doc),'{}');
 ELSIF action='cache' THEN
  IF NOT EXISTS(SELECT 1 FROM maintenance_sources WHERE id=input->>'sourceId' AND state=r.state) THEN PERFORM bw_fail(400,'Invalid source.');END IF;
  INSERT INTO maintenance_documents(source_id,url,hash,etag,modified,more,applied) VALUES(input->>'sourceId',input->>'url',input->>'hash',input->>'etag',input->>'modified',coalesce((input->>'more')::boolean,false),NOT r.dry_run) ON CONFLICT(source_id,url) DO UPDATE SET hash=excluded.hash,etag=excluded.etag,modified=excluded.modified,more=excluded.more,applied=excluded.applied,checked=now();RETURN '{"saved":true}';
 ELSIF action='match' THEN
  SELECT array_agg(DISTINCT bw_canonical(project_id)) INTO matches FROM maintenance_refs WHERE source_id=input->>'sourceId' AND external_id=input->>'externalId';
  RETURN jsonb_build_object('ids',coalesce(to_jsonb(matches),'[]'),'project',CASE WHEN cardinality(matches)=1 THEN bw_project(matches[1]) ELSE NULL END,'policy',(SELECT to_jsonb(ap) FROM approval_policy ap WHERE ap.project_id=matches[1]));
 ELSIF action='finding' THEN
  SELECT * INTO s FROM maintenance_sources WHERE id=input->>'sourceId' AND state=r.state;IF s.id IS NULL THEN PERFORM bw_fail(400,'Invalid source.');END IF;
  f=input->'finding';p=input->'project';pid=p->>'id';mut_id=input->>'id';
  IF EXISTS(SELECT 1 FROM maintenance_findings WHERE id=mut_id) THEN RETURN jsonb_build_object('outcome','unchanged','previousOutcome',(SELECT outcome FROM maintenance_findings WHERE id=mut_id));END IF;
  SELECT array_agg(DISTINCT bw_canonical(project_id)) INTO matches FROM maintenance_refs WHERE source_id=s.id AND external_id=f->>'externalId';
  old=CASE WHEN cardinality(matches)=1 THEN bw_project(matches[1]) ELSE NULL END;
  IF old IS NOT NULL THEN UPDATE maintenance_refs SET last_verified=now() WHERE source_id=s.id AND external_id=f->>'externalId';END IF;
  outcome=CASE WHEN coalesce((input->>'eligible')::boolean,false) AND s.autopublish AND s.authority='official' AND s.config->>'statusScope'='development' AND s.config->>'scopeVerified'='true' AND cardinality(matches)<=1 THEN 'eligible' ELSE 'awaiting_review' END;
  IF matches IS NULL AND input->>'eligible'='true' AND s.autopublish AND s.authority='official' AND s.config->>'statusScope'='development' AND s.config->>'scopeVerified'='true' THEN outcome='eligible';END IF;
  IF old IS NOT NULL AND(pid<>old->>'id' OR coalesce((p->>'revision')::bigint,0)<>coalesce((old->>'revision')::bigint,0)) THEN outcome='awaiting_review';END IF;
  -- Never republish archived, deleted, merged-away or terminal records.
  IF old->>'status' IN('Completed','Cancelled') OR old->>'archived'='true' OR EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid) OR EXISTS(SELECT 1 FROM deleted_project_ids WHERE project_id=pid) OR EXISTS(SELECT 1 FROM project_retirements WHERE project_id=pid) THEN outcome='excluded_archive';END IF;
  IF p->>'status' IN('Completed','Cancelled') AND NOT coalesce((s.config->>'terminalStatusVerified'='true' AND s.config->>'eventDateMeaning'='development_decision' AND f->>'eventDate' IS NOT NULL AND f->>'url' LIKE 'https://%' AND length(coalesce(f->>'quote',''))>0 AND ((p->>'status'='Completed' AND lower(trim(f->>'rawStatus'))='completed') OR (p->>'status'='Cancelled' AND lower(trim(f->>'rawStatus')) IN('cancelled','canceled')))),false) THEN outcome='awaiting_review';END IF;
  -- Cross-source candidates include archived records. Similarity only queues; never merges.
  IF old IS NULL AND p->>'latitude' IS NOT NULL AND EXISTS(SELECT 1 FROM projects x WHERE lower(x.data::jsonb->>'name')=lower(p->>'name') OR((x.data::jsonb->>'latitude')::float8 BETWEEN (p->>'latitude')::float8-0.001 AND (p->>'latitude')::float8+0.001 AND (x.data::jsonb->>'longitude')::float8 BETWEEN (p->>'longitude')::float8-0.001 AND (p->>'longitude')::float8+0.001 AND lower(x.data::jsonb->>'address')=lower(p->>'address'))) THEN outcome='potential_duplicate';END IF;
  IF outcome NOT IN('excluded_archive','potential_duplicate') AND old IS NOT NULL AND p->>'status'=old->>'status' AND p->'meetings'=old->'meetings' AND p->>'sourceStatusDate'=old->>'sourceStatusDate' THEN outcome='unchanged';END IF;
  IF old IS NOT NULL AND outcome<>'excluded_archive' AND input->'informationChange' IS NOT NULL AND input->'informationChange'<>'null'::jsonb AND s.authority='official' AND input#>>'{informationChange,before}'=old->>'description' AND input#>>'{informationChange,after}'=f->>'description' AND length(f->>'description')>=40 AND f->>'eventDate' IS NOT NULL AND f->>'url' LIKE 'https://%' THEN
   INSERT INTO research_batches VALUES('maintenance-'||r.id,now()::text,'{"mode":"github-maintenance","autoMerged":0}') ON CONFLICT DO NOTHING;
   v=jsonb_build_object('id',bw_hash(jsonb_build_array(s.id,f->>'externalId','information',f->>'description',old->'revision')),'kind','information','projectId',pid,'projectName',old->'name','jurisdiction',s.jurisdiction,'reason','Official source description changed; review substantive plan changes before replacing the public description.','before',jsonb_build_object('status',old->'status','revision',old->'revision','description',old->'description'),'patch',jsonb_build_object('description',f->'description'),'evidence',jsonb_build_object('url',f->'url','checkedAt',now(),'publishedAt',f->'publishedAt','eventDate',f->'eventDate','externalId',f->'externalId','summary',f->'quote'));
   INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(v->>'id','maintenance-'||r.id,'information',pid,v::text,bw_now()) ON CONFLICT DO NOTHING;
  END IF;
  -- Track explicit whole-development verification, never an HTTP response alone.
  IF NOT r.dry_run AND old IS NOT NULL AND input->>'eligible'='true' AND s.autopublish AND s.authority='official' AND s.config->>'scopeVerified'='true' AND s.config->>'statusScope'='development' AND outcome NOT IN('excluded_archive','potential_duplicate','awaiting_review') THEN
   INSERT INTO maintenance_lifecycle(project_id,checked_run,source_id,checked_at) VALUES(pid,r.id,s.id,now()) ON CONFLICT(project_id) DO UPDATE SET checked_run=excluded.checked_run,source_id=excluded.source_id,checked_at=excluded.checked_at;
  END IF;
  IF r.dry_run AND outcome='eligible' THEN outcome='would_publish';END IF;
  INSERT INTO maintenance_findings VALUES(mut_id,s.id,f->>'externalId',r.id,f,input->'confidence',now(),outcome,coalesce(old->>'id',pid));
  IF outcome='eligible' THEN
   IF NOT control.writes_enabled OR NOT control.pilot_approved THEN PERFORM bw_fail(403,'Live writes disabled.');END IF;
   IF p->>'state'<>r.state OR length(coalesce(f->>'quote',''))=0 OR f->>'url' NOT LIKE 'https://%' OR input#>>'{derived,normalized,primaryCategory}' IS NULL THEN PERFORM bw_fail(400,'Missing validated evidence or category.');END IF;
   IF old IS NOT NULL THEN
    -- Existing descriptions/identity are preserved; source scans update only documented milestones.
    p=old||jsonb_build_object('status',p->'status','sourceStatus',p->'sourceStatus','sourceStatusDate',p->'sourceStatusDate','meetings',p->'meetings','sources',p->'sources','reviewedAt',p->'reviewedAt');
   END IF;
   p=bw_publish(p,'automation:github',input->'derived');
   INSERT INTO maintenance_mutations VALUES(mut_id,r.id,pid,'publish',old,p,now(),NULL);
   INSERT INTO maintenance_refs(source_id,external_id,project_id,last_verified) VALUES(s.id,f->>'externalId',pid,now()) ON CONFLICT DO NOTHING;
   IF p->>'status'='Approved' AND f->>'eventDate' IS NOT NULL THEN
    INSERT INTO approval_policy(project_id,approval_date,approval_at,approval_evidence,schedules,expires_at,due_at,actor,updated)
    VALUES(pid,f->>'eventDate',floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint,jsonb_build_object('date',f->>'eventDate','url',f->>'url','quote',f->>'quote')::text,'[]',floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint+31536000000,floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint+31536000000,'automation:github',bw_now()) ON CONFLICT(project_id) DO UPDATE SET due_at=greatest(approval_policy.due_at,excluded.due_at),updated=bw_now() WHERE excluded.approval_at>approval_policy.approval_at;
    INSERT INTO maintenance_lifecycle(project_id,checked_run,source_id,checked_at,movement_at,evidence) VALUES(pid,r.id,s.id,now(),floor(extract(epoch FROM (f->>'eventDate')::timestamptz)*1000)::bigint,f) ON CONFLICT(project_id) DO UPDATE SET movement_at=greatest(maintenance_lifecycle.movement_at,excluded.movement_at),evidence=CASE WHEN excluded.movement_at>coalesce(maintenance_lifecycle.movement_at,0) THEN excluded.evidence ELSE maintenance_lifecycle.evidence END;
    PERFORM bw_refresh(pid,input->'derived');
   END IF;
   IF p->>'status' IN('Completed','Cancelled') THEN
    INSERT INTO archived_projects(project_id,reason,archived_at,actor,run_id) VALUES(pid,lower(p->>'status'),bw_now(),'automation:github',r.id::text) ON CONFLICT DO NOTHING;
    INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'archived','automation:github',bw_now(),jsonb_build_object('reason',p->>'status','evidence',f)::text);
    PERFORM bw_refresh(pid);
   END IF;
   UPDATE maintenance_findings SET outcome='published' WHERE id=mut_id;outcome='published';
  ELSIF NOT r.dry_run AND outcome IN('awaiting_review','potential_duplicate') THEN
   INSERT INTO research_batches VALUES('maintenance-'||r.id,now()::text,'{"mode":"github-maintenance","autoMerged":0}') ON CONFLICT DO NOTHING;
   v=jsonb_build_object('id',mut_id,'kind',CASE WHEN old IS NOT NULL AND f->>'status' IS NOT NULL THEN 'status' ELSE 'uncertain' END,'projectId',old->'id','projectName',f->'name','jurisdiction',s.jurisdiction,'reason',input->>'reason','before',jsonb_build_object('status',old->'status','revision',old->'revision'),'patch',jsonb_build_object('status',f->'status','sourceStatus',f->'rawStatus'),'evidence',jsonb_build_object('url',f->'url','checkedAt',now(),'publishedAt',f->'publishedAt','eventDate',f->'eventDate','externalId',f->'externalId','summary',f->'quote'));
   INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(mut_id,'maintenance-'||r.id,v->>'kind',old->>'id',v::text,bw_now()) ON CONFLICT DO NOTHING;
  END IF;
  RETURN jsonb_build_object('outcome',outcome);
 ELSIF action='expirations' THEN
  RETURN coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT p.id,l.approval_date,l.due_at FROM policy_expiration_queue q JOIN approval_policy l ON l.project_id=q.project_id JOIN project_profiles p ON p.id=q.project_id WHERE q.due_at<=bw_now() AND p.data::jsonb->>'status'='Approved' AND p.data::jsonb->>'state'=r.state AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=p.id) AND EXISTS(SELECT 1 FROM maintenance_lifecycle ml JOIN maintenance_sources ms ON ms.id=ml.source_id WHERE ml.project_id=p.id AND ml.checked_run=r.id AND ms.last_error IS NULL AND ms.last_success>=r.started) ORDER BY q.due_at,p.id LIMIT 100) x),'[]');
 ELSIF action='expire' THEN
  pid=input->>'projectId';old=bw_project(pid);
  IF NOT EXISTS(SELECT 1 FROM maintenance_lifecycle ml JOIN maintenance_sources ms ON ms.id=ml.source_id WHERE ml.project_id=pid AND ml.checked_run=r.id AND ms.last_error IS NULL AND ms.last_success>=r.started) THEN RETURN '{"outcome":"protected_unverified"}';END IF;
  IF old->>'state'<>r.state OR old->>'status'<>'Approved' OR NOT EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND due_at<=bw_now() AND approval_at IS NOT NULL AND(exception_until IS NULL OR exception_until<=bw_now())) THEN RETURN '{"outcome":"protected"}';END IF;
  IF r.dry_run THEN RETURN '{"outcome":"would_archive"}';END IF;
  IF NOT control.writes_enabled OR NOT control.pilot_approved THEN PERFORM bw_fail(403,'Live writes disabled.');END IF;
  INSERT INTO archived_projects(project_id,reason,archived_at,actor,run_id) VALUES(pid,'approved_expired',bw_now(),'automation:github',r.id::text) ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n>0 THEN
   INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'archived','automation:github',bw_now(),'Documented approval has no movement or future schedule within 365 days.');
   INSERT INTO maintenance_mutations VALUES(bw_hash(to_jsonb(r.id::text||pid)),r.id,pid,'archive',old,NULL,now(),NULL);
   PERFORM bw_refresh(pid);
  END IF;RETURN jsonb_build_object('outcome',CASE WHEN n>0 THEN 'archived' ELSE 'unchanged' END);
 ELSIF action='quality' THEN
  RETURN jsonb_build_object('checkedAt',now(),'sample',coalesce((SELECT jsonb_agg(to_jsonb(q)) FROM(SELECT m.project_id,m.kind,m.created,f.data->>'url' source,f.data->>'eventDate' event_date,f.confidence FROM maintenance_mutations m LEFT JOIN maintenance_findings f ON f.id=m.id WHERE m.run_id=r.id ORDER BY m.created DESC LIMIT 5) q),'[]'),'sourceFailures',(SELECT count(*) FROM maintenance_sources WHERE state=r.state AND last_error IS NOT NULL),'pendingEvidence',(SELECT count(*) FROM maintenance_findings WHERE run_id=r.id AND outcome IN('awaiting_review','potential_duplicate')));
 ELSIF action='finish' THEN
  IF input->>'status' NOT IN('completed','partially_completed','failed','awaiting_review','skipped') THEN PERFORM bw_fail(400,'Invalid run status.');END IF;
  UPDATE maintenance_runs SET status=input->>'status',stats=input->'stats',checkpoint=input->'checkpoint',finished=now(),heartbeat=now(),lease_until=now(),error=left(input->>'error',1000) WHERE id=r.id;
  IF input->>'status' IN('completed','awaiting_review') AND NOT r.dry_run AND input#>>'{stats,pilotSelection}' IS DISTINCT FROM 'true' THEN UPDATE maintenance_states SET last_success=now() WHERE state=r.state;END IF;
  RETURN jsonb_build_object('saved',true,'dryRun',r.dry_run);
 END IF;
 PERFORM bw_fail(404,'Unknown worker operation.');
END $function$
;
CREATE OR REPLACE FUNCTION buildwatch_audit.bw_research_preview(pid text, actor_id text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'buildwatch_audit', 'pg_catalog'
AS $function$
#variable_conflict use_column
DECLARE r research_proposals%ROWTYPE;data jsonb;current_p jsonb;result jsonb;meeting jsonb;token text=gen_random_uuid()::text;BEGIN
 SELECT * INTO r FROM research_proposals WHERE id=pid FOR UPDATE;IF NOT FOUND THEN PERFORM bw_fail(404,'Research proposal not found.');END IF;
 data=r.data::jsonb;IF r.status NOT IN('pending','deferred') OR r.kind NOT IN('status','meeting','information') THEN PERFORM bw_fail(409,'This record needs manual classification or editing before publication.');END IF;
 current_p=bw_project(r.project_id);
 IF current_p IS NULL OR current_p->>'id'<>r.project_id OR current_p->>'archived'='true' OR current_p->'revision' IS DISTINCT FROM data->'before'->'revision' OR current_p->'status' IS DISTINCT FROM data->'before'->'status' THEN PERFORM bw_fail(409,'Project changed or was linked since research. Refresh this proposal.');END IF;
 result=current_p;
 IF r.kind='information' THEN
  IF data->'patch' IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(data->'patch') k WHERE k<>'description') OR length(coalesce(data#>>'{patch,description}',''))<40 OR current_p->'description' IS DISTINCT FROM data#>'{before,description}' OR data#>>'{evidence,url}' NOT LIKE 'https://%' THEN PERFORM bw_fail(400,'Invalid or stale information patch.');END IF;
  result=result||(data->'patch');
 ELSIF r.kind='status' THEN
  IF data->'patch' IS NULL OR EXISTS(SELECT 1 FROM jsonb_object_keys(data->'patch') k WHERE k NOT IN('status','sourceStatus')) THEN PERFORM bw_fail(400,'Invalid status patch.');END IF;result=result||(data->'patch');
 ELSE
  meeting=data->'meeting';IF meeting->>'id' IS NULL OR data->'evidence'->>'externalId' IS NULL THEN PERFORM bw_fail(400,'A meeting needs a stable official identifier.');END IF;
  IF EXISTS(SELECT 1 FROM jsonb_array_elements(result->'meetings') m WHERE m->>'id'=meeting->>'id') THEN result=jsonb_set(result,'{meetings}',(SELECT jsonb_agg(CASE WHEN m->>'id'=meeting->>'id' THEN meeting ELSE m END ORDER BY ord) FROM jsonb_array_elements(result->'meetings') WITH ORDINALITY t(m,ord)));
  ELSE result=jsonb_set(result,'{meetings}',coalesce(result->'meetings','[]')||jsonb_build_array(meeting));END IF;
 END IF;
 IF NOT EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(result->'sources','[]')) s WHERE s->>'url'=data->'evidence'->>'url') THEN result=jsonb_set(result,'{sources}',coalesce(result->'sources','[]')||jsonb_build_array(jsonb_build_object('title','Official evidence checked '||left(data->'evidence'->>'checkedAt',10),'url',data->'evidence'->'url')));END IF;
 result=jsonb_set(result,'{reviewedAt}',to_jsonb(left(data->'evidence'->>'checkedAt',10)));
 INSERT INTO research_previews VALUES(token,pid,actor_id,bw_hash(jsonb_build_array(r.data,r.revision,current_p)),result::text,bw_now()+600000,0);
 RETURN jsonb_build_object('token',token,'before',current_p,'after',result,'evidence',data->'evidence','notice',CASE WHEN result->>'status' IN('Completed','Cancelled') THEN 'Approval removes this development from the public map and notifies eligible followers. Original information remains in editing history.' ELSE 'Approval publishes only the changes shown and uses existing notification preferences.' END);
END $function$
;
CREATE OR REPLACE FUNCTION buildwatch_audit.bw_research_api(u jsonb, method text, path text, input jsonb, q jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SET search_path TO 'buildwatch_audit', 'pg_catalog'
AS $function$
#variable_conflict use_column
<<bw_research_api>>
DECLARE actor_id text=u->>'id';parts text[]=string_to_array(path,'/');pid text;token_id text;row research_proposals%ROWTYPE;data jsonb;value jsonb;current_p jsonb;result jsonb;source_id text;issuer text;external_id text;cid jsonb;
 page int=coalesce((q->>'page')::int,0);f_status text=coalesce(q->>'status','pending');kind text=coalesce(q->>'kind','all');search text=lower(trim(coalesce(q->>'search','')));total bigint;items jsonb;
BEGIN
 IF path='/api/admin/research' AND method='GET' THEN
  IF page<0 OR page>100000 OR f_status NOT IN('pending','deferred','dismissed','applied','duplicate_review','all') OR kind NOT IN('all','status','meeting','discovery','uncertain','information') OR length(search)>200 THEN PERFORM bw_fail(400,'Invalid review filters.');END IF;
  WITH eligible AS MATERIALIZED(SELECT * FROM research_proposals r WHERE(f_status='all' OR r.status=f_status) AND(kind='all' OR r.kind=kind) AND(search='' OR position(search IN lower(coalesce(r.data::jsonb->>'projectName','')||' '||coalesce(r.data::jsonb->>'jurisdiction','')))>0)),page_rows AS(SELECT id,kind,status,revision,updated,data::jsonb->>'projectName' name,data::jsonb->>'jurisdiction' jurisdiction,data::jsonb->>'reason' reason FROM eligible ORDER BY CASE kind WHEN 'meeting' THEN 0 WHEN 'status' THEN 1 WHEN 'uncertain' THEN 2 ELSE 3 END,updated DESC,id LIMIT 25 OFFSET page*25)
  SELECT(SELECT count(*) FROM eligible),coalesce(jsonb_agg(to_jsonb(r)),'[]') INTO total,items FROM page_rows r;
  RETURN jsonb_build_object('items',items,'total',total,'page',page,'hasMore',(page+1)*25<total,'stats',(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM(SELECT kind,status,count(*) count FROM research_proposals GROUP BY kind,status) s),'batches',(SELECT coalesce(jsonb_agg(to_jsonb(b)||jsonb_build_object('summary',b.summary::jsonb)),'[]') FROM(SELECT * FROM research_batches ORDER BY created DESC LIMIT 5) b),'webResearch',bw_web_summary());
 END IF;
 IF path='__research_info' THEN RETURN bw_research_info(input->>'token',actor_id);END IF;
 IF path='/api/admin/research/commit' AND method='POST' THEN
  PERFORM pg_advisory_xact_lock(72644322);token_id=input->>'token';PERFORM 1 FROM research_previews WHERE token=token_id FOR UPDATE;
  value=bw_research_info(token_id,actor_id);PERFORM 1 FROM research_proposals WHERE id=value->>'proposalId' FOR UPDATE;
  result=bw_publish(input->'_project',actor_id,input->'_derived');UPDATE research_previews SET used=1 WHERE token=token_id;UPDATE research_proposals SET status='applied',revision=revision+1,updated=bw_now() WHERE id=value->>'proposalId';
  INSERT INTO research_audit VALUES(gen_random_uuid()::text,value->>'proposalId',actor_id,'applied','Individually approved from an evidence-backed confirmation preview.',bw_now());RETURN result;
 END IF;
 IF path~'^/api/admin/research/[a-f0-9]{64}(/(preview|decision|duplicate|meeting-target))?$' THEN
  pid=parts[5];SELECT * INTO row FROM research_proposals WHERE id=pid FOR UPDATE;IF NOT FOUND THEN PERFORM bw_fail(404,'Research proposal not found.');END IF;
  IF method='GET' AND parts[6] IS NULL THEN RETURN bw_research_detail(pid);END IF;
  IF method='POST' AND parts[6]='preview' THEN RETURN bw_research_preview(pid,actor_id);END IF;
  IF method='POST' THEN
   IF row.revision<>coalesce((input->>'revision')::bigint,-1) OR row.status IN('applied','duplicate_review') THEN PERFORM bw_fail(409,'Proposal changed or already processed.');END IF;
   data=row.data::jsonb;
   IF parts[6]='decision' THEN
    IF coalesce(input->>'status','') NOT IN('pending','deferred','dismissed') OR length(coalesce(input->>'note',''))>4000 THEN PERFORM bw_fail(400,'Invalid review decision.');END IF;
    UPDATE research_proposals SET status=input->>'status',revision=revision+1,updated=bw_now() WHERE id=pid;INSERT INTO research_audit VALUES(gen_random_uuid()::text,pid,actor_id,input->>'status',coalesce(input->>'note',''),bw_now());RETURN bw_research_detail(pid);
   ELSIF parts[6]='meeting-target' THEN
    current_p=bw_project(input->>'target');IF data->'meeting' IS NULL OR row.status='dismissed' OR current_p IS NULL OR NOT EXISTS(SELECT 1 FROM active_map_index WHERE id=current_p->>'id') THEN PERFORM bw_fail(400,'Choose an active development for this meeting.');END IF;
    source_id=bw_hash(jsonb_build_array(pid,current_p->'id',current_p->'revision'));value=data||jsonb_build_object('id',source_id,'kind','meeting','projectId',current_p->'id','before',jsonb_build_object('status',current_p->'status','revision',current_p->'revision'),'reason','Administrator selected this development for the official hearing. Inspect its case identifier before publishing.','parentProposal',pid);
    INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(source_id,row.batch_id,'meeting',current_p->>'id',value::text,bw_now()) ON CONFLICT DO NOTHING;
    INSERT INTO research_audit VALUES(gen_random_uuid()::text,source_id,actor_id,'association_prepared','Source proposal '||pid||'. No public change.',bw_now());UPDATE research_proposals SET status='deferred',revision=revision+1,updated=bw_now() WHERE id=pid;INSERT INTO research_audit VALUES(gen_random_uuid()::text,pid,actor_id,'association_prepared',source_id,bw_now());RETURN bw_research_detail(source_id);
   ELSIF parts[6]='duplicate' THEN
    current_p=bw_project(input->>'target');IF current_p IS NULL OR current_p->>'archived'='true' THEN PERFORM bw_fail(400,'Choose an existing public project ID.');END IF;
    source_id=row.project_id;
    IF source_id IS NULL THEN
     source_id='research-'||left(pid,32);issuer=coalesce(input->'_issuer',split_part(data->'evidence'->>'url','?',1));external_id=coalesce(data->'evidence'->>'externalId',pid);
     SELECT id INTO token_id FROM supporting_sources s WHERE s.issuer=bw_research_api.issuer AND s.external_id=bw_research_api.external_id;
     IF token_id IS NOT NULL THEN source_id=token_id;
     ELSE
      value=jsonb_build_object('id',source_id,'name',data->'projectName','description',data->'reason','address',coalesce(data#>>'{evidence,attributes,MainAddress}',data#>>'{evidence,attributes,Address}',data#>>'{evidence,attributes,location}','Address not supplied by source'),'category','Unclassified source record','status',NULL,
      'latitude',data#>'{evidence,geometry,y}','longitude',data#>'{evidence,geometry,x}','developer','Not supplied by source','homes',0,'completion','Not verified','neighborhood',coalesce(data->>'jurisdiction','NC'),'state','NC','jurisdiction',data->'jurisdiction','meetings','[]'::jsonb,'sources',jsonb_build_array(jsonb_build_object('title','Original source record '||external_id,'url',data->'evidence'->'url')),'sourceStatus',data->'evidence'->'sourceStatus','revision',1);
      INSERT INTO supporting_sources VALUES(source_id,value::text,issuer,external_id,data->'evidence'->>'url',bw_now());
     END IF;
    END IF;
    cid=bw_register(source_id,current_p->>'id','["Administrator flagged research proposal as a potential duplicate"]',jsonb_build_object('proposalId',pid,'sourceURL',data->'evidence'->'url'),actor_id);
    UPDATE research_proposals SET status='duplicate_review',revision=revision+1,updated=bw_now() WHERE id=pid;INSERT INTO research_audit VALUES(gen_random_uuid()::text,pid,actor_id,'duplicate_review',cid->>'id',bw_now());RETURN jsonb_build_object('candidateId',cid->'id');
   END IF;
  END IF;
 END IF;
 RETURN NULL;
END $function$
;
CREATE OR REPLACE VIEW buildwatch_audit.active_map_index WITH(security_invoker=true) AS  SELECT rid,
    id,
    latitude,
    longitude,
    x,
    y,
    status,
    state,
    searchtext,
    meetings,
    geom
   FROM buildwatch_audit.map_index m
  WHERE (status <> ALL (ARRAY['Completed'::text, 'Cancelled'::text])) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch_audit.project_relationships r
          WHERE r.source_id = m.id)) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch_audit.archived_projects a
          WHERE a.project_id = m.id)) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch_audit.automation_project_policy a
          WHERE a.project_id = m.id AND a.classification <> 'Public-Facing Development'::text)) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch_audit.approval_policy l
          WHERE l.project_id = m.id AND m.status = 'Approved'::text AND l.due_at <= buildwatch_audit.bw_now() AND NOT EXISTS(SELECT 1 FROM buildwatch_audit.maintenance_lifecycle ml WHERE ml.project_id=m.id))) AND NOT (EXISTS ( SELECT 1
           FROM buildwatch_audit.road_project_policy r
          WHERE r.project_id = m.id AND (r.detail::jsonb ->> 'qualifies'::text) = 'false'::text));
CREATE OR REPLACE VIEW buildwatch_audit.archived_inventory WITH(security_invoker=true) AS  SELECT p.id,
    p.rowid,
    p.data,
    p.revision,
    COALESCE(a.reason,
        CASE
            WHEN COALESCE((p.data::jsonb ->> 'archived'::text)::boolean, false) THEN 'manual'::text
            WHEN (p.data::jsonb ->> 'evidenceType'::text) = 'permit'::text AND (p.data::jsonb ->> 'jurisdiction'::text) = 'NC DEQ construction stormwater'::text AND NOT (EXISTS ( SELECT 1
               FROM buildwatch_audit.community_verifications v
              WHERE v.project_id = p.id)) THEN 'supporting_permit_only'::text
            ELSE 'approved_expired'::text
        END) AS archive_reason,
    a.archived_at,
    a.actor AS archive_actor,
    a.run_id
   FROM buildwatch_audit.project_profiles p
     LEFT JOIN buildwatch_audit.archived_projects a ON a.project_id = p.id
     LEFT JOIN buildwatch_audit.approval_policy l ON l.project_id = p.id
  WHERE a.project_id IS NOT NULL OR COALESCE((p.data::jsonb ->> 'archived'::text)::boolean, false) OR (p.data::jsonb ->> 'status'::text) = 'Approved'::text AND (p.data::jsonb ->> 'evidenceType'::text) = 'permit'::text AND (p.data::jsonb ->> 'jurisdiction'::text) = 'NC DEQ construction stormwater'::text AND NOT (EXISTS ( SELECT 1
           FROM buildwatch_audit.community_verifications v
          WHERE v.project_id = p.id)) OR (p.data::jsonb ->> 'status'::text) = 'Approved'::text AND l.due_at <= buildwatch_audit.bw_now() AND NOT EXISTS(SELECT 1 FROM buildwatch_audit.maintenance_lifecycle ml WHERE ml.project_id=p.id);

REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch_audit FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA buildwatch_audit TO buildwatch_worker;
REVOKE ALL ON FUNCTION public.buildwatch_maintenance_worker(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_maintenance_worker(text,jsonb) TO buildwatch_worker,service_role;
NOTIFY pgrst,'reload schema';
