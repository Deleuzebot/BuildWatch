SET search_path=buildwatch,pg_catalog,extensions;
CREATE OR REPLACE FUNCTION buildwatch.bw_inventory() RETURNS TABLE(rowid bigint,id text,revision bigint,data jsonb,archive_reason text,archived_at bigint,archive_actor text,run_id text)
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 WITH raw AS MATERIALIZED(SELECT p.rowid,p.id,coalesce(o.revision,p.revision) revision,coalesce(o.data,p.data)::jsonb data,c.normalized::jsonb category FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id LEFT JOIN project_categories c ON c.project_id=p.id)
 SELECT p.rowid,p.id,p.revision,p.data||jsonb_build_object('category',coalesce(p.category->>'category',p.data->>'category')),
 coalesce(a.reason,CASE WHEN p.data->>'archived'='true' THEN 'manual' WHEN p.data->>'evidenceType'='permit' AND p.data->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications WHERE project_id=p.id) THEN 'supporting_permit_only' ELSE 'approved_expired' END),a.archived_at,a.actor,a.run_id
 FROM raw p LEFT JOIN archived_projects a ON a.project_id=p.id LEFT JOIN approval_policy l ON l.project_id=p.id
 WHERE a.project_id IS NOT NULL OR p.data->>'archived'='true'
 OR(p.data->>'status'='Approved' AND p.data->>'evidenceType'='permit' AND p.data->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications WHERE project_id=p.id))
 OR(p.data->>'status'='Approved' AND l.due_at<=bw_now()) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_match(p jsonb,reason text,approval text,filters jsonb) RETURNS boolean
 LANGUAGE plpgsql IMMUTABLE SET search_path=buildwatch,pg_catalog AS $$
