-- Manual rollback for migration 0006. Export profile rows before running this:
-- rollback necessarily removes new software, certification, and keyword profile data.
DROP TABLE IF EXISTS "user_software";
DROP TABLE IF EXISTS "user_keywords";
DROP TABLE IF EXISTS "user_certifications";
DROP TYPE IF EXISTS "software_familiarity_enum";
DROP TYPE IF EXISTS "keyword_preference_enum";
