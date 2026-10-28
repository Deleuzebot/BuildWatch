SET search_path=buildwatch,pg_catalog,extensions;
CREATE TABLE IF NOT EXISTS buildwatch.public_assets(key text PRIMARY KEY,data jsonb NOT NULL);
ALTER TABLE buildwatch.public_assets ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON buildwatch.public_assets FROM PUBLIC,anon,authenticated;
CREATE OR REPLACE FUNCTION buildwatch.bw_summary(p jsonb,m jsonb) RETURNS jsonb
 LANGUAGE sql IMMUTABLE SET search_path=pg_catalog AS $$ SELECT jsonb_build_object(
 'id',p->'id','name',p->'name','address',p->'address','neighborhood',p->'neighborhood','category',p->'category',
 'primaryCategory',p->'primaryCategory','subtype',p->'subtype','status',m->'status','latitude',m->'latitude','longitude',m->'longitude',
 'homes',p->'homes','city',p->'city','county',p->'county','state',m->'state','evidenceType',p->'evidenceType','sourceAsOf',p->'sourceAsOf') $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_public_project(pid text) RETURNS jsonb
 LANGUAGE sql STABLE SET search_path=buildwatch,pg_catalog AS $$
 SELECT jsonb_object_agg(key,value) FROM jsonb_each(bw_project(pid))
 WHERE key=ANY(ARRAY['id','name','description','status','address','neighborhood','category','primaryCategory','secondaryCategories','subtype','developer','homes','completion','latitude','longitude','meetings','sources','permitNumbers','city','county','state','jurisdiction','sourceStatus','sourceStatusDate','sourceAsOf','evidenceType','revision','reviewedAt']) $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_filtered(q jsonb,box double precision[] DEFAULT NULL) RETURNS SETOF buildwatch.map_index
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog,extensions SET plan_cache_mode=force_custom_plan AS $$
#variable_conflict use_column
DECLARE search text=lower(trim(coalesce(q->>'search','')));f_status text=coalesce(q->>'status','All');types text[]=string_to_array(nullif(q->>'types',''),',');
 f_state text=upper(coalesce(q->>'state',''));activity text=coalesce(q->>'activity','');since_ms bigint;
