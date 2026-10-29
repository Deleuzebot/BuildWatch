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
  -- Explicit component semantics are configured by administrators, not inferred from 'Approved'.
  IF old IS NOT NULL AND outcome NOT IN('excluded_archive','potential_duplicate') AND s.authority='official' AND s.config->>'componentMilestonesVerified'='true' AND s.config->>'statusScope'='application' AND lower(trim(old->>'name'))=lower(trim(f->>'name')) AND f#>>'{sourceFacts,applicationAction}'='TRC Approved' AND f#>>'{sourceDates,applicationActionAt}' IS NOT NULL AND f#>>'{sourceDates,applicationActionAt}'=input#>>'{componentMilestone,date}' AND f->>'url'=input#>>'{componentMilestone,url}' AND input#>>'{componentMilestone,type}'='Application Approval' AND (f#>>'{sourceDates,applicationActionAt}')::date<=current_date AND jsonb_array_length(input#>'{derived,recordEvents}')=1 AND input#>'{derived,recordEvents,0}'=input->'componentMilestone' THEN
   IF EXISTS(SELECT 1 FROM project_activity WHERE project_id=pid AND event_date=f#>>'{sourceDates,applicationActionAt}' AND type IN('Application Approval','Approval') AND source_url=f->>'url') THEN outcome='unchanged';
   ELSIF r.dry_run THEN outcome='would_add_milestone';
   ELSE
    IF NOT control.writes_enabled OR NOT control.pilot_approved THEN PERFORM bw_fail(403,'Live writes disabled.');END IF;
    p=bw_publish(old,'automation:github',input->'derived');
    INSERT INTO maintenance_mutations VALUES(mut_id,r.id,pid,'milestone',old,p,now(),NULL);
    outcome='milestone_added';
   END IF;
   INSERT INTO maintenance_findings VALUES(mut_id,s.id,f->>'externalId',r.id,f,input->'confidence',now(),outcome,pid);
   RETURN jsonb_build_object('outcome',outcome);
  END IF;
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
  IF NOT r.dry_run AND old IS NOT NULL AND s.authority='official' AND s.autopublish AND input->>'eligible'='true' AND s.config->>'constructionScheduleVerified'='true' AND s.config->>'statusScope'='development' AND s.config->>'scopeVerified'='true' AND outcome NOT IN('excluded_archive','potential_duplicate','awaiting_review') AND f#>>'{sourceDates,constructionStartAt}' IS NOT NULL AND (f#>>'{sourceDates,constructionStartAt}')::date>current_date AND f->>'url' LIKE 'https://%' AND length(coalesce(f->>'quote',''))>0 THEN
   v=jsonb_build_object('kind','schedule-through','date',f#>>'{sourceDates,constructionStartAt}','url',f->>'url','quote',f->>'quote');
   UPDATE approval_policy SET schedules=CASE WHEN schedules::jsonb @> jsonb_build_array(v) THEN schedules ELSE (schedules::jsonb||jsonb_build_array(v))::text END,exception_until=greatest(coalesce(exception_until,0),floor(extract(epoch FROM ((f#>>'{sourceDates,constructionStartAt}')::date+1)::timestamptz)*1000)::bigint),due_at=greatest(due_at,floor(extract(epoch FROM ((f#>>'{sourceDates,constructionStartAt}')::date+1)::timestamptz)*1000)::bigint),updated=bw_now() WHERE project_id=pid;
   PERFORM bw_refresh(pid);
   v=NULL;
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
   UPDATE research_proposals SET data=(data::jsonb||jsonb_build_object('before',jsonb_build_object('status',p->'status','revision',p->'revision','description',p->'description')))::text WHERE batch_id='maintenance-'||r.id AND kind='information' AND project_id=pid AND status='pending';
   UPDATE maintenance_findings SET outcome='published' WHERE id=mut_id;outcome='published';
  ELSIF NOT r.dry_run AND outcome IN('awaiting_review','potential_duplicate') THEN
   INSERT INTO research_batches VALUES('maintenance-'||r.id,now()::text,'{"mode":"github-maintenance","autoMerged":0}') ON CONFLICT DO NOTHING;
   v=jsonb_build_object('id',mut_id,'kind',CASE WHEN old IS NOT NULL AND f->>'status' IS NOT NULL THEN 'status' ELSE 'uncertain' END,'projectId',old->'id','projectName',f->'name','jurisdiction',s.jurisdiction,'reason',input->>'reason','before',jsonb_build_object('status',old->'status','revision',old->'revision'),'patch',jsonb_build_object('status',f->'status','sourceStatus',f->'rawStatus'),'evidence',jsonb_build_object('url',f->'url','checkedAt',now(),'publishedAt',f->'publishedAt','eventDate',f->'eventDate','externalId',f->'externalId','summary',f->'quote'));
   INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(mut_id,'maintenance-'||r.id,v->>'kind',old->>'id',v::text,bw_now()) ON CONFLICT DO NOTHING;
  END IF;
  IF outcome='unchanged' AND EXISTS(SELECT 1 FROM research_proposals WHERE batch_id='maintenance-'||r.id AND project_id=pid AND kind='information' AND status='pending') THEN outcome='awaiting_review';UPDATE maintenance_findings SET outcome='awaiting_review' WHERE id=mut_id;END IF;
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
  -- Explicit component semantics are configured by administrators, not inferred from 'Approved'.
  IF old IS NOT NULL AND outcome NOT IN('excluded_archive','potential_duplicate') AND s.authority='official' AND s.config->>'componentMilestonesVerified'='true' AND s.config->>'statusScope'='application' AND lower(trim(old->>'name'))=lower(trim(f->>'name')) AND f#>>'{sourceFacts,applicationAction}'='TRC Approved' AND f#>>'{sourceDates,applicationActionAt}' IS NOT NULL AND f#>>'{sourceDates,applicationActionAt}'=input#>>'{componentMilestone,date}' AND f->>'url'=input#>>'{componentMilestone,url}' AND input#>>'{componentMilestone,type}'='Application Approval' AND (f#>>'{sourceDates,applicationActionAt}')::date<=current_date AND jsonb_array_length(input#>'{derived,recordEvents}')=1 AND input#>'{derived,recordEvents,0}'=input->'componentMilestone' THEN
   IF EXISTS(SELECT 1 FROM project_activity WHERE project_id=pid AND event_date=f#>>'{sourceDates,applicationActionAt}' AND type IN('Application Approval','Approval') AND source_url=f->>'url') THEN outcome='unchanged';
   ELSIF r.dry_run THEN outcome='would_add_milestone';
   ELSE
    IF NOT control.writes_enabled OR NOT control.pilot_approved THEN PERFORM bw_fail(403,'Live writes disabled.');END IF;
    p=bw_publish(old,'automation:github',input->'derived');
    INSERT INTO maintenance_mutations VALUES(mut_id,r.id,pid,'milestone',old,p,now(),NULL);
    outcome='milestone_added';
   END IF;
   INSERT INTO maintenance_findings VALUES(mut_id,s.id,f->>'externalId',r.id,f,input->'confidence',now(),outcome,pid);
   RETURN jsonb_build_object('outcome',outcome);
  END IF;
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
  IF NOT r.dry_run AND old IS NOT NULL AND s.authority='official' AND s.autopublish AND input->>'eligible'='true' AND s.config->>'constructionScheduleVerified'='true' AND s.config->>'statusScope'='development' AND s.config->>'scopeVerified'='true' AND outcome NOT IN('excluded_archive','potential_duplicate','awaiting_review') AND f#>>'{sourceDates,constructionStartAt}' IS NOT NULL AND (f#>>'{sourceDates,constructionStartAt}')::date>current_date AND f->>'url' LIKE 'https://%' AND length(coalesce(f->>'quote',''))>0 THEN
   v=jsonb_build_object('kind','schedule-through','date',f#>>'{sourceDates,constructionStartAt}','url',f->>'url','quote',f->>'quote');
   UPDATE approval_policy SET schedules=CASE WHEN schedules::jsonb @> jsonb_build_array(v) THEN schedules ELSE (schedules::jsonb||jsonb_build_array(v))::text END,exception_until=greatest(coalesce(exception_until,0),floor(extract(epoch FROM ((f#>>'{sourceDates,constructionStartAt}')::date+1)::timestamptz)*1000)::bigint),due_at=greatest(due_at,floor(extract(epoch FROM ((f#>>'{sourceDates,constructionStartAt}')::date+1)::timestamptz)*1000)::bigint),updated=bw_now() WHERE project_id=pid;
   PERFORM bw_refresh(pid);
   v=NULL;
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
   UPDATE research_proposals SET data=(data::jsonb||jsonb_build_object('before',jsonb_build_object('status',p->'status','revision',p->'revision','description',p->'description')))::text WHERE batch_id='maintenance-'||r.id AND kind='information' AND project_id=pid AND status='pending';
   UPDATE maintenance_findings SET outcome='published' WHERE id=mut_id;outcome='published';
  ELSIF NOT r.dry_run AND outcome IN('awaiting_review','potential_duplicate') THEN
   INSERT INTO research_batches VALUES('maintenance-'||r.id,now()::text,'{"mode":"github-maintenance","autoMerged":0}') ON CONFLICT DO NOTHING;
   v=jsonb_build_object('id',mut_id,'kind',CASE WHEN old IS NOT NULL AND f->>'status' IS NOT NULL THEN 'status' ELSE 'uncertain' END,'projectId',old->'id','projectName',f->'name','jurisdiction',s.jurisdiction,'reason',input->>'reason','before',jsonb_build_object('status',old->'status','revision',old->'revision'),'patch',jsonb_build_object('status',f->'status','sourceStatus',f->'rawStatus'),'evidence',jsonb_build_object('url',f->'url','checkedAt',now(),'publishedAt',f->'publishedAt','eventDate',f->'eventDate','externalId',f->'externalId','summary',f->'quote'));
   INSERT INTO research_proposals(id,batch_id,kind,project_id,data,updated) VALUES(mut_id,'maintenance-'||r.id,v->>'kind',old->>'id',v::text,bw_now()) ON CONFLICT DO NOTHING;
  END IF;
  IF outcome='unchanged' AND EXISTS(SELECT 1 FROM research_proposals WHERE batch_id='maintenance-'||r.id AND project_id=pid AND kind='information' AND status='pending') THEN outcome='awaiting_review';UPDATE maintenance_findings SET outcome='awaiting_review' WHERE id=mut_id;END IF;
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
CREATE INDEX maintenance_lifecycle_source ON buildwatch.maintenance_lifecycle(source_id);CREATE INDEX maintenance_lifecycle_run ON buildwatch.maintenance_lifecycle(checked_run);
REVOKE ALL ON FUNCTION public.buildwatch_maintenance_worker(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_maintenance_worker(text,jsonb) TO buildwatch_worker,service_role;
REVOKE ALL ON FUNCTION buildwatch_audit.buildwatch_maintenance_worker(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION buildwatch_audit.buildwatch_maintenance_worker(text,jsonb) TO buildwatch_worker;
