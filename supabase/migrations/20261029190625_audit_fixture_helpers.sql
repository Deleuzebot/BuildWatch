CREATE FUNCTION buildwatch_audit.fixture_seed(project jsonb,derived jsonb,approval jsonb DEFAULT NULL,follow_project boolean DEFAULT false) RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path=pg_catalog,buildwatch_audit,extensions,pg_temp AS $$
DECLARE saved jsonb;pid text=project->>'id';
BEGIN
 IF current_setting('buildwatch.audit_transaction',true) IS DISTINCT FROM 'rollback-only' OR pid NOT LIKE 'audit-%' OR length(project::text)>32000 THEN RAISE EXCEPTION 'Explicit rollback-only fixture transaction and audit-prefixed project required';END IF;
 saved=buildwatch_audit.bw_publish(project,'audit:fixture',derived);
 IF approval IS NOT NULL THEN
  INSERT INTO buildwatch_audit.approval_policy(project_id,approval_date,approval_at,approval_evidence,schedules,exception_until,expires_at,due_at,review_reason,actor,updated)
  VALUES(pid,approval->>'approval_date',(approval->>'approval_at')::bigint,approval->>'approval_evidence',coalesce(approval->>'schedules','[]'),(approval->>'exception_until')::bigint,(approval->>'expires_at')::bigint,(approval->>'due_at')::bigint,'','audit:fixture',buildwatch_audit.bw_now())
  ON CONFLICT(project_id) DO UPDATE SET approval_date=excluded.approval_date,approval_at=excluded.approval_at,approval_evidence=excluded.approval_evidence,schedules=excluded.schedules,exception_until=excluded.exception_until,expires_at=excluded.expires_at,due_at=excluded.due_at;
  PERFORM buildwatch_audit.bw_refresh(pid,derived);
 END IF;
 IF follow_project THEN
  INSERT INTO buildwatch_audit.users(id,subject,email,name,verified,role,preferences,created) VALUES('audit-user','audit:fixture','fixture@example.invalid','Isolated fixture user',1,'collaborator','{"enabled":true,"updates":true,"meetings":true,"reminders":true}',buildwatch_audit.bw_now()) ON CONFLICT DO NOTHING;
  INSERT INTO buildwatch_audit.follows(user_id,project_id,rank) VALUES('audit-user',pid,1) ON CONFLICT DO NOTHING;
 END IF;
 RETURN saved;
END $$;
REVOKE ALL ON FUNCTION buildwatch_audit.fixture_seed(jsonb,jsonb,jsonb,boolean) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION buildwatch_audit.fixture_seed(jsonb,jsonb,jsonb,boolean) TO buildwatch_worker;
