SET search_path=buildwatch,pg_catalog,extensions;
CREATE OR REPLACE FUNCTION buildwatch.bw_fail(code integer,message text) RETURNS void
 LANGUAGE plpgsql SET search_path=pg_catalog AS $$ BEGIN RAISE EXCEPTION 'BW%:%',code,message; END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_hash(value jsonb) RETURNS text
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT encode(sha256(convert_to(value::text,'UTF8')),'hex') $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_actor(identity jsonb,required text DEFAULT 'user') RETURNS jsonb
 LANGUAGE plpgsql SECURITY DEFINER SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE u buildwatch.users%ROWTYPE; sub text=identity->>'subject';
BEGIN
 IF sub IS NULL OR length(sub)>500 THEN PERFORM bw_fail(401,'Please sign in.'); END IF;
 IF EXISTS(SELECT 1 FROM revoked_subjects WHERE subject=sub) THEN PERFORM bw_fail(401,'This account was deleted.'); END IF;
 SELECT * INTO u FROM users WHERE subject=sub FOR UPDATE;
 IF NOT FOUND THEN
  INSERT INTO users(id,subject,email,name,verified,preferences,created)
   VALUES(gen_random_uuid()::text,sub,lower(identity->>'email'),coalesce(identity->>'name',identity->>'email'),CASE WHEN identity->>'verified'='true' THEN 1 ELSE 0 END,
   '{"enabled":true,"updates":true,"meetings":true,"reminders":true}',bw_now()) RETURNING * INTO u;
 ELSE
  IF u.disabled<>0 THEN PERFORM bw_fail(403,'This account is disabled.'); END IF;
  UPDATE users SET email=lower(identity->>'email'),verified=CASE WHEN identity->>'verified'='true' THEN 1 ELSE 0 END WHERE id=u.id RETURNING * INTO u;
 END IF;
 IF u.disabled<>0 THEN PERFORM bw_fail(403,'This account is disabled.');END IF;
 IF required IN ('editor','admin') THEN
  IF u.verified<>1 THEN PERFORM bw_fail(403,'Verify your email first.'); END IF;
  IF u.role NOT IN ('admin','collaborator') THEN PERFORM bw_fail(403,'Collaborator access is required.'); END IF;
  IF u.role='admin' AND coalesce(identity->>'mfa','false')<>'true' THEN PERFORM bw_fail(403,'Administrator access requires multifactor authentication.'); END IF;
  IF required='admin' AND u.role<>'admin' THEN PERFORM bw_fail(403,'Administrator access is required.'); END IF;
 END IF;
 RETURN to_jsonb(u);
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_version() RETURNS text LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT version::text||':'||coalesce((SELECT max(due_at)::text FROM policy_expiration_queue WHERE due_at<=bw_now()),'0') FROM map_meta WHERE id=1 $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_canonical(pid text) RETURNS text
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE current_id text=pid; next_id text; seen text[]='{}';
BEGIN LOOP
 IF current_id=ANY(seen) OR cardinality(seen)>1000 THEN PERFORM bw_fail(409,'Invalid project relationship.'); END IF;
 seen=array_append(seen,current_id); SELECT target_id INTO next_id FROM project_relationships WHERE source_id=current_id;
 IF NOT FOUND THEN RETURN current_id; END IF;current_id=next_id;
