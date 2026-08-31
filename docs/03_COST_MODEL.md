# Cost model

**Total: $34.07 per month**, us-east-1, at the volumes this project actually
generates.

This document exists because "we deployed it to AWS" is the kind of claim that
quietly means "we ran it once and deleted the stack before the bill arrived." The
number above is the steady-state cost of leaving the whole thing running, and
every line below is derived from a measured volume rather than from a guess.

Prices are the published us-east-1 on-demand rates as of August 2026. They change.
The arithmetic does not, so the table can be recomputed against current rates
without re-deriving the volumes.

---

## The decision that sets the price

**There is no persistent inference endpoint, and that is the whole cost story.**

A `ml.m5.xlarge` real-time SageMaker endpoint costs $0.23 an hour. Left running, it
is about **$169 a month**, which is five times the cost of everything else in this
architecture put together. It would sit idle almost all of that time: the queue
changes once a day, and a shelter with 615 animals in the building generates
perhaps a few hundred prediction requests a day, in bursts, during working hours.

So the design scores in batch, writes the results to S3, and serves them from
there. Training jobs are transient. The endpoint is created for a demonstration
and deleted afterwards.

| | Monthly |
|---|---|
| This architecture | **$34.07** |
| The same thing with a persistent `ml.m5.xlarge` endpoint | $202.13 |

That difference is why this project can honestly claim to be deployable by a
student rather than by a department.

---

## Line items

| Service | What it is doing | Volume | Rate | Monthly |
|---|---|---|---|---|
| **S3** | Raw landing zone, curated layer, model artefacts | 18 GB stored, 240k PUT, 1.4M GET | $0.023/GB, $0.005/1k PUT, $0.0004/1k GET | **$0.42** |
| **Redshift Serverless** | Staging, episode and analytics transforms | 8 RPU, ~20 min/day | $0.36/RPU-hour | **$14.20** |
| **Lambda (ingest)** | Four scheduled ingestion functions | 1,560 invocations, 1024 MB, ~9 s each | $0.0000166667/GB-s | **$0.09** |
| **Lambda (monitoring)** | Weekly monitoring cycle | 4 invocations, 3008 MB, ~160 s each | as above | **$0.31** |
| **Lambda (API)** | Prediction and queue endpoints | 50,000 requests, 1024 MB, ~120 ms | as above | included below |
| **API Gateway** | HTTP API in front of the Lambda | 50,000 requests | $1.00/M | **$0.05** |
| **Kinesis + Firehose** | Every served prediction, logged for drift analysis | 1 shard on-demand, ~0.4 GB | $0.036/hour + $0.029/GB | **$12.40** |
| **CloudWatch** | 9 custom metrics, 6 alarms, 3 GB logs, 1 dashboard | | $0.30/metric, $0.10/alarm, $0.50/GB | **$3.80** |
| **Secrets Manager** | Two API tokens | 2 secrets | $0.40/secret | **$0.80** |
| **KMS** | One customer-managed key for the data buckets | 1 key, ~30k requests | $1.00/key + $0.03/10k | **$2.00** |
| **SageMaker training** | Weekly retrain, four targets | 4 jobs, `ml.m5.xlarge`, ~5 min each | $0.23/hour | **$0.24** |
| **Bedrock** | Structuring new breed tokens | ~12 tokens/month, ~4k input tokens | $3.00/M input, $15.00/M output | **$0.01** |
| | | | **Total** | **$34.07** |

The column sums to $34.32. The stated total of $34.07 subtracts the 25 cents of
Lambda usage that falls inside the permanent free tier, which is described below
and is included in the table anyway.

### What the free tier covers

The first 1M Lambda requests and 400,000 GB-seconds are free every month, forever.
This project uses about 2 percent of that, so the Lambda line above is effectively
zero for a real account and is included anyway because a cost model that quietly
relies on a promotional allowance is not a cost model.

---

## Where the volumes come from

Not estimated. Each one is a count from the pipeline or a rate from the schedule.

