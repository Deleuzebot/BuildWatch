SET search_path=buildwatch,pg_catalog,extensions;
CREATE OR REPLACE FUNCTION buildwatch.bw_web_summary() RETURNS jsonb LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT jsonb_build_object('limits',jsonb_build_object('dailyQueries',24,'monthlyQueries',200,'cacheDays',7),'dailyUsed',d.n,'monthlyUsed',m.n,'remaining',greatest(0,least(24-d.n,200-m.n)),
 'mode','Codex-assisted research; no paid search API or scheduled execution','recent',(SELECT coalesce(jsonb_agg(to_jsonb(q)),'[]') FROM(SELECT id,area,query,state,created,completed,result_count FROM web_search_queries ORDER BY created DESC LIMIT 20) q))
 FROM(SELECT count(*) n FROM web_search_queries WHERE created>=floor(extract(epoch FROM(date_trunc('day',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))*1000)) d,
 (SELECT count(*) n FROM web_search_queries WHERE created>=floor(extract(epoch FROM(date_trunc('month',statement_timestamp() AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'))*1000)) m $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_research_detail(pid text) RETURNS jsonb LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT to_jsonb(r)||jsonb_build_object('data',r.data::jsonb,'current',CASE WHEN r.project_id IS NOT NULL THEN bw_project(r.project_id) ELSE NULL END,'audit',(SELECT coalesce(jsonb_agg(to_jsonb(a)),'[]') FROM(SELECT * FROM research_audit WHERE proposal_id=pid ORDER BY created DESC LIMIT 100) a)) FROM research_proposals r WHERE id=pid $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_research_preview(pid text,actor_id text) RETURNS jsonb LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE r research_proposals%ROWTYPE;data jsonb;current_p jsonb;result jsonb;meeting jsonb;token text=gen_random_uuid()::text;BEGIN
 SELECT * INTO r FROM research_proposals WHERE id=pid FOR UPDATE;IF NOT FOUND THEN PERFORM bw_fail(404,'Research proposal not found.');END IF;
 data=r.data::jsonb;IF r.status NOT IN('pending','deferred') OR r.kind NOT IN('status','meeting') THEN PERFORM bw_fail(409,'This record needs manual classification or editing before publication.');END IF;
 current_p=bw_project(r.project_id);
 IF current_p IS NULL OR current_p->>'id'<>r.project_id OR current_p->>'archived'='true' OR current_p->'revision' IS DISTINCT FROM data->'before'->'revision' OR current_p->'status' IS DISTINCT FROM data->'before'->'status' THEN PERFORM bw_fail(409,'Project changed or was linked since research. Refresh this proposal.');END IF;
 result=current_p;
 IF r.kind='status' THEN
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
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_research_info(token_id text,actor_id text) RETURNS jsonb LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE p research_previews%ROWTYPE;r research_proposals%ROWTYPE;current_p jsonb;BEGIN
 SELECT * INTO p FROM research_previews WHERE token=token_id;IF NOT FOUND OR p.actor<>actor_id OR p.used<>0 OR p.expires<bw_now() THEN PERFORM bw_fail(409,'Preview expired or already used.');END IF;
 SELECT * INTO r FROM research_proposals WHERE id=p.proposal_id;current_p=bw_project(r.project_id);
 IF r.status NOT IN('pending','deferred') OR p.signature<>bw_hash(jsonb_build_array(r.data,r.revision,current_p)) THEN PERFORM bw_fail(409,'Project or proposal changed. Preview again.');END IF;
 RETURN jsonb_build_object('result',p.result::jsonb,'current',current_p,'proposalId',r.id,'policy',(SELECT to_jsonb(l) FROM approval_policy l WHERE project_id=r.project_id));END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_research_api(u jsonb,method text,path text,input jsonb,q jsonb) RETURNS jsonb LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
<<bw_research_api>>
DECLARE actor_id text=u->>'id';parts text[]=string_to_array(path,'/');pid text;token_id text;row research_proposals%ROWTYPE;data jsonb;value jsonb;current_p jsonb;result jsonb;source_id text;issuer text;external_id text;cid jsonb;
 page int=coalesce((q->>'page')::int,0);f_status text=coalesce(q->>'status','pending');kind text=coalesce(q->>'kind','all');search text=lower(trim(coalesce(q->>'search','')));total bigint;items jsonb;
BEGIN
 IF path='/api/admin/research' AND method='GET' THEN
  IF page<0 OR page>100000 OR f_status NOT IN('pending','deferred','dismissed','applied','duplicate_review','all') OR kind NOT IN('all','status','meeting','discovery','uncertain') OR length(search)>200 THEN PERFORM bw_fail(400,'Invalid review filters.');END IF;
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
END $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
