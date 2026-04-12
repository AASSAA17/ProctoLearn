# Monitoring Stack

This stack now includes:
- Prometheus + Alertmanager + Grafana
- Nginx + exporters
- cAdvisor + Portainer
- Zabbix (server, web, agent, PostgreSQL DB)
- pgAdmin + PostgreSQL exporter
- Graphite (graphite-web + carbon + statsd)
- Nagios

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
