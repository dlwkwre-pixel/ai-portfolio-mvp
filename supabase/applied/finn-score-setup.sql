-- Add FINN confidence score to strategies
-- Run after finn-profile-setup.sql

alter table strategies add column if not exists finn_confidence int;
