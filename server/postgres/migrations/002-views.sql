SET search_path=buildwatch,public;
CREATE FUNCTION json_merge_patch(target jsonb,patch jsonb) RETURNS jsonb
LANGUAGE plpgsql IMMUTABLE SET search_path=pg_catalog,buildwatch AS $$
DECLARE result jsonb; k text; v jsonb;
BEGIN
 IF jsonb_typeof(patch)<>'object' THEN RETURN patch; END IF;
 result=CASE WHEN jsonb_typeof(target)='object' THEN target ELSE '{}'::jsonb END;
 FOR k,v IN SELECT key,value FROM jsonb_each(patch) LOOP
  IF v='null'::jsonb THEN result=result-k;
  ELSE result=jsonb_set(result,ARRAY[k],buildwatch.json_merge_patch(result->k,v),true); END IF;
 END LOOP;RETURN result;
END $$;
CREATE FUNCTION bw_now() RETURNS bigint LANGUAGE sql VOLATILE AS $$ SELECT floor(extract(epoch FROM clock_timestamp())*1000)::bigint $$;
CREATE VIEW review_records AS SELECT id,data FROM projects UNION ALL SELECT s.id,s.data FROM supporting_sources s WHERE NOT EXISTS(SELECT 1 FROM projects p WHERE p.id=s.id);
CREATE VIEW project_profiles AS SELECT p.id,p.rowid,json_merge_patch(coalesce(o.data,p.data)::jsonb,coalesce(c.normalized,'{}')::jsonb)::text data,coalesce(o.revision,p.revision) revision
 FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id LEFT JOIN project_categories c ON c.project_id=p.id;
CREATE VIEW public_projects AS SELECT p.rowid,p.id,p.data,p.revision FROM project_profiles p WHERE NOT EXISTS(SELECT 1 FROM project_relationships r WHERE r.source_id=p.id);
CREATE VIEW archived_inventory AS
 SELECT p.*,coalesce(a.reason,CASE
 WHEN coalesce((p.data::jsonb->>'archived')::boolean,false) THEN 'manual'
 WHEN p.data::jsonb->>'evidenceType'='permit' AND p.data::jsonb->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications v WHERE v.project_id=p.id) THEN 'supporting_permit_only'
 ELSE 'approved_expired' END) archive_reason,a.archived_at,a.actor archive_actor,a.run_id
 FROM project_profiles p LEFT JOIN archived_projects a ON a.project_id=p.id LEFT JOIN approval_policy l ON l.project_id=p.id
 WHERE a.project_id IS NOT NULL OR coalesce((p.data::jsonb->>'archived')::boolean,false)
 OR (p.data::jsonb->>'status'='Approved' AND p.data::jsonb->>'evidenceType'='permit' AND p.data::jsonb->>'jurisdiction'='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications v WHERE v.project_id=p.id))
 OR (p.data::jsonb->>'status'='Approved' AND l.due_at<=bw_now());
CREATE VIEW active_map_index AS SELECT m.* FROM map_index m
 JOIN public_projects p ON p.id=m.id
 LEFT JOIN road_project_policy road ON road.project_id=m.id
 WHERE p.data::jsonb->>'status' NOT IN ('Completed','Cancelled')
 AND NOT coalesce((p.data::jsonb->>'archived')::boolean,false)
 AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=m.id)
 AND NOT EXISTS(SELECT 1 FROM automation_project_policy a WHERE a.project_id=m.id AND a.classification<>'Public-Facing Development')
 AND NOT EXISTS(SELECT 1 FROM approval_policy l WHERE l.project_id=m.id AND p.data::jsonb->>'status'='Approved' AND l.due_at<=bw_now())
 AND NOT (p.data::jsonb->>'status'='Approved' AND coalesce(p.data::jsonb->>'evidenceType','')='permit' AND coalesce(p.data::jsonb->>'jurisdiction','')='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications c WHERE c.project_id=m.id))
 AND (road.project_id IS NULL OR coalesce((road.detail::jsonb->>'qualifies')::boolean,true));
CREATE INDEX category_review ON project_categories ((normalized::jsonb#>>'{classification,status}'),project_id);
CREATE INDEX projects_state ON projects ((data::jsonb->>'state'));
CREATE INDEX projects_city ON projects ((lower(data::jsonb->>'city')));
CREATE INDEX projects_county ON projects ((lower(data::jsonb->>'county')));
CREATE INDEX projects_status ON projects ((data::jsonb->>'status'));
CREATE INDEX project_category ON project_categories ((normalized::jsonb->>'primaryCategory'));
CREATE INDEX map_state_status ON map_index(state,status,rid);
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC;
REVOKE ALL ON ALL TABLES IN SCHEMA buildwatch FROM PUBLIC;
