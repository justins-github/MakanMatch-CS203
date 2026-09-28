#!/usr/bin/env node
// Starts a Spring Boot service with its Maven wrapper on any OS (needs JDK 17+):
//   node scripts/run-service.mjs account-service
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const service = process.argv[2]
const dir = join(ROOT, service ?? '')
if (!service || !existsSync(join(dir, 'pom.xml'))) {
  console.error('usage: node scripts/run-service.mjs <account-service|catalog-service>')
  process.exit(1)
}

const windows = process.platform === 'win32'
const child = windows
  ? spawn('mvnw.cmd', ['spring-boot:run'], { cwd: dir, stdio: 'inherit', shell: true })
  : spawn('sh', ['mvnw', 'spring-boot:run'], { cwd: dir, stdio: 'inherit' })

child.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
