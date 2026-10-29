-- Under #variable_conflict use_column, the previous r.kind=kind compared a
-- column with itself. Qualify the requested filter with the function label.
DO $migration$
DECLARE signature text;body text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['buildwatch.bw_research_api(jsonb,text,text,jsonb,jsonb)','buildwatch_audit.bw_research_api(jsonb,text,text,jsonb,jsonb)'] LOOP
  body=pg_get_functiondef(signature::regprocedure);
  IF position($old$AND(kind='all' OR r.kind=kind)$old$ IN body)=0 THEN RAISE EXCEPTION 'Expected research filter anchor missing';END IF;
  body=replace(body,$old$AND(kind='all' OR r.kind=kind)$old$,$new$AND(bw_research_api.kind='all' OR r.kind=bw_research_api.kind)$new$);
  EXECUTE body;
 END LOOP;
END $migration$;
