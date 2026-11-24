-- Independent review draft. Apply only if inspection confirms ON DELETE CASCADE.
begin;
set local lock_timeout = '5s';
set local search_path = '';

lock table public.shifts in access exclusive mode;

do $$
declare
  fk record;
  definition text;
begin
  select c.oid, c.conname, c.confdeltype, c.convalidated into strict fk
  from pg_catalog.pg_constraint c
  join pg_catalog.pg_attribute child
    on child.attrelid = c.conrelid and c.conkey = array[child.attnum]
  join pg_catalog.pg_attribute parent
    on parent.attrelid = c.confrelid and c.confkey = array[parent.attnum]
  where c.contype = 'f'
    and c.conrelid = 'public.shifts'::regclass and child.attname = 'participant_id'
    and c.confrelid = 'public.participants'::regclass and parent.attname = 'id';

  if not fk.convalidated or fk.confdeltype <> 'c' then
    raise exception 'Expected one validated ON DELETE CASCADE foreign key on shifts.participant_id.';
  end if;

  definition := replace(
    pg_catalog.pg_get_constraintdef(fk.oid),
    ' ON DELETE CASCADE', ' ON DELETE RESTRICT'
  );
  if position(' ON DELETE RESTRICT' in definition) = 0 then
    raise exception 'Could not safely rewrite the foreign key definition.';
  end if;

  execute format('alter table public.shifts drop constraint %I', fk.conname);
  execute format('alter table public.shifts add constraint %I %s', fk.conname, definition);
end;
$$;

commit;
