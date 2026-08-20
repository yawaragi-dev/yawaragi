import type { ToolSet } from 'ai'

/**
 * Coerce numeric-looking string arguments into numbers before a tool call
 * leaves for the MCP server.
 *
 * WHY: 2026-08-20, `/suggest` started returning zero suggestions. The model
 * (Haiku 4.5) began emitting numeric tool arguments as strings —
 * `find_sakes_by_flavor({f1Min: "0.55", f6Min: "0.4", topK: "30"})` — and the
 * server's Zod schema rejected them (`expected number, received string`). The
 * model retried the identical call twice more, burning three of the loop's six
 * steps; `stopWhen(stepCountIs(6))` then fired before it could emit its final
 * JSON answer, so the parser got prose and produced an empty list. Nothing in
 * our dependency tree had changed — `ai`, `@ai-sdk/mcp` and the MCP server were
 * all identical across the preceding merges. It was model-behaviour drift, and
 * drift will happen again.
 *
 * The deepest fix is `z.coerce.number()` in the sakenowa-mcp server (a separate
 * repo), and that should still happen. This exists because a client that
 * detonates its step budget when a third-party schema gets strict is fragile
 * regardless of who is "right".
 *
 * SCHEMA-DRIVEN, never shape-guessing: a field is coerced only when the tool's
 * own JSON Schema declares it `number` or `integer`. Blanket "looks numeric →
 * make it a number" would corrupt legitimate input — a sake can genuinely be
 * named "1234", and `search_sakes_by_name({query: "1234"})` must stay a string.
 *
 * Values that are not cleanly numeric (`""`, `"abc"`) pass through untouched so
 * the server still rejects them. Coercing `""` to `0` would invent a filter the
 * model never asked for, which is worse than an honest validation error.
 */

/** A JSON Schema node, as much of it as we care about. */
interface SchemaNode {
  type?: string | string[]
  properties?: Record<string, SchemaNode>
  items?: SchemaNode
  $ref?: string
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Resolve a local `#/properties/foo` pointer against the root schema.
 *
 * Not incidental: `find_sakes_by_flavor` defines the axis bound once on
 * `f1Min` and points `f1Max` … `f6Max` at it with `$ref`. Reading
 * `properties[key].type` without following the pointer would silently skip
 * eleven of the twelve flavor bounds — i.e. exactly the arguments that broke.
 *
 * Only local pointers are followed, and `seen` stops a self-referential schema
 * from looping forever.
 */
function resolveRef(node: SchemaNode, root: SchemaNode, seen = new Set<string>()): SchemaNode {
  if (typeof node.$ref !== 'string') return node
  if (seen.has(node.$ref)) return node
  seen.add(node.$ref)

  if (!node.$ref.startsWith('#/')) return node
  let current: unknown = root
  for (const rawSegment of node.$ref.slice(2).split('/')) {
    // JSON Pointer escapes, per RFC 6901.
    const segment = rawSegment.replace(/~1/g, '/').replace(/~0/g, '~')
    if (!isRecord(current)) return node
    current = current[segment]
  }
  if (!isRecord(current)) return node
  return resolveRef(current as SchemaNode, root, seen)
}

function declaresNumber(node: SchemaNode): boolean {
  const type = node.type
  if (typeof type === 'string') return type === 'number' || type === 'integer'
  if (Array.isArray(type)) return type.some((t) => t === 'number' || t === 'integer')
  return false
}

/**
 * `"0.55"` → `0.55`. Returns the input unchanged unless the whole string is a
 * finite number — `Number('')` is 0 and `Number(' ')` is 0, both of which would
 * fabricate a value, so they are explicitly excluded.
 */
function coerceScalar(value: unknown): unknown {
  if (typeof value !== 'string') return value
  const trimmed = value.trim()
  if (trimmed.length === 0) return value
  const asNumber = Number(trimmed)
  return Number.isFinite(asNumber) ? asNumber : value
}

/** Coerce one argument against its (already `$ref`-resolved) schema node. */
function coerceValue(value: unknown, node: SchemaNode, root: SchemaNode): unknown {
  const resolved = resolveRef(node, root)

  if (declaresNumber(resolved)) return coerceScalar(value)

  if (Array.isArray(value) && resolved.items) {
    return value.map((item) => coerceValue(item, resolved.items as SchemaNode, root))
  }

  if (isRecord(value) && resolved.properties) {
    return coerceObject(value, resolved, root)
  }

  return value
}

function coerceObject(
  args: Record<string, unknown>,
  node: SchemaNode,
  root: SchemaNode,
): Record<string, unknown> {
  const properties = node.properties
  if (!properties) return args

  const out: Record<string, unknown> = { ...args }
  for (const [key, value] of Object.entries(args)) {
    const propertySchema = properties[key]
    // Unknown keys pass through — the server decides what to do with them.
    if (propertySchema) out[key] = coerceValue(value, propertySchema, root)
  }
  return out
}

/**
 * Coerce a tool-call argument object against that tool's JSON Schema.
 * Pure; exported for direct unit testing without an MCP client or a model.
 */
export function coerceArgsForSchema(args: unknown, jsonSchema: unknown): unknown {
  if (!isRecord(args) || !isRecord(jsonSchema)) return args
  const root = jsonSchema as SchemaNode
  return coerceObject(args, root, root)
}

/** The AI SDK wraps a tool's schema as `{ jsonSchema, validate, _type }`. */
function readJsonSchema(tool: unknown): unknown {
  if (!isRecord(tool)) return undefined
  const inputSchema = tool.inputSchema
  if (!isRecord(inputSchema)) return undefined
  return inputSchema.jsonSchema
}

/**
 * Wrap every executable tool in the set so its arguments are coerced on the way
 * through. Everything else about the tool (description, metadata,
 * `toModelOutput`, the schema itself) is preserved by spread — the model still
 * sees the server's own contract, and the AI SDK still validates against it.
 */
export function withNumericArgCoercion(tools: ToolSet): ToolSet {
  const out: Record<string, unknown> = {}
  for (const [name, tool] of Object.entries(tools)) {
    const jsonSchema = readJsonSchema(tool)
    const execute = isRecord(tool) ? tool.execute : undefined
    if (jsonSchema == null || typeof execute !== 'function') {
      out[name] = tool
      continue
    }
    out[name] = {
      ...(tool as object),
      execute: (args: unknown, options: unknown) =>
        (execute as (a: unknown, o: unknown) => unknown)(
          coerceArgsForSchema(args, jsonSchema),
          options,
        ),
    }
  }
  return out as ToolSet
}
