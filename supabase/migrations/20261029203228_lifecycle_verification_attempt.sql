-- A resumed checkpoint shares a run ID but gets a new lease. Expiration needs
-- a successful project verification in this attempt, not a stale checkpoint.
ALTER TABLE buildwatch.maintenance_lifecycle ADD COLUMN checked_lease uuid;
ALTER TABLE buildwatch_audit.maintenance_lifecycle ADD COLUMN checked_lease uuid;
DO $migration$
DECLARE signature text;body text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.buildwatch_maintenance_worker(text,jsonb)','buildwatch_audit.buildwatch_maintenance_worker(text,jsonb)'] LOOP
  body=pg_get_functiondef(signature::regprocedure);
  IF position('ml.checked_run=r.id AND ms.last_error' IN body)=0 THEN RAISE EXCEPTION 'Expected verification guard missing';END IF;
  body=replace(body,'maintenance_lifecycle(project_id,checked_run,source_id,checked_at) VALUES(pid,r.id,s.id,now())','maintenance_lifecycle(project_id,checked_run,source_id,checked_at,checked_lease) VALUES(pid,r.id,s.id,now(),r.lease)');
  body=replace(body,'checked_at=excluded.checked_at;','checked_at=excluded.checked_at,checked_lease=excluded.checked_lease;');
  body=replace(body,'maintenance_lifecycle(project_id,checked_run,source_id,checked_at,movement_at,evidence)','maintenance_lifecycle(project_id,checked_run,source_id,checked_at,movement_at,evidence,checked_lease)');
  body=replace(body,'::bigint,f) ON CONFLICT(project_id)','::bigint,f,r.lease) ON CONFLICT(project_id)');
  body=replace(body,'ml.checked_run=r.id AND ms.last_error','ml.checked_run=r.id AND ml.checked_lease=r.lease AND ms.last_error');
  EXECUTE body;
 END LOOP;
END $migration$;
