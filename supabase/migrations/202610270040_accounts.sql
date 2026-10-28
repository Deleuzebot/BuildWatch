SET search_path=buildwatch,pg_catalog,extensions;
CREATE OR REPLACE FUNCTION buildwatch.bw_plus(uid text) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$ SELECT coalesce((SELECT disabled=0 AND(role IN('admin','collaborator') OR coalesce((SELECT expires>bw_now() FROM entitlements WHERE user_id=uid),false)) FROM users WHERE id=uid),false) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_following(uid text) RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE r record;p jsonb;seen text[]='{}';result jsonb='[]';premium boolean=bw_plus(uid);active_count int=0;terminal text;active_flag boolean;
BEGIN
 FOR r IN SELECT project_id FROM follows WHERE user_id=uid ORDER BY rank DESC,project_id LOOP
  p=bw_project(r.project_id);IF p IS NULL OR(p->>'id')=ANY(seen) THEN CONTINUE;END IF;seen=array_append(seen,p->>'id');
  terminal=CASE WHEN p->>'archived'='true' THEN 'Archived' WHEN p->>'status' IN('Completed','Cancelled') THEN p->>'status' ELSE NULL END;
  active_flag=terminal IS NULL AND(premium OR active_count=0);IF terminal IS NULL THEN active_count=active_count+1;END IF;
  result=result||jsonb_build_array(jsonb_build_object('projectId',p->'id','name',p->'name','active',active_flag)||CASE WHEN terminal IS NOT NULL THEN jsonb_build_object('terminal',terminal) ELSE '{}' END);
 END LOOP;RETURN result;
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_active(uid text,pid text) RETURNS boolean
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$ SELECT EXISTS(SELECT 1 FROM jsonb_array_elements(bw_following(uid)) f WHERE f->>'projectId'=bw_canonical(pid) AND f->>'active'='true') $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_account(uid text,identity jsonb) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT jsonb_build_object('id',u.id,'email',u.email,'name',u.name,'role',u.role,'verified',u.verified=1,'preferences',u.preferences::jsonb,'plus',bw_plus(uid),
 'expires',coalesce(e.expires,0),'store',coalesce(e.store,''),'managementURL',e.management_url,'methods',coalesce(identity->'methods','[]'),'mfa',coalesce((identity->>'mfa')::boolean,false))
 FROM users u LEFT JOIN entitlements e ON e.user_id=u.id WHERE u.id=uid $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_notify(pid text,kind_name text,title_text text,body_text text,event text,recipients text[] DEFAULT NULL) RETURNS void
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE uid text;u users%ROWTYPE;notification_id text;inserted integer;ids text[]=bw_components(pid);
BEGIN
 FOR uid IN SELECT DISTINCT user_id FROM follows WHERE project_id=ANY(ids) LOOP
  SELECT * INTO u FROM users WHERE id=uid;
  IF u.disabled<>0 OR coalesce(u.preferences::jsonb->>'enabled','false')<>'true' OR coalesce(u.preferences::jsonb->>kind_name,'false')<>'true' THEN CONTINUE;END IF;
  IF recipients IS NOT NULL THEN IF NOT(uid=ANY(recipients)) THEN CONTINUE;END IF;ELSIF NOT bw_active(uid,pid) THEN CONTINUE;END IF;
  notification_id=gen_random_uuid()::text;
  INSERT INTO notifications(id,user_id,project_id,kind,title,body,created,event_key) VALUES(notification_id,uid,bw_canonical(pid),kind_name,title_text,body_text,bw_now(),event) ON CONFLICT(user_id,event_key) DO NOTHING;
  GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted>0 THEN INSERT INTO deliveries(notification_id,token) SELECT notification_id,token FROM devices WHERE user_id=uid ON CONFLICT DO NOTHING;END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_publish(project jsonb,actor_id text,derived jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
<<bw_publish>>
DECLARE pid text=project->>'id';old jsonb;saved jsonb;revision bigint;related text[];recipients text[];m jsonb;prior jsonb;meetings jsonb='[]';
BEGIN
 PERFORM pg_advisory_xact_lock(72644322);
 IF pid IS NULL OR pid!~'^[A-Za-z0-9-]{1,160}$' THEN PERFORM bw_fail(400,'Invalid project identifier.');END IF;
 IF EXISTS(SELECT 1 FROM deleted_project_ids WHERE project_id=pid) THEN PERFORM bw_fail(409,'This project was permanently deleted and cannot be republished.');END IF;
 IF bw_canonical(pid)<>pid THEN PERFORM bw_fail(409,'Edit the canonical project or undo its relationship first.');END IF;
 PERFORM 1 FROM projects WHERE id=pid FOR UPDATE;old=bw_project(pid);
 IF coalesce((project->>'revision')::bigint,0)<>coalesce((old->>'revision')::bigint,0) THEN PERFORM bw_fail(409,'Project changed elsewhere. Refresh and reopen the editor.');END IF;
 revision=coalesce((old->>'revision')::bigint,0)+1;
 FOR m IN SELECT * FROM jsonb_array_elements(project->'meetings') LOOP
  SELECT value->'originalMeetings' INTO prior FROM jsonb_array_elements(coalesce(old->'meetings','[]')) WHERE value->>'id'=m->>'id';
  meetings=meetings||jsonb_build_array((m-'originalMeetings')||CASE WHEN prior IS NOT NULL THEN jsonb_build_object('originalMeetings',prior) ELSE '{}' END);
 END LOOP;
 saved=project||jsonb_build_object('revision',revision,'meetings',meetings);related=array_remove(bw_components(pid),pid);
 IF cardinality(related)>0 THEN saved=saved||jsonb_build_object('relatedRecordIds',to_jsonb(related));ELSE saved=saved-'relatedRecordIds';END IF;
 IF old IS NOT NULL AND old->>'status' NOT IN('Completed','Cancelled') AND saved->>'status' IN('Completed','Cancelled') THEN recipients=ARRAY(SELECT DISTINCT user_id FROM follows WHERE project_id=ANY(bw_components(pid)) AND bw_active(user_id,pid));END IF;
 IF EXISTS(SELECT 1 FROM project_overrides WHERE project_id=pid) THEN UPDATE project_overrides SET data=saved::text,revision=bw_publish.revision WHERE project_id=pid;
 ELSE INSERT INTO projects(id,data,revision) VALUES(pid,saved::text,revision) ON CONFLICT(id) DO UPDATE SET data=excluded.data,revision=excluded.revision;END IF;
 INSERT INTO history VALUES(gen_random_uuid()::text,pid,actor_id,old::text,saved::text,bw_now());
 IF saved->>'archived'='true' THEN INSERT INTO archived_projects(project_id,reason,archived_at,actor) VALUES(pid,'manual',bw_now(),actor_id) ON CONFLICT DO NOTHING;END IF;
 IF saved->>'status'<>'Approved' THEN DELETE FROM archived_projects WHERE project_id=pid AND reason='approved_expired';END IF;
 PERFORM bw_refresh(pid,derived);
 IF old IS NOT NULL THEN
  IF old->'status' IS DISTINCT FROM saved->'status' OR old->'description' IS DISTINCT FROM saved->'description' OR old->'name' IS DISTINCT FROM saved->'name' OR old->'completion' IS DISTINCT FROM saved->'completion' OR old->'sources' IS DISTINCT FROM saved->'sources' THEN
   PERFORM bw_notify(pid,'updates',(saved->>'name')||' updated',(saved->>'status')||' · '||coalesce(saved->>'completion',''),'update:'||pid||':'||revision,recipients);
  END IF;
  IF old->'meetings' IS DISTINCT FROM saved->'meetings' THEN PERFORM bw_notify(pid,'meetings','Meetings updated: '||(saved->>'name'),'Open the project for the latest meeting details.','meetings:'||pid||':'||revision);END IF;
 END IF;RETURN bw_project(pid);
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_account_api(u jsonb,identity jsonb,method text,path text,input jsonb,q jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE uid text=u->>'id';pid text;parts text[];ids text[];rank_value bigint;old_rank bigint;item jsonb;token_hash text;inv invitations%ROWTYPE;p jsonb;allowed text[];pref jsonb;value jsonb;other users%ROWTYPE;primary_u users%ROWTYPE;k text;
BEGIN
 IF path='/api/me' AND method='GET' THEN RETURN bw_account(uid,identity);END IF;
 IF path='/api/me' AND method='PATCH' THEN
  pref=coalesce(input->'preferences',(u->>'preferences')::jsonb);
  IF input?'preferences' THEN FOREACH k IN ARRAY ARRAY['enabled','updates','meetings','reminders'] LOOP IF jsonb_typeof(pref->k)<>'boolean' THEN PERFORM bw_fail(400,'Notification preferences must be boolean.');END IF;END LOOP;END IF;
  IF input?'name' AND(length(trim(input->>'name'))<1 OR length(input->>'name')>100) THEN PERFORM bw_fail(400,'Use a profile name of at most 100 characters.');END IF;
  UPDATE users SET name=coalesce(input->>'name',u->>'name'),preferences=coalesce(input->'preferences',(u->>'preferences')::jsonb)::text WHERE id=uid;RETURN bw_account(uid,identity);
 END IF;
 IF path='/api/follows' AND method='GET' THEN RETURN bw_following(uid);END IF;
 IF path~'^/api/follows/[A-Za-z0-9-]{1,160}(/activate)?$' AND method IN('PUT','DELETE','POST') THEN
  PERFORM pg_advisory_xact_lock(hashtextextended(uid,44));parts=string_to_array(path,'/');pid=bw_canonical(parts[4]);ids=bw_components(pid);
  IF bw_project(pid) IS NULL THEN PERFORM bw_fail(404,'Project not found.');END IF;
  IF method='DELETE' THEN DELETE FROM follows WHERE user_id=uid AND project_id=ANY(ids);INSERT INTO follow_history VALUES(gen_random_uuid()::text,uid,pid,'unfollow',bw_now());RETURN bw_following(uid);END IF;
  IF NOT EXISTS(SELECT 1 FROM active_map_index WHERE id=pid) THEN PERFORM bw_fail(409,'Development is unavailable for active tracking.');END IF;
  SELECT max(rank) INTO old_rank FROM follows WHERE user_id=uid AND project_id=ANY(ids);
  IF parts[5]='activate' AND old_rank IS NULL THEN PERFORM bw_fail(404,'Follow this project first.');END IF;
  IF old_rank IS NULL AND NOT bw_plus(uid) AND EXISTS(SELECT 1 FROM jsonb_array_elements(bw_following(uid)) f WHERE NOT(f?'terminal')) THEN PERFORM bw_fail(402,'BuildWatch Plus is required to follow more than one development.');END IF;
  SELECT coalesce(max(rank),0)+1 INTO rank_value FROM follows WHERE user_id=uid;
  INSERT INTO follows VALUES(uid,pid,rank_value) ON CONFLICT(user_id,project_id) DO UPDATE SET rank=excluded.rank;
  INSERT INTO follow_history VALUES(gen_random_uuid()::text,uid,pid,CASE WHEN parts[5]='activate' THEN 'activate' ELSE 'follow' END,bw_now());RETURN bw_following(uid);
 END IF;
 IF path='/api/notifications' AND method='GET' THEN RETURN(SELECT coalesce(jsonb_agg(to_jsonb(n) ORDER BY created DESC),'[]') FROM(SELECT id,project_id "projectId",title,body,created,read FROM notifications WHERE user_id=uid ORDER BY created DESC LIMIT 200) n);END IF;
 IF path='/api/notifications/read' AND method='POST' THEN UPDATE notifications SET read=1 WHERE user_id=uid;RETURN '{"ok":true}';END IF;
 IF path='/api/devices' AND method='POST' THEN
  IF input->>'token'!~'^(ExponentPushToken|ExpoPushToken)\[[a-zA-Z0-9_-]+\]$' THEN PERFORM bw_fail(400,'Invalid push token.');END IF;
  INSERT INTO devices VALUES(input->>'token',uid) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id;RETURN '{"ok":true}';
 END IF;
 IF path='/api/devices' AND method='DELETE' THEN DELETE FROM devices WHERE token=input->>'token' AND user_id=uid;RETURN '{"ok":true}';END IF;
 IF path='/api/submissions' AND method='POST' THEN
  IF(u->>'verified')::int<>1 THEN PERFORM bw_fail(403,'Verify your email before submitting.');END IF;
  IF coalesce(input->>'kind','') NOT IN('correction','support','bug','feature','question') OR length(trim(coalesce(input->>'body','')))<1 OR length(input->>'body')>8000 THEN PERFORM bw_fail(400,'Choose a valid feedback type and message.');END IF;
  pid=CASE WHEN input->>'kind'='correction' THEN input->>'projectId' ELSE NULL END;
  IF pid IS NOT NULL AND bw_project(pid) IS NULL THEN PERFORM bw_fail(404,'Project not found.');END IF;
  allowed=ARRAY['name','description','status','address','neighborhood','category','developer','homes','completion','latitude','longitude','meetings','sources'];
  IF input?'patch' AND EXISTS(SELECT 1 FROM jsonb_object_keys(input->'patch') key WHERE NOT(key=ANY(allowed))) THEN PERFORM bw_fail(400,'Invalid correction fields.');END IF;
  k=gen_random_uuid()::text;INSERT INTO submissions(id,user_id,kind,project_id,body,patch,created) VALUES(k,uid,input->>'kind',pid,input->>'body',CASE WHEN input->>'kind'='correction' THEN(input->'patch')::text ELSE NULL END,bw_now());RETURN jsonb_build_object('id',k);
 END IF;
 IF path='/api/invitations/accept' AND method='POST' THEN
  IF(u->>'verified')::int<>1 THEN PERFORM bw_fail(403,'Verify your email first.');END IF;
  token_hash=encode(sha256(convert_to(input->>'token','UTF8')),'hex');SELECT * INTO inv FROM invitations WHERE hash=token_hash FOR UPDATE;
  IF NOT FOUND OR inv.accepted IS NOT NULL OR inv.expires<=bw_now() THEN PERFORM bw_fail(400,'Invitation expired or already used.');END IF;
  IF inv.email<>lower(u->>'email') THEN PERFORM bw_fail(403,'Sign in with the verified email named in this invitation.');END IF;
  UPDATE invitations SET accepted=uid WHERE hash=token_hash;UPDATE users SET role='collaborator' WHERE id=uid AND role='user';
  INSERT INTO role_audit VALUES(gen_random_uuid()::text,uid,uid,'invitation accepted',bw_now());RETURN bw_account(uid,identity);
 END IF;
 IF path='__delete_prepare' THEN
  IF u->>'role'='admin' THEN PERFORM bw_fail(409,'The sole administrator cannot be deleted.');END IF;
  IF bw_now()-coalesce((identity->>'authenticatedAt')::bigint,0)>300000 OR input->>'confirm'<>'DELETE' THEN PERFORM bw_fail(403,'Sign in again and confirm DELETE.');END IF;
  UPDATE users SET disabled=1 WHERE id=uid;RETURN jsonb_build_object('subject',u->>'subject');
 ELSIF path='__delete_abort' THEN UPDATE users SET disabled=0 WHERE id=uid;RETURN '{"ok":true}';
 ELSIF path='__delete_commit' THEN
  INSERT INTO revoked_subjects VALUES(u->>'subject') ON CONFLICT DO NOTHING;DELETE FROM submissions WHERE user_id=uid;UPDATE history SET actor='Deleted account' WHERE actor=uid;DELETE FROM users WHERE id=uid;RETURN '{"deleted":true}';
 END IF;
 IF path IN('__link_prepare','__link_commit') THEN
  IF bw_now()-coalesce((identity->>'authenticatedAt')::bigint,0)>300000 OR bw_now()-coalesce((input->'secondaryIdentity'->>'authenticatedAt')::bigint,0)>300000 OR identity->>'verified'<>'true' OR input->'secondaryIdentity'->>'verified'<>'true' THEN PERFORM bw_fail(403,'Both accounts need recent sign-in and verified email.');END IF;
  IF identity->>'subject'=input->'secondaryIdentity'->>'subject' THEN PERFORM bw_fail(400,'This identity is already connected.');END IF;
  IF u->>'role'='admin' THEN PERFORM bw_actor(identity,'admin');END IF;
  SELECT * INTO other FROM users WHERE subject=input->'secondaryIdentity'->>'subject' FOR UPDATE;
  IF FOUND AND(other.disabled<>0 OR other.role<>'user' OR EXISTS(SELECT 1 FROM entitlements WHERE user_id=other.id)) THEN PERFORM bw_fail(409,'The other account needs an operator-reviewed transfer.');END IF;
  IF path='__link_prepare' THEN RETURN jsonb_build_object('primarySubject',u->>'subject','secondarySubject',input->'secondaryIdentity'->>'subject');END IF;
  IF other.id IS NOT NULL THEN
   INSERT INTO follows(user_id,project_id,rank) SELECT uid,project_id,rank+(SELECT coalesce(min(rank),0) FROM follows WHERE user_id=uid)-(SELECT coalesce(max(rank),0) FROM follows WHERE user_id=other.id)-1 FROM follows WHERE user_id=other.id ON CONFLICT DO NOTHING;
   UPDATE follow_history SET user_id=uid WHERE user_id=other.id;UPDATE submissions SET user_id=uid WHERE user_id=other.id;UPDATE devices SET user_id=uid WHERE user_id=other.id;
   UPDATE notifications SET user_id=uid,event_key='linked:'||other.id||':'||event_key WHERE user_id=other.id;UPDATE history SET actor=uid WHERE actor=other.id;
   pref=(u->>'preferences')::jsonb;FOREACH k IN ARRAY ARRAY['enabled','updates','meetings','reminders'] LOOP pref=jsonb_set(pref,ARRAY[k],to_jsonb(coalesce((pref->>k)::boolean,false) AND coalesce((other.preferences::jsonb->>k)::boolean,false)));END LOOP;
   UPDATE users SET preferences=pref::text WHERE id=uid;DELETE FROM users WHERE id=other.id;
  END IF;
  INSERT INTO revoked_subjects VALUES(input->'secondaryIdentity'->>'subject') ON CONFLICT DO NOTHING;
  INSERT INTO role_audit VALUES(gen_random_uuid()::text,uid,coalesce(other.id,''),'Explicitly authenticated identity linking',bw_now());RETURN '{"linked":true}';
 END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
