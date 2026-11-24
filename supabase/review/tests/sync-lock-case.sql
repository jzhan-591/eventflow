\set ON_ERROR_STOP on
select current_database() = 'eventflow_sync_test' as scratch_database \gset
\if :scratch_database
\else
  \quit 1
\endif

-- Run before sync-cases.sql, while another session holds a conflicting write lock.
select set_config('request.jwt.claim.sub', '20000000-0000-0000-0000-000000000001', false) is not null;
select set_config('test.manifest', manifest, false) is not null,
       set_config('test.signature', signature, false) is not null
from test_support.make_confirmation();
set role authenticated;
select test_support.expect_rejection('PT409', 'Another operation is updating');
reset role;
do $$
begin
  if exists (select 1 from eventflow_sync_private.used_receipts)
    or (select count(*) from public.participants where event_id = '10000000-0000-0000-0000-000000000001') <> 9
    or (select count(*) from public.shifts) <> 3 then
    raise exception 'A lock conflict changed the saved roster or schedule.';
  end if;
end;
$$;
