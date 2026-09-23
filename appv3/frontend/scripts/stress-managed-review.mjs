/**
 * Stress runner for the managed-review suite: executes the focused file in
 * several concurrent processes over multiple rounds to surface timing flakes
 * under contention (parallel workers, shared CPU). Bounded by STRESS_WORKERS
 * (default 3) and STRESS_ROUNDS (default 2). Exits non-zero on any failure.
 */
import { spawn } from 'node:child_process'

const WORKERS = Math.max(1, Number(process.env.STRESS_WORKERS ?? 3) || 3)
const ROUNDS = Math.max(1, Number(process.env.STRESS_ROUNDS ?? 2) || 2)
const TARGET = 'src/features/review/managed-review.test.tsx'

function runOnce(worker, round) {
  return new Promise((resolve) => {
    const started = Date.now()
    const child = spawn('npx', ['vitest', 'run', TARGET], {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, VITEST_STRESS_WORKER: String(worker) },
    })
    let output = ''
    child.stdout?.on('data', (chunk) => {
      output += String(chunk)
    })
    child.stderr?.on('data', (chunk) => {
      output += String(chunk)
    })
    child.on('error', (error) => {
      resolve({ ok: false, elapsed: Date.now() - started, output: String(error) })
    })
    child.on('close', (code) => {
      resolve({ ok: code === 0, elapsed: Date.now() - started, output })
    })
  })
}

const failures = []
let completed = 0
const total = WORKERS * ROUNDS
for (let round = 1; round <= ROUNDS; round += 1) {
  console.log(`stress round ${round}/${ROUNDS}: ${WORKERS} concurrent worker(s) on ${TARGET}`)
  const results = await Promise.all(
    Array.from({ length: WORKERS }, (_, index) => runOnce(index + 1, round)),
  )
  results.forEach((result, index) => {
    completed += 1
    console.log(`  worker ${index + 1}: ${result.ok ? 'PASS' : 'FAIL'} (${result.elapsed}ms) [${completed}/${total}]`)
    if (!result.ok) {
      failures.push({ round, worker: index + 1, output: result.output })
    }
  })
}

if (failures.length > 0) {
  console.error(`\nst stress FAILED: ${failures.length}/${total} run(s) failed`)
  for (const failure of failures.slice(0, 2)) {
    console.error(`\n--- round ${failure.round} worker ${failure.worker} output (tail) ---`)
    console.error(failure.output.split('\n').slice(-30).join('\n'))
  }
  process.exit(1)
}
console.log(`\nstress OK: ${total}/${total} run(s) passed`)
