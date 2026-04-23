# Observability Demo Checklist

## What to show

1. `monitoring-project/prometheus/alert.rules.yml`
   - `ObservabilityDemoApiLoad` alert exists.
2. `monitoring-project/alertmanager/alertmanager.yml`
   - Telegram receiver is configured through env variables.
3. `Jenkinsfile`
   - `IaC Validation` stage exists.
4. `scripts/observability-demo.ps1` or `scripts/observability-demo.sh`
   - Automated firing/resolved proof collection.
5. `evidence/07-observability/observability_demo_*.txt`
   - Final proof file with alert state transitions.
6. `evidence/07-observability/observability_audit_*.txt`
   - Config snapshot and logs.

## Live flow for defense

1. Start the monitoring stack.
2. Run the observability demo script.
3. Wait until the alert becomes firing.
4. Stop the load test and wait until the alert resolves.
5. Open the generated evidence file.
6. Show Jenkins logs and Alertmanager logs appended to the same evidence.

## Evidence interpretation

- Firing section proves the alert was triggered.
- Resolved section proves the system returned to normal.
- Alertmanager logs prove notification dispatch happened.
- Jenkins logs prove CI/CD is integrated into the project workflow.
