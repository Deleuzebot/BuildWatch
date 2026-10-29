-- Read-only functions used by the isolated map/profile views, not production grants.
GRANT EXECUTE ON FUNCTION buildwatch_audit.bw_now(),buildwatch_audit.json_merge_patch(jsonb,jsonb) TO buildwatch_worker;