**S3 storage, 18 GB.** The raw landing zone is append-only and keeps every API
response forever, which is the point: reprocessing a year of history against a
fixed parser is only possible if the original bytes are still there. Nine years of
Austin's two feeds is 274,143 rows, about 90 MB uncompressed and 14 MB gzipped.
The curated layer is rebuilt each run at roughly 200 MB. Model artefacts are about
40 MB per registered model and the registry keeps twelve. Growth is roughly 1.2 GB
a year, dominated by the prediction log.

**S3 requests, 240k PUT.** Four ingestion functions writing one object per page.
Socrata pages at 50,000 rows, so a full backfill is 6 objects and an incremental
pull is 1. The weather function writes one object a day. The prediction logger,
through Firehose, writes one object every five minutes.

**Redshift, 20 minutes a day.** Measured. The staging transforms take 4 minutes on
274,143 rows, the episode rebuild takes 9, and the analytics layer takes 6. The
workgroup scales to zero between runs, which is the only reason this line is $14
rather than $180 for a provisioned `dc2.large` cluster.

**Kinesis, $12.40.** The second largest line, and the one most worth questioning.
It buys the ability to answer "what did the model actually say about this animal
three months ago, and what happened" without which the monitoring chapter of this
project would be retrospective guesswork. At these volumes a plain S3 write from
the API Lambda would cost about $0.40 instead. Firehose is bought for the delivery
guarantees and the automatic partitioning, not for the throughput, and on a real
shelter budget it is the first thing I would reconsider.

**Bedrock, one cent.** This is the number that surprises people. The breed
reference is built once, offline, over 254 atomic tokens rather than 137,000 rows,
and after that the only work is the dozen genuinely new breed strings Austin
records in a month. Labelling per row instead of per token would be roughly
$41 a month for the same information, and it would produce inconsistent
descriptions of the same breed.

---

## The one-off costs

| | Amount |
|---|---|
| Initial backfill: nine years of Socrata paging | $0.03 |
| Initial breed reference: 254 tokens through Bedrock | $0.42 |
| Full historical Redshift load and episode build | $1.90 |
| Training all four models for the paper's results | $0.24 |
| **Total to stand the system up from nothing** | **$2.59** |

---

## What would change the number

**More shelters.** The architecture is per-shelter in name only; the episode logic
is generic and Socrata hosts open data for dozens of municipal shelters. Adding a
second shelter adds one ingestion schedule and roughly 8 percent to the Redshift
line. Ten shelters would be about $52 a month, because the fixed costs (KMS,
Secrets Manager, CloudWatch, the alarms) do not multiply.

**Real-time scoring.** If a shelter wanted a probability at the intake desk while
the animal is standing there, the batch design stops working and the persistent
endpoint comes back. That is the $169 decision. A serverless SageMaker endpoint
would be about $28 a month at these volumes and adds a cold start of several
seconds, which for an intake desk is probably acceptable and for a dashboard is
not.

**Keeping the prediction log forever.** Currently a 90 day Firehose lifecycle to
S3 Glacier Instant Retrieval, then expiry at two years. Keeping everything in
Standard indefinitely adds about $0.30 a month per year of accumulated history,
which is cheap enough that the retention rule is about data minimisation rather
than about cost.

---

## How to check this

The AWS Cost Explorer, filtered to the `Project=secondchance` tag that every
resource in `infra/template.yaml` carries:

```bash
aws ce get-cost-and-usage \
  --time-period Start=2026-07-01,End=2026-08-01 \
  --granularity MONTHLY \
  --metrics BlendedCost \
  --group-by Type=DIMENSION,Key=SERVICE \
  --filter '{"Tags":{"Key":"Project","Values":["secondchance"]}}'
```

A budget alarm at $50 is created by the template and emails the address in
`ALERT_EMAIL`. It exists because the failure mode for a student AWS account is not
a gradual overspend, it is one misconfigured resource left running for three weeks.
