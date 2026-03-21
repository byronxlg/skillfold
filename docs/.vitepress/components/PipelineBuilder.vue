<script setup lang="ts">
import { ref, onMounted, watch, nextTick } from 'vue'
import { useData } from 'vitepress'
import { parse as parseYaml } from 'yaml'

// --- Types (browser-safe subset of compiler types) ---

interface ConditionalBranch {
  when: string
  to: string
}

type Then = string | ConditionalBranch[]

interface StepNode {
  skill: string
  reads: string[]
  writes: string[]
  then?: Then
}

interface AsyncNode {
  name: string
  async: true
  reads: string[]
  writes: string[]
  policy: string
  then?: Then
}

interface MapNode {
  over: string
  as: string
  flow: GraphNode[]
  then?: Then
}

type GraphNode = StepNode | AsyncNode | MapNode

interface SkillEntry {
  compose?: string[]
  description?: string
  path?: string
}

interface ParsedConfig {
  name: string
  skills: Record<string, SkillEntry>
  flow: GraphNode[]
}

interface NodeMeta {
  id: string
  label: string
  type: 'step' | 'async' | 'map'
  composition?: string[]
  reads: string[]
  writes: string[]
  description?: string
}

// --- Example configs ---

const examples: Record<string, string> = {
  'dev-team': `name: dev-team

skills:
  composed:
    planner:
      compose: [planning, decision-making]
      description: "Analyzes the goal and produces a structured plan."

    engineer:
      compose: [planning, code-writing, testing]
      description: "Implements the plan by writing code and tests."

    reviewer:
      compose: [code-review, testing]
      description: "Reviews code for correctness and test coverage."

state:
  Review:
    approved: bool
    feedback: string

  plan:
    type: string

  implementation:
    type: string

  review:
    type: Review

team:
  flow:
    - planner:
        writes: [state.plan]
      then: engineer

    - engineer:
        reads: [state.plan]
        writes: [state.implementation]
      then: reviewer

    - reviewer:
        reads: [state.implementation]
        writes: [state.review]
      then:
        - when: review.approved == true
          to: end
        - when: review.approved == false
          to: engineer`,

  'content-pipeline': `name: content-pipeline

skills:
  composed:
    researcher:
      compose: [research, planning]
      description: "Researches a subject and produces topics to cover."

    writer:
      compose: [research, writing]
      description: "Drafts content for a given topic."

    editor:
      compose: [summarization, writing]
      description: "Reviews and refines drafted content."

state:
  Topic:
    title: string
    draft: string
    approved: bool

  topics:
    type: list<Topic>

team:
  flow:
    - researcher:
        writes: [state.topics]
      then: map

    - map:
        over: state.topics
        as: topic
        flow:
          - writer:
              reads: [topic.title]
              writes: [topic.draft]
            then: editor

          - editor:
              reads: [topic.draft]
              writes: [topic.approved]
            then:
              - when: topic.approved == true
                to: end
              - when: topic.approved == false
                to: writer`,

  'code-review-bot': `name: code-review-bot

skills:
  composed:
    analyzer:
      compose: [code-review, file-management]
      description: "Reads code files and analyzes them for issues."

    reporter:
      compose: [writing, summarization]
      description: "Produces a structured report from findings."

state:
  findings:
    type: string

  report:
    type: string

team:
  flow:
    - analyzer:
        writes: [state.findings]
      then: reporter

    - reporter:
        reads: [state.findings]
        writes: [state.report]
      then: end`,
}

// --- State ---

const yamlInput = ref('')
const errorMsg = ref('')
const selectedExample = ref('dev-team')
const selectedNode = ref<NodeMeta | null>(null)
const graphContainer = ref<HTMLDivElement | null>(null)
const { isDark } = useData()

let mermaidMod: any = null
let renderCounter = 0
let debounceTimer: ReturnType<typeof setTimeout> | null = null

// --- Type guards ---

function isMapNode(node: GraphNode): node is MapNode {
  return 'over' in node
}

function isAsyncNode(node: GraphNode): node is AsyncNode {
  return 'async' in node && (node as AsyncNode).async === true
}

function isComposed(skill: SkillEntry): boolean {
  return Array.isArray(skill.compose)
}

function isConditionalThen(then: Then): then is ConditionalBranch[] {
  return Array.isArray(then)
}

// --- Config parser (browser-safe) ---

