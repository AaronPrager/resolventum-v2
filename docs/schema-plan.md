# Resolventum v2: schema plan

This is the plan for the database behind the rewrite. It is a plan, not code. The
Prisma draft at the end is meant to be argued with before anything is generated.

The v1 schema is 40 models grown over 79 migrations. Some of it is three
generations of the same idea (three deduction trackers, four homework-history
tables, files in six places). The rest is good and carries over with a rename
and a change of type.

## 1. Rules for the new schema

1. **Every data row belongs to an Organization.** No `userId` ownership on
   students, lessons, payments, or expenses. A User is only a login. In v1 the
   `{ organizationId } OR { organizationId: null, userId }` scoping exists
   because tenancy was added later. It goes away.
2. **Money is integer cents.** `amountCents Int`. No Float, no rounding
   helpers. Postgres `integer` tops out at about 21 million dollars, which is
   fine for a tutoring business.
3. **Balance is derived, never stored.** No `Student.credit`, no
   `Lesson.isPaid`, no `Lesson.paidAmount`. Balance of an account is
   `sum(charges) - sum(payments)`. A negative balance is credit. FIFO
   allocation still exists as its own table, because statements need to show
   which payment covered which lesson, but it can be rebuilt from scratch at any
   time and the balance does not depend on it.
4. **Money rows are never deleted.** Charges, payments, and expenses get
   `voidedAt` plus a reason. Students and lessons get `deletedAt`.
5. **The billing unit is an Account, not a student.** A family is an account
   with several students. A single student is an account with one. Payments go
   to the account. This replaces `familyId` (a bare string with no table) and
   removes the family-split and family-redistribute code paths, since moving a
   student between accounts is just a foreign key change followed by a
   re-allocation.
6. **A group lesson is one row.** `Lesson` is the event. `LessonStudent` is one
   row per enrolled student with their own price, attendance status, and notes.
   A solo lesson is a Lesson with one LessonStudent. The v1 invariant "all rows
   sharing groupSessionId must be updated together" stops being something the
   application has to remember.
7. **One File table.** Library files, homework attachments, submissions,
   receipts, student photos, and the org logo are all `File` rows. Nothing is
   stored as a base64 string in a text column. The table supports bytes in
   Postgres today and an object store key later, so the import does not need a
   new service.
8. **One Token table.** Email verify, password reset, invite, intake link,
   calendar feed, and homework upload tokens all live in `Token` with a kind, a
   SHA-256 hash, an expiry, and a used-at. v1 spreads these over six columns on
   four models.
9. **Dates that are dates are `@db.Date`.** Expense date, payment date, due
   date, date of birth. v1 stores these as timestamps and has a `dateOnly`
   utility to fight the resulting off-by-one-day bugs. Lesson start stays a
   timestamp, and the Organization gets a `timezone`, which v1 does not have.
10. **Keep v1 ids where a row maps one to one.** Students, payments, lessons,
    expenses, assignments, submissions, users, and organizations keep their
    UUIDs through the import. This makes the verification script a join, not a
    matching problem.

## 2. What carries over, what changes, what is dropped

### Carries over with rename or retype

| v1 | v2 | Change |
|---|---|---|
| Organization | Organization | gains timezone, currency, business profile fields moved off User, Stripe ids for later |
| User | User | only identity: email, password hash, name, verified, deleted. Business profile moves to Organization |
| OrganizationMember | Membership | gains GUARDIAN and STUDENT roles for the future family portal, links to Tutor, Guardian, or Student |
| Invitation | Invitation | token moves to Token |
| Tutor | Tutor | `hourlyPayRate` becomes cents, `archived` becomes `archivedAt`, optional Membership so a tutor can log in later |
| Student | Student | parent and emergency fields move to Guardian, `familyId` becomes `accountId`, `credit` is removed, StudentProgress folds in as two columns |
| Lesson | Lesson + LessonStudent | see rule 6 |
| Lesson recurring fields | LessonSeries | one row per series with an RRULE string instead of frequency plus end date on every occurrence |
| Payment | Payment | cents, `paidOn @db.Date`, account-scoped, `method` becomes an enum, `ADJUSTMENT` type moves to Charge |
| LessonPayment | Allocation | links Payment to Charge instead of to Lesson |
| LessonProgress | ProgressNote | kept as its own table: a dated note per student, optionally linked to a lesson. 97 rows in production, 12 with no lesson |
| Assignment, Submission, Feedback, Mastery | same | attachments and submission bytes move to File |
| UserResource | File + LibraryItem | |
| HomeworkFile | LessonFile | |
| Transaction | Expense | cents, `spentOn @db.Date`, legacy enum column dropped, recurring template split out |
| Category | ExpenseCategory | org-scoped instead of user-scoped, `legacyEnum` dropped |
| Vendor + FrequentVendor + AutomationRule + ExpenseTemplate | Vendor | one row per vendor with default category, treatment, and percent. Four tables become one |
| PaymentMethod | PaymentSource | renamed so the word "payment method" can mean how a family paid |
| HomeOfficeProfile, User.homeOffice* | TaxYear | home office percent per tax year, plus `filedAt` to lock a year |
| Waitlist | Waitlist | |

### New

