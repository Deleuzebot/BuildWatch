-- Empty private test area. Fixture writes run only inside explicit rolled-back transactions.
-- No production data is copied and no production table privilege is granted.
CREATE SCHEMA buildwatch_audit;
REVOKE ALL ON SCHEMA buildwatch_audit FROM PUBLIC,anon,authenticated;
DO $$
DECLARE item record; definition text; sequence_name text; view_name text;
BEGIN
 PERFORM set_config('check_function_bodies','off',true);
 PERFORM set_config('search_path','pg_catalog,extensions',true);
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch' AND c.relkind='r' ORDER BY c.relname LOOP
  EXECUTE format('CREATE TABLE buildwatch_audit.%I (LIKE buildwatch.%I INCLUDING ALL EXCLUDING DEFAULTS EXCLUDING IDENTITY)',item.relname,item.relname);
 END LOOP;
 -- Restore defaults and identity sequences only in the audit namespace.
 FOR item IN SELECT c.relname,a.attname,a.attidentity,a.attgenerated,pg_get_expr(d.adbin,d.adrelid) expression FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace JOIN pg_attribute a ON a.attrelid=c.oid LEFT JOIN pg_attrdef d ON d.adrelid=c.oid AND d.adnum=a.attnum WHERE n.nspname='buildwatch' AND c.relkind='r' AND a.attnum>0 AND NOT a.attisdropped AND (d.oid IS NOT NULL OR a.attidentity<>'') LOOP
  IF item.attidentity<>'' THEN
   sequence_name=replace(pg_get_serial_sequence(format('buildwatch.%I',item.relname),item.attname),'buildwatch.','buildwatch_audit.');
   EXECUTE format('ALTER TABLE buildwatch_audit.%I ALTER COLUMN %I ADD GENERATED %s AS IDENTITY (SEQUENCE NAME %s)',item.relname,item.attname,CASE WHEN item.attidentity='a' THEN 'ALWAYS' ELSE 'BY DEFAULT' END,sequence_name);
  ELSIF item.attgenerated='' THEN
   EXECUTE format('ALTER TABLE buildwatch_audit.%I ALTER COLUMN %I SET DEFAULT %s',item.relname,item.attname,regexp_replace(item.expression,'\mbuildwatch\M','buildwatch_audit','g'));
  END IF;
 END LOOP;
 FOR item IN SELECT p.oid FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='buildwatch' AND p.prokind='f' LOOP
  definition=regexp_replace(pg_get_functiondef(item.oid),'\mbuildwatch\M','buildwatch_audit','g');
  definition=regexp_replace(definition,'(SET search_path TO [^\n]+)','\1, ''pg_temp''');
  EXECUTE definition;
 END LOOP;
 FOREACH view_name IN ARRAY ARRAY['review_records','project_profiles','public_projects','archived_inventory','active_map_index'] LOOP
  SELECT pg_get_viewdef(c.oid,true) INTO definition FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch' AND c.relname=view_name AND c.relkind='v';
  EXECUTE format('CREATE VIEW buildwatch_audit.%I AS %s',view_name,regexp_replace(definition,'\mbuildwatch\M','buildwatch_audit','g'));
 END LOOP;
 FOR item IN SELECT c.relname,k.conname,pg_get_constraintdef(k.oid) definition FROM pg_constraint k JOIN pg_class c ON c.oid=k.conrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch' AND k.contype='f' LOOP
  EXECUTE format('ALTER TABLE buildwatch_audit.%I ADD CONSTRAINT %I %s',item.relname,item.conname,regexp_replace(item.definition,'\mbuildwatch\M','buildwatch_audit','g'));
 END LOOP;
 FOR item IN SELECT t.oid FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch' AND NOT t.tgisinternal LOOP
  EXECUTE regexp_replace(pg_get_triggerdef(item.oid),'\mbuildwatch\M','buildwatch_audit','g');
 END LOOP;
 FOR item IN SELECT p.oid,p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public' AND p.proname='buildwatch_maintenance_worker' LOOP
  definition=replace(pg_get_functiondef(item.oid),'public.buildwatch_maintenance_worker','buildwatch_audit.buildwatch_maintenance_worker');
  definition=regexp_replace(definition,'\mbuildwatch\M','buildwatch_audit','g');
  definition=regexp_replace(definition,'(SET search_path TO [^\n]+)','\1, ''pg_temp''');
  EXECUTE definition;
 END LOOP;
 -- Server-only policies; the public site's roles have no schema access.
 FOR item IN SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname='buildwatch_audit' AND c.relkind='r' LOOP
  EXECUTE format('ALTER TABLE buildwatch_audit.%I ENABLE ROW LEVEL SECURITY',item.relname);
  EXECUTE format('CREATE POLICY audit_worker_only ON buildwatch_audit.%I TO buildwatch_worker USING (true) WITH CHECK (true)',item.relname);
 END LOOP;
END $$;
CREATE TABLE buildwatch_audit.audit_manifest(id int PRIMARY KEY,created timestamptz NOT NULL DEFAULT now(),note text NOT NULL);
INSERT INTO buildwatch_audit.audit_manifest VALUES(1,now(),'Empty isolated clone; fixture transactions must roll back. Function source fidelity is checked before each run.');
ALTER TABLE buildwatch_audit.audit_manifest ENABLE ROW LEVEL SECURITY;
CREATE POLICY audit_manifest_read ON buildwatch_audit.audit_manifest FOR SELECT TO buildwatch_worker USING(true);
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch_audit FROM PUBLIC,anon,authenticated;
GRANT USAGE ON SCHEMA buildwatch_audit TO buildwatch_worker;
GRANT SELECT ON ALL TABLES IN SCHEMA buildwatch_audit TO buildwatch_worker;
GRANT INSERT,UPDATE,DELETE ON ALL TABLES IN SCHEMA buildwatch_audit TO buildwatch_worker;
REVOKE INSERT,UPDATE,DELETE ON buildwatch_audit.audit_manifest,buildwatch_audit.admin_login_bindings FROM buildwatch_worker;
GRANT USAGE,SELECT ON ALL SEQUENCES IN SCHEMA buildwatch_audit TO buildwatch_worker;
GRANT EXECUTE ON FUNCTION buildwatch_audit.buildwatch_maintenance_worker(text,jsonb),buildwatch_audit.bw_publish(jsonb,text,jsonb),buildwatch_audit.bw_refresh(text,jsonb) TO buildwatch_worker;

CREATE OR REPLACE FUNCTION public.buildwatch_audit_guard() RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path=pg_catalog,buildwatch,pg_temp AS $$
 SELECT jsonb_build_object('projects',(SELECT count(*) FROM buildwatch.projects),'projectsHash',(SELECT md5(string_agg(id||md5(data::text),',' ORDER BY id)) FROM buildwatch.projects),
 'approvalHash',(SELECT md5(string_agg(project_id||md5(to_jsonb(a)::text),',' ORDER BY project_id)) FROM buildwatch.approval_policy a),'history',(SELECT count(*) FROM buildwatch.history),
 'activity',(SELECT count(*) FROM buildwatch.project_activity),'mutations',(SELECT count(*) FROM buildwatch.maintenance_mutations),
 'gates',(SELECT jsonb_build_object('schedule',schedule_enabled,'writes',writes_enabled,'approved',pilot_approved) FROM buildwatch.maintenance_control WHERE id=1));
$$;
REVOKE ALL ON FUNCTION public.buildwatch_audit_guard() FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_audit_guard() TO buildwatch_worker,service_role;
