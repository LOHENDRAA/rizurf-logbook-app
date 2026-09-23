/**
 * Fail-closed production bundle check.
 *
 * Scans the eagerly-loaded entry assets referenced by dist/index.html
 * (async dev-only chunks such as the MSW mock are never executed in
 * production because VITE_ENABLE_MSW is rejected there). Fails on:
 * demo plaintext credentials, one-click sign-in affordances, or an eager
 * reference to the MSW runtime.
 */
import { readFileSync, existsSync } from 'node:fs'
import { resolve, dirname, join } from 'node:path'

const dist = resolve(process.argv[2] ?? 'dist')
const failures = []

const htmlPath = join(dist, 'index.html')
if (!existsSync(htmlPath)) {
  console.error(`bundle check failed: ${htmlPath} does not exist (run npm run build first)`)
  process.exit(1)
}
const html = readFileSync(htmlPath, 'utf8')
const entryRefs = [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1])
const cssRefs = [...html.matchAll(/<link[^>]+href="([^"]+\.css)"/g)].map((match) => match[1])
if (entryRefs.length === 0) failures.push('no entry scripts referenced by dist/index.html')

let bundle = ''
for (const ref of [...entryRefs, ...cssRefs]) {
  const file = resolve(dist, ref.replace(/^\//, ''))
  if (!existsSync(file)) {
    failures.push(`missing dist asset: ${ref}`)
    continue
  }
  bundle += `\n${readFileSync(file, 'utf8')}`
}

function checkAbsent(token, message) {
  if (bundle.includes(token)) failures.push(message)
}

// Demo plaintext credentials must never ship.
for (const secret of ['intern123', 'supervisor123', 'mentor123']) {
  checkAbsent(secret, `demo credential in entry bundle: ${secret}`)
}
// No one-click sign-in affordances or demo-credential helpers in the UI bundle.
for (const token of ['quick-login', 'quickLogin', 'Quick login', 'demo credentials', 'Demo credentials']) {
  checkAbsent(token, `one-click sign-in/demo affordance in entry bundle: ${token}`)
}
// The MSW runtime must not be eagerly loaded in production. (The mock lives
// in an async dev-only chunk guarded by VITE_ENABLE_MSW, which production
// builds reject.)
checkAbsent('setupWorker', 'MSW setupWorker eagerly referenced in production entry bundle')

if (failures.length > 0) {
  console.error(`bundle check failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`bundle check ok: ${entryRefs.length} entr${entryRefs.length === 1 ? 'y' : 'ies'} scanned, no demo secrets or eager mock runtime.`)