| Model | Why |
|---|---|
| Account | the billing unit (rule 5) |
| Guardian | parents and emergency contacts as rows, so a parent can have a login later |
| Charge | an amount owed: a lesson, a fee, a tip, or a credit adjustment. Lessons do not carry money directly |
| AuthSession | revocable refresh tokens, so auth can move to httpOnly cookies |
| Token | rule 8 |
| File, LibraryItem, LessonFile, AssignmentFile | rule 7 |
| Message | one log of every email sent, replacing EmailLog, HomeworkLog, and HomeworkHistory |
| RecurringExpense | template rows instead of a self-referencing column on Expense |
| Draft | AI-generated content awaiting approval: parent report, feedback, practice set, expense from receipt. Reserved now so the first AI feature does not need a migration |

### Dropped

| v1 model | Reason | Import note |
|---|---|---|
| Deduction, HomeOfficeDetail, VehicleDetail, StartupDetail | superseded by Transaction in v1 already | if production has rows, each becomes an Expense with the matching treatment |
| HomeOfficeDeduction, HomeOfficeExpense | same | same |
| HomeworkHistory, HomeworkLog, EmailLog | history of emails sent | become Message rows |
| MasterFile | filenames on a disk that no longer exists | no bytes to import; the name survives in Message rows only |
| StudentAssignedResource | "file shared with student" without an assignment | becomes an Assignment titled after the file, if production has rows |
| StudentProgress | two text columns | fold into Student |
| Settings | global key/value | check what keys production holds before dropping |
| User.googleDrive*, User.fileStorageType | files live in the database now | dropped |
| User.frequentVendors, purchaseCategories, paymentMethodDetails | JSON strings from before the ledger tables existed | dropped |
| Lesson.notesFiles, Lesson.homeworkFiles | JSON strings of file metadata | anything that points at a live UserResource becomes a LessonFile; disk paths are gone |
| Student.credit | rule 3 | not imported. The v1 Students page computes its balance from lessons and payments and ignores this column. Aaron confirmed on 2026-09-11 that the ledger is right and the column is stale. The import still prints the non-zero values as a note |
| Lesson.isPaid, Lesson.paidAmount | rule 3 | recomputed |
| Transaction.category (enum) | replaced by categoryId | system categories seeded from the enum |

### What production actually holds (dump of 2026-09-10)

Restored locally as `resolventum_prod_copy` on Postgres 17. Counts that
matter:

| Table | Rows | Note |
|---|---|---|
| Organization | 3 | only "Easy STEM School" has data; "Concept" and "Test Company" are test accounts and are not imported |
| User | 4 | one real user; business profile, logo (5.6 KB), home office 12 percent, academic email |
| Student | 95 | 70 archived, 90 with parent email, 61 with emergency contact, 0 with `familyId`, 4 with non-zero `credit` totaling 1,140 |
| Lesson | 1,687 | 0 group sessions, 0 shell rows, 106 recurring series all weekly, 757 in the future, 29 series still open |
| Payment | 518 | 515 PAYMENT, 2 REFUND, 1 ADJUSTMENT, 0 family payments, 59 flagged tax-reported |
| LessonPayment | 893 | allocations total 110,770 versus lesson `paidAmount` total 110,760; one lesson on 2026-03-20 is over-allocated by 10 |
| Transaction | 650 | 50 recurring templates, 402 generated instances, 172 of them dated 2028 and 2029; one row dated year 25 (GoDaddy, should be 2025-08-09); 0 receipts; 9 flagged tax-reported |
| Category | 43 | 17 system, 26 user |
| FrequentVendor | 42 | Vendor 6, AutomationRule 0, ExpenseTemplate 0 |
| LessonProgress | 97 | all have a note, 85 linked to a lesson, 12 free-standing |
| Assignment | 77 | all have a public token, 74 with library attachments, some attachment arrays hold strings instead of objects |
| Submission | 13 | all with bytes, 16 MB |
| UserResource | 74 | 72 docx and 2 rtf, 48 MB |
| StudentAssignedResource | 7 | |
| HomeOfficeDeduction | 1 | mortgage interest 25,000 for 2025 at 12 percent. Not read by any tax summary code, and a separate Transaction "Mortgage, FirstTrust Bank, 21,178.08, HOME_OFFICE_INDIRECT" exists for 2025-12-31. Aaron decides which is right; the row is not imported |
| Tutor | 1 | no pay rate |
| Settings, Waitlist, Invitation, Mastery, Feedback, EmailLog, HomeworkLog, HomeworkHistory, MasterFile, Deduction and satellites, HomeOfficeExpense, HomeOfficeProfile, StudentProgress, HomeworkFile, PaymentMethod use | 0 | dropped with nothing to import |

Timezone: lesson times cluster between 20:00 and 23:00 UTC, which is 4 to
7 pm Eastern. Payment and expense dates sit at 04:00 or 05:00 UTC, which is
local midnight, with 179 expense rows at 00:00 UTC and a handful at 01:00,
02:00, and 23:00. The organization timezone is `America/New_York`. The rule
for turning these timestamps into `@db.Date` is: take the UTC calendar date.
That is right for every hour observed. The import prints any row outside
those hours for a look.

Two rows on 2026-03-24 are a manual "rebalance" between two siblings: an
ADJUSTMENT of minus 600 on one student and a PAYMENT of plus 600 with method
`balance_transfer` on the other. In v2 those two students would be one
Account and the rows would be unnecessary. The import keeps them as a
positive ADJUSTMENT charge and a payment with method OTHER, so balances match
v1. Whether to merge the siblings into one account afterwards is a data
decision for Aaron.

