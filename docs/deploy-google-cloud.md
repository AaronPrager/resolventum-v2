# Deploying to Google Cloud

Cloud Run for the app, Cloud SQL for Postgres, Secret Manager for keys,
Cloud Scheduler for the daily job, Cloud Build to build the container from
GitHub. One region, one project. Commands are for the `gcloud` CLI on a Mac
(`brew install google-cloud-sdk`, then `gcloud auth login`).

Pick values once and reuse them:

```bash
export PROJECT=resolventum-prod        # any unique id
export REGION=us-east4                 # near Boston; us-east1 is also fine
export INSTANCE=resolventum-db
export DBNAME=resolventum
export DBUSER=resolventum
export SERVICE=resolventum
```

## 1. Project and APIs

```bash
gcloud projects create $PROJECT && gcloud config set project $PROJECT
```

Link the billing account that holds the credits in the console (Billing,
then Link a billing account), then:

```bash
gcloud services enable run.googleapis.com sqladmin.googleapis.com secretmanager.googleapis.com cloudbuild.googleapis.com cloudscheduler.googleapis.com artifactregistry.googleapis.com
```

New projects no longer let the default compute service account build, so
the first `gcloud run deploy --source` fails with a storage 403. Give it
the builder role once:

```bash
export SA="$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role=roles/cloudbuild.builds.builder --condition=None
```

The same account runs the app, and it needs to reach Cloud SQL:

```bash
gcloud projects add-iam-policy-binding $PROJECT --member="serviceAccount:$SA" --role=roles/cloudsql.client --condition=None
```

## 2. Postgres

Smallest instance to start; resize later without downtime for the data.
Point-in-time recovery is on from the first day.

```bash
gcloud sql instances create $INSTANCE --database-version=POSTGRES_17 --region=$REGION --tier=db-f1-micro --storage-size=10GB --storage-auto-increase --backup-start-time=07:00 --enable-point-in-time-recovery --retained-backups-count=14
```

```bash
gcloud sql databases create $DBNAME --instance=$INSTANCE
```

Make a strong password, keep it in your password manager, then:

```bash
gcloud sql users create $DBUSER --instance=$INSTANCE --password='PASTE_PASSWORD'
```

Cloud Run reaches Cloud SQL over a Unix socket. The connection string the
app uses is:

```
postgresql://resolventum:PASTE_PASSWORD@localhost/resolventum?host=/cloudsql/PROJECT:REGION:INSTANCE
```

Replace `PROJECT:REGION:INSTANCE` with the output of:

```bash
gcloud sql instances describe $INSTANCE --format='value(connectionName)'
```

## 3. Secrets

One secret per value. The app reads them as environment variables.

```bash
printf '%s' 'postgresql://resolventum:PASTE_PASSWORD@localhost/resolventum?host=/cloudsql/PROJECT:REGION:INSTANCE' | gcloud secrets create DATABASE_URL --data-file=-
```

```bash
openssl rand -base64 32 | tr -d '\n' | gcloud secrets create CRON_SECRET --data-file=-
```

```bash
printf '%s' 're_PASTE' | gcloud secrets create RESEND_API_KEY --data-file=-
```

```bash
printf '%s' 'PASTE' | gcloud secrets create GEMINI_API_KEY --data-file=-
```

Let Cloud Run's service account read them:

```bash
export SA="$(gcloud projects describe $PROJECT --format='value(projectNumber)')-compute@developer.gserviceaccount.com"
for s in DATABASE_URL CRON_SECRET RESEND_API_KEY GEMINI_API_KEY; do gcloud secrets add-iam-policy-binding $s --member="serviceAccount:$SA" --role=roles/secretmanager.secretAccessor; done
```

## 4. First deploy

From the repository folder. This builds the Dockerfile with Cloud Build and
deploys it. The first run takes a few minutes.

```bash
gcloud run deploy $SERVICE --source . --region=$REGION --allow-unauthenticated --add-cloudsql-instances=$(gcloud sql instances describe $INSTANCE --format='value(connectionName)') --set-secrets=DATABASE_URL=DATABASE_URL:latest,CRON_SECRET=CRON_SECRET:latest,RESEND_API_KEY=RESEND_API_KEY:latest,GEMINI_API_KEY=GEMINI_API_KEY:latest --set-env-vars=EMAIL_FROM='Resolventum <mail@yourdomain.com>',REGISTRATION_OPEN=false,GEMINI_MODEL=gemini-2.5-pro --min-instances=0 --max-instances=3 --memory=1Gi --cpu=1 --port=8080
```

