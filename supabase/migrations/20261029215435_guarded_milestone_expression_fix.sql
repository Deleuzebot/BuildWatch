DO $patch$ DECLARE ns text; f text; BEGIN
 FOR ns IN SELECT unnest(ARRAY['buildwatch','buildwatch_audit']) LOOP
 SELECT pg_get_functiondef(to_regprocedure(ns||'.bw_research_api(jsonb,text,text,jsonb,jsonb)')) INTO f;
 f=replace(f,'(value->''current''-''revision'')','((value->''current'')-''revision'')');
 EXECUTE f;
 END LOOP;
END $patch$;
