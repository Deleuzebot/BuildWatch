-- Extend only private shadow cache/read matching; no project publication operations.
DO $patch$ DECLARE signature text;f text;BEGIN
 FOREACH signature IN ARRAY ARRAY['public.buildwatch_shadow(text,jsonb)','buildwatch_audit.buildwatch_shadow(text,jsonb)'] LOOP
  f=pg_get_functiondef(signature::regprocedure);
  f=replace(f,$old$u=input->>'url';IF NOT ($old$,$new$u=input->>'url';IF NOT (u~'^https://www[.]chapelhillnc[.]gov/(robots[.]txt$|Business-and-Development/Active-Development([?]|$)|Projects/|files/assets/public/|DocumentCenter/)' OR u~'^https://(www[.])?chapelboro[.]com/(robots[.]txt$|feed(/|[?]|$)|news/)' OR u~'^https://news[.]unchealthcare[.]org/(robots[.]txt$|feed(/|[?]|$)|20[0-9]{2}/)' OR $new$);
  f=replace(f,$old$AND EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(x.data::jsonb->'sources','[]')) s WHERE s->>'url'=input->>'projectPage');$old$,$new$AND (lower(x.data::jsonb->>'name')=lower(input->>'name') OR EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(x.data::jsonb->'sources','[]')) s WHERE s->>'url'=input->>'projectPage'));$new$);
  EXECUTE f;
 END LOOP;
END $patch$;
