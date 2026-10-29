DO $patch$ DECLARE signature text;f text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.buildwatch_shadow(text,jsonb)','buildwatch_audit.buildwatch_shadow(text,jsonb)'] LOOP
  f=pg_get_functiondef(signature::regprocedure);
  f=replace(f,$old$IF sid='apex' THEN SELECT$old$,$new$IF sid='chapel' AND input->>'indexOnly'='true' THEN
   IF coalesce(input->>'projectPage','') !~ '^https://www[.]chapelhillnc[.]gov/Projects/' THEN PERFORM bw_fail(400,'Official project page required.');END IF;
   SELECT array_agg(DISTINCT bw_canonical(x.id)) INTO ids FROM (SELECT p.id,coalesce(o.data,p.data) data FROM projects p LEFT JOIN project_overrides o ON o.project_id=p.id) x WHERE x.data::jsonb->>'state'='NC' AND x.data::jsonb->>'city'='Chapel Hill' AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(x.data::jsonb->'sources','[]')) s WHERE s->>'url'=input->>'projectPage');
  ELSIF sid='apex' THEN SELECT$new$);
  EXECUTE f;
 END LOOP;
END $patch$;