DECLARE key text;v text;actual text;BEGIN
 FOREACH key IN ARRAY ARRAY['state','county','municipality','type'] LOOP
  v=filters->>key;IF v IS NULL OR v='' THEN CONTINUE;END IF;IF length(v)>200 THEN PERFORM bw_fail(400,'Invalid archive filter.');END IF;
  actual=CASE key WHEN 'state' THEN p->>'state' WHEN 'county' THEN p->>'county' WHEN 'municipality' THEN coalesce(p->>'city',p->>'jurisdiction') ELSE p->>'category' END;
  IF lower(coalesce(actual,''))<>lower(v) THEN RETURN false;END IF;
 END LOOP;
 v=filters->>'search';IF length(v)>200 THEN PERFORM bw_fail(400,'Search is too long.');END IF;
 IF coalesce(v,'')<>'' AND position(lower(v) IN lower(concat_ws(' ',p->>'id',p->>'name',p->>'address')))=0 THEN RETURN false;END IF;
 v=filters->>'reason';IF coalesce(v,'')<>'' THEN IF NOT(v=ANY(ARRAY['approved_expired','legacy_archived','manual','supporting_permit_only','road_not_significant'])) THEN PERFORM bw_fail(400,'Invalid archival reason.');END IF;IF reason<>v THEN RETURN false;END IF;END IF;
 FOREACH key IN ARRAY ARRAY['after','before'] LOOP v=filters->>key;IF coalesce(v,'')='' THEN CONTINUE;END IF;IF v!~'^\d{4}-\d{2}-\d{2}$' THEN PERFORM bw_fail(400,'Use ISO approval dates.');END IF;IF approval IS NULL OR(key='after' AND left(approval,10)<v) OR(key='before' AND left(approval,10)>v) THEN RETURN false;END IF;END LOOP;
 RETURN true;END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_stats() RETURNS jsonb LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT jsonb_build_object('storedRecords',(SELECT count(*) FROM projects),'publicProjects',(SELECT count(*) FROM active_map_index),'archivedRecords',(SELECT count(*) FROM bw_inventory()),
 'approvedPublic',(SELECT count(*) FROM active_map_index WHERE status='Approved'),'inReviewPublic',(SELECT count(*) FROM active_map_index WHERE status='In review'),
 'approvedMissingDateStored',(SELECT count(*) FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id LEFT JOIN approval_policy l ON l.project_id=p.id WHERE coalesce(o.data,p.data)::jsonb->>'status'='Approved' AND l.approval_at IS NULL),
 'approvedMissingDate',(SELECT count(*) FROM active_map_index m LEFT JOIN approval_policy l ON l.project_id=m.id WHERE m.status='Approved' AND l.approval_at IS NULL),
 'futureExceptions',(SELECT count(*) FROM active_map_index m JOIN approval_policy l ON l.project_id=m.id WHERE m.status='Approved' AND l.expires_at<=bw_now() AND l.exception_until>bw_now()),
 'latestCleanup',(SELECT to_jsonb(e)||jsonb_build_object('statistics',e.statistics::jsonb) FROM expiration_cleanups e ORDER BY created DESC LIMIT 1)) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_row(pid text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 WITH p AS(SELECT p.rowid,p.id,coalesce(o.revision,p.revision) revision,coalesce(o.data,p.data)::jsonb data,c.normalized::jsonb category FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id LEFT JOIN project_categories c ON c.project_id=p.id WHERE p.id=pid)
 SELECT jsonb_build_object('id',p.id,'rowid',p.rowid,'revision',p.revision,'data',p.data||jsonb_build_object('category',coalesce(p.category->>'category',p.data->>'category')),'archive_reason',coalesce(a.reason,CASE WHEN p.data->>'archived'='true' THEN 'manual' WHEN p.data->>'evidenceType'='permit' AND p.data->>'jurisdiction'='NC DEQ construction stormwater' THEN 'supporting_permit_only' ELSE 'approved_expired' END),'archived_at',a.archived_at)
 FROM p LEFT JOIN archived_projects a ON a.project_id=p.id LEFT JOIN approval_policy l ON l.project_id=p.id
 WHERE a.project_id IS NOT NULL OR p.data->>'archived'='true' OR(p.data->>'status'='Approved' AND l.due_at<=bw_now()) OR(p.data->>'status'='Approved' AND p.data->>'evidenceType'='permit' AND p.data->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications WHERE project_id=p.id)) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_blocker(pid text,action_name text) RETURNS text LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