END LOOP;END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_components(pid text) RETURNS text[]
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT ARRAY[bw_canonical(pid)]||coalesce((SELECT array_agg(source_id ORDER BY source_id) FROM project_relationships WHERE target_id=bw_canonical(pid)),'{}'::text[]) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_original(pid text) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$ SELECT data::jsonb FROM review_records WHERE id=pid $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_profile(pid text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$ DECLARE p jsonb;BEGIN
 SELECT data::jsonb INTO p FROM project_overrides WHERE project_id=pid;IF NOT FOUND THEN p=bw_original(pid);END IF;
 IF p IS NULL THEN PERFORM bw_fail(404,'Record not found.');END IF;RETURN p;END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_project(pid text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$ DECLARE root text=bw_canonical(pid);p jsonb;BEGIN
 SELECT data::jsonb INTO p FROM public_projects WHERE id=root;
 IF p IS NOT NULL AND EXISTS(SELECT 1 FROM archived_inventory WHERE id=root) THEN p=jsonb_set(p,'{archived}','true');END IF;RETURN p;END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_capture(ids text[]) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT jsonb_build_object('ids',to_jsonb(ARRAY(SELECT unnest(ids) ORDER BY 1)),
 'originals',coalesce((SELECT jsonb_agg(jsonb_build_object('id',r.id,'hash',encode(sha256(convert_to(r.data,'UTF8')),'hex')) ORDER BY r.id) FROM review_records r WHERE r.id=ANY(ids)),'[]'),
 'relations',coalesce((SELECT jsonb_agg(to_jsonb(r) ORDER BY source_id) FROM project_relationships r WHERE source_id=ANY(ids)),'[]'),
 'profiles',(SELECT jsonb_agg(jsonb_build_object('id',i,'data',bw_profile(i)) ORDER BY i) FROM unnest(ids) i)) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_semantic(state jsonb) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$
 SELECT jsonb_build_object('ids',state->'ids','originals',state->'originals',
 'relations',coalesce((SELECT jsonb_agg(jsonb_build_object('source_id',r->'source_id','target_id',r->'target_id','kind',r->'kind') ORDER BY r->>'source_id') FROM jsonb_array_elements(state->'relations') r),'[]'),
 'profiles',(SELECT jsonb_agg(jsonb_build_object('id',p->'id','data',(p->'data')-'revision') ORDER BY p->>'id') FROM jsonb_array_elements(state->'profiles') p)) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_meetings(a jsonb,b jsonb) RETURNS jsonb
 LANGUAGE plpgsql IMMUTABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE project jsonb;m jsonb;ref jsonb;refs jsonb;events jsonb='{}';keys text[]='{}';k text;prior jsonb;
BEGIN
 FOR project IN SELECT * FROM jsonb_array_elements(jsonb_build_array(a,b)) LOOP
  FOR m IN SELECT * FROM jsonb_array_elements(coalesce(project->'meetings','[]')) LOOP
   k=bw_hash(jsonb_build_array(m->'title',floor(extract(epoch FROM (m->>'startsAt')::timestamptz)*1000)::bigint,m->'venue',m->'agenda'));
   refs='[]';
   FOR ref IN SELECT * FROM jsonb_array_elements(coalesce(m->'originalMeetings',jsonb_build_array(jsonb_build_object('projectId',project->'id','meetingId',m->'id')))) LOOP
    refs=refs||jsonb_build_array(ref||jsonb_build_object('startsAt',coalesce(ref->>'startsAt',m->>'startsAt')));
   END LOOP;
   prior=events->k;
   IF prior IS NULL THEN
    keys=array_append(keys,k);events=jsonb_set(events,ARRAY[k],m||jsonb_build_object('id','event-'||k,'originalMeetings',refs));
   ELSE
    refs=(SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') FROM (SELECT DISTINCT ON(value->>'projectId',value->>'meetingId') value,ord FROM jsonb_array_elements((prior->'originalMeetings')||refs) WITH ORDINALITY e(value,ord) ORDER BY value->>'projectId',value->>'meetingId',ord DESC) x);
    events=jsonb_set(events,ARRAY[k],prior||jsonb_build_object('originalMeetings',refs));
   END IF;
  END LOOP;
 END LOOP;
 RETURN coalesce((SELECT jsonb_agg(events->key ORDER BY ord) FROM unnest(keys) WITH ORDINALITY t(key,ord)),'[]');
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_preview_compute(cid text,input jsonb) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE c duplicate_candidates%ROWTYPE;a jsonb;b jsonb;primary_p jsonb;secondary_p jsonb;result jsonb;before_state jsonb;ids text[];field text;side text;chosen jsonb;conflicts jsonb='[]';
 fields text[]=ARRAY['name','address','description','status','category','developer','homes','completion','neighborhood','city','county','state','location','evidenceType','sourceAsOf','sourceStatus','sourceStatusDate','verificationNote','reviewedAt'];
BEGIN
 SELECT * INTO c FROM duplicate_candidates WHERE id=cid;IF NOT FOUND THEN PERFORM bw_fail(404,'Candidate pair not found.');END IF;
 IF c.revision<>coalesce((input->>'revision')::bigint,-1) THEN PERFORM bw_fail(409,'The review changed. Refresh this pair.');END IF;
 IF coalesce(input->>'action','') NOT IN ('merge','supporting') OR coalesce(input->>'canonical','') NOT IN ('a','b') THEN PERFORM bw_fail(400,'Choose an action and canonical project.');END IF;
 IF jsonb_typeof(coalesce(input->'choices','{}'))<>'object' THEN PERFORM bw_fail(400,'Invalid field choices.');END IF;
 FOR field,side IN SELECT key,value FROM jsonb_each_text(coalesce(input->'choices','{}')) LOOP
  IF NOT(field=ANY(fields)) OR side NOT IN ('a','b') THEN PERFORM bw_fail(400,'Choose field values from record A or B.');END IF;
 END LOOP;
 IF input->>'action'='supporting' AND coalesce(input->'choices','{}')<>'{}'::jsonb THEN PERFORM bw_fail(400,'Supporting links retain primary fields.');END IF;
 a=coalesce(bw_project(c.a_id),bw_profile(c.a_id));b=coalesce(bw_project(c.b_id),bw_profile(c.b_id));
 IF a->>'id'=b->>'id' THEN PERFORM bw_fail(409,'These records already share a canonical project.');END IF;
 primary_p=CASE WHEN input->>'canonical'='a' THEN a ELSE b END;secondary_p=CASE WHEN input->>'canonical'='a' THEN b ELSE a END;
 IF NOT EXISTS(SELECT 1 FROM projects WHERE id=primary_p->>'id') THEN PERFORM bw_fail(409,'Choose an existing project as canonical.');END IF;
 IF primary_p->>'archived'='true' AND EXISTS(SELECT 1 FROM active_map_index WHERE id=secondary_p->>'id') THEN PERFORM bw_fail(409,'Choose the publicly visible development as canonical.');END IF;
 ids=ARRAY(SELECT DISTINCT unnest(bw_components(a->>'id')||bw_components(b->>'id')) ORDER BY 1);
 IF cardinality(ids)>250 THEN PERFORM bw_fail(409,'This component exceeds the 250-record safety limit.');END IF;
 before_state=bw_capture(ids);result=primary_p;
 FOREACH field IN ARRAY fields LOOP
  IF (CASE WHEN field='location' THEN jsonb_build_array(a->'latitude',a->'longitude') ELSE a->field END) IS DISTINCT FROM
     (CASE WHEN field='location' THEN jsonb_build_array(b->'latitude',b->'longitude') ELSE b->field END) THEN conflicts=conflicts||to_jsonb(field);END IF;
  IF input->>'action'='merge' THEN
   chosen=CASE WHEN coalesce(input->'choices'->>field,input->>'canonical')='a' THEN a ELSE b END;
   IF field='location' THEN result=result||jsonb_build_object('latitude',chosen->'latitude','longitude',chosen->'longitude');
   ELSIF chosen?field THEN result=jsonb_set(result,ARRAY[field],chosen->field);ELSE result=result-field;END IF;
  END IF;
 END LOOP;
 result=result||jsonb_build_object('id',primary_p->'id','revision',(SELECT coalesce(max((p->'data'->>'revision')::bigint),0)+1 FROM jsonb_array_elements(before_state->'profiles') p),
 'sources',(SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') FROM (SELECT DISTINCT ON(value->>'url',value->>'title') value,ord FROM jsonb_array_elements(coalesce(primary_p->'sources','[]')||coalesce(secondary_p->'sources','[]')) WITH ORDINALITY e(value,ord) ORDER BY value->>'url',value->>'title',ord) s),
 'permitNumbers',(SELECT coalesce(jsonb_agg(value ORDER BY ord),'[]') FROM (SELECT DISTINCT ON(value) value,ord FROM jsonb_array_elements(coalesce(primary_p->'permitNumbers','[]')||coalesce(secondary_p->'permitNumbers','[]')) WITH ORDINALITY e(value,ord) ORDER BY value,ord) s),
 'meetings',bw_meetings(primary_p,secondary_p),'relatedRecordIds',to_jsonb(array_remove(ids,primary_p->>'id')));
 RETURN jsonb_build_object('candidateId',cid,'input',input,'before',before_state,'result',result,'primary',primary_p->'id','secondary',secondary_p->'id','conflicts',conflicts,
 'affectedRecords',(SELECT jsonb_agg(jsonb_build_object('id',i,'name',bw_original(i)->'name') ORDER BY i) FROM unnest(ids) i),
 'signature',bw_hash(jsonb_build_array(c.revision,c.evidence_hash,before_state,input)),
 'preservation',jsonb_build_object('sourceLinks',jsonb_array_length(result->'sources'),'permitIdentifiers',jsonb_array_length(result->'permitNumbers'),'meetings',jsonb_array_length(result->'meetings'),
 'followingRows',(SELECT count(*) FROM follows WHERE project_id=ANY(ids)),'historyRows',(SELECT count(*) FROM history WHERE project_id=ANY(ids)),
 'notice','Original records, sources, follows, meetings and history are retained. Undo restores relationships and field values unless later edits depend on them.'));
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
