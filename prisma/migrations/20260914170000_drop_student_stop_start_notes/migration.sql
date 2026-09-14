-- "Where we stopped" and "start next" lived on the student since v1. Session notes carry that
-- now. Any text still in the two columns becomes one dated progress note, then the columns go.
INSERT INTO "ProgressNote" ("id", "studentId", "notedOn", "note", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, "id", CURRENT_DATE,
       concat_ws(E'\n', CASE WHEN "lastStopNote" IS NOT NULL THEN 'Stopped at: ' || "lastStopNote" END,
                        CASE WHEN "nextStartNote" IS NOT NULL THEN 'Start next: ' || "nextStartNote" END),
       now(), now()
FROM "Student" WHERE "lastStopNote" IS NOT NULL OR "nextStartNote" IS NOT NULL;
ALTER TABLE "Student" DROP COLUMN "lastStopNote";
ALTER TABLE "Student" DROP COLUMN "nextStartNote";
