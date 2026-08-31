# AWS setup runbook

Everything you have to do by hand, in order, with the exact commands. Written
while doing it, which is the only time the steps are actually known.

Total time: about 70 minutes the first time. Total cost at the volumes this
project generates: roughly $34 a month, itemised in `03_COST_MODEL.md`.

**Read step 0 before you start.** It sets the budget alarm that stops this from
becoming an expensive mistake.

---

## Step 0. Set a budget alarm before you deploy anything

Do this first. It takes four minutes and it is the difference between a $34 month
and a $200 one.

```bash
aws budgets create-budget \
  --account-id "$(aws sts get-caller-identity --query Account --output text)" \
  --budget '{
    "BudgetName": "secondchance-monthly",
    "BudgetLimit": {"Amount": "50", "Unit": "USD"},
    "TimeUnit": "MONTHLY",
    "BudgetType": "COST"
  }' \
  --notifications-with-subscribers '[{
    "Notification": {
      "NotificationType": "ACTUAL",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 50,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "YOUR_EMAIL_HERE"}]
  }, {
    "Notification": {
      "NotificationType": "FORECASTED",
      "ComparisonOperator": "GREATER_THAN",
      "Threshold": 100,
      "ThresholdType": "PERCENTAGE"
    },
    "Subscribers": [{"SubscriptionType": "EMAIL", "Address": "YOUR_EMAIL_HERE"}]
  }]'
```

Replace `YOUR_EMAIL_HERE` in both places with your address. The first alarm fires
at $25 actual spend, the second when AWS forecasts you will exceed $50.

---

## Step 1. Prerequisites

```bash
# AWS CLI v2
aws --version          # expect aws-cli/2.x
# SAM CLI
sam --version          # expect SAM CLI, version 1.10x or later
# Python
python3 --version      # expect 3.11 or later
```

If the CLI is not configured:

```bash
aws configure
# AWS Access Key ID:     from IAM, an access key on a user with AdministratorAccess
# AWS Secret Access Key: ...
# Default region name:   us-east-1
# Default output format: json
```

**On the IAM user.** For a student project, a user with `AdministratorAccess` is
acceptable and is what these instructions assume. Do not use the account root
credentials, and enable MFA on the root account if you have not. In anything
resembling production you would scope this down; the stack creates its own
least-privilege execution roles for every runtime component regardless.

Verify:

```bash
aws sts get-caller-identity
```

---

## Step 2. Enable Amazon Bedrock model access

**This one is easy to miss and the breed labelling step fails without it.**
Bedrock foundation models are opt-in per account per region, through the console
only. There is no CLI equivalent.

1. Open the Bedrock console in `us-east-1`.
2. Left navigation, bottom: **Model access**.
3. **Manage model access**.
4. Tick **Anthropic → Claude 3.5 Sonnet**.
5. Submit. Access is usually granted within a minute or two; the status column
   changes to **Access granted**.

Verify from the CLI:

```bash
aws bedrock list-foundation-models --region us-east-1 \
  --query "modelSummaries[?contains(modelId, 'claude-3-5-sonnet')].modelId" \
  --output table
```

If that returns rows but an invocation later fails with `AccessDeniedException`,
the access request has not finished processing. Wait and retry.

---

## Step 3. Get the two API keys

Both are free. Neither blocks the core pipeline, but the first meaningfully
improves ingestion reliability.

### 3a. Socrata application token (10 minutes, instant)

The Austin API works without a token, but unauthenticated callers share a small
throttling pool and will start receiving HTTP 429 during a full backfill.

1. Go to `https://data.austintexas.gov/` and create an account (top right,
   **Sign In** then **Sign Up**).
2. Once signed in, open your profile menu and choose **Developer Settings**.
   Direct link: `https://data.austintexas.gov/profile/edit/developer_settings`
3. **Create New App Token**.
4. Application name: `SecondChance`. Description: `UNC Charlotte DTSC 3601
   student project, shelter adoption forecasting`. Leave the callback and
   application URLs blank.
5. **Save**. Copy the **App Token** value, not the Secret Token.

### 3b. RescueGroups.org API key (request form, 1 to 3 business days)

Only needed for the public discovery page. The ingestion Lambda treats a missing
key as "skip this run" rather than an error, so the project functions without it.

