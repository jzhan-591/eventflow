-- Read only: inspect column types, incoming foreign keys, RLS, policies, and triggers.
select table_name, column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name in ('events', 'participants', 'shifts')
order by table_name, ordinal_position;

select
  conname,
  conrelid::regclass as referencing_table,
  confrelid::regclass as referenced_table,
  convalidated,
  pg_get_constraintdef(oid) as definition
from pg_constraint
where contype = 'f'
  and confrelid in ('public.events'::regclass, 'public.participants'::regclass, 'public.shifts'::regclass)
order by 2, 3, 1;

select relname, relrowsecurity, relforcerowsecurity
from pg_class
where oid in ('public.events'::regclass, 'public.participants'::regclass, 'public.shifts'::regclass);

select tablename, policyname, roles, cmd, qual, with_check
from pg_policies
where schemaname = 'public'
  and tablename in ('events', 'participants', 'shifts')
order by tablename, policyname;

select
  (select rolbypassrls from pg_roles where rolname = 'authenticated') as authenticated_bypasses_rls,
  has_schema_privilege('authenticated', 'public', 'USAGE') as can_use_public,
  has_any_column_privilege('authenticated', 'public.events', 'UPDATE') as can_lock_event,
  has_table_privilege('authenticated', 'public.events', 'SELECT') as can_select_events,
  has_table_privilege('authenticated', 'public.participants', 'SELECT') as can_select_participants,
  has_table_privilege('authenticated', 'public.shifts', 'SELECT') as can_select_shifts,
  has_table_privilege('authenticated', 'public.participants', 'UPDATE') as can_update_participants,
  has_table_privilege('authenticated', 'public.participants', 'INSERT') as can_insert_participants,
  has_table_privilege('authenticated', 'public.participants', 'DELETE') as can_delete_participants,
  has_table_privilege('authenticated', 'public.shifts', 'INSERT') as can_insert_shifts,
  has_table_privilege('authenticated', 'public.shifts', 'DELETE') as can_delete_shifts;

select
  to_regprocedure('extensions.hmac(bytea,bytea,text)') as hmac_function,
  p.oid::regprocedure as rpc,
  p.prosecdef as security_definer,
  has_function_privilege('authenticated', p.oid, 'EXECUTE') as authenticated_can_execute,
  has_function_privilege('anon', p.oid, 'EXECUTE') as anon_can_execute
from (values (to_regprocedure('public.sync_event_participants(text,text)')),
             (to_regprocedure('public.sync_event_participants(uuid,uuid[],jsonb,jsonb)'))) as candidate(oid)
left join pg_proc p using (oid);

select tgrelid::regclass as table_name, tgenabled, pg_get_triggerdef(oid) as definition
from pg_trigger
where not tgisinternal
  and tgrelid in ('public.participants'::regclass, 'public.shifts'::regclass)
order by 1, 3;