One Lesson row has `notesFiles` pointing at a Google Drive link. There are no
bytes to import; the link goes into the lesson notes text.

Because production has no families and no group lessons, the import creates
one Account per student and one LessonStudent per Lesson. The schema still
supports both, but the import for them is untested by real data.

## 3. Money model in detail

```
Account
  Student*          each has Charges
  Payment*          money that actually moved, in or out
  Charge*           money owed (lesson, fee) or forgiven (negative adjustment)
  Allocation*       which payment covered which charge, FIFO, rebuildable

balance(account)   = sum(Charge.amountCents where voidedAt is null)
                   - sum(Payment.amountCents where voidedAt is null)
credit(account)    = max(0, -balance)
balance(student)   = same sums restricted to that student's charges
                     and the allocations that landed on them
```

Signs: a Charge for a lesson is positive. A Charge of kind ADJUSTMENT can be
negative, which is how "give this family a 50 dollar credit" is recorded. A
Payment is positive. A refund is a Payment of kind REFUND with a negative
amount. Only positive payments get allocated, and only to positive charges.

Why Charge exists instead of putting price on the lesson: cancellations with a
fee, a free trial lesson, a materials fee, a package of ten lessons paid up
front, and a discount all become ordinary rows instead of special cases. The
LessonStudent row still holds `priceCents` so the calendar can show it, and
the Charge is created from it when the lesson is marked completed (or on
creation, matching v1 behavior; this is a product decision, not a schema one).

Tutor payroll stays where v1 put it: an Expense with a `tutorId` and a
contract-labor category. The payroll report is a query over lessons by tutor
times `hourlyPayRateCents`.

## 4. Import mapping

The import is a script that reads a v1 database and writes a v2 database. It
must be safe to run repeatedly against a fresh restore. Order matters because
of foreign keys.

0. Only the "Easy STEM School" organization and its owner are imported. The
   two test organizations and their users are skipped.
1. Organization, then User, Membership, Invitation, Tutor. Business profile
   fields come from the owner's User row. Organization timezone is
   `America/New_York`.
2. Account: one per student, with the same id as the student, since
   production has no families. The script stops if it ever sees a `familyId`,
   so a family in v1 data has to be handled on purpose. Guardian rows from
   `parentFullName`, `parentEmail`, `parentPhone`, `parentAddress`, and a
   second Guardian flagged emergency from `emergencyContactInfo` when present.
3. Student, keeping ids. StudentProgress folds into two columns.
4. Files: UserResource, Submission.fileData, student `photoData`, user
   `logoData`, tutor `photoData` all become File rows, deduplicated by SHA-256
   within an organization.
5. Lessons. Group rows sharing a `groupSessionId` become one Lesson whose id is
   the anchor (smallest v1 id) and one LessonStudent per non-shell row, each
   keeping the v1 row id. Solo lessons use the v1 id for both the Lesson and
   its LessonStudent. `recurringGroupId` groups become LessonSeries rows.
6. Charges: one per LessonStudent, same id, `amountCents = round(price * 100)`,
   `chargedOn` is the New York date of the lesson. A v1 Payment of type
   ADJUSTMENT becomes an ADJUSTMENT charge with the opposite sign, so the
   balance is unchanged. `Student.credit` is reported, not imported (see the
   Dropped table). Lessons before the import time get status COMPLETED, later
   ones SCHEDULED.
7. Payments of type PAYMENT and REFUND, keeping ids, account from the student.
   If a family payment's `familyId` disagrees with the student's account, the
   script stops and reports it.
8. Allocations from LessonPayment, `chargeId = lessonId`, copied as they are.
   Eight v1 lessons priced 130 carry 140 of allocations; v1 capped the
   displayed `paidAmount` so it never showed. The verify script lists them.
   Balances do not depend on allocations, so nothing is wrong with the money,
   and the v2 FIFO service will rebuild them cleanly once it exists.
9. Assignment, Submission, Feedback, Mastery, keeping ids. AssignmentFile from
   `libraryAttachments`, tolerating arrays that contain plain strings as well
   as `{ resourceId, fileName }` objects, and reporting any resourceId that
   does not resolve. LessonFile from HomeworkFile rows that have a
   `resourceId` (none in production today).
9b. ProgressNote from LessonProgress, keeping ids, `notedOn` from
   `lessonDate` by the UTC-date rule.
10. Message rows from EmailLog, HomeworkLog, and HomeworkHistory (all empty in
    production; the code path stays so the script is complete).
11. ExpenseCategory: system rows seeded from the TransactionCategory enum, then
    user Category rows. Vendor from Vendor, FrequentVendor, AutomationRule, and
    ExpenseTemplate, merged by name. PaymentSource from PaymentMethod.
12. Expense from Transaction, keeping ids. Template rows (`isRecurring` with
    `recurringNextDate`) become RecurringExpense; instances point at them.
    The GoDaddy row dated year 25 is corrected to 2025-08-09 and the fix is
    printed. Any other date before 2020 stops the script.
13. TaxYear: one row per year that has any expense or payment, with the home
    office percent from the User or HomeOfficeProfile.
