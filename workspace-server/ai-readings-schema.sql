-- Private W5 exercise; comments and teacher notes never enter the public gallery.
create table if not exists rib.ai_readings (
 id text primary key, version_id text not null unique references rib.versions,
 comment_a text not null check(length(comment_a)<=300),
 comment_b text not null check(length(comment_b)<=300),
 source_hash text not null, image_key text not null, task_note text not null default '',
 teacher_notes jsonb not null default '{}',
 status text not null default 'draft' check(status in ('draft','published','withdrawn')),
 created_by text not null, created_at timestamptz not null default now(), published_at timestamptz,
 check(status <> 'published' or published_at is not null),
 check((comment_a<>'' and comment_b<>'') or (comment_a='' and comment_b='' and task_note<>''))
);
alter table rib.ai_readings enable row level security;
revoke all on rib.ai_readings from public;
do $$ begin
 if exists(select 1 from pg_roles where rolname='anon') then revoke all on rib.ai_readings from anon; end if;
 if exists(select 1 from pg_roles where rolname='authenticated') then revoke all on rib.ai_readings from authenticated; end if;
 if exists(select 1 from pg_roles where rolname='rib_app') then
  grant select,insert,update,delete on rib.ai_readings to rib_app;
  drop policy if exists rib_server on rib.ai_readings;
  create policy rib_server on rib.ai_readings to rib_app using(true) with check(true);
 end if;
end $$;
