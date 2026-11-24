\set ON_ERROR_STOP on
select current_database() = 'eventflow_sync_test' as scratch_database \gset
\if :scratch_database
\else
  \echo 'Use a fresh local database named eventflow_sync_test.'
  \quit 1
\endif

-- Fresh local PostgreSQL database only. These policies are test fixtures.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
end;
$$;
create schema extensions;
create extension pgcrypto with schema extensions;
create schema auth;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;
grant usage on schema auth to authenticated;

create table public.events (id uuid primary key, owner_id uuid not null);
create table public.participants (
  id uuid primary key,
  event_id uuid not null references public.events(id) on delete cascade,
  full_name text not null check (full_name <> 'Reject after deletes'),
  checked_in boolean not null
);
create table public.shifts (
  id uuid primary key,
  participant_id uuid not null references public.participants(id) on delete cascade,
  role text not null,
  start_time time not null,
  end_time time not null
);

alter table public.events enable row level security;
alter table public.participants enable row level security;
alter table public.shifts enable row level security;
create policy event_owner on public.events for all to authenticated
  using (owner_id = auth.uid()) with check (owner_id = auth.uid());
create policy participant_owner on public.participants for all to authenticated
  using (exists (select 1 from public.events e where e.id = event_id))
  with check (exists (select 1 from public.events e where e.id = event_id));
create policy shift_owner on public.shifts for all to authenticated
  using (role <> 'Hidden' and exists (select 1 from public.participants p where p.id = participant_id))
  with check (role <> 'Hidden' and exists (select 1 from public.participants p where p.id = participant_id));
grant select, update on public.events to authenticated;
grant select, insert, update, delete on public.participants, public.shifts to authenticated;

\ir ../restrict-shift-participant-delete.sql
\ir ../sync-event-participants.sql

-- Fictional test key only. Never reuse it outside this fixture.
insert into eventflow_sync_private.signing_key values (true, decode(repeat('ab', 32), 'hex'));
insert into public.events values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002');
insert into public.participants
select ('30000000-0000-0000-0000-' || lpad(i::text, 12, '0'))::uuid,
  '10000000-0000-0000-0000-000000000001', 'Person ' || i, i in (1, 9)
from generate_series(1, 9) as seed(i);
insert into public.participants values
  ('30000000-0000-0000-0000-000000000099', '10000000-0000-0000-0000-000000000002', 'Other event', false);
insert into public.shifts values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Setup', '09:00:01.25', '11:00'),
  ('40000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000009', 'Setup', '11:00', '12:30'),
  ('40000000-0000-0000-0000-000000000099', '30000000-0000-0000-0000-000000000099', 'Cleanup', '12:00', '13:00');

-- Invoker assertion helper. It receives only signed test input.
create schema test_support;
grant usage on schema test_support to authenticated;
create function test_support.expect_rejection(expected_state text, message_prefix text default '')
returns void language plpgsql as $$
declare
  actual_state text;
  actual_message text;
begin
  perform public.sync_event_participants(
    current_setting('test.manifest'), current_setting('test.signature')
  );
  raise exception 'Expected SQLSTATE %, but sync succeeded.', expected_state;
exception when others then
  get stacked diagnostics actual_state = returned_sqlstate, actual_message = message_text;
  if actual_state <> all(string_to_array(expected_state, '|'))
    or left(actual_message, length(message_prefix)) <> message_prefix then
    raise exception 'Expected % (%), got % (%).', expected_state, message_prefix, actual_state, actual_message;
  end if;
end;
$$;

-- Only the fixture administrator can sign. The simulated authenticated role cannot.
create function test_support.make_confirmation(
  addition_name text default 'New volunteer',
  event_id_from_test uuid default '10000000-0000-0000-0000-000000000001',
  owner_id_from_test uuid default '20000000-0000-0000-0000-000000000001',
  use_preview_domain boolean default false
)
returns table(manifest text, signature text) language sql as $$
  with payload as (
    select jsonb_build_object(
      'version', 1,
      'owner_id', owner_id_from_test,
      'event_id', event_id_from_test,
      'nonce', gen_random_uuid(),
      'expires_at', floor(extract(epoch from clock_timestamp()))::bigint + 300,
      'csv_sha256', repeat('a', 64),
      'removals', array[
        '30000000-0000-0000-0000-000000000007',
        '30000000-0000-0000-0000-000000000008',
        '30000000-0000-0000-0000-000000000009'
      ],
      'additions', jsonb_build_array(jsonb_build_object(
        'id', '30000000-0000-0000-0000-000000000010',
        'full_name', addition_name, 'checked_in', true
      )),
      'expected', jsonb_build_object(
        'participants', coalesce((
          select jsonb_object_agg(p.id::text, jsonb_build_array(p.full_name, p.checked_in))
          from public.participants p where p.event_id = event_id_from_test
        ), '{}'::jsonb),
        'shifts', coalesce((
          select jsonb_object_agg(s.id::text,
            jsonb_build_array(s.participant_id, s.role, s.start_time::text, s.end_time::text))
          from public.shifts s join public.participants p on p.id = s.participant_id
          where p.event_id = event_id_from_test and s.role <> 'Hidden'
        ), '{}'::jsonb)
      )
    )::text as body
  )
  select body, encode(extensions.hmac(
    convert_to(
      (case when use_preview_domain then 'eventflow:sync:preview:v1:' else 'eventflow:sync:confirm:v1:' end)
      || body, 'UTF8'
    ),
    decode(repeat('ab', 32), 'hex'), 'sha256'
  ), 'hex') from payload;
$$;
revoke all on function test_support.make_confirmation(text, uuid, uuid, boolean) from public, anon, authenticated;
