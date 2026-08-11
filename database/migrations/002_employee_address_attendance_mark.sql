-- Add employee home address for attendance register
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS address VARCHAR(255);

ALTER TABLE attendance_records
  ADD COLUMN IF NOT EXISTS mark CHAR(1) CHECK (mark IS NULL OR mark IN ('P', 'A'));
