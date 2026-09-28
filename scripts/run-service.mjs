#!/usr/bin/env node
// Starts a Spring Boot service with its Maven wrapper on any OS (needs JDK 17+):
//   node scripts/run-service.mjs account-service [--verbose]
// `npm run dev` interleaves four processes in one terminal, so by default the
// service starts quietly: no Maven build chatter, no banner, framework logs only
// at WARN and up (ours, com.makanmatch, stay at INFO) and a short line format,
// since concurrently already prefixes the service name. Errors print in full.
// --verbose (`npm run dev:verbose`) keeps Maven's and Spring's defaults.
import { spawn } from 'child_process'
import { existsSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const service = process.argv[2]
const dir = join(ROOT, service ?? '')
if (!service || !existsSync(join(dir, 'pom.xml'))) {
  console.error('usage: node scripts/run-service.mjs <account-service|catalog-service> [--verbose]')
  process.exit(1)
}
const verbose = process.argv.includes('--verbose')

// Passed as SPRING_APPLICATION_JSON so the services' own config stays untouched
// (running mvnw directly, or in production, logs as usual).
const quietLogging = {
  'spring.main.banner-mode': 'off',
  'spring.main.log-startup-info': false,
  'logging.level.root': 'WARN',
  'logging.level.com.makanmatch': 'INFO',
  // "Tomcat started on port 8082" is the ready line.
  'logging.level.org.springframework.boot.tomcat.TomcatWebServer': 'INFO',
  // Warns on every start that Swagger UI is on by default; it is on deliberately.
  'logging.level.org.springdoc.core.events.SpringDocAppInitializer': 'ERROR',
  'logging.pattern.console': '%clr(%d{HH:mm:ss}){faint} %clr(%5p) %clr(%logger{0}){cyan}%clr(:){faint} %m%n%wEx',
  // Spring can't see the terminal through concurrently's pipe; concurrently sets
  // FORCE_COLOR when the terminal takes colour.
  ...(Number(process.env.FORCE_COLOR) > 0 && { 'spring.output.ansi.enabled': 'always' }),
}

const mavenArgs = verbose ? ['spring-boot:run'] : ['-q', 'spring-boot:run']
const env = verbose ? process.env : { ...process.env, SPRING_APPLICATION_JSON: JSON.stringify(quietLogging) }

const windows = process.platform === 'win32'
const child = windows
  ? spawn('mvnw.cmd', mavenArgs, { cwd: dir, env, stdio: 'inherit', shell: true })
  : spawn('sh', ['mvnw', ...mavenArgs], { cwd: dir, env, stdio: 'inherit' })

child.on('exit', (code) => process.exit(code ?? 0))
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal))
