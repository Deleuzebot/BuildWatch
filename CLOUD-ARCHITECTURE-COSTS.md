> Deployment deferred: BuildWatch is using manual Codex research and administrator review for now. No Google Cloud services or weekly cloud schedules were activated. The architecture and prices below remain an unapproved future option.

# BuildWatch cloud architecture and cost proposal

October 25, 2026. **Not deployed, enabled or approved for spending.** Prices checked against official Google documentation. USD estimates exclude tax, domain registration, Auth0/RevenueCat/Apple plans and any future paid data licenses. Free allowances are shared across the billing account and eligibility must be checked before provisioning. Temporary trial credits are not counted as a permanent saving.

## Recommendation

Keep the existing Node/SQLite architecture for the initial NC pilot: **one small, always-on Compute Engine VM with a local persistent disk, two Cloud Scheduler definitions and the existing app's backend worker**. Scheduled calls use a dedicated service account and verified Google OIDC tokens; the worker consumes a durable database queue. The public web/API and worker share the same local WAL database. No active browser, personal computer or administrator session is needed after cloud deployment.

Start with a free-tier e2-micro pilot only if an isolated memory/CPU test shows sufficient headroom. Prepare a more comfortable e2-small option, but do not upgrade or resize without approval. The VM is a single point of failure; this is a low-cost pilot rather than a high-availability nationwide service. Avoid Cloud Run plus a local SQLite file: an ephemeral/scaled filesystem cannot safely act as the current shared database. A later managed database migration requires its own workload and cost review.

## Existing hosting check

The checked application is served by a Node process listening on **127.0.0.1:8765 on your computer**, with a local SQLite database. The repository contains a Dockerfile and a checks-only GitHub Actions definition, but no configured remote deployment or existing always-on host. You also confirmed that you have no hosting yet. Auth0 hosts authentication, not BuildWatch's database or long-running jobs.

Therefore the current installation cannot run when your computer is off. The code can also run on another always-on VPS/container host with persistent local storage and a cron/scheduler service; Google Cloud is not mandatory. If you already pay for such hosting in the future, incremental scheduling cost could be near zero, subject to its included capacity and backups. A static website host alone is insufficient. I have not inspected an external hosting account because none was supplied or connected.

## Exact proposed services

| Service | Purpose | Initial scope / cost control |
|---|---|---|
| Compute Engine | Host the existing Node API/web service and a durable background worker | One VM; no autoscaling, extra replicas or premium OS; free-region pilot |
| Standard Persistent Disk | Existing SQLite database, job state and retained evidence | Up to 30 GiB **combined across boot and data disks**, e.g. 10 + 20 GiB; not 30 GiB per disk; do not default to paid balanced/SSD disks |
| Cloud Scheduler | Monday status check and Friday discovery at configurable morning times | Exactly two jobs; America/New_York; authenticated HTTPS; bounded retries; idempotent schedule keys |
| IAM / dedicated service accounts | Authenticate scheduled requests and scope runtime access | No broad owner/editor role; runtime cannot create or resize infrastructure |
| Secret Manager | Server credentials and scheduler verification configuration | One/few secret versions, read at process startup, not per development |
| Artifact Registry | Store the reproducible application/worker container image | One regional repository; retain a small number of versions; scanning not automatically enabled |
| Cloud Storage | Optional off-VM consistent database backup copies | Single-region Standard storage in an eligible free region; bounded backup retention, not deletion of original evidence |
| Cloud Logging + Billing budgets | Operational failures, small summaries and spending alerts | Small structured logs; no full document/request-body logging; default retention; no paid custom monitoring stack initially |
| Cloud Build — optional | Build images away from the 1 GiB VM if local/GitHub builds are unavailable | Not needed for weekly executions; review its free allowance and build count before enabling |

Do not add Cloud SQL, Kubernetes, load balancers, Cloud NAT, Cloud DNS, BigQuery, Vertex/Gemini, paid Google Maps APIs or third-party AI extraction by default. Use an existing/free registrar DNS service where available and HTTPS on the VM. A public IPv4 is the main unavoidable small charge in this particular IPv4-compatible design; bypassing it through a paid NAT or load balancer would usually cost more.

## Current verified prices and arithmetic

