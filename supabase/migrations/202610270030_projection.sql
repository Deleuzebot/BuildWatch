SET search_path=buildwatch,pg_catalog,extensions;
CREATE OR REPLACE FUNCTION buildwatch.bw_refresh(pid text,derived jsonb DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog,extensions AS $$
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
 AND NOT EXISTS(SELECT 1 FROM approval_policy WHERE project_id=pid AND p->>'status'='Approved' AND due_at<=bw_now())
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
   IF origin_name IN ('meeting','policy') THEN DELETE FROM project_activity WHERE project_id=pid AND origin=origin_name AND event_key NOT IN(SELECT value->>'key' FROM jsonb_array_elements(events));END IF;
   IF origin_name='record' AND policy_exists THEN DELETE FROM project_activity WHERE project_id=pid AND origin='record' AND type='Approval';END IF;
   FOR e IN SELECT * FROM jsonb_array_elements(events) LOOP
    IF origin_name='record' AND policy_exists AND e->>'type'='Approval' THEN CONTINUE;END IF;
    INSERT INTO project_activity VALUES(gen_random_uuid()::text,pid,origin_name,e->>'key',e->>'type',e->>'date',(e->>'at')::bigint,e->>'description',e->>'url',bw_now())
     ON CONFLICT(project_id,origin,event_key) DO UPDATE SET event_date=excluded.event_date,occurred_at=excluded.occurred_at,description=excluded.description,source_url=excluded.source_url
     WHERE project_activity.event_date IS DISTINCT FROM excluded.event_date OR project_activity.description IS DISTINCT FROM excluded.description OR project_activity.source_url IS DISTINCT FROM excluded.source_url;
   END LOOP;
  END LOOP;
 END IF;
 UPDATE map_meta SET version=version+1 WHERE id=1;
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_duplicate_preview(cid text,input jsonb,actor text) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$ DECLARE p jsonb;token text=gen_random_uuid()::text;expires bigint=bw_now()+600000;BEGIN
 IF length(coalesce(input->>'note',''))>4000 THEN PERFORM bw_fail(400,'Use a note of at most 4,000 characters.');END IF;
 p=bw_preview_compute(cid,input);
 DELETE FROM duplicate_previews WHERE duplicate_previews.expires<bw_now();
 INSERT INTO duplicate_previews VALUES(token,actor,cid,input::text,p->>'signature',expires,0);
 RETURN(p-ARRAY['before','signature'])||jsonb_build_object('token',token,'expires',expires);END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_commit_info(token_id text,actor_id text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$ DECLARE saved duplicate_previews%ROWTYPE;p jsonb;BEGIN
 SELECT * INTO saved FROM duplicate_previews WHERE token=token_id;
 IF NOT FOUND OR saved.actor<>actor_id OR saved.used<>0 OR saved.expires<bw_now() THEN PERFORM bw_fail(409,'Preview expired, already used, or belongs to another administrator.');END IF;
 p=bw_preview_compute(saved.candidate_id,saved.input::jsonb);IF p->>'signature'<>saved.signature THEN PERFORM bw_fail(409,'A project or relationship changed. Generate a fresh preview.');END IF;
 RETURN p||jsonb_build_object('policy',(SELECT to_jsonb(l) FROM approval_policy l WHERE project_id=p->>'primary'));END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_duplicate_commit(token_id text,actor_id text,derived jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
<<bw_duplicate_commit>>
DECLARE p jsonb;decision text=gen_random_uuid()::text;created bigint=bw_now();ids text[];after_state jsonb;child text;
BEGIN
 PERFORM pg_advisory_xact_lock(72644322);PERFORM 1 FROM duplicate_previews WHERE token=token_id FOR UPDATE;
 p=bw_commit_info(token_id,actor_id);ids=ARRAY(SELECT jsonb_array_elements_text(p->'before'->'ids'));
 PERFORM 1 FROM projects WHERE id=ANY(ids) ORDER BY id FOR UPDATE;
 INSERT INTO duplicate_decisions(id,candidate_id,action,actor,created,note,before_state,after_state,undoes_id)
 VALUES(decision,p->>'candidateId',p->'input'->>'action',actor_id,created,coalesce(p->'input'->>'note',''),(p->'before')::text,NULL,NULL);
 UPDATE project_relationships SET target_id=p->>'primary',decision_id=decision,created=bw_duplicate_commit.created WHERE target_id=p->>'secondary';
 INSERT INTO project_relationships VALUES(p->>'secondary',p->>'primary',CASE WHEN p->'input'->>'action'='merge' THEN 'merge' ELSE 'supporting' END,decision,created);
 INSERT INTO project_overrides VALUES(p->>'primary',(p->'result')::text,(p->'result'->>'revision')::bigint) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,revision=excluded.revision;
 UPDATE duplicate_candidates SET status=CASE WHEN p->'input'->>'action'='merge' THEN 'merged' ELSE 'linked' END,revision=revision+1,updated_at=created WHERE id=p->>'candidateId';
 PERFORM bw_refresh(p->>'primary',derived);
 FOREACH child IN ARRAY ids LOOP IF child<>p->>'primary' THEN PERFORM bw_refresh(child);END IF;END LOOP;
 after_state=bw_capture(ids);UPDATE duplicate_decisions SET after_state=bw_duplicate_commit.after_state::text WHERE id=decision;
 UPDATE duplicate_previews SET used=1 WHERE token=token_id;
 RETURN jsonb_build_object('decisionId',decision,'canonicalId',p->'primary','project',bw_project(p->>'primary'));
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_duplicate_undo(decision_id text,actor_id text,note text,derived_by_id jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE event duplicate_decisions%ROWTYPE;before_state jsonb;after_state jsonb;current_state jsonb;ids text[];r jsonb;p jsonb;undo_id text=gen_random_uuid()::text;next_revision bigint;pid text;
BEGIN
 PERFORM pg_advisory_xact_lock(72644322);SELECT * INTO event FROM duplicate_decisions WHERE id=decision_id FOR UPDATE;
 IF NOT FOUND OR event.action NOT IN ('merge','supporting') OR event.after_state IS NULL THEN PERFORM bw_fail(400,'Choose an applied merge or supporting link.');END IF;
 IF EXISTS(SELECT 1 FROM duplicate_decisions WHERE undoes_id=decision_id) THEN PERFORM bw_fail(409,'This decision was already undone.');END IF;
 IF length(coalesce(note,''))>4000 THEN PERFORM bw_fail(400,'Use a note of at most 4,000 characters.');END IF;
 before_state=event.before_state::jsonb;after_state=event.after_state::jsonb;
 ids=ARRAY(SELECT DISTINCT unnest(bw_components(value)) FROM jsonb_array_elements_text(after_state->'ids') ORDER BY 1);
 PERFORM 1 FROM projects WHERE id=ANY(ids) ORDER BY id FOR UPDATE;current_state=bw_capture(ids);
 IF bw_semantic(current_state)<>bw_semantic(after_state) THEN PERFORM bw_fail(409,'Later edits or relationships depend on this decision. Undo those later changes first.');END IF;
 next_revision=(SELECT coalesce(max((p->'data'->>'revision')::bigint),0)+1 FROM jsonb_array_elements(current_state->'profiles') p);
 INSERT INTO duplicate_decisions(id,candidate_id,action,actor,created,note,before_state,after_state,undoes_id) VALUES(undo_id,event.candidate_id,'undo',actor_id,bw_now(),coalesce(note,''),current_state::text,before_state::text,decision_id);
 DELETE FROM project_relationships WHERE source_id=ANY(ids);
 FOR r IN SELECT * FROM jsonb_array_elements(before_state->'relations') LOOP INSERT INTO project_relationships VALUES(r->>'source_id',r->>'target_id',r->>'kind',r->>'decision_id',(r->>'created')::bigint);END LOOP;
 FOR p IN SELECT * FROM jsonb_array_elements(before_state->'profiles') LOOP
  pid=p->>'id';IF NOT EXISTS(SELECT 1 FROM projects WHERE id=pid) THEN CONTINUE;END IF;
  IF derived_by_id->pid IS NULL THEN PERFORM bw_fail(400,'Trusted restoration classification is required.');END IF;
  INSERT INTO project_overrides VALUES(pid,((p->'data')||jsonb_build_object('revision',next_revision))::text,next_revision) ON CONFLICT(project_id) DO UPDATE SET data=excluded.data,revision=excluded.revision;
  PERFORM bw_refresh(pid,derived_by_id->pid);
 END LOOP;
 UPDATE duplicate_candidates SET status='pending',revision=revision+1,updated_at=bw_now() WHERE id=event.candidate_id;
 FOR r IN SELECT to_jsonb(c) FROM duplicate_candidates c WHERE c.status IN ('merged','linked') LOOP
  IF bw_canonical(r->>'a_id')<>bw_canonical(r->>'b_id') AND (SELECT action FROM duplicate_decisions WHERE candidate_id=r->>'id' ORDER BY created DESC,rowid DESC LIMIT 1)='acknowledge' THEN
   INSERT INTO duplicate_decisions(id,candidate_id,action,actor,created,note) VALUES(gen_random_uuid()::text,r->>'id','dependency_undone',actor_id,bw_now(),'Earlier relationship was undone; review reopened.');
   UPDATE duplicate_candidates SET status='pending',revision=revision+1,updated_at=bw_now() WHERE id=r->>'id';
  END IF;
 END LOOP;
 RETURN jsonb_build_object('undoId',undo_id,'restoredRecords',before_state->'ids');
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
