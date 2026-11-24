-- Review only. Install after checking grants, RLS, triggers, and foreign keys.
begin;

-- Remove the unsigned overload if an earlier draft was installed.
drop function if exists public.sync_event_participants(uuid, uuid[], jsonb, jsonb);

do $$
begin
  if pg_catalog.to_regprocedure('extensions.hmac(bytea,bytea,text)') is null then
    raise exception 'Install or locate pgcrypto in the extensions schema before installing sync.';
  end if;
end;
$$;

create schema if not exists eventflow_sync_private;
revoke all on schema eventflow_sync_private from public, anon, authenticated;
grant usage on schema eventflow_sync_private to authenticated;

create table if not exists eventflow_sync_private.signing_key (
  singleton boolean primary key check (singleton),
  key_bytes bytea not null check (octet_length(key_bytes) = 32)
);

create table if not exists eventflow_sync_private.used_receipts (
  nonce uuid primary key,
  expires_at bigint not null
);

revoke all on eventflow_sync_private.signing_key, eventflow_sync_private.used_receipts
  from public, anon, authenticated;

-- This helper only authenticates the plan and records receipt use. It cannot
-- read or write application data on behalf of the caller.
create or replace function eventflow_sync_private.consume_confirmation(
  p_manifest text,
  p_signature text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  key_bytes bytea;
  expected bytea;
  provided bytea;
  difference integer := 0;
  plan jsonb;
  expiry bigint;
  now_epoch bigint;
begin
  if auth.uid() is null or p_manifest is null
    or p_signature is null or p_signature !~ '^[a-f0-9]{64}$' then
    raise exception using errcode = '42501', message = 'A signed sync confirmation is required.';
  end if;

  select k.key_bytes into key_bytes from eventflow_sync_private.signing_key k where k.singleton;
  if not found then
    raise sqlstate 'PT503' using message = 'Sync signing is unavailable.';
  end if;

  provided := pg_catalog.decode(p_signature, 'hex');
  expected := extensions.hmac(
    pg_catalog.convert_to('eventflow:sync:confirm:v1:' || p_manifest, 'UTF8'), key_bytes, 'sha256'
  );
  for byte_index in 0..31 loop
    difference := difference | (get_byte(expected, byte_index) # get_byte(provided, byte_index));
  end loop;
  if difference <> 0 then
    raise exception using errcode = '42501', message = 'A signed sync confirmation is required.';
  end if;

  plan := p_manifest::jsonb;
  if jsonb_typeof(plan) is distinct from 'object'
    or plan->'version' is distinct from '1'::jsonb
    or (plan->>'owner_id') is distinct from auth.uid()::text
    or coalesce(plan->>'csv_sha256', '') !~ '^[a-f0-9]{64}$'
    or coalesce(plan->>'expires_at', '') !~ '^[0-9]{1,12}$'
    or coalesce(plan->>'nonce', '') !~ '^[a-f0-9]{8}(-[a-f0-9]{4}){3}-[a-f0-9]{12}$' then
    raise exception using errcode = '42501', message = 'The sync confirmation is invalid for this user.';
  end if;

  expiry := (plan->>'expires_at')::bigint;
  now_epoch := floor(extract(epoch from clock_timestamp()))::bigint;
  if expiry <= now_epoch or expiry > now_epoch + 600 then
    raise sqlstate 'PT409' using message = 'The sync preview expired. Upload the CSV again.';
  end if;

  -- This insert is rolled back with the business changes if sync fails.
  insert into eventflow_sync_private.used_receipts (nonce, expires_at)
  values ((plan->>'nonce')::uuid, expiry)
  on conflict (nonce) do nothing;
  if not found then
    raise sqlstate 'PT409' using message = 'The sync confirmation has already been used.';
  end if;

  return plan;
end;
$$;

revoke all on function eventflow_sync_private.consume_confirmation(text, text) from public, anon, authenticated;
grant execute on function eventflow_sync_private.consume_confirmation(text, text) to authenticated;

create or replace function public.sync_event_participants(
  p_manifest text,
  p_signature text
)
returns boolean
language plpgsql
volatile
security invoker
set search_path = ''
set lock_timeout = '2s'
as $$
declare
  owner uuid := auth.uid();
  plan jsonb;
  event_id_from_plan uuid;
  removal_ids uuid[];
  additions jsonb;
  expected_snapshot jsonb;
  current_snapshot jsonb;
  shift_ids text[];
  participant_count bigint;
  affected_count bigint;
begin
  plan := eventflow_sync_private.consume_confirmation(p_manifest, p_signature);
  event_id_from_plan := (plan->>'event_id')::uuid;
  additions := plan->'additions';
  expected_snapshot := plan->'expected';

  if jsonb_typeof(plan->'removals') is distinct from 'array' then
    raise exception using errcode = '22023', message = 'Invalid sync removal list.';
  end if;
  select coalesce(array_agg(value::uuid), array[]::uuid[]) into removal_ids
  from jsonb_array_elements_text(plan->'removals') as removal(value);

  if owner is null or event_id_from_plan is null then
    raise exception using errcode = '42501', message = 'A verified event owner is required.';
  end if;

  if not pg_catalog.row_security_active('public.events'::regclass)
    or not pg_catalog.row_security_active('public.participants'::regclass)
    or not pg_catalog.row_security_active('public.shifts'::regclass) then
    raise exception using errcode = '42501', message = 'Sync requires active row security on all three tables.';
  end if;

  if jsonb_typeof(additions) is distinct from 'array'
    or jsonb_typeof(expected_snapshot) is distinct from 'object'
    or jsonb_typeof(expected_snapshot->'participants') is distinct from 'object'
    or jsonb_typeof(expected_snapshot->'shifts') is distinct from 'object'
    or (expected_snapshot - array['participants', 'shifts']) <> '{}'::jsonb then
    raise exception using errcode = '22023', message = 'Invalid sync plan or preview snapshot.';
  end if;

  if (select count(distinct id) from unnest(removal_ids) as removal(id)) <> cardinality(removal_ids) then
    raise exception using errcode = '22023', message = 'Removal IDs must be unique and non-null.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(additions) as addition(row_data)
    where jsonb_typeof(row_data) is distinct from 'object'
       or jsonb_typeof(row_data->'id') is distinct from 'string'
       or (row_data->>'id') !~* '^[0-9a-f]{8}(-[0-9a-f]{4}){3}-[0-9a-f]{12}$'
       or jsonb_typeof(row_data->'full_name') is distinct from 'string'
       or (row_data->>'full_name') !~ '[^[:space:]]'
       or jsonb_typeof(row_data->'checked_in') is distinct from 'boolean'
  ) then
    raise exception using errcode = '22023', message = 'Each addition needs a UUID, a name, and a boolean check-in status.';
  end if;

  if exists (
    select 1 from jsonb_array_elements(additions) as addition(row_data)
    where (row_data - array['id', 'full_name', 'checked_in']) <> '{}'::jsonb
  ) then
    raise exception using errcode = '22023', message = 'Unexpected fields in the sync additions.';
  end if;

  if exists (
    select 1 from jsonb_to_recordset(additions) as a(id uuid, full_name text)
    group by a.id having count(*) > 1
  ) or exists (
    select 1 from jsonb_to_recordset(additions) as a(full_name text)
    group by lower(regexp_replace(a.full_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    having count(*) > 1
  ) then
    raise exception using errcode = '22023', message = 'Addition IDs and normalized names must be unique.';
  end if;

  if pg_catalog.current_setting('transaction_isolation') <> 'read committed' then
    raise sqlstate 'PT409' using message = 'Sync requires a fresh READ COMMITTED snapshot.';
  end if;

  -- Keep ownership stable during the transaction. This also requires an UPDATE grant
  -- and an applicable row policy on events; the draft never grants either.
  perform 1 from public.events
  where id = event_id_from_plan and owner_id = owner
  for share nowait;
  if not found then
    raise exception using errcode = '42501', message = 'You do not own this event or cannot lock it.';
  end if;

  -- Ordinary roster and schedule writes take conflicting locks, even outside sync.
  lock table public.participants, public.shifts in share row exclusive mode nowait;

  if cardinality(removal_ids) > 0 and (
    not exists (
      select 1
      from pg_catalog.pg_constraint fk
      join pg_catalog.pg_attribute child
        on child.attrelid = fk.conrelid and fk.conkey = array[child.attnum]
      join pg_catalog.pg_attribute parent
        on parent.attrelid = fk.confrelid and fk.confkey = array[parent.attnum]
      where fk.contype = 'f' and fk.convalidated
        and fk.conrelid = 'public.shifts'::regclass and child.attname = 'participant_id'
        and fk.confrelid = 'public.participants'::regclass and parent.attname = 'id'
        and fk.confdeltype in ('a', 'r')
    ) or exists (
      select 1 from pg_catalog.pg_constraint fk
      where fk.contype = 'f'
        and fk.confrelid in ('public.participants'::regclass, 'public.shifts'::regclass)
        and fk.confdeltype not in ('a', 'r')
    )
  ) then
    raise sqlstate 'PT412' using message = 'Foreign keys cannot safely support the previewed deletion.';
  end if;

  -- Arbitrary custom write triggers may change records outside the approved plan.
  if exists (
    select 1 from pg_catalog.pg_trigger t
    where not t.tgisinternal and t.tgenabled in ('O', 'A') and (
      (cardinality(removal_ids) > 0
        and t.tgrelid in ('public.participants'::regclass, 'public.shifts'::regclass)
        and (t.tgtype::integer & 8) <> 0)
      or (jsonb_array_length(additions) > 0
        and t.tgrelid = 'public.participants'::regclass
        and (t.tgtype::integer & 4) <> 0)
    )
  ) then
    raise sqlstate 'PT412' using message = 'An enabled custom write trigger requires review before sync.';
  end if;

  select jsonb_build_object(
    'participants', coalesce((
      select jsonb_object_agg(p.id::text, jsonb_build_array(p.full_name, p.checked_in))
      from public.participants p where p.event_id = event_id_from_plan
    ), '{}'::jsonb),
    'shifts', coalesce((
      select jsonb_object_agg(
        s.id::text, jsonb_build_array(s.participant_id, s.role, s.start_time::text, s.end_time::text)
      )
      from public.shifts s
      join public.participants p on p.id = s.participant_id
      where p.event_id = event_id_from_plan
    ), '{}'::jsonb)
  ) into current_snapshot;

  if current_snapshot is distinct from expected_snapshot then
    raise sqlstate 'PT409' using message = 'The saved roster or shifts changed after preview.';
  end if;

  if exists (
    select 1 from unnest(removal_ids) as removal(id)
    where not ((current_snapshot->'participants') ? removal.id::text)
  ) then
    raise exception using errcode = '42501', message = 'A removal is outside the approved event roster.';
  end if;

  select count(*) into participant_count from jsonb_each(current_snapshot->'participants');
  if participant_count + jsonb_array_length(additions) <= cardinality(removal_ids) then
    raise exception using errcode = '22023', message = 'The synced roster must contain a participant.';
  end if;

  if exists (
    select 1 from public.participants p
    where p.event_id = event_id_from_plan
    group by lower(regexp_replace(p.full_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    having count(*) > 1
  ) or exists (
    select 1 from jsonb_to_recordset(additions) as a(id uuid, full_name text)
    join public.participants p on p.event_id = event_id_from_plan and (
      p.id = a.id or
      lower(regexp_replace(p.full_name, '^[[:space:]]+|[[:space:]]+$', '', 'g')) =
      lower(regexp_replace(a.full_name, '^[[:space:]]+|[[:space:]]+$', '', 'g'))
    )
  ) then
    raise sqlstate 'PT409' using message = 'Resolve duplicate names before syncing.';
  end if;

  if cardinality(removal_ids) > 0 then
    select coalesce(array_agg(id), array[]::text[]) into shift_ids
    from jsonb_each(current_snapshot->'shifts') as approved_shift(id, fields)
    where (fields->>0)::uuid = any(removal_ids);

    if cardinality(shift_ids) > 0 then
      delete from public.shifts s
      using public.participants p
      where s.id::text = any(shift_ids) and p.id = s.participant_id
        and p.event_id = event_id_from_plan and p.id = any(removal_ids);
      get diagnostics affected_count = row_count;
      if affected_count <> cardinality(shift_ids) then
        raise exception using errcode = '42501', message = 'Some previewed shifts could not be deleted.';
      end if;
    end if;

    -- RESTRICT also rejects hidden or otherwise undeleted child rows.
    delete from public.participants p
    where p.event_id = event_id_from_plan and p.id = any(removal_ids);
    get diagnostics affected_count = row_count;
    if affected_count <> cardinality(removal_ids) then
      raise exception using errcode = '42501', message = 'Some previewed participants could not be deleted.';
    end if;
  end if;

  if jsonb_array_length(additions) > 0 then
    insert into public.participants (id, event_id, full_name, checked_in)
    select a.id, event_id_from_plan, a.full_name, a.checked_in
    from jsonb_to_recordset(additions) as a(id uuid, full_name text, checked_in boolean);
    get diagnostics affected_count = row_count;
    if affected_count <> jsonb_array_length(additions) then
      raise exception using errcode = '42501', message = 'Some previewed participants could not be inserted.';
    end if;
  end if;

  return true;
exception
  when lock_not_available or deadlock_detected or serialization_failure then
    raise sqlstate 'PT409' using message =
      'Another operation is updating the roster or shifts. Wait a moment, then upload the CSV for a fresh preview.';
end;
$$;

revoke all on function public.sync_event_participants(text, text) from public, anon, authenticated;
grant execute on function public.sync_event_participants(text, text) to authenticated;

commit;
