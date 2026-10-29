-- Read-only, lease-scoped context for dry-run identity and timeline deduplication.
-- No table grants, data migration, scheduling, or publication capability is added.
CREATE OR REPLACE FUNCTION public.buildwatch_maintenance_context(input jsonb) RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path=pg_catalog,buildwatch AS $$
DECLARE run_row buildwatch.maintenance_runs%ROWTYPE; matched_ids text[]; project_json jsonb; activity_count int;
BEGIN
 IF length(input::text)>8000 OR length(coalesce(input->>'externalId',''))>200 THEN
  PERFORM buildwatch.bw_fail(400,'Bounded source identity required.');
 END IF;
 SELECT r.* INTO run_row FROM buildwatch.maintenance_runs r
 WHERE r.id=(input->>'runId')::uuid AND r.lease=(input->>'lease')::uuid
 AND r.status='running' AND r.dry_run AND r.lease_until>now();
 IF run_row.id IS NULL THEN PERFORM buildwatch.bw_fail(403,'An active dry-run worker lease is required.');END IF;
 IF EXISTS(SELECT 1 FROM buildwatch.maintenance_control c WHERE c.schedule_enabled OR c.writes_enabled) THEN
  PERFORM buildwatch.bw_fail(403,'Publication and schedules must be off for validation.');END IF;
 IF NOT EXISTS(SELECT 1 FROM buildwatch.maintenance_sources s WHERE s.id=input->>'sourceId' AND s.state=run_row.state AND s.authority='official') THEN
  PERFORM buildwatch.bw_fail(403,'Official source must belong to the leased state.');END IF;
 SELECT array_agg(DISTINCT buildwatch.bw_canonical(m.project_id)) INTO matched_ids
 FROM buildwatch.maintenance_refs m WHERE m.source_id=input->>'sourceId' AND m.external_id=input->>'externalId';
 IF cardinality(matched_ids)=1 THEN project_json=buildwatch.bw_project(matched_ids[1]);END IF;
 IF project_json IS NULL THEN RETURN jsonb_build_object('ids',coalesce(to_jsonb(matched_ids),'[]'),'project',NULL,'activity',jsonb_build_array(),'activityComplete',false);END IF;
 SELECT count(*) INTO activity_count FROM buildwatch.project_activity a WHERE a.project_id=project_json->>'id';
 RETURN jsonb_build_object('ids',to_jsonb(matched_ids),'project',project_json,'activityComplete',activity_count<=200,
  'activity',coalesce((SELECT jsonb_agg(to_jsonb(x)) FROM(SELECT a.type,a.event_date,a.description,a.source_url FROM buildwatch.project_activity a WHERE a.project_id=project_json->>'id' ORDER BY a.occurred_at DESC,a.id LIMIT 200)x),'[]'),
  'approvalPolicy',(SELECT to_jsonb(p) FROM buildwatch.approval_policy p WHERE p.project_id=project_json->>'id'));
END $$;
REVOKE ALL ON FUNCTION public.buildwatch_maintenance_context(jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_maintenance_context(jsonb) TO buildwatch_worker,service_role;
