-- Identity fields are not category-normalized. Avoid rebuilding the full category projection for every scanned row.
DO $patch$ DECLARE signature text;f text;BEGIN
 IF EXISTS(SELECT 1 FROM buildwatch.project_categories WHERE normalized::jsonb ?| ARRAY['name','address','state','city','sources','permitNumbers']) THEN RAISE EXCEPTION 'Category projection contains identity overrides; do not change identity lookup semantics.';END IF;
 FOREACH signature IN ARRAY ARRAY['public.buildwatch_shadow(text,jsonb)','buildwatch_audit.buildwatch_shadow(text,jsonb)'] LOOP
  f=pg_get_functiondef(signature::regprocedure);
  f=replace(f,'FROM project_profiles x','FROM (SELECT p.id,coalesce(o.data,p.data) data FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id) x');
  EXECUTE f;
 END LOOP;
END $patch$;
