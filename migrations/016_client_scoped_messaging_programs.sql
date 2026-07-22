DO $$ BEGIN
  ALTER TABLE messaging_programs
    ADD CONSTRAINT messaging_programs_id_organization_unique
    UNIQUE (id, organization_id);
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE recipient_authorizations
    ADD CONSTRAINT recipient_authorizations_program_organization_fk
    FOREIGN KEY (messaging_program_id, organization_id)
    REFERENCES messaging_programs (id, organization_id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE messages
    ADD CONSTRAINT messages_program_organization_fk
    FOREIGN KEY (messaging_program_id, organization_id)
    REFERENCES messaging_programs (id, organization_id)
    ON DELETE RESTRICT;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
