-- User approved 500 additional requests for manual NC dry-run testing only.
-- No schedules, publication gates, privileges, or paid services are changed.
ALTER TABLE buildwatch.maintenance_control DROP CONSTRAINT maintenance_control_monthly_requests_check;
ALTER TABLE buildwatch.maintenance_control ADD CONSTRAINT maintenance_control_monthly_requests_check CHECK(monthly_requests BETWEEN 1 AND 10500);
UPDATE buildwatch.maintenance_control SET monthly_requests=10500 WHERE id=1 AND monthly_requests=10000 AND NOT schedule_enabled AND NOT writes_enabled;