14. Legacy deduction tables, only if production has rows.
15. Post-import fixes: facts v1 had no way to record, kept as a list inside
    the import script so every run applies them, each with a "[v2 fix]"
    marker in its description so the verify script can leave them out of the
    v1 comparison. Today: two tips (Zahar Lazarevich 50 on 2026-05-19, Jack
    Weltman 70 on 2026-06-23) as Charge rows of kind TIP, and a temporary
    ADJUSTMENT of 50 for Michail Shulkin, standing in for a v1 refund that
    was entered as 80 instead of 130. Once the refund is corrected in v1 that
    line is deleted. A tip settles the balance and stays income. v1 showed all three as
    credit. Also an account merge: Nina and Timothy Marriott become one
    "Marriott family" account, because v1 recorded every family payment on
    Timothy after Nina was split off, leaving him 2,970 in credit and her
    2,970 in debt. The verify script adds v1 students up by their v2 account,
    so merged families still reconcile.

## 5. Verification after every import

A second script, run after the import, that prints a table of v1 versus v2 and
exits non-zero on any mismatch.

- per student: v1 displayed balance (from `accountBalanceDisplay.js`) versus
  v2 derived balance, to the cent
- per account: v2 balance equals the sum of its students' balances plus
  unallocated payments
- per year: revenue (sum of payments) v1 versus v2
- per year: tax summary totals per treatment, v1 versus v2
- counts: students, lessons (v1 rows versus v2 LessonStudent rows), payments,
  expenses, assignments, submissions
- files: count and total bytes
- allocations: v1 LessonPayment sum versus v2 Allocation sum, and v2 imported
  allocations versus v2 recomputed allocations

When all of these pass on a fresh production dump, the import is done, and
everything after that is feature work.

Status on 2026-09-11: `npm run import` then `npm run verify` pass every check
against the 2026-09-10 dump. 95 of 95 balances match to the cent.

## 6. Decisions to make before the schema is generated

1. **Prisma or Drizzle.** Recommendation: Prisma 6 with TypeScript. You know
   it, the migration tooling is fine when the history starts clean, and the
   existing services port with fewer surprises.
2. **Where file bytes live.** Recommendation: Postgres bytes at import, with
   `storageKey` on File so a later move to Vercel Blob or Cloudflare R2 is a
   backfill, not a schema change. Check total file bytes in production first.
   If it is over a few hundred megabytes, move to blob storage at import time.
3. **When a lesson creates its charge.** On creation (v1 behavior, simplest) or
   on completion (correct for cancellations). The schema supports both.
4. **Whether tutors log in.** The schema allows it through Membership. Not
   required for the import.
5. **The 2025 mortgage.** Production has both a HomeOfficeDeduction row
   (25,000, 12 percent) that no report reads, and a Transaction (21,178.08,
   HOME_OFFICE_INDIRECT) that the tax summary does read. The import takes the
   Transaction and drops the other row. If 25,000 is the right number, fix it
   in v1 before the final dump.
6. **The two siblings.** The March 2026 rebalance rows exist because v1 had
   no shared account. After import, merging those two students into one
   Account and voiding the two rows is a cleanup, not a requirement.

## 7. Prisma draft

Everything below is a draft. Relations and indexes are shown where they
matter; boilerplate `createdAt` and `updatedAt` are on every model and omitted
from some for brevity.

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider  = "postgresql"
  url       = env("DATABASE_URL")
  directUrl = env("DIRECT_URL")
}

// ---------------------------------------------------------------- identity

model User {
  id              String    @id @default(uuid())
  email           String    @unique
  passwordHash    String?   // null for portal users who sign in by magic link
  name            String
  emailVerifiedAt DateTime?
  deletedAt       DateTime?
  createdAt       DateTime  @default(now())
  updatedAt       DateTime  @updatedAt
  memberships     Membership[]
  authSessions    AuthSession[]
}

/// Refresh-token sessions. Access tokens are short-lived JWTs; these are what get revoked.
model AuthSession {
  id        String    @id @default(uuid())
  userId    String
  user      User      @relation(fields: [userId], references: [id], onDelete: Cascade)
  tokenHash String    @unique
  userAgent String?
  ip        String?
  expiresAt DateTime
  revokedAt DateTime?
  createdAt DateTime  @default(now())

  @@index([userId])
}

enum MemberRole {
  OWNER
  TUTOR
  ACCOUNTANT
  GUARDIAN   // family portal, later
  STUDENT    // student portal, later
}

model Membership {
  id             String       @id @default(uuid())
  userId         String
  user           User         @relation(fields: [userId], references: [id], onDelete: Cascade)
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  role           MemberRole
  tutorId        String?      @unique
  tutor          Tutor?       @relation(fields: [tutorId], references: [id], onDelete: SetNull)
  guardianId     String?      @unique
  guardian       Guardian?    @relation(fields: [guardianId], references: [id], onDelete: SetNull)
  studentId      String?      @unique
  student        Student?     @relation(fields: [studentId], references: [id], onDelete: SetNull)
  createdAt      DateTime     @default(now())

  @@unique([userId, organizationId])
  @@index([organizationId])
}

