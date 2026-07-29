# Observability, Secrets, Backups, and Runbooks

## Observability
- Log every consumer mutation with a structured event.
- Include request/session IDs on all web-boundary errors when practical.
- Track analysis failures, upload failures, persistence failures, and rejected approvals as separate event classes.
- Web runtime events are persisted in the runtime SQLite store.

## Secrets
- Keep future production secrets out of git.
- Use environment variables or a secret manager for database credentials, signing keys, and provider tokens.
- Never hardcode credentials in `apps/web`, `apps/worker`, or `apps/admin`.

## Backups
- Treat runtime storage as a backup target once it moves off local disk.
- Define restore steps before any real pilot expansion.
- Test restore paths on a schedule.

## Runbooks
### Health failure
1. Check boundary process status.
2. Check runtime storage path availability.
3. Review latest structured logs and runtime events.
4. Re-run the smoke check.

### Analysis failure
1. Confirm the upload is authorized and intact.
2. Confirm the parser can read the report format.
3. Inspect the match-review flow for unresolved collisions.
4. Check the rule publication and jurisdiction gate.

### Persistence failure
1. Confirm the persistence directory exists and is writable.
2. Confirm the SQLite runtime file is present.
3. Inspect recent `runtime_events` records.
4. Restore from the latest backup if available.

## Release note
These notes are operational scaffolding only. They do not constitute production certification.
