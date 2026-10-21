// Fails if a React effect's callback could return something other than a clean-up function.
// `useEffect(() => el.scrollIntoView())` looks harmless, but newer browsers return a Promise from
// scroll methods, and React then crashes with "destroy is not a function". Effects must use a
// block body: useEffect(() => { el.scrollIntoView() }, [deps]). Async callbacks are caught too.
// Run: npm run check
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const roots = ['app', 'components', 'lib']
const bad = /use(Layout|Insertion)?Effect\(\s*(async\b|\([^)]*\)\s*=>\s*(?![\s{]))/g
const problems = []

function walk(dir) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) walk(p)
    else if (/\.(tsx?|jsx?)$/.test(name)) {
      const src = readFileSync(p, 'utf8')
      for (const m of src.matchAll(bad)) {
        const line = src.slice(0, m.index).split('\n').length
        problems.push(`${p}:${line}  ${src.split('\n')[line - 1].trim()}`)
      }
    }
  }
}
roots.forEach(walk)
if (problems.length) {
  console.error('Effects must use a block body and not be async:\n' + problems.join('\n'))
  process.exit(1)
}
console.log('Effects OK')
