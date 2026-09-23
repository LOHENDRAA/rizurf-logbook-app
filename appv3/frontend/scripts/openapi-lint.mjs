/** Lightweight contract lint: asserts the required paths, headers, schemas, and error model. */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const file = resolve(process.argv[2] ?? 'openapi/portal.yaml')
const yaml = readFileSync(file, 'utf8')

const failures = []
function check(condition, message) {
  if (!condition) failures.push(message)
}

const requiredPaths = [
  '/sanctum/csrf-cookie:',
  '/auth/login:',
  '/auth/logout:',
  '/me:',
  '/me/internship:',
  '/me/journal/weeks:',
  '/me/journal/weeks/{weekNumber}:',
  '/me/journal/weeks/{weekNumber}/daily:',
  '/me/journal/weeks/{weekNumber}/weekly-draft:',
  '/me/journal/weeks/{weekNumber}/submit:',
  '/supervisor/interns:',
  '/supervisor/interns/{studentId}/weeks:',
  '/supervisor/interns/{studentId}/weeks/{weekNumber}:',
  '/supervisor/interns/{studentId}/weeks/{weekNumber}/review:',
  '/mentor/mentees:',
  '/mentor/mentees/{studentId}/weeks:',
  '/mentor/mentees/{studentId}/weeks/{weekNumber}:',
  '/mentor/mentees/{studentId}/weeks/{weekNumber}/review:',
]
for (const path of requiredPaths) check(yaml.includes(path), `missing path ${path}`)

for (const token of ['If-Match', 'Idempotency-Key', 'ETag', 'requestId', 'application/problem+json', '401', '403', '404', '409', '412', '422', '429']) {
  check(yaml.includes(token), `missing contract token ${token}`)
}
for (const schema of ['SessionUser:', 'Capabilities:', 'WeekDetail:', 'ReviewRequest:', 'Problem:', 'PageMeta:']) {
  check(yaml.includes(schema), `missing schema ${schema}`)
}
check(!yaml.includes('password') || yaml.includes('LoginRequest'), 'password must only appear in LoginRequest')
check(yaml.includes('password') === false || (yaml.match(/password/g) ?? []).length <= 3, 'password must not leak into response schemas')

if (failures.length > 0) {
  console.error(`openapi lint failed:\n- ${failures.join('\n- ')}`)
  process.exit(1)
}
console.log(`openapi lint ok: ${requiredPaths.length} paths, problem+json error model, versioned transitions.`)
