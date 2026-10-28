CREATE INDEX IF NOT EXISTS road_excluded_ids_idx ON buildwatch.road_project_policy(project_id) WHERE detail::jsonb->>'qualifies'='false';
ANALYZE buildwatch.road_project_policy;
ANALYZE buildwatch.map_index;
ANALYZE buildwatch.archived_projects;
ANALYZE buildwatch.project_relationships;
ANALYZE buildwatch.approval_policy;
