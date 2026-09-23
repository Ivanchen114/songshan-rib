-- Additive whole-course migration; existing works and credentials are untouched.
alter table rib.works add column if not exists current_version_id text references rib.versions;
alter table rib.publications add column if not exists featured boolean not null default false;
create table if not exists rib.wall_comments (
 id text primary key,activity_id text not null references rib.activities,
 target_work_id text not null references rib.works,actor_work_id text not null references rib.works,
 body text not null,request_id text not null,hidden boolean not null default false,
 created_at timestamptz not null default now(),unique(actor_work_id,request_id)
);
create index if not exists wall_comments_target on rib.wall_comments(target_work_id,created_at);
create table if not exists rib.wall_votes (
 activity_id text not null references rib.activities,actor_work_id text not null references rib.works,
 target_work_id text not null references rib.works,active boolean not null default true,
 primary key(actor_work_id,target_work_id)
);
create index if not exists wall_votes_target on rib.wall_votes(target_work_id);
create table if not exists rib.selections (
 term text not null,student_id text not null,version_ids jsonb not null default '[]',
 revision integer not null default 1,updated_at timestamptz not null default now(),
 primary key(term,student_id),foreign key(term,student_id) references rib.students
);
create table if not exists rib.activity_assets (
 id text primary key,activity_id text not null references rib.activities,actor text not null,
 request_id text not null,file jsonb not null,media jsonb not null default '[]',
 completed boolean not null default false,created_at timestamptz not null default now(),
 unique(activity_id,request_id)
);
create index if not exists activity_assets_activity on rib.activity_assets(activity_id,created_at);

revoke all on all tables in schema rib from public,anon,authenticated;
grant select,insert,update,delete on rib.wall_comments,rib.wall_votes,rib.selections,rib.activity_assets to rib_app;
do $$ declare n text; begin foreach n in array array['wall_comments','wall_votes','selections','activity_assets'] loop
 execute format('alter table rib.%I enable row level security',n);
 execute format('create policy rib_server on rib.%I to rib_app using (true) with check (true)',n);
end loop; end $$;
