SET search_path=buildwatch,extensions,public;
CREATE OR REPLACE VIEW active_map_index AS SELECT m.* FROM map_index m
 JOIN public_projects p ON p.id=m.id
 LEFT JOIN road_project_policy road ON road.project_id=m.id
 WHERE p.data::jsonb->>'status' NOT IN ('Completed','Cancelled')
 AND NOT coalesce((p.data::jsonb->>'archived')::boolean,false)
 AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=m.id)
 AND NOT EXISTS(SELECT 1 FROM automation_project_policy a WHERE a.project_id=m.id AND a.classification<>'Public-Facing Development')
 AND NOT EXISTS(SELECT 1 FROM approval_policy l WHERE l.project_id=m.id AND p.data::jsonb->>'status'='Approved' AND l.due_at<=bw_now())
 AND NOT (p.data::jsonb->>'status'='Approved' AND coalesce(p.data::jsonb->>'evidenceType','')='permit' AND coalesce(p.data::jsonb->>'jurisdiction','')='NC DEQ construction stormwater' AND NOT EXISTS(SELECT 1 FROM community_verifications c WHERE c.project_id=m.id))
 AND (road.project_id IS NULL OR coalesce((road.detail::jsonb->>'qualifies')::boolean,true));
