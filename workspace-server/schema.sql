-- Private schema: no browser PostgREST access; application queries are parameterized.
create schema if not exists rib;
revoke all on schema rib from public;
create table if not exists rib.students (
 term text not null, student_id text not null, name text not null, class_name text not null,
 seat integer not null, active boolean not null default true, is_test boolean not null default false, sharing_agreement jsonb,
 primary key(term,student_id)
);
create table if not exists rib.credentials (
 term text not null, student_id text not null, algorithm text not null check(algorithm in ('gas-sha256','scrypt')),
 salt text not null, digest text not null, revision integer not null default 1,
 primary key(term,student_id), foreign key(term,student_id) references rib.students
);
create table if not exists rib.teachers (
 email text primary key, name text not null, role text not null check(role in ('admin','teacher')),
 active boolean not null default true, scopes jsonb not null default '[]'
);
create table if not exists rib.sessions (
 token_hash text primary key, principal jsonb not null, expires_at timestamptz not null,
 created_at timestamptz not null default now()
);
create table if not exists rib.rate_limits (
 id text primary key, count integer not null, reset_at timestamptz not null
);
create table if not exists rib.activities (
 id text primary key, term text not null, week integer not null, title text not null,
 kind text not null, phase text not null default 'production', accepting boolean not null default false,
 archived boolean not null default false, revision integer not null default 0, legacy jsonb
);
create table if not exists rib.works (
 id text primary key, activity_id text not null references rib.activities, class_name text not null,
 owner_id text, revision integer not null default 0, hidden boolean not null default false, publication_hold boolean not null default false,
 created_at timestamptz not null default now(), unique(activity_id,owner_id)
);
create table if not exists rib.members (
 work_id text not null references rib.works, term text not null, student_id text not null,
 status text not null check(status in ('confirmed','invited','declined')), consent boolean not null default false, sharing_opt_out boolean not null default false,
 primary key(work_id,student_id), foreign key(term,student_id) references rib.students
);
create table if not exists rib.versions (
 id text primary key, work_id text not null references rib.works, ordinal integer not null,
 media jsonb not null, metadata jsonb not null default '{}', request_id text not null,
 created_at timestamptz not null default now(), unique(work_id,ordinal), unique(work_id,request_id)
);
create table if not exists rib.reviews (
 id text primary key, activity_id text not null references rib.activities,
 target_work_id text not null references rib.works, reviewer_id text not null, term text not null,
 version_id text references rib.versions, status text not null check(status in ('waiting','assigned','done','requested','cancelled')),
 situation text, meaning text, reason text, revision integer not null default 0,
 created_at timestamptz not null default now(), submitted_at timestamptz,
 foreign key(term,reviewer_id) references rib.students
);
create unique index if not exists review_target_active on rib.reviews(target_work_id) where status <> 'cancelled';
create index if not exists review_reader on rib.reviews(activity_id,reviewer_id);
create table if not exists rib.replies (
 id text primary key, review_id text not null references rib.reviews,
 actor text not null, label text not null check(label in ('author','reader','teacher')),
 body text not null, request_id text not null, created_at timestamptz not null default now(),
 unique(review_id,actor,request_id)
);
create table if not exists rib.decisions (
 id text primary key, work_id text not null references rib.works, student_id text not null,
 choice text not null check(choice in ('keep','revise')), reason text not null,
 version_id text not null references rib.versions, created_at timestamptz not null default now()
);
create table if not exists rib.uploads (
 id text primary key, work_id text not null references rib.works, actor text not null,
 request_id text not null, expected_revision integer not null, files jsonb not null, metadata jsonb not null,
 expires_at timestamptz not null, version_id text references rib.versions,
 unique(work_id,request_id)
);
create table if not exists rib.assessments (
 work_id text not null references rib.works, student_id text not null, rubric text not null,
 criteria jsonb not null, comment text not null, status text not null, evidence_key text not null,
 teacher text not null, revision integer not null, updated_at timestamptz not null default now(),
 legacy_score numeric, legacy_max numeric, legacy_payload jsonb,
 primary key(work_id,student_id,rubric)
);
create table if not exists rib.publications (
 id text primary key, version_id text not null unique references rib.versions,
 title text not null default '匿名作品', status text not null default 'pending' check(status in ('pending','published','withdrawn')),
 reviewed_by text, reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table if not exists rib.events (
 id bigserial primary key, activity_id text references rib.activities, actor text not null,
 kind text not null, resource text not null, detail jsonb not null default '{}', created_at timestamptz not null default now()
);
create index if not exists events_activity on rib.events(activity_id,id);
create table if not exists rib.legacy_records (
 source_table text not null, source_id text not null, source_hash text not null, payload jsonb not null,
 primary key(source_table,source_id)
);
create table if not exists rib.legacy_files (
 source_id text primary key, object_key text not null, sha256 text not null, bytes bigint not null, mime text not null
);
create table if not exists rib.migration_runs (
 id text primary key, source_hash text not null, summary jsonb not null, created_at timestamptz not null default now()
);
-- A shared row lock on this singleton serializes semester activation with writes.
create table if not exists rib.workspace_state (
 id integer primary key check(id=1), current_term text, revision integer not null default 0
);
insert into rib.workspace_state(id) values(1) on conflict do nothing;
create table if not exists rib.term_drafts (
 term text primary key, source_term text not null, revision integer not null default 1,
 status text not null default 'draft' check(status in ('draft','activated')),
 payload jsonb not null, source_digest text not null, actor text not null,
 updated_at timestamptz not null default now()
);
create table if not exists rib.term_changes (
 id text primary key, from_term text not null, to_term text not null unique,
 actor text not null, snapshot jsonb not null, snapshot_hash text not null,
 summary jsonb not null, created_at timestamptz not null default now()
);
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
revoke all on all tables in schema rib from public;
revoke all on all sequences in schema rib from public;

-- Defense in depth: browser roles get no schema access and no row policies.
-- The deployment administrator grants the dedicated server role explicit policies separately.
do $$ declare item record; begin
 for item in select tablename from pg_tables where schemaname='rib' loop
  execute format('alter table rib.%I enable row level security',item.tablename);
 end loop;
end $$;
