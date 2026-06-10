-- Seed default users (idempotent)
INSERT INTO "users" ("id", "name", "email", "password_hash", "created_at", "updated_at")
VALUES
  (gen_random_uuid(), 'Martina', 'martina@hikeplanner.local', '$2a$12$p6/sb1JBe33qqOb2L5vW8.yq8bLDvK9OQE9Z0oZg0A918ydWsFNuG', NOW(), NOW()),
  (gen_random_uuid(), 'Sebastian', 'sebastian@hikeplanner.local', '$2a$12$p6/sb1JBe33qqOb2L5vW8.yq8bLDvK9OQE9Z0oZg0A918ydWsFNuG', NOW(), NOW())
ON CONFLICT ("email") DO NOTHING;
