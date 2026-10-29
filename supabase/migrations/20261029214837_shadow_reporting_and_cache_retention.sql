-- Cache eviction affects only reproducible government responses, never project/history records.
ALTER TABLE buildwatch.shadow_state DROP CONSTRAINT shadow_state_cursor_check;
ALTER TABLE buildwatch.shadow_state ADD CHECK(cursor>=0);
ALTER TABLE buildwatch.shadow_state ALTER COLUMN cursor SET DEFAULT 0;
ALTER TABLE buildwatch_audit.shadow_state DROP CONSTRAINT shadow_state_cursor_check;
ALTER TABLE buildwatch_audit.shadow_state ADD CHECK(cursor>=0);
ALTER TABLE buildwatch_audit.shadow_state ALTER COLUMN cursor SET DEFAULT 0;
DO $migration$ DECLARE signature text;body text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.buildwatch_shadow(text,jsonb)','buildwatch_audit.buildwatch_shadow(text,jsonb)'] LOOP
  body=pg_get_functiondef(signature::regprocedure);
  body=replace(body,$old$IF octet_length(input->>'body')>200000 THEN$old$,$new$DELETE FROM shadow_cache WHERE checked<now()-interval '14 days';
  IF u~'[?&]resultOffset=[1-9]' THEN DELETE FROM shadow_cache WHERE url<>u AND url~'[?&]resultOffset=[1-9]' AND regexp_replace(url,'([?&]resultOffset=)[0-9]+','\1*','g')=regexp_replace(u,'([?&]resultOffset=)[0-9]+','\1*','g');END IF;
  IF octet_length(input->>'body')>200000 THEN$new$);
  body=replace(body,$old$greatest(8,(input->>'cursor')::int)$old$,$new$greatest(0,(input->>'cursor')::int)$new$);
  body=replace(body,$old$ELSIF action='finish' THEN$old$,$new$ELSIF action='report' THEN
  RETURN coalesce((SELECT jsonb_agg(f.data ORDER BY f.source_id,f.external_id) FROM shadow_findings f JOIN shadow_run_findings s ON s.finding_id=f.id WHERE s.run_id=r.id),'[]');
 ELSIF action='finish' THEN$new$);
  EXECUTE body;
 END LOOP;
END $migration$;
