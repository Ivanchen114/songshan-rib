-- Two private course checkpoints; additive and repeatable. No roster or score changes.
create table if not exists rib.late_controls (
 activity_id text not null references rib.activities, class_name text not null,
 proposal_closed boolean not null default false, evidence_closed boolean not null default false,
 v1_closed boolean not null default false, final_closed boolean not null default false,
 classroom_open boolean not null default false, revision integer not null default 0,
 updated_at timestamptz not null default now(), primary key(activity_id,class_name)
);
create table if not exists rib.late_checkpoints (
 work_id text primary key references rib.works,
 proposal_version_id text references rib.versions, v1_version_id text references rib.versions,
 final_version_id text references rib.versions, sealed_members jsonb not null default '[]',
 proposal_at timestamptz, v1_at timestamptz, final_at timestamptz,
 content_until timestamptz, evidence_until timestamptz, extension_reason text not null default '',
 delivery_status text not null default 'pending' check(delivery_status in ('pending','completed','missing','obstacle')),
 verified boolean not null default false, teacher_reason text not null default '',
 revision integer not null default 0, updated_at timestamptz not null default now()
);
-- Uploaded receipts and replies never live in ordinary work/version metadata.
create table if not exists rib.late_deliveries (
 id text primary key, work_id text not null references rib.works, actor text not null,
 request_id text not null, payload jsonb not null, files jsonb not null, media jsonb not null default '[]',
 completed boolean not null default false, created_at timestamptz not null default now(), completed_at timestamptz,
 unique(work_id,request_id)
);
create index if not exists late_delivery_work on rib.late_deliveries(work_id,completed_at);

revoke all on rib.late_controls,rib.late_checkpoints,rib.late_deliveries from public;
alter table rib.late_controls enable row level security;
alter table rib.late_checkpoints enable row level security;
alter table rib.late_deliveries enable row level security;
-- Then run grant-app-role.sql with the deployment administrator, never a browser identity.