function parseFlowNodes(rawFlow: any[]): GraphNode[] {
  const nodes: GraphNode[] = []

  for (const entry of rawFlow) {
    if (!entry || typeof entry !== 'object') continue

    const keys = Object.keys(entry)
    const skillKey = keys.find(k => k !== 'then')
    if (!skillKey) continue

    const config = entry[skillKey]
    const then = entry.then

    if (skillKey === 'map' && config && typeof config === 'object' && config.over) {
      nodes.push({
        over: config.over,
        as: config.as || 'item',
        flow: parseFlowNodes(config.flow || config.graph || []),
        then,
      })
    } else if (config && config.async === true) {
      nodes.push({
        name: skillKey,
        async: true,
        reads: config.reads || [],
        writes: config.writes || [],
        policy: config.policy || 'block',
        then,
      })
    } else {
      nodes.push({
        skill: skillKey,
        reads: config?.reads || [],
        writes: config?.writes || [],
        then,
      })
    }
  }

  return nodes
}

function parseConfig(text: string): ParsedConfig {
  const raw = parseYaml(text)
  if (!raw || typeof raw !== 'object') throw new Error('Invalid YAML')

  const name = (raw as any).name || 'pipeline'
  const skills: Record<string, SkillEntry> = {}
  const rawObj = raw as any

  if (rawObj.skills) {
    if (rawObj.skills.atomic) {
      for (const [k, v] of Object.entries(rawObj.skills.atomic)) {
        skills[k] = { path: typeof v === 'string' ? v : '.' }
      }
    }
    if (rawObj.skills.composed) {
      for (const [k, v] of Object.entries(rawObj.skills.composed)) {
        if (v && typeof v === 'object') {
          skills[k] = v as SkillEntry
        }
      }
    }
  }

  if (!rawObj.team?.flow || !Array.isArray(rawObj.team.flow)) {
    throw new Error('Missing team.flow section')
  }

  const flow = parseFlowNodes(rawObj.team.flow)
  if (flow.length === 0) throw new Error('Empty flow')

  return { name, skills, flow }
}

// --- Mermaid generation (ported from src/visualize.ts) ---

function sanitizeId(name: string): string {
  return name.replace(/[^a-zA-Z0-9_]/g, '_')
}

function getLeafAtomics(name: string, skills: Record<string, SkillEntry>, visited?: Set<string>): string[] {
  const skill = skills[name]
  if (!skill || !isComposed(skill)) return [name]

  visited = visited ?? new Set()
  if (visited.has(name)) return []
  visited.add(name)

  const leaves: string[] = []
  const seen = new Set<string>()
  for (const ref of skill.compose!) {
    for (const leaf of getLeafAtomics(ref, skills, new Set(visited))) {
      if (!seen.has(leaf)) {
        seen.add(leaf)
        leaves.push(leaf)
      }
    }
  }
  return leaves
}

function formatWritesLabel(writes: string[]): string {
  if (writes.length === 0) return ''
  return writes.map(w => w.replace(/^state\./, '')).join(', ')
}

function buildIdMap(nodes: GraphNode[]): Map<string, string> {
  const ids = new Map<string, string>()
  for (const node of nodes) {
    if (isMapNode(node)) {
      ids.set('map', `map_${sanitizeId(node.over)}`)
    } else if (isAsyncNode(node)) {
      ids.set(node.name, sanitizeId(node.name))
    } else {
      ids.set(node.skill, sanitizeId(node.skill))
    }
  }
  return ids
}

function resolveTarget(target: string, idMap: Map<string, string>): string {
  return idMap.get(target) ?? sanitizeId(target)
}

function renderEdge(lines: string[], indent: string, fromId: string, toId: string, writes: string[]): void {
  const label = formatWritesLabel(writes)
  if (label) {
    lines.push(`${indent}${fromId} -->|"${label}"| ${toId}`)
  } else {
    lines.push(`${indent}${fromId} --> ${toId}`)
  }
}

function renderThen(
  lines: string[], indent: string, fromId: string, then: Then,
  endNodeId: string, idMap: Map<string, string>, writes: string[],
): void {
  if (isConditionalThen(then)) {
    for (const branch of then) {
      const targetId = branch.to === 'end'
        ? `${endNodeId}([end])`
        : resolveTarget(branch.to, idMap)
      lines.push(`${indent}${fromId} -->|"${branch.when}"| ${targetId}`)
    }
  } else if (then === 'end') {
    renderEdge(lines, indent, fromId, `${endNodeId}([end])`, writes)
  } else {
    renderEdge(lines, indent, fromId, resolveTarget(then, idMap), writes)
  }
}

