-- ArcGIS dates are typed UTC timestamps. Compare explicit calendar dates without
-- converting an application decision into a whole-development approval.
DO $migration$
DECLARE signature text;body text;
BEGIN
 FOREACH signature IN ARRAY ARRAY['public.buildwatch_maintenance_worker(text,jsonb)','buildwatch_audit.buildwatch_maintenance_worker(text,jsonb)'] LOOP
  body=pg_get_functiondef(signature::regprocedure);
  IF position('componentMilestonesVerified' IN body)=0 THEN RAISE EXCEPTION 'Expected component evidence guard missing';END IF;
  body=replace(body,$old$f#>>'{sourceDates,applicationActionAt}'=input#>>'{componentMilestone,date}'$old$,$new$(f#>>'{sourceDates,applicationActionAt}')::date=(input#>>'{componentMilestone,date}')::date$new$);
  body=replace(body,$old$event_date=f#>>'{sourceDates,applicationActionAt}'$old$,$new$event_date=left(f#>>'{sourceDates,applicationActionAt}',10)$new$);
  EXECUTE body;
 END LOOP;
END $migration$;