BEGIN
 IF length(search)>200 OR f_status NOT IN ('All','Proposed','In review','Approved','Under construction','Completed','Cancelled','On hold') OR (f_state<>'' AND f_state!~'^[A-Z]{2}$') THEN PERFORM bw_fail(400,'Invalid map filters.');END IF;
 IF types IS NOT NULL AND NOT types<@ARRAY['Residential','Mixed-Use','Commercial','Industrial','Civic','Transportation','Utilities','Environment'] THEN PERFORM bw_fail(400,'Invalid development types.');END IF;
 IF box IS NOT NULL AND (cardinality(box)<>4 OR box[1]< -180 OR box[1]>180 OR box[3]< -180 OR box[3]>180 OR box[2]< -90 OR box[4]>90 OR box[2]>box[4] OR EXISTS(SELECT 1 FROM unnest(box) x WHERE x='NaN'::float8 OR x='Infinity'::float8 OR x='-Infinity'::float8)) THEN PERFORM bw_fail(400,'Invalid viewport bounds.');END IF;
 IF activity NOT IN ('','5y') THEN
  IF activity IN ('3m','1y') THEN since_ms=floor(extract(epoch FROM (((statement_timestamp() AT TIME ZONE 'UTC')::date-CASE WHEN activity='3m' THEN interval '3 months' ELSE interval '1 year' END) AT TIME ZONE 'UTC'))*1000);
  ELSIF activity~'^[0-9]{2,4}d$' AND substring(activity FROM '^[0-9]+')::int BETWEEN 30 AND 1826 THEN since_ms=floor(extract(epoch FROM (((statement_timestamp() AT TIME ZONE 'UTC')::date-substring(activity FROM '^[0-9]+')::int) AT TIME ZONE 'UTC'))*1000);
  ELSE PERFORM bw_fail(400,'Invalid activity period.');END IF;
 END IF;
 RETURN QUERY SELECT m.* FROM active_map_index m
 WHERE (f_status='All' OR m.status=f_status) AND (f_state='' OR m.state=f_state)
 AND (search='' OR m.searchtext LIKE '%'||replace(replace(replace(search,'\','\\'),'%','\%'),'_','\_')||'%' ESCAPE '\')
 AND (types IS NULL OR EXISTS(SELECT 1 FROM map_types t WHERE t.rid=m.rid AND t.category=ANY(types)))
 AND (since_ms IS NULL OR m.id IN(SELECT coalesce(r.target_id,a.project_id) FROM project_activity a LEFT JOIN project_relationships r ON r.source_id=a.project_id WHERE a.occurred_at>=since_ms AND a.occurred_at<=bw_now()))
 AND (box IS NULL OR (m.latitude BETWEEN box[2] AND box[4] AND
  CASE WHEN box[1]<=box[3] THEN m.geom OPERATOR(extensions.&&) extensions.st_makeenvelope(box[1],box[2],box[3],box[4],4326) AND m.longitude BETWEEN box[1] AND box[3]
  ELSE (m.geom OPERATOR(extensions.&&) extensions.st_makeenvelope(box[1],box[2],180,box[4],4326) OR m.geom OPERATOR(extensions.&&) extensions.st_makeenvelope(-180,box[2],box[3],box[4],4326)) AND (m.longitude>=box[1] OR m.longitude<=box[3]) END));
END $$;
CREATE OR REPLACE FUNCTION buildwatch.bw_read(path text,q jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE plpgsql STABLE SET search_path=buildwatch,pg_catalog,extensions AS $$
#variable_conflict use_column
DECLARE version text;total bigint;box double precision[];bounds jsonb;nodes jsonb;items jsonb;cursor_id bigint=coalesce((q->>'cursor')::bigint,0);page_limit int=coalesce((q->>'limit')::int,50);
 zoom int=coalesce((q->>'zoom')::int,7);effective int;scale float8;cols float8;cells float8;west_cell float8;east_cell float8;pid text;p jsonb;ids text[];last_id bigint;more boolean;
BEGIN
 IF NOT(q?'limit') THEN page_limit=CASE WHEN path='/api/meetings' THEN 100 WHEN right(path,9)='/activity' THEN 20 ELSE 50 END;END IF;
 version=bw_version();
 IF cursor_id<0 OR cursor_id>9007199254740991 OR page_limit<1 OR page_limit>100 THEN PERFORM bw_fail(400,'Invalid page size or cursor.');END IF;
 IF q?'bbox' THEN box=string_to_array(q->>'bbox',',')::float8[];PERFORM count(*) FROM bw_filtered(q,box);END IF;
 IF path='/api/state-boundaries/2025-20m' THEN RETURN(SELECT data FROM public_assets WHERE key='state-boundaries-2025-20m');END IF;
 IF path='/api/config' THEN RETURN(SELECT data FROM public_assets WHERE key='backend-config');END IF;
 IF path='/api/catalog' THEN
  SELECT count(*),CASE WHEN count(*)=0 THEN NULL ELSE jsonb_build_object('west',min(longitude),'east',max(longitude),'south',min(latitude),'north',max(latitude)) END INTO total,bounds FROM active_map_index;
  RETURN jsonb_build_object('version',version,'total',total,'bounds',bounds);
 ELSIF path='/api/browse' THEN
  SELECT count(*),CASE WHEN count(*)=0 THEN NULL ELSE jsonb_build_object('west',min(longitude),'east',max(longitude),'south',min(latitude),'north',max(latitude)) END INTO total,bounds FROM bw_filtered(q,box);
  WITH candidates AS MATERIALIZED(SELECT m.* FROM bw_filtered(q,box) m WHERE m.rid>cursor_id ORDER BY m.rid LIMIT page_limit+1),
  page AS MATERIALIZED(SELECT * FROM candidates ORDER BY rid LIMIT page_limit)
  SELECT coalesce(jsonb_agg(bw_summary(bw_project(m.id),to_jsonb(m)) ORDER BY m.rid),'[]'),max(m.rid),(SELECT count(*)>page_limit FROM candidates)
  INTO items,last_id,more FROM page m;
  RETURN jsonb_build_object('version',version,'total',total,'items',items,'nextCursor',CASE WHEN more THEN last_id::text ELSE NULL END,'bounds',CASE WHEN cursor_id=0 THEN bounds ELSE NULL END);
 ELSIF path='/api/map' THEN
  IF box IS NULL OR zoom<0 OR zoom>20 THEN PERFORM bw_fail(400,'A valid map viewport and zoom are required.');END IF;
  SELECT count(*) INTO total FROM bw_filtered(q,box);effective=zoom;
  LOOP
   scale=4*power(2,effective);west_cell=floor((box[1]+180)/360*scale);east_cell=floor((box[3]+180)/360*scale);
   cols=CASE WHEN box[1]<=box[3] THEN east_cell-west_cell+1 ELSE ceil(scale)-west_cell+east_cell+1 END;
   cells=cols*(floor((1-ln(tan(pi()/4+greatest(-85,least(85,box[2]))*pi()/360))/pi())/2*scale)-floor((1-ln(tan(pi()/4+greatest(-85,least(85,box[4]))*pi()/360))/pi())/2*scale)+1);
   EXIT WHEN effective=0 OR cells<=512;effective=effective-1;
  END LOOP;
  IF (zoom>=17 OR total<60) AND total<=512 THEN
   WITH candidates AS MATERIALIZED(SELECT * FROM bw_filtered(q,box)) SELECT coalesce(jsonb_agg(jsonb_build_object('id',m.id,'projectId',m.id,'count',1,'latitude',m.latitude,'longitude',m.longitude,'state',m.state,'status',m.status,'name',bw_project(m.id)->>'name','bounds',jsonb_build_object('west',m.longitude,'east',m.longitude,'south',m.latitude,'north',m.latitude))),'[]') INTO nodes FROM candidates m;
  ELSE
   WITH grouped AS MATERIALIZED(SELECT floor(m.x*scale)::int cx,floor(m.y*scale)::int cy,count(*) n,avg(m.latitude) latitude,avg(m.longitude) longitude,min(m.longitude) west,max(m.longitude) east,min(m.latitude) south,max(m.latitude) north,
    CASE WHEN count(m.state)=count(*) AND min(m.state)=max(m.state) THEN min(m.state) ELSE NULL END state,min(m.id) project_id,min(m.status) status FROM bw_filtered(q,box) m GROUP BY cx,cy)
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',CASE WHEN g.n=1 THEN g.project_id ELSE 'cell-'||effective||'-'||g.cx||'-'||g.cy END,'count',g.n,'latitude',g.latitude,'longitude',g.longitude,'state',g.state,'bounds',jsonb_build_object('west',g.west,'east',g.east,'south',g.south,'north',g.north))||CASE WHEN g.n=1 THEN jsonb_build_object('projectId',g.project_id,'status',g.status,'name',bw_project(g.project_id)->>'name') ELSE '{}' END),'[]') INTO nodes FROM grouped g;
  END IF;
  RETURN jsonb_build_object('version',version,'total',total,'nodes',nodes,'bounds',jsonb_build_object('west',box[1],'south',box[2],'east',box[3],'north',box[4]),'zoom',zoom,'effectiveZoom',effective);
 ELSIF path='/api/meetings' THEN
  SELECT count(*) INTO total FROM map_meetings mm JOIN bw_filtered(q) m ON m.rid=mm.project_rid WHERE mm.starts>=bw_now();
  WITH page AS MATERIALIZED(SELECT mm.*,m.id pid,to_jsonb(m) summary FROM map_meetings mm JOIN bw_filtered(q) m ON m.rid=mm.project_rid WHERE mm.starts>=bw_now() ORDER BY mm.starts,mm.project_rid,mm.id LIMIT page_limit OFFSET cursor_id)
  SELECT coalesce(jsonb_agg(mm.data::jsonb||jsonb_build_object('project',bw_summary(bw_project(mm.pid),mm.summary)) ORDER BY mm.starts,mm.project_rid,mm.id),'[]') INTO items FROM page mm;
  RETURN jsonb_build_object('version',version,'total',total,'items',items,'nextCursor',CASE WHEN cursor_id+page_limit<total THEN(cursor_id+page_limit)::text ELSE NULL END);
 ELSIF path='/api/projects' THEN
  IF(SELECT count(*) FROM active_map_index)>20000 THEN PERFORM bw_fail(413,'Use the paginated map API.');END IF;
  RETURN(SELECT coalesce(jsonb_agg(bw_public_project(id) ORDER BY rid),'[]') FROM active_map_index);
 ELSIF path LIKE '/api/public/projects/%' THEN
  pid=substring(path FROM 22);IF right(pid,9)='/activity' THEN pid=left(pid,-9);END IF;
  IF length(pid)>160 OR pid='' THEN PERFORM bw_fail(400,'Invalid project identifier.');END IF;
  pid=bw_canonical(pid);IF NOT EXISTS(SELECT 1 FROM active_map_index WHERE id=pid) THEN PERFORM bw_fail(404,'Project not found.');END IF;
  IF right(path,9)='/activity' THEN
   ids=bw_components(pid);IF cursor_id>1000000 THEN PERFORM bw_fail(400,'Invalid activity page.');END IF;
   SELECT count(*) INTO total FROM project_activity WHERE project_id=ANY(ids) AND occurred_at<=bw_now();
   SELECT coalesce(jsonb_agg(jsonb_build_object('id',a.id,'projectId',a.project_id,'type',a.type,'date',a.event_date,'description',a.description,'sourceUrl',a.source_url,'recordedAt',a.recorded_at) ORDER BY a.occurred_at DESC,a.id),'[]') INTO items FROM(SELECT * FROM project_activity WHERE project_id=ANY(ids) AND occurred_at<=bw_now() ORDER BY occurred_at DESC,id LIMIT page_limit OFFSET cursor_id) a;
   RETURN jsonb_build_object('total',total,'items',items,'nextCursor',CASE WHEN cursor_id+page_limit<total THEN(cursor_id+page_limit)::text ELSE NULL END);
  END IF;RETURN bw_public_project(pid);
 END IF;
 PERFORM bw_fail(404,'Not found.');RETURN NULL;
END $$;
CREATE OR REPLACE FUNCTION public.buildwatch_read(path text,query jsonb DEFAULT '{}') RETURNS jsonb
 LANGUAGE sql SECURITY DEFINER SET search_path=buildwatch,pg_catalog,extensions SET extra_float_digits=3 SET jit=off AS $$ SELECT buildwatch.bw_read(path,query) $$;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
REVOKE ALL ON FUNCTION public.buildwatch_read(text,jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.buildwatch_read(text,jsonb) TO anon,authenticated,service_role;