function getNextTarget(node: GraphNode): string {
  if (isMapNode(node)) return `map_${sanitizeId(node.over)}`
  if (isAsyncNode(node)) return sanitizeId(node.name)
  return sanitizeId(node.skill)
}

function renderNodes(
  nodes: GraphNode[], lines: string[], indent: string,
  endNodeId: string, skills: Record<string, SkillEntry>,
): void {
  const idMap = buildIdMap(nodes)

  for (let i = 0; i < nodes.length; i++) {
    const node = nodes[i]

    if (isMapNode(node)) {
      const subgraphId = `map_${sanitizeId(node.over)}`
      lines.push(`${indent}subgraph ${subgraphId}["map over ${node.over}"]`)
      renderNodes(node.flow, lines, indent + '    ', `end_${subgraphId}`, skills)
      lines.push(`${indent}end`)

      if (node.then !== undefined) {
        renderThen(lines, indent, subgraphId, node.then, endNodeId, idMap, [])
      } else {
        const next = nodes[i + 1]
        if (next) lines.push(`${indent}${subgraphId} --> ${getNextTarget(next)}`)
      }
    } else if (isAsyncNode(node)) {
      const currentId = sanitizeId(node.name)
      lines.push(`${indent}${currentId}([${node.name}]):::async`)

      if (node.then !== undefined) {
        renderThen(lines, indent, currentId, node.then, endNodeId, idMap, node.writes)
      } else {
        const next = nodes[i + 1]
        if (next) {
          renderEdge(lines, indent, currentId, getNextTarget(next), node.writes)
        } else {
          renderEdge(lines, indent, currentId, `${endNodeId}([end])`, node.writes)
        }
      }
    } else {
      const currentId = sanitizeId(node.skill)
      const skill = skills[node.skill]
      const composed = skill !== undefined && isComposed(skill)

      if (composed) {
        const leaves = getLeafAtomics(node.skill, skills)
        if (currentId !== node.skill) {
          lines.push(`${indent}subgraph ${currentId}["${node.skill}"]`)
        } else {
          lines.push(`${indent}subgraph ${currentId}`)
        }
        for (const leaf of leaves) {
          lines.push(`${indent}    ${currentId}_${sanitizeId(leaf)}["${leaf}"]`)
        }
        lines.push(`${indent}end`)
      } else if (currentId !== node.skill) {
        lines.push(`${indent}${currentId}["${node.skill}"]`)
      }

      if (node.then !== undefined) {
        renderThen(lines, indent, currentId, node.then, endNodeId, idMap, node.writes)
      } else {
        const next = nodes[i + 1]
        if (next) {
          renderEdge(lines, indent, currentId, getNextTarget(next), node.writes)
        } else {
          renderEdge(lines, indent, currentId, `${endNodeId}([end])`, node.writes)
        }
      }
    }
  }
}

function hasAsyncNodes(nodes: GraphNode[]): boolean {
  for (const node of nodes) {
    if (isAsyncNode(node)) return true
    if (isMapNode(node) && hasAsyncNodes(node.flow)) return true
  }
  return false
}

function generateMermaidCode(config: ParsedConfig): string {
  const lines: string[] = ['graph TD']
  renderNodes(config.flow, lines, '    ', 'end_node', config.skills)
  if (hasAsyncNodes(config.flow)) {
    lines.push('    classDef async stroke-dasharray: 5 5')
  }
  return lines.join('\n') + '\n'
}

// --- Node metadata ---

function collectNodeMeta(nodes: GraphNode[], skills: Record<string, SkillEntry>): NodeMeta[] {
  const metas: NodeMeta[] = []

  for (const node of nodes) {
    if (isMapNode(node)) {
      metas.push({
        id: `map_${sanitizeId(node.over)}`,
        label: `map over ${node.over}`,
        type: 'map',
        reads: [],
        writes: [],
      })
      metas.push(...collectNodeMeta(node.flow, skills))
    } else if (isAsyncNode(node)) {
      metas.push({
        id: sanitizeId(node.name),
        label: node.name,
        type: 'async',
        reads: node.reads,
        writes: node.writes,
      })
    } else {
      const skill = skills[node.skill]
      const composed = skill !== undefined && isComposed(skill)
      const meta: NodeMeta = {
        id: sanitizeId(node.skill),
        label: node.skill,
        type: 'step',
        reads: node.reads,
        writes: node.writes,
      }
      if (composed) {
        meta.composition = getLeafAtomics(node.skill, skills)
        meta.description = skill.description
      }
      metas.push(meta)
    }
  }

  return metas
}

