-- Attested consumer identity (intake).
--
-- The identity checks in the analysis catalog compare the report's own personal-information
-- section against a reference set. That reference set can only come from the consumer: a report
-- compared with itself cannot show that the name on it is not the reader's name. This table is
-- that reference set, plus the accuracy declaration that makes a variance Finding defensible.
--
-- It is a dedicated table rather than another key inside users.payload_json (where Consent lives)
-- for one operational reason: it carries a date of birth and a Social Security fragment, and
-- deletion of those must be an explicit, greppable, separately-auditable statement in
-- deleteAccount rather than an implicit consequence of deleting the user row.
--
-- Only the last four SSN digits are ever stored. There is no column for a full number and the
-- application layer rejects any input longer than four digits rather than truncating it.

CREATE TABLE IF NOT EXISTS consumer_identities (
  user_id TEXT PRIMARY KEY REFERENCES users(id),
  payload_json TEXT NOT NULL
);
