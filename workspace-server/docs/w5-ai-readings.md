# W5 甲乙讀法

`rib.ai_readings` is a private exercise bound to an immutable W4 version. Its two comments are simulated AI interpretations for evidence checking, not human first readings or grades. A separate `task_note` can deliver teacher-directed format clarification; a note-only row has two empty comments.

The owner sees published rows from their W4 board and the same-term W5 personal board. Access to exhibits or an assigned peer review never grants access. Teachers are limited by existing term/class scopes. Student responses use an explicit allowlist and never include teacher notes. No public gallery or portfolio export includes the exercise.

Apply `workspace-server/ai-readings-schema.sql` transactionally before deploying. It enables RLS, revokes browser/public roles, and applies the existing server-role model. Imports are performed through a private maintenance process after visual reading and teacher authorization: bind work/version/display hash, recheck current latest version, verify private reading-copy bytes, write comments and notes, log the event, and read back. Never put student images, generated feedback datasets, account identifiers or teacher answer keys in the repository or public site build. Unclear cards remain pending for teacher discussion.

Backup format v4 includes the new table; v1–v3 restore to an empty exercise table. Images remain in private object storage under `private-ai-readings/<version>/<hash>.jpg`, separate from originals. For rollback, retain the private table and set affected rows to withdrawn; never remove student versions or human feedback.
