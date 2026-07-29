import { execSync } from 'node:child_process'

const steps = [
  'npm run typecheck',
  'npm test',
  'npm run build:web',
  'npm run health',
]

for (const step of steps) {
  console.log(`\n=== ${step} ===`)
  execSync(step, { stdio: 'inherit' })
}

console.log('\nrelease verification passed')
