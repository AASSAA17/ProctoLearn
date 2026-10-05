# Monitoring Stack

This stack now includes:
- Prometheus + Alertmanager + Grafana
- Nginx + exporters
- cAdvisor + Portainer
- Zabbix (server, web, agent, PostgreSQL DB)
- pgAdmin + PostgreSQL exporter
- Graphite (graphite-web + carbon + statsd)
- Nagios

## Private API monitoring and host filesystems

Both monitoring Compose files require `PROCTOLEARN_API_NETWORK` to name the
**existing** application Docker network. The application service is named `api`
in the local, production and legacy Compose stacks. For example, the local
stack's default network is `proctolearn-local_default`; the legacy server stack
uses `proctolearn_server_network`. For production, select its actual
`<compose-project>_default` network. Start that application stack first and set
this variable in your private monitoring environment. Do not use a host bridge
IP or expose port 4000 publicly: only Prometheus and the readiness prober join
that network, using `api:4000` internally.

Prometheus scrapes `/metrics` as `proctolearn_api`. A separate existing blackbox
HTTP probe checks `/ready` as `proctolearn_api_ready`: `probe_success=0` with
API `up=1` fires `ProctoLearnApiNotReady`; API scrape failures fire `ServiceDown`.
The liveness JSON `/health` remains unchanged and is not a metrics target.

Both node exporters use read-only host root/proc/sys mounts and aligned paths,
with slave propagation for host submounts and `scope="host"` on exported series.
These mounts require a Linux Docker host; Docker Desktop reports its Linux VM,
not the outer macOS/Windows filesystem. Filesystem exclusions retain `/`,
`/home`, `/var`, and `/mnt` data mounts. `DiskSpaceLow` continues to monitor the
host root filesystem; compare its size/available series with host `df -B1 /`.

Focused checks (Docker Compose and Python PyYAML required):
`node --test scripts/p2-monitoring.test.cjs scripts/p1-infrastructure.test.cjs`
from the repository root. Using `promtool` v2.54.1 (matching the image), also run:

```bash
promtool check config monitoring-project/prometheus/prometheus.yml
promtool test rules monitoring-project/prometheus/alert.rules.test.yml
```

The rule fixtures distinguish healthy, API unavailable, dependency unavailable,
and host-root low-space signals. Deployment validation must additionally confirm
`up{job="proctolearn_api"}=1`, API process series, independent `/ready` failure,
and host capacity/low-space alert behavior on a disposable host.

## Start

```bash
docker compose up -d
```

## Stop

```bash
docker compose down
```

## Optional credentials via environment variables

Set these in your shell before start, or in a local `.env` file in this folder:

```env
ZABBIX_DB_PASSWORD=change_me
PGADMIN_DEFAULT_EMAIL=admin@local.test
PGADMIN_DEFAULT_PASSWORD=change_me
NAGIOSADMIN_USER=nagiosadmin
NAGIOSADMIN_PASS=change_me
```

If not set, defaults from `docker-compose.yml` are used.

## Access URLs

- Grafana: http://localhost:3000
- Prometheus: http://localhost:9090
- Alertmanager: http://localhost:9093
- Portainer: http://localhost:9002
- Zabbix Web: http://localhost:8082
- pgAdmin: http://localhost:5051
- Nagios Web: http://localhost:8084
- Graphite Web: http://localhost:8085

## Service Ports

- Zabbix server: `10051/tcp`
- Zabbix agent: `10050/tcp`
- Graphite carbon plaintext: `2003/tcp`
- Graphite statsd: `8125/udp`

## Notes

- Prometheus blackbox checks include Zabbix, Nagios, and Graphite web endpoints.
- Existing ports are preserved to avoid conflicts with the main project stack.
- Grafana auto-provisions Prometheus datasource and `PostgreSQL Overview` dashboard on startup.
- Alert rules include PostgreSQL exporter availability, high connections, rollback ratio, and deadlocks.