If the project sits under a Google Workspace organization, the deploy ends
with "Setting IAM policy failed": the organization policy
`iam.allowedPolicyMemberDomains` forbids `allUsers`. Override it for this
project only, then add the binding:

```bash
gcloud services enable orgpolicy.googleapis.com
```

```bash
printf 'name: projects/%s/policies/iam.allowedPolicyMemberDomains\nspec:\n  rules:\n  - allowAll: true\n' $PROJECT > /tmp/allow-public.yaml && gcloud org-policies set-policy /tmp/allow-public.yaml
```

```bash
gcloud run services add-iam-policy-binding $SERVICE --region=$REGION --member=allUsers --role=roles/run.invoker
```

This needs the Organization Policy Administrator role on the organization.
If the account lacks it, the Workspace super admin can grant it in
IAM at the organization level.

`REGISTRATION_OPEN=false` keeps sign-up closed until you want strangers.
The command prints the service URL; `/api/health` on it should answer
`{"ok":true,"db":true}` once the schema exists (next step).

## 5. Schema and data

Migrations run from your Mac through the Cloud SQL Auth Proxy, never from
the build.

```bash
brew install cloud-sql-proxy
```

```bash
cloud-sql-proxy --port 5433 $(gcloud sql instances describe $INSTANCE --format='value(connectionName)')
```

In a second terminal, with the proxy running:

```bash
DATABASE_URL='postgresql://resolventum:PASTE_PASSWORD@localhost:5433/resolventum' npx prisma migrate deploy
```

Then the one-time import from v1. Take a final v1 dump first (v1 frozen
from this point), restore it locally as `resolventum_prod_copy`, and run:

```bash
DATABASE_URL='postgresql://resolventum:PASTE_PASSWORD@localhost:5433/resolventum' npm run import
```

```bash
DATABASE_URL='postgresql://resolventum:PASTE_PASSWORD@localhost:5433/resolventum' npm run verify
```

`ALL CHECKS PASSED` means production holds exactly what v1 held plus the
post-import fixes. Your v1 password works on the new sign-in.

## 6. Daily job

```bash
gcloud scheduler jobs create http resolventum-daily --location=$REGION --schedule='15 9 * * *' --time-zone='America/New_York' --uri="$(gcloud run services describe $SERVICE --region=$REGION --format='value(status.url)')/api/cron" --http-method=GET --headers="Authorization=Bearer $(gcloud secrets versions access latest --secret=CRON_SECRET)"
```

Run it once by hand to check: `gcloud scheduler jobs run resolventum-daily --location=$REGION`, then look at the Cloud Run logs.

## 7. Domain and email

```bash
gcloud run domain-mappings create --service=$SERVICE --region=$REGION --domain=app.yourdomain.com
```

Add the DNS records it prints. Certificates are automatic.

In Resend, add and verify the sending domain (the DNS records Resend shows),
then set `EMAIL_FROM` to an address on it. Until the domain is verified,
Resend only delivers to your own address.

## 8. Deploy on every push

Connect the GitHub repository in Cloud Build (Triggers, Connect repository),
then create a trigger on pushes to `main` that runs:

```
gcloud run deploy resolventum --source . --region us-east4
```

Or keep deploying by hand with the command from step 4; the secrets and
settings stick between deploys, so the short form is enough:

```bash
gcloud run deploy $SERVICE --source . --region=$REGION
```

## Costs to expect after the credits

Cloud Run at this traffic sits inside the free tier. `db-f1-micro` is about
10 dollars a month plus a few for storage and backups; `db-g1-small` about
25 to 35. Gemini and Resend bill separately by use, both small.

## If something is wrong

- `gcloud run services logs read $SERVICE --region=$REGION --limit=100`
- `/api/health` says `db:false`: the secret's connection string or the
  `--add-cloudsql-instances` flag is wrong.
- A page 500s after a schema change: `prisma migrate deploy` was not run.
- Restore a point in time: Cloud SQL, the instance, Backups, "Restore" with
  a timestamp. Restores to a new instance; switch the secret to it.
