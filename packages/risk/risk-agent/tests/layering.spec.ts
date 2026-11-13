/**
 * 分层红线机械化校验（ID_PENDING）：扫描 `src/` 全部 import，强制包 AGENTS.md §2 第 1～3 条。
 * 第 1 条：依赖方向 plugin → application → domain，infrastructure 只实现 application 定义的 Port。
 * 第 2 条：domain/ 禁止 import `@deepseek-ai/*`、`node:fs`、`node:child_process`、`node:net`。
 * 第 3 条：Tool Handler 不触 Repository；application 不 import 具体 adapter；infrastructure 不反向依赖 Use Case。
 * 另：Cordis 运行时 API（`@deepseek-ai/cordis*`）只允许出现在 plugin 层；
 * 跨层引用只允许命中目标层的 `index.ts` 门面（包根 `index.ts` / `types.ts` 除外）。
 */

import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join, normalize, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

const SRC = fileURLToPath(new URL('../src', import.meta.url))

/** 六层与包根。 */
type Layer = 'root' | 'plugin' | 'tools' | 'application' | 'domain' | 'infrastructure' | 'shared'

/** 各层允许 import 的包内层（第 1 条依赖方向矩阵）。 */
const ALLOWED_LAYERS: Record<Layer, readonly Layer[]> = {
  root: ['plugin', 'tools', 'application', 'domain', 'infrastructure', 'shared'],
  plugin: ['plugin', 'tools', 'application', 'domain', 'infrastructure', 'shared'],
  tools: ['tools', 'application', 'domain', 'shared'],
  application: ['application', 'domain', 'shared'],
  domain: ['domain', 'shared'],
  infrastructure: ['infrastructure', 'application', 'domain', 'shared'],
  shared: ['shared'],
}

/** 包根允许被任意层直接引用的文件。 */
const ROOT_FILES = new Set(['index.ts', 'types.ts'])

/** domain 层禁止的外部依赖（第 2 条）。 */
const DOMAIN_FORBIDDEN = ['node:fs', 'node:child_process', 'node:net']

/**
 * 递归收集目录下的 `.ts` 文件。
 * @param dir - 起始目录。
 * @returns 绝对路径列表。
 */
function collectSources(dir: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) files.push(...collectSources(path))
    else if (entry.isFile() && entry.name.endsWith('.ts')) files.push(path)
  }
  return files
}

/**
 * 提取一个源文件的全部静态 import / re-export 目标。
 * @param file - 源文件绝对路径。
 * @returns 模块说明符列表。
 */
function importSpecifiers(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  const specifiers: string[] = []
  const patterns = [
    /(?:import|export)\s[^'"]*?from\s+['"]([^'"]+)['"]/g,
    /(?:^|\n)\s*import\s+['"]([^'"]+)['"]/g,
  ]
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) specifiers.push(match[1]!)
  }
  return specifiers
}

/**
 * 解析文件所属层。
 * @param file - 源文件绝对路径。
 * @returns 所在层；包根文件返回 `root`。
 */
function layerOf(file: string): Layer {
  const relative = normalize(file.slice(SRC.length + 1))
  const [first] = relative.split(sep)
  if (first !== undefined && first in ALLOWED_LAYERS && first !== 'root') return first as Layer
  return 'root'
}

/**
 * 校验全部 import 并返回违规描述列表。
 * @returns 违规列表；空数组表示通过。
 */
function violations(): string[] {
  const found: string[] = []
  for (const file of collectSources(SRC)) {
    const layer = layerOf(file)
    for (const specifier of importSpecifiers(file)) {
      if (!specifier.startsWith('.')) {
        if (layer === 'domain' && (specifier.startsWith('@deepseek-ai/') || DOMAIN_FORBIDDEN.includes(specifier))) {
          found.push(`${file}: domain 禁止 import ${specifier}（红线 2）`)
        }
        if (layer !== 'plugin' && layer !== 'root' && /^@deepseek-ai\/cordis/.test(specifier)) {
          found.push(`${file}: Cordis 运行时 API 只允许出现在 plugin 层，得到 ${specifier}`)
        }
        continue
      }
      const target = normalize(join(dirname(file), specifier))
      if (!target.startsWith(SRC + sep)) {
        found.push(`${file}: import 越出 src 边界 ${specifier}`)
        continue
      }
      const relative = target.slice(SRC.length + 1).split(sep).join('/')
      const targetLayer = layerOf(target)
      if (targetLayer === 'root') {
        if (!ROOT_FILES.has(relative)) found.push(`${file}: 包根只允许引用 index.ts / types.ts，得到 ${specifier}`)
        continue
      }
      if (!ALLOWED_LAYERS[layer].includes(targetLayer)) {
        found.push(`${file}: ${layer} 不允许依赖 ${targetLayer}（红线 1），得到 ${specifier}`)
        continue
      }
      if (targetLayer !== layer && !relative.endsWith('/index.ts')) {
        found.push(`${file}: 跨层引用必须命中目标层 index.ts 门面，得到 ${specifier}`)
      }
      if (layer === 'tools' && /repository/i.test(relative)) {
        found.push(`${file}: Tool Handler 禁止接触 Repository（红线 3），得到 ${specifier}`)
      }
      if (layer === 'infrastructure' && targetLayer === 'application' && !/port/i.test(relative)) {
        found.push(`${file}: infrastructure 只允许实现 application 的 Port，得到 ${specifier}`)
      }
    }
  }
  return found
}

describe('分层红线（AGENTS.md §2 第 1～3 条）', () => {
  it('[ID_PENDING] 扫描确实覆盖了现有源文件', () => {
    const files = collectSources(SRC).map(file => file.slice(SRC.length + 1).split(sep).join('/')).sort()
    expect(files).toEqual([
      'application/config/audit.ts',
      'application/config/index.ts',
      'application/config/schema.ts',
      'application/config/service.ts',
      'application/config/snapshot.ts',
      'application/config/validation.ts',
      'application/security/index.ts',
      'domain/index.ts',
      'domain/tenant/index.ts',
      'index.ts',
      'plugin/composition/index.ts',
      'plugin/index.ts',
      'shared/errors/index.ts',
      'shared/index.ts',
      'shared/types/index.ts',
      'tools/get-monitor-health.ts',
      'tools/index.ts',
    ])
  })

  it('[ID_PENDING] 全部 import 满足依赖方向与禁则', () => {
    expect(violations()).toEqual([])
  })
})
