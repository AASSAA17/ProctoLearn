#!/usr/bin/env node

/*
  Simple API load generator for ProctoLearn monitoring demos.
  Example:
    node scripts/load-test.js --url http://localhost:4000/health --duration 180 --concurrency 80 --timeout 5000
*/

const defaultOptions = {
  url: "http://localhost:4000/health",
  durationSec: 180,
  concurrency: 80,
  timeoutMs: 5000,
};

function parseArgs(argv) {
  const options = { ...defaultOptions };

  for (let i = 2; i < argv.length; i += 1) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--url" && next) {
      options.url = next;
      i += 1;
      continue;
    }
    if (arg === "--duration" && next) {
      options.durationSec = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--concurrency" && next) {
      options.concurrency = Number(next);
      i += 1;
      continue;
    }
    if (arg === "--timeout" && next) {
      options.timeoutMs = Number(next);
      i += 1;
      continue;
    }
  }

  if (!Number.isFinite(options.durationSec) || options.durationSec <= 0) {
    throw new Error("--duration must be a positive number (seconds)");
  }
  if (!Number.isFinite(options.concurrency) || options.concurrency <= 0) {
    throw new Error("--concurrency must be a positive number");
  }
  if (!Number.isFinite(options.timeoutMs) || options.timeoutMs <= 0) {
    throw new Error("--timeout must be a positive number (ms)");
  }

  return options;
}

function createAbortSignal(timeoutMs) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

async function worker(state, options) {
  while (Date.now() < state.deadline) {
    state.total += 1;
    const started = performance.now();
    const { signal, clear } = createAbortSignal(options.timeoutMs);

    try {
      const res = await fetch(options.url, {
        method: "GET",
        signal,
        headers: {
          "Cache-Control": "no-cache",
          Pragma: "no-cache",
        },
      });

      const ms = performance.now() - started;
      state.latencySum += ms;
      state.latencyCount += 1;

      if (res.ok) {
        state.ok += 1;
      } else {
        state.failed += 1;
      }
    } catch (_err) {
      state.failed += 1;
    } finally {
      clear();
    }
  }
}

async function main() {
  const options = parseArgs(process.argv);

  const state = {
    total: 0,
    ok: 0,
    failed: 0,
    latencySum: 0,
    latencyCount: 0,
    deadline: Date.now() + options.durationSec * 1000,
  };

  console.log("Starting load test");
  console.log(`URL: ${options.url}`);
  console.log(`Duration: ${options.durationSec}s`);
  console.log(`Concurrency: ${options.concurrency}`);
  console.log(`Timeout: ${options.timeoutMs}ms`);

  const startedAt = Date.now();
  const workers = Array.from({ length: options.concurrency }, () => worker(state, options));
  await Promise.all(workers);
  const elapsedSec = (Date.now() - startedAt) / 1000;

  const rps = state.total / elapsedSec;
  const avgLatencyMs = state.latencyCount ? state.latencySum / state.latencyCount : 0;
  const successRate = state.total ? (state.ok / state.total) * 100 : 0;

  console.log("\nLoad test finished");
  console.log(`Elapsed: ${elapsedSec.toFixed(1)}s`);
  console.log(`Total requests: ${state.total}`);
  console.log(`OK: ${state.ok}`);
  console.log(`Failed: ${state.failed}`);
  console.log(`RPS: ${rps.toFixed(1)}`);
  console.log(`Avg latency: ${avgLatencyMs.toFixed(1)} ms`);
  console.log(`Success rate: ${successRate.toFixed(2)}%`);
}

main().catch((err) => {
  console.error("Load test failed:", err.message);
  process.exit(1);
});
