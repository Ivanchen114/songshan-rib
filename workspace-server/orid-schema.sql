-- Additive, private columns. Existing image versions and printed material stay unchanged.
alter table rib.works add column if not exists reflection jsonb;
alter table rib.publications add column if not exists reflection jsonb;