model Organization {
  id                     String    @id @default(uuid())
  name                   String
  slug                   String    @unique
  timezone               String    @default("America/New_York")
  currency               String    @default("USD")
  // business profile, moved from v1 User
  legalName              String?
  address                String?
  phone                  String?
  replyToEmail           String?   // v1 User.academicEmail
  venmoHandle            String?
  zelleHandle            String?
  logoFileId             String?   @unique
  logo                   File?     @relation("OrgLogo", fields: [logoFileId], references: [id], onDelete: SetNull)
  onboardingCompletedAt  DateTime?
  studentIntakeEnabled   Boolean   @default(false)
  // product billing, unused until Stripe lands
  plan                   String    @default("free")
  stripeCustomerId       String?   @unique
  stripeConnectAccountId String?   @unique
  createdAt              DateTime  @default(now())
  updatedAt              DateTime  @updatedAt

  memberships   Membership[]
  invitations   Invitation[]
  tutors        Tutor[]
  accounts      Account[]
  students      Student[]
  lessons       Lesson[]
  charges       Charge[]
  payments      Payment[]
  expenses      Expense[]
  files         File[]        @relation("OrgFiles")
  tokens        Token[]
  messages      Message[]
  taxYears      TaxYear[]
}

enum TokenKind {
  EMAIL_VERIFY
  PASSWORD_RESET
  INVITE
  STUDENT_INTAKE
  CALENDAR_FEED
  HOMEWORK_UPLOAD
}

/// Every unguessable link in the system. Only the SHA-256 hash is stored.
model Token {
  id             String        @id @default(uuid())
  organizationId String?
  organization   Organization? @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  kind           TokenKind
  tokenHash      String        @unique
  /// What the token is for: userId, invitationId, membershipId, assignmentId
  subjectId      String
  expiresAt      DateTime?
  usedAt         DateTime?
  revokedAt      DateTime?
  createdAt      DateTime      @default(now())

  @@index([kind, subjectId])
}

model Invitation {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  email          String
  role           MemberRole
  invitedById    String?
  expiresAt      DateTime
  acceptedAt     DateTime?
  createdAt      DateTime     @default(now())

  @@unique([organizationId, email])
}

model Waitlist {
  id        String   @id @default(uuid())
  email     String   @unique
  createdAt DateTime @default(now())
}

// ---------------------------------------------------------------- people

model Tutor {
  id                 String       @id @default(uuid())
  organizationId     String
  organization       Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name               String
  email              String?
  phone              String?
  photoFileId        String?      @unique
  photo              File?        @relation("TutorPhoto", fields: [photoFileId], references: [id], onDelete: SetNull)
  color              String?
  hourlyPayRateCents Int?
  notes              String?
  archivedAt         DateTime?
  createdAt          DateTime     @default(now())
  updatedAt          DateTime     @updatedAt
  membership         Membership?
  lessons            Lesson[]
  expenses           Expense[]

  @@index([organizationId, archivedAt])
}

/// Billing unit. A family, or a single independent student.
model Account {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  name           String
  notes          String?
  archivedAt     DateTime?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt
  students       Student[]
  guardians      Guardian[]
  charges        Charge[]
  payments       Payment[]

  @@index([organizationId, archivedAt])
}

model Guardian {
  id           String      @id @default(uuid())
  accountId    String
  account      Account     @relation(fields: [accountId], references: [id], onDelete: Cascade)
  name         String
  email        String?
  phone        String?
  address      String?
  relationship String?     // "mother", "father", "grandparent"
  isPrimary    Boolean     @default(false)
  isBilling    Boolean     @default(false)
  isEmergency  Boolean     @default(false)
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt
  membership   Membership?

  @@index([accountId])
}

model Student {
  id                String       @id @default(uuid())
  organizationId    String
  organization      Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  accountId         String
  account           Account      @relation(fields: [accountId], references: [id], onDelete: Restrict)
  firstName         String
  lastName          String
  email             String?
  phone             String?
  dateOfBirth       DateTime?    @db.Date
  photoFileId       String?      @unique
  photo             File?        @relation("StudentPhoto", fields: [photoFileId], references: [id], onDelete: SetNull)
  schoolName        String?
  grade             String?
  defaultSubject    String?
  defaultPriceCents Int?
  difficulties      String?
  notes             String?
  lastStopNote      String?      // v1 StudentProgress.lastLessonStop
  nextStartNote     String?      // v1 StudentProgress.nextLessonStart
  archivedAt        DateTime?
  deletedAt         DateTime?
  createdAt         DateTime     @default(now())
  updatedAt         DateTime     @updatedAt
  membership        Membership?
  lessons           LessonStudent[]
  progressNotes     ProgressNote[]
  charges           Charge[]
  assignments       Assignment[]
  masteries         Mastery[]

  @@index([organizationId, archivedAt])
  @@index([accountId])
  @@index([lastName, firstName])
}

// ---------------------------------------------------------------- teaching