- [Compute free tier](https://docs.cloud.google.com/free/docs/free-cloud-features): one eligible non-preemptible e2-micro's monthly hours in us-east1/us-central1/us-west1, 30 GiB-month standard disk and 1 GiB outbound transfer allowance. A billing account is still required; eligible use is not a guarantee that the whole deployment is free.
- [External IPv4](https://cloud.google.com/vpc/network-pricing): a standard VM's in-use public address is $0.005/hour, with only one free hour monthly. At an average 730-hour month, approximately **$3.65/month**. Unused reserved addresses cost more; simply stopping a VM does not remove all disk/address charges.
- [Cloud Scheduler](https://cloud.google.com/scheduler/pricing): first three jobs per billing account are free; otherwise $0.10/job/month. Two jobs therefore cost **$0 if allowance is available, or about $0.20/month**. It is not $0.10 per execution, project record or API request. Paused definitions still count toward the allowance.
- [General-purpose VM rates](https://cloud.google.com/products/compute/pricing/general-purpose), Iowa on-demand list prices: e2-small **$0.016752855/hour ≈ $12.23/month**; e2-standard-2, 2 vCPU/8 GiB, **$0.06701142/hour ≈ $48.92/month**. The official pricing HTML was read directly because the documentation browser timed out on its large table. These exclude disks, network and IP addresses; confirm the selected region's calculator quote before approval.
- [Standard disk pricing](https://cloud.google.com/compute/disks-image-pricing): about **$0.04/GiB-month** beyond the applicable free allowance in the selected US region. A 100 GiB total allocation would be approximately $2.80/month if 30 GiB is free, or $4/month without that allowance. Larger/faster disks or regional replication cost more.
- [Secret Manager](https://cloud.google.com/secret-manager/pricing): six active secret versions and 10,000 access operations monthly are free. Expected pilot use stays within this if secrets are not fetched per record.
- [Artifact Registry](https://cloud.google.com/artifact-registry/pricing): first 0.5 GiB stored is free; further storage is approximately $0.10/GiB-month. For example, 2 GiB retained is approximately $0.15/month, excluding any separately enabled scans or network charges.
- [Cloud Storage](https://cloud.google.com/storage/pricing) and the free-program page: eligible regional storage has a 5 GiB free allowance and operation allowances. Small compressed backups may fit; this is separate from Persistent Disk and does not make unlimited historical snapshots free.
- [Cloud Logging](https://cloud.google.com/products/observability/pricing): first 50 GiB/project/month of applicable log storage is free; longer retention and special network logs can cost extra. We do not need that volume for this application.

These are published list rates, not negotiated rates or a binding quote. Monthly hours, free-pool consumption, region, image size, backup retention and public downloads affect the bill.

## Monthly planning estimates

| Scenario | Scheduling / marginal weekly-job cost | Estimated entire backend hosting bill |
|---|---|---|
| Existing paid always-on host with spare capacity | Often $0 additional for cron/worker; storage/network still apply | Existing hosting bill; none is currently configured |
| NC pilot: eligible e2-micro, ≤30 GiB standard disk, low traffic | $0 Scheduler within free pool; no AI fees; worker shares fixed VM | **Approximately $4–8/month** |
| NC pilot with more memory: e2-small | Same two schedules; fixed-size VM rather than per-record compute billing | **Approximately $16–25/month** |
| Nationwide pilot, up to ~1M underlying records, low/moderate traffic: e2-standard-2 + ~100 GiB storage | $0–$0.20 Scheduler; batch-source processing; no AI | **Planning range $60–120/month**, pending runtime/source/storage measurements |
| Busy national production service / high availability | Cannot responsibly quote from record count alone | Separate design/load-test review; **$150–500+/month** is a planning allowance, not a measured estimate or approved tier |

For the NC free-compute example, the base is roughly $0 VM + $0 eligible disk + $3.65 IPv4 + $0 Scheduler/secrets + small image/backup/network usage. Thus **two weekly automations are essentially free to schedule; keeping the durable backend online is the main cost**. An e2-micro's memory and shared CPU may not be adequate during simultaneous traffic and processing, so it must pass testing before being chosen.

For the national pilot example, VM compute is about $48.92, IPv4 $3.65, standard disk about $2.80–4, registry around $0.15, plus backup retention and outbound traffic. Public website traffic and immutable source-history growth may exceed the allowance. The free VM is not a credible million-record/high-traffic capacity promise. The previous million-record test measured queries on local hardware, not this cloud VM or national-source ingestion.

A million **underlying records** is also different from a million active monitored projects. Retired and supporting-only records do not require individual weekly project checks. Source availability, pagination and licensing matter more than row count alone. No nationwide operating-cost guarantee is possible before representative job measurements.

## Minimize network, AI and database work

The saved NC structured-source snapshots contain about **2,237 raw rows across 11 municipal inventories**, while the public catalog has 11,940 mixed records. Fetching supported inventories in pages, then matching stable issuer/case IDs locally, is much cheaper and gentler than requesting each permit's page individually. A rough pilot allowance is **hundreds to around 1,000 source HTTP requests/month**, with actual totals measured during read-only adapter checks. This is an estimate, not a completed job benchmark, and unsupported HTML/PDF records still need review rather than invented status changes.

At a hypothetical one million active rows served through 1,000-row API pages, two full weekly inventory passes would be around **8,700 data-page requests/month**, before per-source overhead and retries—not 8.7 million individual webpage requests. Many sources do not support that page size or incremental queries; source-specific restrictions can raise the total. Fetch only changed pages/records where reliable modified timestamps and conditional requests are supported.

Proposed safeguards in the application:

- Batch by authority/API, use source-provided modification cursors, ETags/Last-Modified and bounded pagination. Treat absence, errors and expiration as uncertainty.
- Cache raw payloads by content hash. Store a new evidence version only for changed content; preserve critical original evidence. Store last-successful-check separately so a check timestamp does not rewrite public project JSON or invalidate every map cluster.
- Terminal-record tombstones, issuer-scoped IDs and explicit prior decisions prevent rediscovery and repeated duplicate flags. Do not monitor confirmed completed/cancelled projects routinely.
- Use deterministic typed mappings and human review for unsupported/ambiguous documents. **No paid AI processing is planned; AI inference cost is $0 in this design.** AI services stay disabled unless separately approved.
- One leased job at a time, source concurrency one initially, bounded retries/backoff, per-source circuit breakers and hard application request/page/byte/runtime budgets. Reaching a limit yields a logged partial run, not silent success.
- Keep full source bodies out of logs. Batch database writes, checkpoint pages, and index matching/review queries. Preserve public viewport APIs, versioned caches and bounded clusters.

## Alerts versus enforceable limits

For a pilot, propose a dedicated project with **$10/month alert budget** for the micro option (or a separately approved $25 budget for the small option), alerts at 50/80/100% and forecast alerts. Set recipients explicitly before launch. Review the first week and first bill before expanding sources or resources.

[Alerts-only billing budgets do not stop charges](https://docs.cloud.google.com/billing/docs/how-to/budgets). Do not describe an email alert as a hard cap.

Google now has [service-scoped spend-cap budgets](https://docs.cloud.google.com/billing/docs/how-to/budgets-spend-caps) for eligible services including Cloud Run/functions and certain AI APIs. They are not a universal account cap, can have enforcement delay and do not pause ongoing fixed persistent-resource charges. They do not provide an all-inclusive cap on this Compute Engine + Persistent Disk design. If eligible services are added later, configure their supported spend caps separately and verify availability in the account.

For this design, practical enforceable controls are: one fixed VM, no autoscaler, small fixed disks, no automatic resizing, minimal regional CPU/IP quotas where Google permits lowering them, and runtime IAM that cannot provision extra resources. In-app network/job limits directly bound the crawler's work, but do not constitute a contractual dollar cap on public traffic or cloud billing. Public response rate limiting and emergency pause controls reduce abuse risk; exceeding disk capacity should pause ingestion rather than silently grow the disk or delete original evidence.

An optional budget-alert shutdown workflow can pause jobs/stop compute, but it can be delayed, can interrupt the site, and leaves some disk/address/storage charges. It would require separate explicit approval and must never be represented as an exact spending ceiling. Disabling billing can disrupt services and is not an automatic default.

## Approval gate

No paid resources, billing linkage, APIs that create billable resources, containers, schedules, secrets, deployments or charge-incurring service activation will be created until you approve the architecture and the specific proposed budget. Local implementation/tests and read-only pricing research can continue without that activation.

Before provisioning, confirm: chosen option and monthly budget, Google project/billing ownership, free-tier availability, domain/HTTPS plan, region, exact calculator quote, resource quotas, alert recipients, and backup handling. If the free pilot fails its capacity checks, stop and request approval for a larger tier rather than upgrading automatically.
