import { resolve } from 'node:path'

const [root='.', durations='300,900,1800,3600,7200,14400'] = process.argv.slice(2)
process.argv.splice(2, process.argv.length - 2, resolve(root), durations, '--alpha09')
await import('./simulate-alpha08.mjs')
