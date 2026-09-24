-- Private W5 responses; only the server role can access student writing.
create table if not exists rib.ai_judgments (
 activity_id text not null references rib.activities, term text not null, student_id text not null,
 answers jsonb not null, status text not null check(status in ('draft','submitted')),
 revision integer not null default 1, updated_at timestamptz not null default now(),
 primary key(activity_id,student_id), foreign key(term,student_id) references rib.students
);
alter table rib.ai_judgments enable row level security;
revoke all on rib.ai_judgments from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on rib.ai_judgments from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on rib.ai_judgments from authenticated; end if;
 if exists(select 1 from pg_roles where rolname='rib_app') then
  grant select,insert,update,delete on rib.ai_judgments to rib_app;
  drop policy if exists rib_server on rib.ai_judgments;
  create policy rib_server on rib.ai_judgments to rib_app using(true) with check(true);
 end if;
end $$;