DECLARE p jsonb=bw_profile(pid);BEGIN
 IF bw_archive_row(pid) IS NULL THEN RETURN 'No longer archived.';END IF;
 IF action_name='delete' THEN
  IF p->>'status'='In review' THEN RETURN 'In Review records are protected from permanent deletion.';END IF;
  IF EXISTS(SELECT 1 FROM project_relationships WHERE source_id=pid OR target_id=pid) OR EXISTS(SELECT 1 FROM duplicate_candidates c JOIN duplicate_decisions d ON d.candidate_id=c.id JOIN project_relationships r ON r.decision_id=d.id WHERE c.a_id=pid OR c.b_id=pid) THEN RETURN 'Merged/supporting relationship exists. Undo it before deletion.';END IF;
 ELSE
  IF EXISTS(SELECT 1 FROM road_project_policy WHERE project_id=pid AND detail::jsonb->>'qualifies'='false') THEN RETURN 'Verified scope does not meet the major-road policy.';END IF;
  IF p->>'evidenceType'='permit' AND p->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications WHERE project_id=pid) THEN RETURN 'Stormwater coverage alone is not a public-facing development.';END IF;
  IF p->>'status'='Approved' AND EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND due_at<=bw_now()) THEN RETURN 'Approval expired; document qualifying activity before restoring.';END IF;
  IF p->>'status' IN('Completed','Cancelled') THEN RETURN 'Completed/cancelled projects cannot return to the public map.';END IF;
  IF EXISTS(SELECT 1 FROM project_relationships WHERE source_id=pid) THEN RETURN 'Restore the canonical project instead.';END IF;
  IF EXISTS(SELECT 1 FROM automation_project_policy WHERE project_id=pid AND classification<>'Public-Facing Development') THEN RETURN 'This record is classified as non-public.';END IF;
 END IF;RETURN '';END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_snapshot(pid text) RETURNS text LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$ SELECT bw_hash(jsonb_build_array(i->'data',i->'archive_reason',coalesce((SELECT updated FROM approval_policy WHERE project_id=pid),0))) FROM(SELECT bw_archive_row(pid) i) s WHERE i IS NOT NULL $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_delete_archived(pid text,op archive_operations) RETURNS void LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE cid text;rid text;table_name text;p jsonb=bw_profile(pid);BEGIN
 INSERT INTO deleted_project_ids VALUES(pid,op.id,bw_now(),(SELECT coalesce(jsonb_agg(encode(sha256(convert_to((s->>'url')||'|'||pid,'UTF8')),'hex')),'[]')::text FROM jsonb_array_elements(coalesce(p->'sources','[]')) s));
 FOR cid IN SELECT id FROM duplicate_candidates WHERE a_id=pid OR b_id=pid LOOP DELETE FROM duplicate_previews WHERE candidate_id=cid;DELETE FROM duplicate_decisions WHERE candidate_id=cid;DELETE FROM duplicate_candidates WHERE id=cid;END LOOP;
 DELETE FROM duplicate_group_members WHERE project_id=pid;
 FOR rid IN SELECT id FROM research_proposals WHERE project_id=pid LOOP DELETE FROM research_previews WHERE proposal_id=rid;DELETE FROM research_audit WHERE proposal_id=rid;DELETE FROM research_proposals WHERE id=rid;END LOOP;
 FOREACH table_name IN ARRAY ARRAY['follows','follow_history','history','notifications','notification_meeting_refs','classification_review_candidates','project_overrides','project_retirements','automation_project_policy','approval_policy','community_verifications','policy_expiration_queue','policy_permit_queue','archived_projects','verified_import_evidence'] LOOP EXECUTE format('DELETE FROM buildwatch.%I WHERE project_id=$1',table_name) USING pid;END LOOP;
 DELETE FROM submissions WHERE project_id=pid AND kind='correction';UPDATE submissions SET project_id=NULL,patch=NULL WHERE project_id=pid;
 DELETE FROM source_bindings WHERE project_id=pid OR record_id=pid;DELETE FROM automation_reviews WHERE project_id=pid OR record_id=pid;DELETE FROM automation_changes WHERE project_id=pid;
 DELETE FROM supporting_sources WHERE id=pid;DELETE FROM archive_events WHERE project_id=pid;
 DELETE FROM map_meetings WHERE project_rid=(SELECT rowid FROM projects WHERE id=pid);DELETE FROM map_types WHERE rid=(SELECT rowid FROM projects WHERE id=pid);DELETE FROM map_index WHERE id=pid;DELETE FROM projects WHERE id=pid;
 INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'permanently_deleted',op.actor,bw_now(),jsonb_build_object('operationId',op.id)::text);UPDATE map_meta SET version=version+1 WHERE id=1;
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_step(oid text,actor_id text) RETURNS void LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
<<bw_archive_step>>
DECLARE op archive_operations%ROWTYPE;scope jsonb;r record;why text;last_rid bigint;rows_count int=0;p jsonb;prior_p jsonb;updated_count int=0;counts record;
BEGIN
 SELECT * INTO op FROM archive_operations WHERE id=oid AND actor=actor_id FOR UPDATE;
 IF NOT FOUND OR op.status NOT IN('preparing','running') THEN RETURN;END IF;
 IF NOT EXISTS(SELECT 1 FROM users WHERE id=actor_id AND role='admin' AND verified=1 AND disabled=0) THEN PERFORM bw_fail(403,'Administrator access revoked.');END IF;
 scope=op.scope::jsonb;
 IF op.status='preparing' THEN
  FOR r IN SELECT i.* FROM bw_inventory() i LEFT JOIN approval_policy l ON l.project_id=i.id WHERE i.rowid>coalesce((scope->>'cursor')::bigint,0) AND i.rowid<=(scope->>'cutoff')::bigint
   AND bw_archive_match(i.data,i.archive_reason,l.approval_date,coalesce(scope->'filters','{}')) AND(NOT(scope?'ids') OR i.id IN(SELECT jsonb_array_elements_text(scope->'ids'))) ORDER BY i.rowid LIMIT 100 LOOP
   why=bw_archive_blocker(r.id,op.action);INSERT INTO archive_operation_items(operation_id,project_id,snapshot,status,reason) VALUES(oid,r.id,bw_archive_snapshot(r.id),CASE WHEN why='' THEN 'pending' ELSE 'blocked' END,why) ON CONFLICT DO NOTHING;
   rows_count=rows_count+1;last_rid=r.rowid;
  END LOOP;
  IF last_rid IS NOT NULL THEN scope=jsonb_set(scope,'{cursor}',to_jsonb(last_rid));END IF;
  SELECT count(*) selected,count(*) FILTER(WHERE status='pending') eligible,count(*) FILTER(WHERE status='blocked') blocked INTO counts FROM archive_operation_items WHERE operation_id=oid;
  UPDATE archive_operations SET scope=bw_archive_step.scope::text,status=CASE WHEN rows_count=100 THEN 'preparing' ELSE 'preview' END,updated=bw_now(),expires=bw_now()+600000,selected=counts.selected,eligible=counts.eligible,blocked=counts.blocked WHERE id=oid;
 ELSE
  FOR r IN SELECT * FROM archive_operation_items WHERE operation_id=oid AND status='pending' ORDER BY project_id LIMIT 25 FOR UPDATE LOOP
   rows_count=rows_count+1;why=bw_archive_blocker(r.project_id,op.action);
   IF why='' AND bw_archive_snapshot(r.project_id) IS DISTINCT FROM r.snapshot THEN why='Record or documentation changed after confirmation.';END IF;
   IF why<>'' THEN UPDATE archive_operation_items SET status='blocked',reason=why WHERE operation_id=oid AND project_id=r.project_id;CONTINUE;END IF;
   IF op.action='delete' THEN PERFORM bw_delete_archived(r.project_id,op);updated_count=updated_count+1;
   ELSE
    SELECT data::jsonb INTO prior_p FROM project_profiles WHERE id=r.project_id;p=prior_p||jsonb_build_object('archived',false,'revision',(prior_p->>'revision')::bigint+1);
    INSERT INTO project_overrides VALUES(r.project_id,p::text,(p->>'revision')::bigint) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,revision=excluded.revision;
    DELETE FROM archived_projects WHERE project_id=r.project_id;INSERT INTO history VALUES(gen_random_uuid()::text,r.project_id,actor_id,prior_p::text,p::text,bw_now());
    INSERT INTO archive_events VALUES(gen_random_uuid()::text,r.project_id,'restored',actor_id,bw_now(),'Administrator confirmed restoration.');PERFORM bw_refresh(r.project_id);
   END IF;
   UPDATE archive_operation_items SET status='done' WHERE operation_id=oid AND project_id=r.project_id;
  END LOOP;
  SELECT count(*) FILTER(WHERE status='done') done,count(*) FILTER(WHERE status='blocked') blocked INTO counts FROM archive_operation_items WHERE operation_id=oid;
  UPDATE archive_operations SET done=counts.done,blocked=counts.blocked,updated=bw_now(),status=CASE WHEN rows_count=0 THEN CASE WHEN counts.blocked>0 THEN 'partial' ELSE 'completed' END ELSE 'running' END WHERE id=oid;
  IF op.action='delete' THEN UPDATE permanent_deletion_audit SET record_count=record_count+updated_count,finished=CASE WHEN rows_count=0 THEN bw_now() ELSE NULL END WHERE operation_id=oid;END IF;
 END IF;
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_operation(oid text,actor_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE op archive_operations%ROWTYPE;BEGIN
 SELECT * INTO op FROM archive_operations WHERE id=oid AND actor=actor_id;IF NOT FOUND THEN PERFORM bw_fail(404,'Operation not found.');END IF;
 RETURN to_jsonb(op)||jsonb_build_object('scope',jsonb_build_object('allArchived',coalesce((op.scope::jsonb->>'allArchived')::boolean,false)),
 'items',(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM(SELECT project_id,status,reason FROM archive_operation_items WHERE operation_id=oid AND status IN('blocked','error') ORDER BY project_id LIMIT 100) i),
 'canResume',op.status IN('preparing','running','interrupted') AND op.updated<bw_now()-30000);
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_archive_api(u jsonb,method text,path text,input jsonb,q jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE actor_id text=u->>'id';parts text[]=string_to_array(path,'/');pid text;oid text;page int=coalesce((q->>'page')::int,0);total bigint;items jsonb;review boolean=q->>'scope'='review';p jsonb;l approval_policy%ROWTYPE;old_updated bigint;vals jsonb;op archive_operations%ROWTYPE;scope jsonb;raw jsonb;
BEGIN
 IF page<0 OR page>1000000 THEN PERFORM bw_fail(400,'Invalid page.');END IF;
 IF path='/api/admin/archives' AND method='GET' THEN
  IF review THEN
   WITH candidates AS MATERIALIZED(SELECT p.id,p.rowid,p.revision,coalesce(c.normalized::jsonb,'{}')||coalesce(o.data,p.data)::jsonb data,l.approval_date,l.exception_until FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id LEFT JOIN project_categories c ON c.project_id=p.id LEFT JOIN approval_policy l ON l.project_id=p.id WHERE coalesce(o.data,p.data)::jsonb->>'status'='Approved' AND l.approval_at IS NULL AND NOT EXISTS(SELECT 1 FROM bw_inventory() a WHERE a.id=p.id)),
   eligible AS MATERIALIZED(SELECT * FROM candidates WHERE bw_archive_match(data,'missing_approval_date',approval_date,q-'reason')),
   page_rows AS(SELECT * FROM eligible ORDER BY rowid LIMIT 50 OFFSET page*50)
   SELECT(SELECT count(*) FROM eligible),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'revision',p.revision,'name',p.data->'name','originalStatus',p.data->'status','state',p.data->'state','county',p.data->'county','city',p.data->'city','type',p.data->'category','archive_reason','missing_approval_date','archived_at',NULL,'approval_date',p.approval_date,'exception_until',p.exception_until) ORDER BY rowid),'[]') INTO total,items FROM page_rows p;
  ELSE
   WITH eligible AS MATERIALIZED(SELECT i.*,l.approval_date,l.exception_until FROM bw_inventory() i LEFT JOIN approval_policy l ON l.project_id=i.id WHERE bw_archive_match(i.data,i.archive_reason,l.approval_date,q)),page_rows AS(SELECT * FROM eligible ORDER BY rowid LIMIT 50 OFFSET page*50)
   SELECT(SELECT count(*) FROM eligible),coalesce(jsonb_agg(jsonb_build_object('id',p.id,'revision',p.revision,'name',p.data->'name','originalStatus',p.data->'status','state',p.data->'state','county',p.data->'county','city',p.data->'city','type',p.data->'category','archive_reason',p.archive_reason,'archived_at',p.archived_at,'approval_date',p.approval_date,'exception_until',p.exception_until) ORDER BY rowid),'[]') INTO total,items FROM page_rows p;
  END IF;
  RETURN jsonb_build_object('items',items,'total',total,'page',page,'hasMore',(page+1)*50<total,'stats',bw_archive_stats(),'operations',(SELECT coalesce(jsonb_agg(to_jsonb(o)),'[]') FROM(SELECT id,action,status,selected,eligible,done,blocked,created,updated FROM archive_operations ORDER BY created DESC LIMIT 10) o));
 END IF;
 IF path~'^/api/admin/archives/records/[A-Za-z0-9-]{1,160}$' THEN
  pid=parts[6];SELECT data::jsonb INTO p FROM project_profiles WHERE id=pid;IF p IS NULL THEN PERFORM bw_fail(404,'Project not found.');END IF;
  SELECT * INTO l FROM approval_policy WHERE project_id=pid;
  IF method='PUT' THEN
   IF(p->>'revision')::bigint<>coalesce((input->>'revision')::bigint,-1) OR coalesce(l.updated,0)<>coalesce((input->>'policyUpdated')::bigint,0) THEN PERFORM bw_fail(409,'Project or approval evidence changed. Reopen its documentation.');END IF;
   IF l.approval_at IS NOT NULL AND(input->'approval' IS NULL OR input->'approval'='null') THEN PERFORM bw_fail(400,'A documented approval date cannot be erased to bypass expiration.');END IF;
   vals=input->'_policy';IF vals IS NULL THEN PERFORM bw_fail(400,'Validated approval evidence is required.');END IF;
   INSERT INTO approval_policy VALUES(pid,input->'approval'->>'date',(vals->>'approvalAt')::bigint,CASE WHEN input->'approval'<>'null' THEN(input->'approval')::text ELSE NULL END,coalesce(input->'schedules','[]')::text,(vals->>'exceptionUntil')::bigint,(vals->>'expiresAt')::bigint,(vals->>'dueAt')::bigint,vals->>'reviewReason',actor_id,greatest(bw_now(),coalesce(l.updated,0)+1)) ON CONFLICT(project_id) DO UPDATE SET approval_date=excluded.approval_date,approval_at=excluded.approval_at,approval_evidence=excluded.approval_evidence,schedules=excluded.schedules,exception_until=excluded.exception_until,expires_at=excluded.expires_at,due_at=excluded.due_at,review_reason=excluded.review_reason,actor=excluded.actor,updated=excluded.updated;
   IF input?'communityEvidence' THEN INSERT INTO community_verifications VALUES(pid,(input->'communityEvidence')::text,actor_id,bw_now()) ON CONFLICT(project_id) DO UPDATE SET evidence=excluded.evidence,actor=excluded.actor,updated=excluded.updated;END IF;
   IF p->>'status'='Approved' AND(vals->>'dueAt')::bigint<=bw_now() AND NOT EXISTS(SELECT 1 FROM archived_projects WHERE project_id=pid) THEN INSERT INTO archived_projects VALUES(pid,'approved_expired',bw_now(),actor_id,NULL,input->'approval'->>'date',(vals->>'expiresAt')::bigint);INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'archived',actor_id,bw_now(),'Documented approval expired.');END IF;
   INSERT INTO archive_events VALUES(gen_random_uuid()::text,pid,'evidence_updated',actor_id,bw_now(),jsonb_build_object('approval',input->'approval','schedules',input->'schedules')::text);PERFORM bw_refresh(pid,input->'_derived');SELECT * INTO l FROM approval_policy WHERE project_id=pid;
  END IF;
  RETURN jsonb_build_object('project',p,'roadPolicy',(SELECT detail::jsonb FROM road_project_policy WHERE project_id=pid),'archive',(SELECT jsonb_build_object('reason',archive_reason,'archivedAt',archived_at) FROM bw_inventory() WHERE id=pid),'community',(SELECT to_jsonb(v)||jsonb_build_object('evidence',v.evidence::jsonb) FROM community_verifications v WHERE project_id=pid),
  'policy',CASE WHEN l.project_id IS NULL THEN NULL ELSE to_jsonb(l)||jsonb_build_object('approval',l.approval_evidence::jsonb,'schedules',l.schedules::jsonb) END,'history',(SELECT coalesce(jsonb_agg(to_jsonb(e)),'[]') FROM(SELECT * FROM archive_events WHERE project_id=pid ORDER BY created DESC LIMIT 100) e));
 END IF;
 IF path='/api/admin/archives/preview' AND method='POST' THEN
  IF coalesce(input->>'action','') NOT IN('delete','restore') THEN PERFORM bw_fail(400,'Choose restore or delete.');END IF;
  IF input?'ids' AND(jsonb_typeof(input->'ids')<>'array' OR jsonb_array_length(input->'ids')<1 OR jsonb_array_length(input->'ids')>1000) THEN PERFORM bw_fail(400,'Select 1–1,000 explicit records.');END IF;
  IF NOT(input?'ids') AND coalesce(input->>'allMatching','false')<>'true' AND coalesce(input->>'allArchived','false')<>'true' THEN PERFORM bw_fail(400,'Choose a selection.');END IF;
  IF input->>'allArchived'='true' AND input->>'action'<>'delete' THEN PERFORM bw_fail(400,'All archived scope requires its separate deletion action.');END IF;
  oid=gen_random_uuid()::text;scope=jsonb_build_object('filters',CASE WHEN input->>'allArchived'='true' THEN '{}'::jsonb ELSE coalesce(input->'filters','{}') END,'allArchived',coalesce((input->>'allArchived')::boolean,false),'cursor',0,'cutoff',(SELECT coalesce(max(rowid),0) FROM projects));IF input?'ids' THEN scope=scope||jsonb_build_object('ids',input->'ids');END IF;
  INSERT INTO archive_operations(id,actor,action,scope,status,created,updated,expires,owner) VALUES(oid,actor_id,input->>'action',scope::text,'preparing',bw_now(),bw_now(),bw_now()+600000,actor_id);PERFORM bw_archive_step(oid,actor_id);RETURN bw_archive_operation(oid,actor_id);
 END IF;
 IF path~'^/api/admin/archives/operations/[a-f0-9-]{36}(/(confirm|cancel|resume))?$' OR path='__archive_step' THEN
  oid=CASE WHEN path='__archive_step' THEN input->>'operationId' ELSE parts[6] END;SELECT * INTO op FROM archive_operations WHERE id=oid AND actor=actor_id FOR UPDATE;IF NOT FOUND THEN PERFORM bw_fail(404,'Operation not found.');END IF;
  IF method='POST' AND parts[7]='confirm' THEN
   IF op.status<>'preview' OR op.expires<bw_now() OR op.eligible=0 THEN PERFORM bw_fail(409,'Selection is not ready or expired.');END IF;
   IF op.action='delete' AND(coalesce(input->>'word','')<>'DELETE' OR coalesce((input->>'allArchived')::boolean,false)<>coalesce((op.scope::jsonb->>'allArchived')::boolean,false)) THEN PERFORM bw_fail(400,'Type DELETE and use the matching confirmation.');END IF;
   UPDATE archive_operations SET status='running',updated=bw_now() WHERE id=oid;IF op.action='delete' THEN INSERT INTO permanent_deletion_audit VALUES(oid,actor_id,bw_now(),NULL,0);END IF;
  ELSIF method='POST' AND parts[7]='cancel' THEN IF op.status NOT IN('preview','preparing') THEN PERFORM bw_fail(409,'Only an unconfirmed selection can be cancelled.');END IF;UPDATE archive_operations SET status='cancelled',updated=bw_now() WHERE id=oid;
  ELSIF method='POST' AND parts[7]='resume' THEN IF op.status NOT IN('preparing','running','interrupted') OR op.updated>=bw_now()-30000 THEN PERFORM bw_fail(409,'Operation is active or cannot be resumed.');END IF;UPDATE archive_operations SET status=CASE WHEN op.status='preparing' OR op.scope::jsonb->>'resumeStatus'='preparing' THEN 'preparing' ELSE 'running' END,updated=bw_now() WHERE id=oid;END IF;
  PERFORM bw_archive_step(oid,actor_id);RETURN bw_archive_operation(oid,actor_id);
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