// --- Render logic ---

onMounted(async () => {
  const m = await import('https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs')
  mermaidMod = m.default
  mermaidMod.initialize({
    startOnLoad: false,
    theme: isDark.value ? 'dark' : 'default',
    securityLevel: 'loose',
    flowchart: { curve: 'basis', padding: 16 },
  })
  yamlInput.value = examples[selectedExample.value]
  await renderGraph()
})

watch(isDark, () => {
  if (!mermaidMod) return
  mermaidMod.initialize({
    startOnLoad: false,
    theme: isDark.value ? 'dark' : 'default',
    securityLevel: 'loose',
    flowchart: { curve: 'basis', padding: 16 },
  })
  renderGraph()
})

function onInput() {
  if (debounceTimer) clearTimeout(debounceTimer)
  debounceTimer = setTimeout(renderGraph, 300)
}

function loadExample() {
  yamlInput.value = examples[selectedExample.value]
  selectedNode.value = null
  renderGraph()
}

async function renderGraph() {
  if (!mermaidMod || !graphContainer.value) return

  try {
    const config = parseConfig(yamlInput.value)
    const mermaidCode = generateMermaidCode(config)
    const nodeMetas = collectNodeMeta(config.flow, config.skills)

    renderCounter++
    const { svg } = await mermaidMod.render(`graph-${renderCounter}`, mermaidCode)
    graphContainer.value.innerHTML = svg
    errorMsg.value = ''

    await nextTick()
    const metaMap = new Map(nodeMetas.map(n => [n.id, n]))
    const svgEl = graphContainer.value.querySelector('svg')
    if (svgEl) {
      svgEl.querySelectorAll('.node, .cluster').forEach((el: Element) => {
        ;(el as HTMLElement).style.cursor = 'pointer'
        el.addEventListener('click', (e) => {
          e.stopPropagation()
          const elId = el.id || ''
          const cleanId = elId.replace(/^flowchart-/, '').replace(/-\d+$/, '')
          const meta = metaMap.get(cleanId)
          if (meta) {
            selectedNode.value = meta
            return
          }
          for (const [key, val] of metaMap) {
            if (cleanId.includes(key) || key.includes(cleanId)) {
              selectedNode.value = val
              return
            }
          }
        })
      })
    }
  } catch (e: any) {
    errorMsg.value = e.message || 'Parse error'
    if (graphContainer.value) graphContainer.value.innerHTML = ''
    selectedNode.value = null
  }
}

function copyYaml() {
  navigator.clipboard.writeText(yamlInput.value)
}

