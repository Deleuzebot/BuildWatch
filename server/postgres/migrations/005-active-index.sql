SET search_path=buildwatch,extensions,public;
-- map_index is the eligibility projection, not a query over every source JSON.
-- Preserve dynamic expiration/revocation checks using indexed IDs only.
CREATE OR REPLACE VIEW active_map_index AS SELECT m.* FROM map_index m
 WHERE m.status NOT IN ('Completed','Cancelled')
 AND NOT EXISTS(SELECT 1 FROM project_relationships r WHERE r.source_id=m.id)
 AND NOT EXISTS(SELECT 1 FROM archived_projects a WHERE a.project_id=m.id)
 AND NOT EXISTS(SELECT 1 FROM automation_project_policy a WHERE a.project_id=m.id AND a.classification<>'Public-Facing Development')
 AND NOT EXISTS(SELECT 1 FROM approval_policy l WHERE l.project_id=m.id AND m.status='Approved' AND l.due_at<=bw_now())
 AND NOT EXISTS(SELECT 1 FROM road_project_policy r WHERE r.project_id=m.id AND r.detail::jsonb->>'qualifies'='false');
