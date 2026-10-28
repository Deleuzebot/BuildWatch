SET search_path=buildwatch,pg_catalog,extensions;
CREATE OR REPLACE FUNCTION buildwatch.bw_remind(uid text) RETURNS void LANGUAGE plpgsql SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE pref jsonb;m record;meeting jsonb;refs jsonb;ref jsonb;event text;nid text;inserted int;
BEGIN
 SELECT preferences::jsonb INTO pref FROM users WHERE id=uid AND disabled=0;
 IF coalesce(pref->>'enabled','false')<>'true' OR coalesce(pref->>'reminders','false')<>'true' THEN RETURN;END IF;
 FOR m IN SELECT mm.*,p.data::jsonb->>'name' name,index.id pid FROM(SELECT DISTINCT bw_canonical(project_id) pid FROM follows WHERE user_id=uid) f
 JOIN active_map_index index ON index.id=f.pid JOIN map_meetings mm ON mm.project_rid=index.rid JOIN public_projects p ON p.id=index.id
 WHERE mm.starts>bw_now() AND mm.starts<=bw_now()+86400000 AND bw_active(uid,index.id) ORDER BY mm.starts LIMIT 500 LOOP
  meeting=m.data::jsonb;event='reminder:'||m.pid||':'||(meeting->>'id')||':'||(meeting->>'startsAt');refs='[]';
  FOR ref IN SELECT * FROM jsonb_array_elements(coalesce(meeting->'originalMeetings',jsonb_build_array(jsonb_build_object('projectId',m.pid,'meetingId',meeting->'id')))) LOOP
   IF ref?'startsAt' AND(ref->>'startsAt')::timestamptz<>(meeting->>'startsAt')::timestamptz THEN ref=jsonb_build_object('projectId',m.pid,'meetingId',meeting->'id');END IF;
   refs=refs||jsonb_build_array(ref||jsonb_build_object('startsAt',coalesce(ref->>'startsAt',meeting->>'startsAt')));
  END LOOP;
  IF EXISTS(SELECT 1 FROM notifications n WHERE user_id=uid AND(n.event_key=event OR EXISTS(SELECT 1 FROM notification_meeting_refs old,jsonb_array_elements(refs) r WHERE old.notification_id=n.id AND old.project_id=r->>'projectId' AND old.meeting_id=r->>'meetingId' AND old.starts_at=r->>'startsAt'))) THEN CONTINUE;END IF;
  nid=gen_random_uuid()::text;INSERT INTO notifications(id,user_id,project_id,kind,title,body,created,event_key) VALUES(nid,uid,m.pid,'reminders','Meeting reminder: '||m.name,(meeting->>'title')||' · '||(meeting->>'startsAt'),bw_now(),event) ON CONFLICT DO NOTHING;GET DIAGNOSTICS inserted=ROW_COUNT;
  IF inserted>0 THEN
   INSERT INTO notification_meeting_refs SELECT nid,r->>'projectId',r->>'meetingId',r->>'startsAt' FROM jsonb_array_elements(refs) r ON CONFLICT DO NOTHING;
   INSERT INTO deliveries(notification_id,token) SELECT nid,token FROM devices WHERE user_id=uid ON CONFLICT DO NOTHING;
  END IF;
 END LOOP;
