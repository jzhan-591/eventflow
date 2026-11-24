\set ON_ERROR_STOP on
select current_database() = 'eventflow_sync_test' as scratch_database \gset
\if :scratch_database
\else
  \quit 1
\endif

select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false) is not null;

-- Untrusted callers cannot use the old signature or read the signing key.
do $$
begin
  if to_regprocedure('public.sync_event_participants(uuid,uuid[],jsonb,jsonb)') is not null
    or has_function_privilege('anon', 'public.sync_event_participants(text,text)', 'EXECUTE')
    or not has_function_privilege('authenticated', 'public.sync_event_participants(text,text)', 'EXECUTE')
    or has_table_privilege('authenticated', 'eventflow_sync_private.signing_key', 'SELECT') then
    raise exception 'Sync privileges do not match the expected boundary.';
  end if;
end;
$$;

-- A future event deletion must remove child shifts before relying on the event cascade.
do $$
begin
  delete from public.events where id = '10000000-0000-0000-0000-000000000001';
  raise exception 'Expected the shift FK to reject cascading event deletion.';
exception when foreign_key_violation or sqlstate '23001' then
  null;
end;
$$;

-- Keep the signature and replace the removal list.
select set_config('test.manifest', (manifest::jsonb ||
         '{"removals":["30000000-0000-0000-0000-000000000001"]}'::jsonb)::text, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation();
set role authenticated;
select test_support.expect_rejection('42501', 'A signed sync confirmation');
reset role;

-- Neither an altered addition nor a preview-domain signature authorizes writes.
select set_config('test.manifest', jsonb_set(manifest::jsonb, '{additions,0,full_name}', '"Substitute"')::text, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation();
set role authenticated;
select test_support.expect_rejection('42501', 'A signed sync confirmation');
reset role;

select set_config('test.manifest', manifest, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation(use_preview_domain => true);
set role authenticated;
select test_support.expect_rejection('42501', 'A signed sync confirmation');
reset role;

-- Sign for another event with the caller's identity. The event ownership check must still reject it.
select set_config('test.manifest', manifest, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation(event_id_from_test => '10000000-0000-0000-0000-000000000002');
set role authenticated;
select test_support.expect_rejection('42501', 'You do not own this event');
reset role;

-- Another user cannot replay an otherwise valid confirmation.
select set_config('test.manifest', manifest, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation();
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000002', false) is not null;
set role authenticated;
select test_support.expect_rejection('42501', 'The sync confirmation is invalid for this user');
reset role;
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false) is not null;

-- A sub-minute schedule change must invalidate the original snapshot.
update public.shifts set start_time = '09:00:01.75' where id = '40000000-0000-0000-0000-000000000001';
set role authenticated;
select test_support.expect_rejection('PT409', 'The saved roster or shifts changed');
reset role;
update public.shifts set start_time = '09:00:01.25' where id = '40000000-0000-0000-0000-000000000001';

-- An RLS-hidden child shift is not in the preview. The migrated FK must block deletion.
insert into public.shifts values
  ('40000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000009', 'Hidden', '14:00', '15:00');
select set_config('test.manifest', manifest, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation();
set role authenticated;
select test_support.expect_rejection('23503|23001');
reset role;
do $$
begin
  if (select count(*) from public.shifts) <> 4 then
    raise exception 'The FK failure did not restore the visible and hidden shifts.';
  end if;
end;
$$;
delete from public.shifts where id = '40000000-0000-0000-0000-000000000008';

-- Force a CHECK failure at the final insertion, after both deletions.
select set_config('test.manifest', manifest, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation('Reject after deletes');
set role authenticated;
select test_support.expect_rejection('23514');
reset role;
do $$
begin
  if (select count(*) from public.participants where event_id = '10000000-0000-0000-0000-000000000001') <> 9
    or (select count(*) from public.shifts) <> 3
    or exists (select 1 from eventflow_sync_private.used_receipts) then
    raise exception 'A failed sync left partial changes or consumed a receipt.';
  end if;
end;
$$;

-- A successful signed plan removes three, adds one, and preserves existing identities.
select set_config('test.manifest', manifest, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation();
set role authenticated;
select public.sync_event_participants(current_setting('test.manifest'), current_setting('test.signature'));
select test_support.expect_rejection('PT409', 'The sync confirmation has already been used');
reset role;
do $$
begin
  if (select count(*) from public.participants where event_id = '10000000-0000-0000-0000-000000000001') <> 7
    or not exists (select 1 from public.participants where id = '30000000-0000-0000-0000-000000000001' and checked_in)
    or not exists (select 1 from public.participants where id = '30000000-0000-0000-0000-000000000010' and checked_in)
    or exists (select 1 from public.participants where id in (
      '30000000-0000-0000-0000-000000000007','30000000-0000-0000-0000-000000000008','30000000-0000-0000-0000-000000000009'))
    or not exists (select 1 from public.shifts
      where id = '40000000-0000-0000-0000-000000000001' and start_time = '09:00:01.25' and end_time = '11:00')
    or exists (select 1 from public.shifts where id = '40000000-0000-0000-0000-000000000009')
    or not exists (select 1 from public.shifts where id = '40000000-0000-0000-0000-000000000099')
    or not exists (select 1 from public.participants where id = '30000000-0000-0000-0000-000000000099')
    or (select count(*) from eventflow_sync_private.used_receipts) <> 1 then
    raise exception 'The sync did not preserve the approved roster and schedule.';
  end if;
end;
$$;