function exportSvg() {
  if (!graphContainer.value) return
  const svg = graphContainer.value.querySelector('svg')
  if (!svg) return
  const serializer = new XMLSerializer()
  const svgStr = serializer.serializeToString(svg)
  const blob = new Blob([svgStr], { type: 'image/svg+xml' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = 'pipeline.svg'
  a.click()
  URL.revokeObjectURL(url)
}
</script>

<template>
  <div class="builder">
    <div class="builder-toolbar">
      <div class="toolbar-group">
        <label class="example-label">
          Example:
          <select v-model="selectedExample" @change="loadExample">
            <option value="dev-team">dev-team</option>
            <option value="content-pipeline">content-pipeline</option>
            <option value="code-review-bot">code-review-bot</option>
          </select>
        </label>
      </div>
      <div class="toolbar-group">
        <button class="toolbar-btn" @click="copyYaml">Copy YAML</button>
        <button class="toolbar-btn" @click="exportSvg">Export SVG</button>
      </div>
    </div>

    <div class="builder-panels">
      <div class="editor-panel">
        <textarea
          v-model="yamlInput"
          @input="onInput"
          spellcheck="false"
          placeholder="Paste your skillfold.yaml here..."
        />
        <div v-if="errorMsg" class="error-bar">{{ errorMsg }}</div>
      </div>

      <div class="graph-panel">
        <div ref="graphContainer" class="graph-container" />

        <div v-if="selectedNode" class="node-detail">
          <h3>{{ selectedNode.label }}</h3>
          <div class="detail-row">
            <span class="detail-label">Type</span>
            <span class="tag tag-type">{{ selectedNode.type }}</span>
          </div>
          <div v-if="selectedNode.description" class="detail-row">
            <span class="detail-label">Description</span>
            <span class="detail-value">{{ selectedNode.description }}</span>
          </div>
          <div v-if="selectedNode.composition?.length" class="detail-row">
            <span class="detail-label">Skills</span>
            <span class="detail-tags">
              <span v-for="s in selectedNode.composition" :key="s" class="tag tag-skill">{{ s }}</span>
            </span>
          </div>
          <div v-if="selectedNode.reads.length" class="detail-row">
            <span class="detail-label">Reads</span>
            <span class="detail-tags">
              <span v-for="r in selectedNode.reads" :key="r" class="tag tag-read">{{ r }}</span>
            </span>
          </div>
          <div v-if="selectedNode.writes.length" class="detail-row">
            <span class="detail-label">Writes</span>
            <span class="detail-tags">
              <span v-for="w in selectedNode.writes" :key="w" class="tag tag-write">{{ w }}</span>
            </span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.builder {
  display: flex;
  flex-direction: column;
  height: calc(100vh - 64px);
  width: 100%;
}

.builder-toolbar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 16px;
  border-bottom: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  flex-shrink: 0;
}

.toolbar-group {
  display: flex;
  align-items: center;
  gap: 8px;
}

.toolbar-btn {
  padding: 6px 12px;
  background: var(--vp-c-bg-mute);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-size: 13px;
  cursor: pointer;
}

.toolbar-btn:hover {
  background: var(--vp-c-default-soft);
}

.example-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.example-label select {
  padding: 6px 8px;
  background: var(--vp-c-bg-mute);
  border: 1px solid var(--vp-c-divider);
  border-radius: 6px;
  color: var(--vp-c-text-1);
  font-size: 13px;
}

.builder-panels {
  display: flex;
  flex: 1;
  min-height: 0;
}

.editor-panel {
  width: 40%;
  display: flex;
  flex-direction: column;
  border-right: 1px solid var(--vp-c-divider);
}

.editor-panel textarea {
  flex: 1;
  resize: none;
  border: none;
  outline: none;
  padding: 16px;
  font-family: var(--vp-font-family-mono);
  font-size: 13px;
  line-height: 1.6;
  color: var(--vp-c-text-1);
  background: var(--vp-c-bg);
  tab-size: 2;
}

.error-bar {
  padding: 8px 16px;
  background: var(--vp-c-danger-soft);
  color: var(--vp-c-danger-1);
  font-size: 13px;
  border-top: 1px solid var(--vp-c-danger-2);
  flex-shrink: 0;
}

.graph-panel {
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.graph-container {
  flex: 1;
  overflow: auto;
  padding: 24px;
  display: flex;
  align-items: flex-start;
  justify-content: center;
}

.graph-container :deep(svg) {
  max-width: 100%;
  height: auto;
}

.node-detail {
  padding: 16px;
  border-top: 1px solid var(--vp-c-divider);
  background: var(--vp-c-bg-soft);
  flex-shrink: 0;
  max-height: 200px;
  overflow-y: auto;
}

.node-detail h3 {
  font-size: 14px;
  font-weight: 600;
  margin-bottom: 10px;
}

.detail-row {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-bottom: 6px;
}

.detail-label {
  font-size: 11px;
  color: var(--vp-c-text-3);
  text-transform: uppercase;
  letter-spacing: 0.5px;
  min-width: 80px;
  padding-top: 3px;
  flex-shrink: 0;
}

.detail-value {
  font-size: 13px;
  color: var(--vp-c-text-2);
}

.detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.tag {
  display: inline-block;
  padding: 2px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.tag-read { background: rgba(56, 139, 253, 0.15); color: var(--vp-c-brand-1); }
.tag-write { background: rgba(240, 136, 62, 0.15); color: #f0883e; }
.tag-skill { background: rgba(86, 211, 100, 0.15); color: #56d364; }
.tag-type { background: rgba(210, 168, 255, 0.15); color: #d2a8ff; }

@media (max-width: 768px) {
  .builder-panels {
    flex-direction: column;
  }
  .editor-panel {
    width: 100%;
    height: 40%;
    border-right: none;
    border-bottom: 1px solid var(--vp-c-divider);
  }
}
</style>