END $$;
CREATE OR REPLACE FUNCTION public.buildwatch_delivery(action text,input jsonb DEFAULT '{}') RETURNS jsonb LANGUAGE plpgsql SECURITY DEFINER SET search_path=buildwatch,pg_catalog AS $$
#variable_conflict use_column
DECLARE r record;u users%ROWTYPE;p jsonb;eligible boolean;result jsonb='[]';BEGIN
 IF action='claim' THEN
  FOR r IN SELECT d.*,n.user_id,n.project_id,n.kind,n.title,n.body,n.created,n.event_key FROM deliveries d JOIN notifications n ON n.id=d.notification_id WHERE d.status IN('pending','ticket','checking','sending') AND d.next_attempt<=bw_now() ORDER BY n.created LIMIT 5 FOR UPDATE OF d SKIP LOCKED LOOP
   SELECT * INTO u FROM users WHERE id=r.user_id;p=bw_project(r.project_id);
   eligible=u.id IS NOT NULL AND u.disabled=0 AND u.preferences::jsonb->>'enabled'='true' AND u.preferences::jsonb->>r.kind='true' AND EXISTS(SELECT 1 FROM devices WHERE token=r.token AND user_id=r.user_id) AND bw_now()-r.created<=86400000;
   IF eligible THEN eligible=bw_active(r.user_id,r.project_id) OR(p->>'status' IN('Completed','Cancelled') AND EXISTS(SELECT 1 FROM follows WHERE user_id=r.user_id AND project_id=ANY(bw_components(r.project_id))));END IF;
   IF eligible AND r.kind='reminders' THEN eligible=EXISTS(SELECT 1 FROM jsonb_array_elements(coalesce(p->'meetings','[]')) m WHERE(m->>'startsAt')::timestamptz>statement_timestamp() AND(r.event_key='reminder:'||bw_canonical(r.project_id)||':'||(m->>'id')||':'||(m->>'startsAt') OR EXISTS(SELECT 1 FROM notification_meeting_refs ref,jsonb_array_elements(coalesce(m->'originalMeetings','[]')) original WHERE ref.notification_id=r.notification_id AND ref.project_id=original->>'projectId' AND ref.meeting_id=original->>'meetingId' AND ref.starts_at=m->>'startsAt')));END IF;
   IF NOT coalesce(eligible,false) THEN UPDATE deliveries SET status='skipped' WHERE notification_id=r.notification_id AND token=r.token;CONTINUE;END IF;
   IF r.status='sending' THEN UPDATE deliveries SET status='uncertain' WHERE notification_id=r.notification_id AND token=r.token;CONTINUE;END IF;
   UPDATE deliveries SET status=CASE WHEN r.ticket IS NULL THEN 'sending' ELSE 'checking' END,next_attempt=bw_now()+120000 WHERE notification_id=r.notification_id AND token=r.token;
   result=result||jsonb_build_array(to_jsonb(r));
  END LOOP;RETURN result;
 END IF;
 IF action='ticket' THEN UPDATE deliveries SET status='ticket',ticket=input->>'ticket',next_attempt=bw_now()+900000 WHERE notification_id=input->>'notificationId' AND token=input->>'token';
 ELSIF action='receipt' THEN
  UPDATE deliveries SET status=CASE WHEN input->>'status'='ok' THEN 'delivered' WHEN input->>'pending'='true' THEN 'ticket' ELSE 'failed' END,next_attempt=bw_now()+900000 WHERE notification_id=input->>'notificationId' AND token=input->>'token';
  IF input->>'unregistered'='true' THEN DELETE FROM devices WHERE token=input->>'token';END IF;
 ELSIF action='failure' THEN UPDATE deliveries SET attempts=attempts+1,status=CASE WHEN input->>'uncertain'='true' THEN 'uncertain' WHEN attempts>=4 THEN 'failed' ELSE 'pending' END,next_attempt=bw_now()+least(3600000,60000*power(2,attempts))::bigint WHERE notification_id=input->>'notificationId' AND token=input->>'token';
 ELSE PERFORM bw_fail(400,'Invalid delivery operation.');END IF;RETURN '{"ok":true}';END $$;
REVOKE ALL ON FUNCTION public.buildwatch_delivery(text,jsonb) FROM PUBLIC,anon,authenticated;
GRANT EXECUTE ON FUNCTION public.buildwatch_delivery(text,jsonb) TO service_role;
REVOKE ALL ON ALL FUNCTIONS IN SCHEMA buildwatch FROM PUBLIC,anon,authenticated;
