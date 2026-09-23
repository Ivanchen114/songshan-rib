-- Run by the database administrator AFTER schema.sql, on the isolated staging project.
-- Provision the rib_app LOGIN role with a strong password via a secure local administration flow first.
-- Do not use postgres, service_role, anon, or authenticated as the website's SQL identity.
revoke all on schema rib from public;
revoke all on all tables in schema rib from public;
grant usage on schema rib to rib_app;
grant select,insert,update,delete on all tables in schema rib to rib_app;
grant usage,select on all sequences in schema rib to rib_app;
do $$ declare item record; begin
 for item in select tablename from pg_tables where schemaname='rib' loop
  execute format('drop policy if exists rib_server on rib.%I',item.tablename);
  execute format('create policy rib_server on rib.%I to rib_app using (true) with check (true)',item.tablename);
 end loop;
end $$;
-- Browser roles remain without a policy and without schema access. Do not expose rib in PostgREST.