1. Go to `https://rescuegroups.org/services/adoptable-pet-data-api/`
2. Follow the **Request an API key** link and complete the form. Under intended
   use, describe it as a non-commercial student research project displaying
   adoptable animals.
3. The key arrives by email. There is no published turnaround; request it in
   Week 1 so it has time to land.

---

## Step 4. Clone and build

```bash
git clone https://github.com/YOUR_USERNAME/secondchance.git
cd secondchance
python3 -m venv .venv && source .venv/bin/activate
pip install -e ".[dev,aws]"
sam build --use-container
```

`--use-container` builds the Lambda dependencies inside an
Amazon Linux container so that compiled wheels match the runtime. It requires
Docker. Without Docker, drop the flag and accept that a native dependency
compiled on your machine may not load on `arm64` Lambda; if a function fails at
import time with a `.so` error, this is why.

---

## Step 5. Deploy the stack

```bash
sam deploy --guided --capabilities CAPABILITY_NAMED_IAM
```

Answer as follows:

```
Stack Name [sam-app]: secondchance-dev
AWS Region [us-east-1]: us-east-1
Parameter ProjectName [secondchance]: secondchance
Parameter Environment [dev]: dev
Parameter AlertEmail []: davishiggins1@gmail.com
Parameter RedshiftAdminUsername [scadmin]: scadmin
Parameter DataCutoffDate [2022-03-04]: 2022-03-04
Parameter ModelApprovalMode [Manual]: Manual
Parameter EnableScheduledIngest [true]: true
Confirm changes before deploy [y/N]: y
Allow SAM CLI IAM role creation [Y/n]: Y
Disable rollback [y/N]: N
Save arguments to configuration file [Y/n]: Y
SAM configuration file [samconfig.toml]: samconfig.toml
```

First deploy takes 12 to 18 minutes; the Redshift Serverless namespace is the
slow part.

**Confirm the SNS subscription.** AWS emails a confirmation link to the address
you gave. Alarms do not deliver until you click it. Check spam.

Capture the outputs:

```bash
aws cloudformation describe-stacks --stack-name secondchance-dev \
  --query 'Stacks[0].Outputs' --output table
```

---

## Step 6. Populate the two secrets

The stack creates both secrets empty on purpose. Never put a token in the
template.

```bash
aws secretsmanager put-secret-value \
  --secret-id secondchance/dev/socrata-app-token \
  --secret-string 'PASTE_YOUR_SOCRATA_APP_TOKEN'

# Only if the RescueGroups key has arrived
aws secretsmanager put-secret-value \
  --secret-id secondchance/dev/rescuegroups-api-key \
  --secret-string 'PASTE_YOUR_RESCUEGROUPS_KEY'
```

Verify without printing the value:

```bash
aws secretsmanager describe-secret \
  --secret-id secondchance/dev/socrata-app-token \
  --query 'Name'
```

---

## Step 7. Run the first ingestion

```bash
aws lambda invoke --function-name secondchance-ingest-austin-intakes-dev \
  --cli-binary-format raw-in-base64-out --payload '{}' /tmp/intakes.json
cat /tmp/intakes.json

aws lambda invoke --function-name secondchance-ingest-austin-outcomes-dev \
  --cli-binary-format raw-in-base64-out --payload '{}' /tmp/outcomes.json
cat /tmp/outcomes.json

aws lambda invoke --function-name secondchance-ingest-weather-dev \
  --cli-binary-format raw-in-base64-out --payload '{}' /tmp/weather.json
cat /tmp/weather.json
```

The first intakes run is a full backfill of roughly 170,000 rows and takes about
four minutes. Expect a response like:

```json
{"dataset_id": "wter-evkm", "batch_id": "...", "rows": 172431,
 "pages": 4, "incremental": false, "since": null, "keys": ["austin/intakes/..."]}
```

Confirm the objects landed:

```bash
RAW=$(aws cloudformation describe-stacks --stack-name secondchance-dev \
  --query "Stacks[0].Outputs[?OutputKey=='RawBucketName'].OutputValue" --output text)
aws s3 ls "s3://$RAW/austin/intakes/" --recursive --human-readable | head
```

**If the intakes function times out**, raise its timeout to 900 seconds in
`infra/template.yaml` and redeploy. The default of 600 is comfortable for the
current dataset but the feed grows.

