SET search_path=buildwatch,pg_catalog,extensions;
CREATE OR REPLACE FUNCTION buildwatch.bw_duplicate_stats() RETURNS jsonb LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT jsonb_build_object('groups',count(DISTINCT group_id),'pairs',count(*),'pending',count(*) FILTER(WHERE status='pending'),'merged',count(*) FILTER(WHERE status='merged'),'linked',count(*) FILTER(WHERE status='linked'),'distinct',count(*) FILTER(WHERE status='distinct'),'skipped',count(*) FILTER(WHERE status='skipped'),'classificationCandidates',(SELECT count(*) FROM classification_review_candidates)) FROM duplicate_candidates $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_duplicate_detail(cid text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE c duplicate_candidates%ROWTYPE;BEGIN SELECT * INTO c FROM duplicate_candidates WHERE id=cid;IF NOT FOUND THEN PERFORM bw_fail(404,'Candidate pair not found.');END IF;
 RETURN to_jsonb(c)||jsonb_build_object('reasons',c.reasons::jsonb,'metadata',c.metadata::jsonb,'a',bw_original(c.a_id),'b',bw_original(c.b_id),'aEffective',coalesce(bw_project(c.a_id),bw_profile(c.a_id)),'bEffective',coalesce(bw_project(c.b_id),bw_profile(c.b_id)),
 'history',(SELECT coalesce(jsonb_agg(to_jsonb(d) ORDER BY created DESC,rowid DESC),'[]') FROM(SELECT id,action,actor,created,note,undoes_id,rowid FROM duplicate_decisions WHERE candidate_id=cid ORDER BY created DESC,rowid DESC LIMIT 100) d),
 'fields',to_jsonb(ARRAY['name','address','description','status','category','developer','homes','completion','neighborhood','city','county','state','location','evidenceType','sourceAsOf','sourceStatus','sourceStatusDate','verificationNote','reviewedAt']),'confidence',NULL);
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_register(a text,b text,reasons jsonb,metadata jsonb,actor_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
<<bw_register>>
DECLARE old duplicate_candidates%ROWTYPE;aid text=least(a,b);bid text=greatest(a,b);cid text;gid text;groups text[];members text[];evidence text;old_state jsonb;
BEGIN
 PERFORM pg_advisory_xact_lock(72644322);
 IF a=b OR bw_original(a) IS NULL OR bw_original(b) IS NULL THEN PERFORM bw_fail(400,'Choose two different existing records.');END IF;
 IF jsonb_typeof(reasons)<>'array' OR jsonb_array_length(reasons)<1 OR jsonb_array_length(reasons)>20 OR EXISTS(SELECT 1 FROM jsonb_array_elements_text(reasons) r WHERE length(trim(r))<1 OR length(r)>2000) THEN PERFORM bw_fail(400,'Provide factual matching reasons.');END IF;
 reasons=(SELECT jsonb_agg(r ORDER BY r) FROM(SELECT DISTINCT jsonb_array_elements_text(reasons) r) s);
 evidence=bw_hash(jsonb_build_array(aid,bid,bw_original(aid)-ARRAY['revision','reviewedAt'],bw_original(bid)-ARRAY['revision','reviewedAt'],reasons,metadata));
 SELECT * INTO old FROM duplicate_candidates WHERE a_id=aid AND b_id=bid FOR UPDATE;
 IF FOUND AND old.evidence_hash=evidence THEN RETURN to_jsonb(old)||'{"unchanged":true}'::jsonb;END IF;
 cid=coalesce(old.id,bw_hash(jsonb_build_array(aid,bid)));
 IF old.id IS NOT NULL THEN UPDATE duplicate_candidates SET reasons=bw_register.reasons::text,metadata=bw_register.metadata::text,evidence_hash=evidence,status='pending',revision=revision+1,updated_at=bw_now() WHERE id=cid;
 ELSE INSERT INTO duplicate_candidates VALUES(cid,aid,bid,'unassigned',reasons::text,metadata::text,evidence,'pending',1,bw_now(),bw_now());END IF;
 INSERT INTO duplicate_decisions(id,candidate_id,action,actor,created,note) VALUES(gen_random_uuid()::text,cid,CASE WHEN old.id IS NULL THEN 'detected' ELSE 'new_evidence' END,actor_id,bw_now(),'Candidate only; no public records merged.');
 groups=ARRAY(SELECT DISTINCT group_id FROM duplicate_group_members WHERE project_id IN(aid,bid));
 members=ARRAY(SELECT DISTINCT id FROM(SELECT project_id id FROM duplicate_group_members WHERE group_id=ANY(groups) UNION SELECT aid UNION SELECT bid) s ORDER BY id);
 gid=bw_hash(to_jsonb(members[1]));DELETE FROM duplicate_group_members WHERE group_id=ANY(groups);
 INSERT INTO duplicate_group_members SELECT gid,unnest(members) ON CONFLICT DO NOTHING;
 UPDATE duplicate_candidates SET group_id=gid WHERE group_id=ANY(groups) OR id=cid;
 RETURN(SELECT to_jsonb(c) FROM duplicate_candidates c WHERE id=cid);
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_duplicate_decide(cid text,input jsonb,actor_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE c duplicate_candidates%ROWTYPE;action text=input->>'action';same boolean;status_value text;BEGIN
 PERFORM pg_advisory_xact_lock(72644322);SELECT * INTO c FROM duplicate_candidates WHERE id=cid FOR UPDATE;
 IF NOT FOUND THEN PERFORM bw_fail(404,'Candidate pair not found.');END IF;
 IF c.revision<>coalesce((input->>'revision')::bigint,-1) THEN PERFORM bw_fail(409,'Review changed. Refresh.');END IF;
 IF coalesce(action,'') NOT IN('distinct','skipped','reopen','acknowledge') OR length(coalesce(input->>'note',''))>4000 THEN PERFORM bw_fail(400,'Choose a valid review action and note.');END IF;
 same=bw_canonical(c.a_id)=bw_canonical(c.b_id);
 IF action='distinct' AND same THEN PERFORM bw_fail(409,'Undo the existing relationship first.');END IF;
 IF action='acknowledge' AND NOT same THEN PERFORM bw_fail(409,'These records do not share a canonical project.');END IF;
 IF action='skipped' AND c.status IN('merged','linked') THEN PERFORM bw_fail(409,'This relationship has already been reviewed.');END IF;
 status_value=CASE WHEN action='reopen' THEN 'pending' WHEN action='acknowledge' THEN CASE WHEN EXISTS(SELECT 1 FROM project_relationships WHERE source_id IN(c.a_id,c.b_id) AND kind='supporting') THEN 'linked' ELSE 'merged' END ELSE action END;
 INSERT INTO duplicate_decisions(id,candidate_id,action,actor,created,note,before_state,after_state) VALUES(gen_random_uuid()::text,cid,action,actor_id,bw_now(),coalesce(input->>'note',''),jsonb_build_object('status',c.status,'revision',c.revision)::text,jsonb_build_object('status',status_value)::text);
 UPDATE duplicate_candidates SET status=status_value,revision=revision+1,updated_at=bw_now() WHERE id=cid;RETURN bw_duplicate_detail(cid);
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_duplicate_list(q jsonb) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE page int=coalesce((q->>'page')::int,0);f_status text=coalesce(q->>'status','pending');search text=lower(trim(coalesce(q->>'search','')));county text=lower(trim(coalesce(q->>'county','')));kind text=coalesce(q->>'kind','all');sort text=coalesce(q->>'sort','recent');items jsonb;total bigint;
BEGIN
 IF page<0 OR page>100000 OR f_status NOT IN('all','pending','merged','linked','distinct','skipped') OR kind NOT IN('all','permit','municipal','curated') OR sort NOT IN('recent','name','pairs') OR length(search)>200 OR length(county)>100 THEN PERFORM bw_fail(400,'Invalid queue filters.');END IF;
 WITH eligible AS MATERIALIZED(SELECT c.* FROM duplicate_candidates c WHERE(f_status='all' OR c.status=f_status)
 AND((search='' AND county='' AND kind='all') OR EXISTS(SELECT 1 FROM duplicate_group_members gm JOIN review_records p ON p.id=gm.project_id WHERE gm.group_id=c.group_id AND(search='' OR position(search IN lower(coalesce(p.data::jsonb->>'name','')||' '||coalesce(p.data::jsonb->>'address','')||' '||p.id))>0) AND(county='' OR lower(coalesce(p.data::jsonb->>'county',''))=county) AND(kind='all' OR coalesce(p.data::jsonb->>'evidenceType','curated')=kind)))),
 groups AS MATERIALIZED(SELECT c.group_id id,count(*) pairs,max(c.updated_at) updated,(SELECT min(p.data::jsonb->>'name') FROM duplicate_group_members gm JOIN review_records p ON p.id=gm.project_id WHERE gm.group_id=c.group_id) name,(SELECT count(*) FROM duplicate_group_members gm WHERE gm.group_id=c.group_id) records FROM eligible c GROUP BY c.group_id),
 page_rows AS(SELECT * FROM groups ORDER BY CASE WHEN sort='name' THEN lower(name) END,CASE WHEN sort='pairs' THEN pairs END DESC,CASE WHEN sort='recent' THEN updated END DESC,id LIMIT 20 OFFSET page*20)
 SELECT(SELECT count(*) FROM groups),coalesce(jsonb_agg(to_jsonb(p)),'[]') INTO total,items FROM page_rows p;
 RETURN jsonb_build_object('items',items,'total',total,'page',page,'hasMore',(page+1)*20<total,'stats',bw_duplicate_stats());
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_admin_api(u jsonb,identity jsonb,method text,path text,input jsonb,q jsonb) RETURNS jsonb
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE actor_id text=u->>'id';parts text[]=string_to_array(path,'/');cid text;gid text;pid text;page int=coalesce((q->>'page')::int,0);total bigint;items jsonb;record_count bigint;other users%ROWTYPE;row submissions%ROWTYPE;value jsonb;token text;expires bigint;
BEGIN
 IF page<0 OR page>1000000 THEN PERFORM bw_fail(400,'Invalid page.');END IF;
 IF path='/api/admin/duplicates' AND method='GET' THEN RETURN bw_duplicate_list(q);END IF;
 IF path='/api/admin/duplicates/candidates' AND method='POST' THEN RETURN bw_register(input->>'a',input->>'b',jsonb_build_array(input->>'reason'),'{"discovery":"manual"}',actor_id);END IF;
 IF path~'^/api/admin/duplicates/groups/[a-f0-9]{64}$' AND method='GET' THEN
  gid=parts[6];SELECT count(*) INTO total FROM duplicate_candidates WHERE group_id=gid;IF total=0 THEN PERFORM bw_fail(404,'Group not found.');END IF;
  SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') INTO items FROM(SELECT c.*,a.data::jsonb->>'name' "aName",b.data::jsonb->>'name' "bName" FROM duplicate_candidates c JOIN review_records a ON a.id=c.a_id JOIN review_records b ON b.id=c.b_id WHERE c.group_id=gid ORDER BY CASE c.status WHEN 'pending' THEN 0 WHEN 'skipped' THEN 1 ELSE 2 END,c.id LIMIT 20 OFFSET page*20) c;
  RETURN jsonb_build_object('items',items,'total',total,'page',page,'hasMore',(page+1)*20<total,'records',(SELECT coalesce(jsonb_agg(jsonb_build_object('id',p.id,'name',p.data::jsonb->>'name') ORDER BY p.id),'[]') FROM(SELECT p.id,p.data FROM duplicate_group_members gm JOIN review_records p ON p.id=gm.project_id WHERE gm.group_id=gid ORDER BY p.id LIMIT 100) p),'recordCount',(SELECT count(*) FROM duplicate_group_members WHERE group_id=gid));
 END IF;
 IF path~'^/api/admin/duplicates/pairs/[a-f0-9]{64}(/(preview|decision))?$' THEN
  cid=parts[6];IF method='GET' AND parts[7] IS NULL THEN RETURN bw_duplicate_detail(cid);END IF;
  IF method='POST' AND parts[7]='preview' THEN RETURN bw_duplicate_preview(cid,input,actor_id);END IF;
  IF method='POST' AND parts[7]='decision' THEN RETURN bw_duplicate_decide(cid,input,actor_id);END IF;
 END IF;
 IF path='__merge_info' THEN RETURN bw_commit_info(input->>'token',actor_id);END IF;
 IF path='/api/admin/duplicates/commit' AND method='POST' THEN RETURN bw_duplicate_commit(input->>'token',actor_id,input->'_derived');END IF;
 IF path='__undo_info' THEN
  SELECT before_state::jsonb INTO value FROM duplicate_decisions WHERE id=input->>'decisionId' AND action IN('merge','supporting') AND after_state IS NOT NULL;
  IF value IS NULL THEN PERFORM bw_fail(400,'Choose an applied merge or supporting link.');END IF;
  RETURN jsonb_build_object('profiles',value->'profiles','policies',(SELECT coalesce(jsonb_object_agg(l.project_id,to_jsonb(l)),'{}') FROM approval_policy l WHERE project_id IN(SELECT p->>'id' FROM jsonb_array_elements(value->'profiles') p)));
 END IF;
 IF path='/api/admin/duplicates/undo' AND method='POST' THEN RETURN bw_duplicate_undo(input->>'decisionId',actor_id,coalesce(input->>'note',''),input->'_derivedById');END IF;
 IF path='/api/admin/classification-candidates' AND method='GET' THEN
  SELECT count(*) INTO total FROM classification_review_candidates;
  RETURN jsonb_build_object('total',total,'page',page,'hasMore',(page+1)*50<total,'items',(SELECT coalesce(jsonb_agg(to_jsonb(c)),'[]') FROM(SELECT c.*,p.data::jsonb->>'name' name FROM classification_review_candidates c JOIN review_records p ON p.id=c.project_id ORDER BY c.project_id LIMIT 50 OFFSET page*50) c));
 END IF;
 IF path='/api/admin/category-report' AND method='GET' THEN
  SELECT count(*) INTO total FROM project_categories WHERE normalized::jsonb#>>'{classification,status}'='needs_review';
  RETURN jsonb_build_object('categories',(SELECT jsonb_agg(jsonb_build_object('category',category,'stored',(SELECT count(*) FROM project_categories WHERE normalized::jsonb->>'primaryCategory'=category),'public',(SELECT count(*) FROM active_map_index m JOIN project_categories c ON c.project_id=m.id WHERE c.normalized::jsonb->>'primaryCategory'=category)) ORDER BY ord) FROM unnest(ARRAY['Residential','Mixed-Use','Commercial','Industrial','Civic','Transportation','Utilities','Environment']) WITH ORDINALITY t(category,ord)),
  'total',(SELECT count(*) FROM projects),'unresolved',total,'publicUnresolved',(SELECT count(*) FROM project_categories c JOIN active_map_index m ON m.id=c.project_id WHERE normalized::jsonb#>>'{classification,status}'='needs_review'),
  'items',(SELECT coalesce(jsonb_agg(to_jsonb(p)),'[]') FROM(SELECT p.id,p.data::jsonb->>'name' name,c.normalized::jsonb->>'originalCategory' "originalCategory",c.normalized::jsonb#>>'{classification,reason}' reason FROM project_categories c JOIN project_profiles p ON p.id=c.project_id WHERE c.normalized::jsonb#>>'{classification,status}'='needs_review' ORDER BY EXISTS(SELECT 1 FROM active_map_index m WHERE m.id=p.id) DESC,p.id LIMIT 50 OFFSET page*50) p),'page',page,'hasMore',(page+1)*50<total);
 END IF;
 IF path~'^/api/admin/records/[A-Za-z0-9-]{1,160}$' AND method='GET' THEN pid=parts[5];IF bw_original(pid) IS NULL THEN PERFORM bw_fail(404,'Original record not found.');END IF;RETURN jsonb_build_object('original',bw_original(pid),'profile',bw_profile(pid),'canonicalId',bw_canonical(pid));END IF;
 IF path='/api/admin/users' AND method='GET' THEN RETURN(SELECT coalesce(jsonb_agg(to_jsonb(u)),'[]') FROM(SELECT id,email,name,role,disabled,verified,created FROM users ORDER BY created DESC LIMIT 200) u);END IF;
 IF path~'^/api/admin/users/[a-f0-9-]+$' AND method='PATCH' THEN
  SELECT * INTO other FROM users WHERE id=parts[5] FOR UPDATE;IF NOT FOUND THEN PERFORM bw_fail(404,'Account not found.');END IF;
  IF other.role='admin' THEN PERFORM bw_fail(403,'The sole administrator is protected.');END IF;
  IF input?'role' AND input->>'role' NOT IN('user','collaborator') THEN PERFORM bw_fail(400,'Only user and collaborator can be assigned.');END IF;
  IF input->>'role'='collaborator' AND other.verified<>1 THEN PERFORM bw_fail(403,'Verify the account email first.');END IF;
  IF input?'disabled' AND jsonb_typeof(input->'disabled')<>'boolean' THEN PERFORM bw_fail(400,'Invalid disabled flag.');END IF;
  UPDATE users SET role=coalesce(input->>'role',other.role),disabled=CASE WHEN input?'disabled' THEN CASE WHEN input->>'disabled'='true' THEN 1 ELSE 0 END ELSE other.disabled END WHERE id=other.id;
  INSERT INTO role_audit VALUES(gen_random_uuid()::text,actor_id,other.id,input::text,bw_now());RETURN '{"ok":true}';
 END IF;
 IF path='/api/admin/invitations' AND method='GET' THEN RETURN(SELECT coalesce(jsonb_agg(to_jsonb(i)),'[]') FROM(SELECT email,expires,accepted,created FROM invitations ORDER BY created DESC LIMIT 200) i);END IF;
 IF path='/api/admin/invitations' AND method='POST' THEN
  IF coalesce(input->>'email','')!~'^[^\s@]+@[^\s@]+\.[^\s@]+$' OR length(input->>'email')>254 THEN PERFORM bw_fail(400,'Enter a valid email.');END IF;
  token=gen_random_uuid()::text||gen_random_uuid()::text;expires=bw_now()+7*86400000::bigint;
  INSERT INTO invitations VALUES(encode(sha256(convert_to(token,'UTF8')),'hex'),lower(input->>'email'),expires,NULL,actor_id,bw_now());RETURN jsonb_build_object('token',token,'email',lower(input->>'email'),'expires',expires);
 END IF;
 IF path='/api/admin/submissions' AND method='GET' THEN RETURN(SELECT coalesce(jsonb_agg(to_jsonb(s)),'[]') FROM(SELECT s.*,u.email FROM submissions s LEFT JOIN users u ON u.id=s.user_id ORDER BY s.created DESC LIMIT 200) s);END IF;
 IF path~'^/api/admin/submissions/[a-f0-9-]+$' AND method='POST' THEN
  SELECT * INTO row FROM submissions WHERE id=parts[5] FOR UPDATE;IF NOT FOUND OR row.status<>'pending' THEN PERFORM bw_fail(409,'Submission already reviewed or unavailable.');END IF;
  IF coalesce(input->>'action','') NOT IN('approve','reject','resolved') THEN PERFORM bw_fail(400,'Choose a valid review action.');END IF;
  IF input->>'action'='approve' THEN
   IF row.kind<>'correction' THEN PERFORM bw_fail(400,'Only corrections can change a project.');END IF;
   value=coalesce(input->'patch',row.patch::jsonb);IF value IS NULL THEN PERFORM bw_fail(400,'Enter reviewed project fields.');END IF;
   IF EXISTS(SELECT 1 FROM jsonb_object_keys(value) k WHERE NOT(k=ANY(ARRAY['name','description','status','address','neighborhood','category','developer','homes','completion','latitude','longitude','meetings','sources']))) THEN PERFORM bw_fail(400,'Invalid correction fields.');END IF;
   value=bw_project(row.project_id);IF coalesce((input->>'_expectedRevision')::bigint,-1)<>coalesce((value->>'revision')::bigint,0) THEN PERFORM bw_fail(409,'Project changed during moderation.');END IF;
   PERFORM bw_publish(input->'_project',actor_id,input->'_derived');
  END IF;
  UPDATE submissions SET status=input->>'action',reviewer=actor_id WHERE id=row.id;RETURN '{"ok":true}';
 END IF;
 IF path='__correction_info' THEN SELECT to_jsonb(s) INTO value FROM submissions s WHERE id=input->>'submissionId';IF value IS NULL THEN PERFORM bw_fail(404,'Submission not found.');END IF;RETURN value||jsonb_build_object('current',bw_project(value->>'project_id'),'policy',(SELECT to_jsonb(l) FROM approval_policy l WHERE project_id=value->>'project_id'));END IF;
 IF path='/api/admin/history' AND method='GET' THEN RETURN jsonb_build_object('projects',(SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM(SELECT * FROM history ORDER BY created DESC LIMIT 200) h),'roles',(SELECT coalesce(jsonb_agg(to_jsonb(r)),'[]') FROM(SELECT * FROM role_audit ORDER BY created DESC LIMIT 200) r));END IF;
 RETURN NULL;
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
