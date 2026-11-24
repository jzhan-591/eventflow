# Sync CSV installation review

The Dashboard is read-only for sync and has no confirmation write action. Review the application and SQL on a disposable test database before considering that action.

## Changes from the previous draft

- The public RPC accepts only `p_manifest text` and `p_signature text`. The old unsigned overload is removed. The signature covers the original UTF-8 JSON text and permits no independently supplied removals, additions, or snapshot.
- The preview signs a receipt under a different HMAC domain. The future confirmation helper verifies the user and event, reparses the original CSV, rereads saved data, and regenerates the exact manifest to verify the receipt. The helper is server-only and currently has no reachable confirmation action.
- The private verifier validates the confirmation HMAC, owner, expiration, and single-use nonce. A failed transaction rolls back nonce consumption. The public data write runs with the caller's RLS. The private verifier touches only its key and nonce tables.
- Locks, foreign-key checks, exact deletion IDs, and affected-row checks remain in the public transaction. Lock conflicts return a fresh-preview prompt.

## Snapshot contract

The manifest includes a version, authenticated owner ID, event ID, SHA-256 of the original CSV, expiry as epoch seconds, nonce, removal IDs, additions, and the `expected` snapshot. The snapshot is a JSON object with two maps keyed by row ID. Participant values are `[full_name, checked_in]`. Shift values are `[participant_id, role, start_time, end_time]`, including any stored seconds and fractional seconds. An empty collection is `{}`. PostgreSQL compares JSONB values by content. HMAC verification runs on the original text before parsing.

## Review and staging sequence

1. Run the read-only inspection. Confirm active RLS on all three tables. Verify event SELECT and UPDATE visibility for the owner, participant SELECT, INSERT and DELETE policies scoped to the event owner, and shift SELECT and DELETE policies scoped through the participant. Verify the relevant table grants. The authenticated role must lack RLS bypass.
2. Verify the actual incoming FK actions and enabled triggers. If the shift FK is CASCADE, assess all event and participant deletion callers, then apply the independent RESTRICT migration in a test database. An event deletion that cascades to participants will now fail while any shifts reference those participants. A future event-delete transaction needs to remove its authorized shifts before deleting the event.
3. Run the local fixture and the two-session lock test. Repeat authentication and snapshot tests on a separate Supabase project that mirrors the live schema, using real authenticated JWTs. Confirm the old overload is absent and anonymous callers cannot execute the new RPC.
4. If approved for staging, install the revised function. Verify that pgcrypto's HMAC is available under `extensions` and that `eventflow_sync_private` is excluded from the exposed Data API schemas. Use a trusted administrator and a bound SQL parameter to provision a fresh 32-byte key in the private singleton row. Bind its 64-character hex representation as the parameter to the statement below. Put the same hex value in the server-only `EVENTFLOW_SYNC_SIGNING_KEY` secret. Keep parameters out of SQL logging, command history, screenshots, and source control.

   ```sql
   insert into eventflow_sync_private.signing_key (singleton, key_bytes)
   values (true, decode($1, 'hex'))
   on conflict (singleton) do update set key_bytes = excluded.key_bytes;
   ```

5. Review the results before separately implementing an explicit confirmation action or deploying to production. Keep database and application clocks synchronized. Rotate the shared key together on both sides. Old receipts expire within ten minutes and consumed nonces can be pruned by an administrator after expiry. Retain the private verifier's fixed search path and restrictive privileges.

The table locks block participant and shift writes across events during sync. Ordinary app writes can wait for the sync transaction, or can fail and show a retry hint if the database returns a lock-related error. Sync uses NOWAIT and a short lock timeout. After a transport failure with unknown commit status, reload the saved state before retrying.