---

## Step 8. Load the warehouse

```bash
WG=secondchance-dev-wg
DB=secondchance
ROLE=$(aws cloudformation describe-stacks --stack-name secondchance-dev \
  --query "Stacks[0].Outputs[?OutputKey=='RedshiftRoleArn'].OutputValue" --output text)

# Schema
aws redshift-data execute-statement --workgroup-name "$WG" --database "$DB" \
  --sql "$(cat sql/01_schema.sql)"

# Wait for it, then load
aws redshift-data execute-statement --workgroup-name "$WG" --database "$DB" \
  --sql "COPY raw.austin_intakes FROM 's3://$RAW/austin/intakes/' \
         IAM_ROLE '$ROLE' FORMAT AS JSON 'auto ignorecase' GZIP;"
```

Check the statement completed and inspect any load errors:

```bash
aws redshift-data list-statements --status FAILED --max-items 5

aws redshift-data execute-statement --workgroup-name "$WG" --database "$DB" \
  --sql "SELECT query, filename, line_number, colname, err_reason
         FROM sys_load_error_detail ORDER BY start_time DESC LIMIT 10;"
```

Then run the staging and analytics transforms:

```bash
for f in sql/02_staging.sql sql/03_episodes.sql sql/04_analytics.sql; do
  aws redshift-data execute-statement --workgroup-name "$WG" --database "$DB" \
    --sql "$(cat $f)"
done
```

---

## Step 9. Train and register a model

```bash
aws lambda invoke --function-name secondchance-start-training-dev \
  --cli-binary-format raw-in-base64-out \
  --payload '{"target": "adopted_within_30d", "data_cutoff": "2022-03-04"}' \
  /tmp/training.json
cat /tmp/training.json
```

Watch it:

```bash
# Capture the most recent job name rather than copying it by eye. Nine-character
# timestamps are exactly the kind of thing that gets mistyped at 1am.
JOB=$(aws sagemaker list-training-jobs \
  --sort-by CreationTime --sort-order Descending --max-results 1 \
  --query 'TrainingJobSummaries[0].TrainingJobName' --output text)
echo "Watching $JOB"

aws sagemaker describe-training-job --training-job-name "$JOB" \
  --query '{Status:TrainingJobStatus, Secondary:SecondaryStatus, Seconds:TrainingTimeInSeconds}'

# Or block until it finishes:
aws sagemaker wait training-job-completed-or-stopped --training-job-name "$JOB"
```

A run on `ml.m5.xlarge` takes about nine minutes and costs roughly six cents.

---

## Step 10. Approve and deploy the model

Approval is manual by design. This is the human gate in the lifecycle.

```bash
ARN=$(aws sagemaker list-model-packages \
  --model-package-group-name secondchance-adoption-models \
  --sort-by CreationTime --sort-order Descending --max-results 1 \
  --query 'ModelPackageSummaryList[0].ModelPackageArn' --output text)

# Read the metrics before approving. This is the point of the gate.
aws sagemaker describe-model-package --model-package-name "$ARN" \
  --query 'ModelMetrics'

aws sagemaker update-model-package --model-package-arn "$ARN" \
  --model-approval-status Approved
```

Then create the endpoint:

```bash
make deploy-endpoint MODEL_PACKAGE_ARN="$ARN" ENV=dev
```

**Cost warning.** A real-time endpoint on `ml.m5.xlarge` costs about $169 a
month if you leave it up. Bring it up for the demo, tear it down after. Step 13.

Smoke test:

```bash
API=$(aws cloudformation describe-stacks --stack-name secondchance-dev \
  --query "Stacks[0].Outputs[?OutputKey=='ApiEndpoint'].OutputValue" --output text)

curl -s "$API/v1/health" | python3 -m json.tool

curl -s -X POST "$API/v1/predict" -H 'content-type: application/json' -d '{
  "animal": {
    "animal_id": "A999001", "animal_type": "Dog", "breed": "Pit Bull Mix",
    "color": "Blue/White", "sex_upon_intake": "Intact Female",
    "age_at_intake_days": 1095, "intake_type": "Stray",
    "intake_condition": "Normal", "name": null
  }}' | python3 -m json.tool
```

---

## Step 11. Establish the monitoring baseline

The monitoring job needs a reference distribution before it can detect drift.

