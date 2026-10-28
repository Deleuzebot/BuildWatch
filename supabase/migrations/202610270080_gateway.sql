SET search_path=buildwatch,pg_catalog,extensions;
CREATE TABLE IF NOT EXISTS buildwatch.edge_rate_limits(subject text NOT NULL,bucket bigint NOT NULL,count integer NOT NULL,PRIMARY KEY(subject,bucket));
ALTER TABLE buildwatch.edge_rate_limits ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON buildwatch.edge_rate_limits FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION public.buildwatch_runtime_config() RETURNS jsonb LANGUAGE sql SECURITY DEFINER SET search_path=pg_catalog AS $$ SELECT decrypted_secret::jsonb FROM vault.decrypted_secrets WHERE name='buildwatch_backend_config' $$;
REVOKE ALL ON FUNCTION public.buildwatch_runtime_config() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_runtime_config() TO service_role;
CREATE OR REPLACE FUNCTION buildwatch.bw_gateway(identity jsonb,method text,path text,input jsonb DEFAULT '{}',query jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE required text='user';u jsonb;result jsonb;pid text;parts text[]=string_to_array(path,'/');bucket_id bigint=floor(bw_now()/60000);requests integer;event_id text;
BEGIN
 IF method NOT IN('GET','POST','PUT','PATCH','DELETE') OR length(path)>300 OR length(input::text)>128000 THEN PERFORM bw_fail(400,'Invalid request.');END IF;
 IF path LIKE '/api/admin/%' OR path=ANY(ARRAY['__merge_info','__undo_info','__correction_info','__research_info','__archive_step','__archive_checkpoint']) THEN required='admin';
 ELSIF path LIKE '/api/management/%' OR path LIKE '/api/projects/%' OR path='__project_info' THEN required='editor';END IF;
 IF path IN('__delete_abort','__delete_commit') THEN
  SELECT to_jsonb(s) INTO u FROM users s WHERE subject=identity->>'subject';
  IF u IS NULL OR u->>'role'='admin' OR bw_now()-coalesce((identity->>'authenticatedAt')::bigint,0)>300000 THEN PERFORM bw_fail(403,'Recent sign-in required.');END IF;
 ELSE u=bw_actor(identity,required);END IF;
 IF path IN('/api/me','/api/notifications') AND method='GET' THEN PERFORM bw_remind(u->>'id');END IF;
 IF method<>'GET' THEN
  INSERT INTO edge_rate_limits VALUES(identity->>'subject',bucket_id,1) ON CONFLICT(subject,bucket) DO UPDATE SET count=edge_rate_limits.count+1 RETURNING count INTO requests;
  IF requests>100 THEN PERFORM bw_fail(429,'Too many changes. Try again shortly.');END IF;
  DELETE FROM edge_rate_limits WHERE subject=identity->>'subject' AND bucket<bucket_id-2;
 END IF;
 IF path='__project_info' THEN pid=input->>'id';RETURN jsonb_build_object('project',bw_project(pid),'raw',CASE WHEN bw_original(pid) IS NOT NULL THEN bw_profile(pid) ELSE NULL END,'policy',(SELECT to_jsonb(l) FROM approval_policy l WHERE project_id=pid));END IF;
 IF path='/api/management/map' AND method='GET' THEN
  IF query->>'paged'='1' THEN result=bw_read('/api/browse',query);RETURN jsonb_set(result,'{items}',(SELECT coalesce(jsonb_agg(bw_project(item->>'id') ORDER BY ord),'[]') FROM jsonb_array_elements(result->'items') WITH ORDINALITY t(item,ord)));
  ELSE IF(SELECT count(*) FROM active_map_index)>20000 THEN PERFORM bw_fail(413,'Use the paged management endpoint.');END IF;RETURN(SELECT coalesce(jsonb_agg(bw_project(id) ORDER BY rid),'[]') FROM active_map_index);END IF;
 END IF;
 IF path='/api/management/projects' AND method='GET' THEN RETURN(SELECT coalesce(jsonb_agg(p),'[]') FROM(SELECT DISTINCT bw_project(project_id) p FROM history WHERE actor=u->>'id') s WHERE p IS NOT NULL AND coalesce(p->>'archived','false')<>'true');END IF;
 IF path~'^/api/projects/[A-Za-z0-9-]{1,160}(/history)?$' THEN
  pid=parts[4];IF method='PUT' AND parts[5] IS NULL THEN RETURN bw_publish(input->'_project',u->>'id',input->'_derived');END IF;
  IF method='GET' AND parts[5]='history' THEN RETURN(SELECT coalesce(jsonb_agg(to_jsonb(h)),'[]') FROM(SELECT * FROM history WHERE project_id=ANY(bw_components(pid)) ORDER BY created DESC LIMIT 200) h);END IF;
 END IF;
 IF path='__billing_apply' THEN
  INSERT INTO entitlements(user_id,expires,store,management_url,synced) VALUES(u->>'id',coalesce((input->>'expires')::bigint,0),coalesce(input->>'store',''),CASE WHEN input->>'managementURL' LIKE 'https://%' THEN input->>'managementURL' ELSE NULL END,bw_now()) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires,store=excluded.store,management_url=excluded.management_url,synced=excluded.synced;
  RETURN bw_account(u->>'id',identity);
 END IF;
 result=bw_account_api(u,identity,method,path,input,query);IF result IS NOT NULL THEN RETURN result;END IF;
 IF required='admin' THEN
  IF path='__archive_checkpoint' THEN
   UPDATE archive_operations SET scope=jsonb_set(scope::jsonb,'{resumeStatus}',to_jsonb(status))::text,status='interrupted',updated=bw_now() WHERE id=input->>'operationId' AND actor=u->>'id' AND status IN('preparing','running');
   RETURN bw_archive_operation(input->>'operationId',u->>'id');
  END IF;
  result=bw_admin_api(u,identity,method,path,input,query);IF result IS NOT NULL THEN RETURN result;END IF;
  result=bw_archive_api(u,method,path,input,query);IF result IS NOT NULL THEN RETURN result;END IF;
  result=bw_research_api(u,method,path,input,query);IF result IS NOT NULL THEN RETURN result;END IF;
 END IF;
 PERFORM bw_fail(404,'Not found.');RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.buildwatch_edge(identity jsonb,method text,path text,input jsonb DEFAULT '{}',query jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path=buildwatch,pg_catalog SET extra_float_digits=3 SET jit=off AS $$ SELECT buildwatch.bw_gateway(identity,method,path,input,query) $$;
REVOKE ALL ON FUNCTION public.buildwatch_edge(jsonb,text,text,jsonb,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_edge(jsonb,text,text,jsonb,jsonb) TO service_role;
CREATE OR REPLACE FUNCTION public.buildwatch_billing(event_id text,updates jsonb) RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE item jsonb;BEGIN
 IF length(event_id)>200 OR jsonb_typeof(updates)<>'array' OR jsonb_array_length(updates)>100 THEN PERFORM bw_fail(400,'Invalid billing event.');END IF;
 IF EXISTS(SELECT 1 FROM webhook_events WHERE id=event_id) THEN RETURN '{"received":true}';END IF;
 FOR item IN SELECT * FROM jsonb_array_elements(updates) LOOP
  IF NOT EXISTS(SELECT 1 FROM users WHERE id=item->>'id') THEN CONTINUE;END IF;
  INSERT INTO entitlements(user_id,expires,store,management_url,synced) VALUES(item->>'id',coalesce((item->>'expires')::bigint,0),coalesce(item->>'store',''),CASE WHEN item->>'managementURL' LIKE 'https://%' THEN item->>'managementURL' ELSE NULL END,bw_now()) ON CONFLICT(user_id) DO UPDATE SET expires=excluded.expires,store=excluded.store,management_url=excluded.management_url,synced=excluded.synced;
 END LOOP;
 INSERT INTO webhook_events VALUES(event_id,bw_now()) ON CONFLICT DO NOTHING;RETURN '{"received":true}';END $$;
REVOKE ALL ON FUNCTION public.buildwatch_billing(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_billing(text,jsonb) TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL TABLES IN SCHEMA buildwatch FROM PUBLIC,anon,authenticated;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA buildwatch FROM PUBLIC,anon,authenticated;
NOTIFY pgrst,'reload schema';
