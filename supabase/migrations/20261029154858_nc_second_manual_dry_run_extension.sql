-- Explicit second allowance: 500 more manual NC dry-run requests.
-- Does not enable schedules, publication, paid services, or additional states.
ALTER TABLE buildwatch.maintenance_control DROP CONSTRAINT maintenance_control_monthly_requests_check;
ALTER TABLE buildwatch.maintenance_control ADD CONSTRAINT maintenance_control_monthly_requests_check CHECK(monthly_requests BETWEEN 1 AND 11000);
UPDATE buildwatch.maintenance_control SET monthly_requests=11000 WHERE id=1 AND monthly_requests=10500 AND NOT schedule_enabled AND NOT writes_enabled;