```bash
python3 scripts/publish_baseline.py --env dev --block validation
```

Then run one cycle by hand:

```bash
aws lambda invoke --function-name secondchance-monitor-dev \
  --cli-binary-format raw-in-base64-out --payload '{"dry_run": true}' /tmp/monitor.json
cat /tmp/monitor.json
```

Confirm the metrics arrived:

```bash
aws cloudwatch list-metrics --namespace SecondChance/dev --output table
```

---

## Step 12. Test the alarms, including the rollback

Do not skip this. An untested alarm is a decoration.

```bash
# Force the drift alarm into ALARM state
aws cloudwatch set-alarm-state --alarm-name secondchance-data-drift-dev \
  --state-value ALARM --state-reason "Runbook step 12, deliberate test"
```

You should receive an email within a minute. Then reset:

```bash
aws cloudwatch set-alarm-state --alarm-name secondchance-data-drift-dev \
  --state-value OK --state-reason "Test complete"
```

Test the rollback path while nothing is wrong:

```bash
make rollback-endpoint ENV=dev TO_MODEL_PACKAGE_ARN="<previous arn>"
curl -s "$API/v1/health" | python3 -m json.tool   # model_version should have changed back
```

---

## Step 13. Tear down the expensive parts

Run this the same day you finish demonstrating.

```bash
# The endpoint is the expensive resource
aws sagemaker delete-endpoint --endpoint-name secondchance-endpoint-dev
aws sagemaker delete-endpoint-config --endpoint-config-name secondchance-endpoint-dev

# Pause scheduled ingestion if you are not actively using it
aws scheduler update-schedule --name secondchance-ingest-austin-intakes-dev-DailySchedule \
  --state DISABLED --flexible-time-window '{"Mode":"OFF"}' \
  --schedule-expression 'cron(15 9 * * ? *)' --target '{}'
```

Full teardown at the end of the semester:

```bash
make teardown ENV=dev
```

The three S3 buckets and the KMS key have `DeletionPolicy: Retain` and survive
stack deletion on purpose, so a stack mistake cannot destroy the raw data. Delete
them explicitly when you genuinely mean to:

```bash
aws s3 rb "s3://$RAW" --force
```

---

## Troubleshooting

**`AccessDeniedException` from Bedrock.** Step 2 not completed, or completed in a
different region. Model access is per region.

**Redshift `COPY` fails with "Invalid JSONPath format".** The gzipped objects are
newline-delimited JSON arrays, not JSON Lines. Either add
`FORMAT AS JSON 'auto ignorecase'` as shown above, or have the ingestion Lambda
write one object per line.

**Socrata returns HTTP 429 mid-backfill.** The app token is missing or was written
to the wrong secret. Confirm with `describe-secret` and re-run; ingestion is
append-only and idempotent on content hash, so re-running is safe.

**NWS API returns HTTP 403.** The `User-Agent` header is missing or does not
identify you. The API rejects generic agents. The value is set in the function's
environment variables.

**Lambda `Runtime.ImportModuleError`.** Built without `--use-container` on a
non-`arm64` machine. Rebuild with the flag, or change `Architectures` to `x86_64`
in `infra/template.yaml`.

**SAM deploy fails with "Export already exists".** Another stack in the account
exports the same name. Change `ProjectName` and redeploy.

**The endpoint returns 503 and CloudWatch shows `ModelError`.** Usually a feature
schema mismatch: the endpoint was built against a different feature list than the
API is sending. Compare `feature_list_hash` in the model registry entry against
`secondchance.features.DEPLOYMENT_FEATURES`.

---

## What you can safely skip

If time is short, the pipeline still demonstrates the full lifecycle without:

- **RescueGroups ingestion** (step 3b). Skip it entirely; the discovery page falls
  back to Austin data.
- **The real-time endpoint** (step 10). Batch transform costs a fraction and
  demonstrates the same thing. Training, monitoring and the API can all be shown
  without a persistent endpoint.
- **Redshift** (step 8), if you are prepared to run the joins in pandas from S3.
  You lose the warehouse component of the brief, so only do this if you have run
  out of time.

Do not skip steps 0, 2, 11 or 12. The first prevents an expensive mistake, the
second silently breaks the labelling step, and the last two are the difference
between a monitoring system and a monitoring diagram.