enum LessonStatus {
  SCHEDULED
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum LocationType {
  IN_PERSON
  REMOTE
}

enum LessonCategory {
  TUTORING
  COLLEGE_COUNSELING
}

/// A recurring series. Occurrences are real Lesson rows generated ahead of time.
model LessonSeries {
  id             String    @id @default(uuid())
  organizationId String
  rrule          String    // RFC 5545, e.g. "FREQ=WEEKLY;BYDAY=TU"
  startsAt       DateTime
  endsOn         DateTime? @db.Date
  createdAt      DateTime  @default(now())
  lessons        Lesson[]
}

/// One teaching event. Solo or group; the roster is LessonStudent.
model Lesson {
  id             String          @id @default(uuid())
  organizationId String
  organization   Organization    @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  tutorId        String?
  tutor          Tutor?          @relation(fields: [tutorId], references: [id], onDelete: SetNull)
  seriesId       String?
  series         LessonSeries?   @relation(fields: [seriesId], references: [id], onDelete: SetNull)
  startsAt       DateTime
  durationMin    Int
  allDay         Boolean         @default(false)
  subject        String
  category       LessonCategory?
  locationType   LocationType    @default(IN_PERSON)
  meetingLink    String?
  notes          String?         // shown on calendar
  status         LessonStatus    @default(SCHEDULED)
  homeworkText   String?
  homeworkDueOn  DateTime?       @db.Date
  createdById    String?
  deletedAt      DateTime?
  createdAt      DateTime        @default(now())
  updatedAt      DateTime        @updatedAt
  students       LessonStudent[]
  files          LessonFile[]
  assignments    Assignment[]
  progressNotes  ProgressNote[]

  @@index([organizationId, startsAt])
  @@index([tutorId, startsAt])
  @@index([seriesId])
}

/// One student's seat in a lesson: their price, attendance, and per-student notes.
model LessonStudent {
  id            String       @id @default(uuid())
  lessonId      String
  lesson        Lesson       @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  studentId     String
  student       Student      @relation(fields: [studentId], references: [id], onDelete: Cascade)
  priceCents    Int
  status        LessonStatus @default(SCHEDULED)
  academicNotes String?
  charge        Charge?
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@unique([lessonId, studentId])
  @@index([studentId])
}

/// "Where we stopped" notes over time. Survives lesson deletion. v1 LessonProgress.
model ProgressNote {
  id        String   @id @default(uuid())
  studentId String
  student   Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  lessonId  String?
  lesson    Lesson?  @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  notedOn   DateTime @db.Date
  note      String
  createdById String?
  createdAt DateTime @default(now())

  @@index([studentId, notedOn])
}

enum LessonFileKind {
  NOTES
  HOMEWORK
}

model LessonFile {
  id       String         @id @default(uuid())
  lessonId String
  lesson   Lesson         @relation(fields: [lessonId], references: [id], onDelete: Cascade)
  fileId   String
  file     File           @relation(fields: [fileId], references: [id], onDelete: Cascade)
  kind     LessonFileKind

  @@unique([lessonId, fileId, kind])
}

// ---------------------------------------------------------------- money in

enum ChargeKind {
  LESSON
  FEE
  ADJUSTMENT   // may be negative: a credit given to the account
}

/// Something an account owes (or is owed, when negative).
model Charge {
  id              String         @id @default(uuid())
  organizationId  String
  organization    Organization   @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  accountId       String
  account         Account        @relation(fields: [accountId], references: [id], onDelete: Restrict)
  studentId       String?
  student         Student?       @relation(fields: [studentId], references: [id], onDelete: SetNull)
  lessonStudentId String?        @unique
  lessonStudent   LessonStudent? @relation(fields: [lessonStudentId], references: [id], onDelete: SetNull)
  kind            ChargeKind
  amountCents     Int
  chargedOn       DateTime       @db.Date
  description     String
  voidedAt        DateTime?
  voidReason      String?
  createdAt       DateTime       @default(now())
  updatedAt       DateTime       @updatedAt
  allocations     Allocation[]

  @@index([accountId, chargedOn])
  @@index([studentId, chargedOn])
}

enum PaymentKind {
  PAYMENT
  REFUND     // amountCents is negative
}

enum PaymentMethod {
  CASH
  CHECK
  CARD
  ZELLE
  VENMO
  BANK_TRANSFER
  ONLINE     // collected through Stripe, later
  OTHER
}

/// Money that actually moved.
model Payment {
  id             String        @id @default(uuid())
  organizationId String
  organization   Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  accountId      String
  account        Account       @relation(fields: [accountId], references: [id], onDelete: Restrict)
  kind           PaymentKind   @default(PAYMENT)
  amountCents    Int
  paidOn         DateTime      @db.Date
  method         PaymentMethod
  reference      String?       // check number, Zelle memo
  notes          String?
  refundReason   String?
  provider       String?       // "stripe"
  providerRef    String?       // Stripe payment intent id
  taxReportedAt  DateTime?
  voidedAt       DateTime?
  voidReason     String?
  createdAt      DateTime      @default(now())
  updatedAt      DateTime      @updatedAt
  allocations    Allocation[]

  @@index([accountId, paidOn])
  @@index([organizationId, paidOn])
  @@unique([provider, providerRef])
}

/// FIFO link from a payment to a charge. Rebuildable; never the source of the balance.
model Allocation {
  id          String   @id @default(uuid())
  chargeId    String
  charge      Charge   @relation(fields: [chargeId], references: [id], onDelete: Cascade)
  paymentId   String
  payment     Payment  @relation(fields: [paymentId], references: [id], onDelete: Cascade)
  amountCents Int
  createdAt   DateTime @default(now())

  @@unique([chargeId, paymentId])
  @@index([paymentId])
}

// ---------------------------------------------------------------- homework

enum AssignmentStatus {
  PENDING
  ASSIGNED
  SOLVED
  REVIEWED
  OVERDUE
}

enum SubmissionSource {
  STUDENT
  TUTOR
}

model Assignment {
  id             String           @id @default(uuid())
  organizationId String
  studentId      String
  student        Student          @relation(fields: [studentId], references: [id], onDelete: Cascade)
  lessonId       String?
  lesson         Lesson?          @relation(fields: [lessonId], references: [id], onDelete: SetNull)
  title          String
  description    String?
  dueOn          DateTime?        @db.Date
  status         AssignmentStatus @default(PENDING)
  inviteSentAt   DateTime?
  createdById    String?
  createdAt      DateTime         @default(now())
  updatedAt      DateTime         @updatedAt
  files          AssignmentFile[]
  submissions    Submission[]

  @@index([studentId, status])
  @@index([organizationId, dueOn])
}

model AssignmentFile {
  id           String     @id @default(uuid())
  assignmentId String
  assignment   Assignment @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  fileId       String
  file         File       @relation(fields: [fileId], references: [id], onDelete: Cascade)

  @@unique([assignmentId, fileId])
}

model Submission {
  id           String           @id @default(uuid())
  assignmentId String
  assignment   Assignment       @relation(fields: [assignmentId], references: [id], onDelete: Cascade)
  fileId       String?
  file         File?            @relation(fields: [fileId], references: [id], onDelete: SetNull)
  note         String?
  source       SubmissionSource @default(STUDENT)
  submittedAt  DateTime         @default(now())
  feedback     Feedback?

  @@index([assignmentId])
}

model Feedback {
  id           String     @id @default(uuid())
  submissionId String     @unique
  submission   Submission @relation(fields: [submissionId], references: [id], onDelete: Cascade)
  comment      String?
  score        Int?
  reviewedById String?
  draftId      String?    // the AI Draft this was approved from, if any
  reviewedAt   DateTime   @default(now())
}

model Mastery {
  id        String   @id @default(uuid())
  studentId String
  student   Student  @relation(fields: [studentId], references: [id], onDelete: Cascade)
  topic     String
  score     Int      // 1..5
  notedById String?
  notedAt   DateTime @default(now())

  @@unique([studentId, topic])
}

// ---------------------------------------------------------------- files

enum FileStorage {
  DATABASE
  BLOB
}

model File {
  id             String       @id @default(uuid())
  organizationId String
  organization   Organization @relation("OrgFiles", fields: [organizationId], references: [id], onDelete: Cascade)
  name           String
  mimeType       String
  sizeBytes      Int
  sha256         String
  storage        FileStorage  @default(DATABASE)
  data           Bytes?       // when storage = DATABASE
  storageKey     String?      // when storage = BLOB
  uploadedById   String?
  createdAt      DateTime     @default(now())

  libraryItem     LibraryItem?
  lessonFiles     LessonFile[]
  assignmentFiles AssignmentFile[]
  submissions     Submission[]
  expenseReceipts Expense[]
  orgLogo         Organization? @relation("OrgLogo")
  studentPhoto    Student?      @relation("StudentPhoto")
  tutorPhoto      Tutor?        @relation("TutorPhoto")

  @@unique([organizationId, sha256, name])
  @@index([organizationId, createdAt])
}

/// A file the tutor keeps in their library (the Resources page).
model LibraryItem {
  id        String   @id @default(uuid())
  fileId    String   @unique
  file      File     @relation(fields: [fileId], references: [id], onDelete: Cascade)
  folder    String?
  tags      String[]
  createdAt DateTime @default(now())
}

// ---------------------------------------------------------------- messaging

enum MessageKind {
  EMAIL_VERIFY
  PASSWORD_RESET
  INVITE
  HOMEWORK_INVITE
  HOMEWORK_SUBMITTED
  LESSON_REMINDER
  DAILY_SCHEDULE
  BALANCE_REMINDER
  STATEMENT
  INTAKE_CONFIRMATION
  OTHER
}

enum MessageStatus {
  QUEUED
  SENT
  FAILED
}

/// Every email the system sends. Replaces EmailLog, HomeworkLog, HomeworkHistory.
model Message {
  id                String        @id @default(uuid())
  organizationId    String
  organization      Organization  @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  kind              MessageKind
  toEmail           String
  subject           String
  bodyText          String?
  relatedType       String?       // "lesson", "assignment", "account"
  relatedId         String?
  status            MessageStatus @default(QUEUED)
  providerMessageId String?
  error             String?
  sentAt            DateTime?
  createdAt         DateTime      @default(now())

  @@index([organizationId, createdAt])
  @@index([relatedType, relatedId])
}

// ---------------------------------------------------------------- expenses

enum TaxTreatment {
  BUSINESS_DIRECT
  HOME_OFFICE_INDIRECT
  PARTIAL_USE
  PERSONAL
}

enum PaymentSourceType {
  BUSINESS
  PERSONAL
}

enum RecurringFrequency {
  MONTHLY
  YEARLY
}

/// organizationId null = system category available to every org.
model ExpenseCategory {
  id                     String       @id @default(uuid())
  organizationId         String?
  name                   String
  defaultTaxTreatment    TaxTreatment
  defaultBusinessPercent Int?
  scheduleCLine          String?
  archivedAt             DateTime?
  createdAt              DateTime     @default(now())
  updatedAt              DateTime     @updatedAt
  expenses               Expense[]
  vendors                Vendor[]
  recurring              RecurringExpense[]

  @@unique([organizationId, name])
}

/// Replaces Vendor, FrequentVendor, AutomationRule, and ExpenseTemplate.
model Vendor {
  id                     String           @id @default(uuid())
  organizationId         String
  name                   String
  defaultCategoryId      String?
  defaultCategory        ExpenseCategory? @relation(fields: [defaultCategoryId], references: [id], onDelete: SetNull)
  defaultTaxTreatment    TaxTreatment?
  defaultBusinessPercent Int?
  useCount               Int              @default(0)
  lastUsedAt             DateTime?
  createdAt              DateTime         @default(now())
  updatedAt              DateTime         @updatedAt
  expenses               Expense[]
  recurring              RecurringExpense[]

  @@unique([organizationId, name])
}

/// How the tutor paid for an expense (a card, an account). v1 PaymentMethod.
model PaymentSource {
  id             String            @id @default(uuid())
  organizationId String
  name           String
  type           PaymentSourceType @default(BUSINESS)
  isDefault      Boolean           @default(false)
  notes          String?
  archivedAt     DateTime?
  createdAt      DateTime          @default(now())
  updatedAt      DateTime          @updatedAt
  expenses       Expense[]
  recurring      RecurringExpense[]

  @@unique([organizationId, name])
}

model RecurringExpense {
  id              String             @id @default(uuid())
  organizationId  String
  description     String
  vendorId        String?
  vendor          Vendor?            @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  categoryId      String
  category        ExpenseCategory    @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  amountCents     Int
  taxTreatment    TaxTreatment
  businessPercent Int?
  paymentSourceId String?
  paymentSource   PaymentSource?     @relation(fields: [paymentSourceId], references: [id], onDelete: SetNull)
  frequency       RecurringFrequency
  nextOn          DateTime           @db.Date
  endsOn          DateTime?          @db.Date
  active          Boolean            @default(true)
  createdAt       DateTime           @default(now())
  updatedAt       DateTime           @updatedAt
  expenses        Expense[]

  @@index([organizationId, active, nextOn])
}

model Expense {
  id                 String            @id @default(uuid())
  organizationId     String
  organization       Organization      @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  spentOn            DateTime          @db.Date
  description        String
  vendorId           String?
  vendor             Vendor?           @relation(fields: [vendorId], references: [id], onDelete: SetNull)
  amountCents        Int
  categoryId         String
  category           ExpenseCategory   @relation(fields: [categoryId], references: [id], onDelete: Restrict)
  taxTreatment       TaxTreatment
  businessPercent    Int?              // required when PARTIAL_USE
  paymentSourceId    String?
  paymentSource      PaymentSource?    @relation(fields: [paymentSourceId], references: [id], onDelete: SetNull)
  receiptFileId      String?
  receipt            File?             @relation(fields: [receiptFileId], references: [id], onDelete: SetNull)
  recurringExpenseId String?
  recurringExpense   RecurringExpense? @relation(fields: [recurringExpenseId], references: [id], onDelete: SetNull)
  tutorId            String?           // set when this expense is a tutor payout
  tutor              Tutor?            @relation(fields: [tutorId], references: [id], onDelete: SetNull)
  notes              String?
  taxReportedAt      DateTime?
  voidedAt           DateTime?
  voidReason         String?
  createdById        String?
  createdAt          DateTime          @default(now())
  updatedAt          DateTime          @updatedAt

  @@index([organizationId, spentOn])
  @@index([categoryId])
  @@index([tutorId])
}

/// Per-year tax facts. Home office percent can change year to year; filedAt locks the year.
model TaxYear {
  id                    String       @id @default(uuid())
  organizationId        String
  organization          Organization @relation(fields: [organizationId], references: [id], onDelete: Cascade)
  year                  Int
  homeSqft              Int?
  officeSqft            Int?
  homeOfficeBasisPoints Int?         // 1250 = 12.50 %
  filedAt               DateTime?
  notes                 String?
  createdAt             DateTime     @default(now())
  updatedAt             DateTime     @updatedAt

  @@unique([organizationId, year])
}

// ---------------------------------------------------------------- AI drafts (reserved)

enum DraftKind {
  PARENT_REPORT
  FEEDBACK
  PRACTICE_SET
  EXPENSE_FROM_RECEIPT
  LESSON_NOTE
}

enum DraftStatus {
  DRAFT
  APPROVED
  DISCARDED
}

/// Model-generated content waiting for a person to approve it.
model Draft {
  id             String      @id @default(uuid())
  organizationId String
  kind           DraftKind
  subjectType    String      // "student", "submission", "expense"
  subjectId      String
  model          String      // model id used
  inputTokens    Int?
  outputTokens   Int?
  content        Json
  status         DraftStatus @default(DRAFT)
  createdById    String?
  approvedAt     DateTime?
  createdAt      DateTime    @default(now())

  @@index([organizationId, kind, status])
  @@index([subjectType, subjectId])
}
```

## 8. What is left out on purpose

- Availability and booking (tutor working hours, public booking page). Add
  when the family portal is built; it is two tables and does not affect the
  import.
- Product subscription details (plan, period end, seat count). Stripe is the
  source of truth for those; the Organization only holds the ids.
- An audit log. `createdById` and `voidedAt` cover the import. A real audit
  table can come with multi-user studios.
- Lesson packages (buy ten, use ten). A Charge of kind FEE for the package and
  a package counter on Account would do it; not needed for parity.
