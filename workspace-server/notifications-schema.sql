-- Apply before the new application release. The first application of this column
-- establishes a baseline: older messages remain in their original context.
alter table rib.workspace_state add column if not exists notifications_since timestamptz not null default now();
create table if not exists rib.notification_reads (
 term text not null, student_id text not null, thread_key text not null,
 version text not null, read_at timestamptz not null default now(),
 primary key(term,student_id,thread_key,version),
 foreign key(term,student_id) references rib.students
);
alter table rib.notification_reads enable row level security;
revoke all on rib.notification_reads from public;
-- The server role is provisioned separately. Existing installations must receive
-- both SQL privileges and an RLS policy in this same migration, before release.
do $$ begin
 if exists(select 1 from pg_roles where rolname='rib_app') then
  grant select,insert,update,delete on rib.notification_reads to rib_app;
  drop policy if exists rib_server on rib.notification_reads;
  create policy rib_server on rib.notification_reads to rib_app using (true) with check (true);
 end if;
end $$;
-- Teacher-authored records may be maintained by private import tools. Track the
-- actual content publication, not just the original AI material creation date.
alter table rib.ai_readings add column if not exists student_record_updated_at timestamptz;
create or replace function rib.note_student_record_update() returns trigger language plpgsql set search_path = '' as $$
begin
 if current_setting('rib.restoring',true)='true' then return NEW; end if;
 if TG_OP='INSERT' then
  if NEW.teacher_notes->'studentRecord' is not null then NEW.student_record_updated_at=clock_timestamp(); end if;
 elsif NEW.teacher_notes->'studentRecord' is distinct from OLD.teacher_notes->'studentRecord' then
  NEW.student_record_updated_at=clock_timestamp();
 end if;
 return NEW;
end $$;
drop trigger if exists student_record_updated on rib.ai_readings;
create trigger student_record_updated before insert or update of teacher_notes on rib.ai_readings
 for each row execute function rib.note_student_record_update();
