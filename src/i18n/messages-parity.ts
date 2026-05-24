type MessageNode = string | { [key: string]: MessageNode }

function collectPaths(node: MessageNode, prefix: string[] = []): string[] {
  if (typeof node === 'string') return [prefix.join('.')]
  const out: string[] = []
  for (const [key, value] of Object.entries(node)) {
    out.push(...collectPaths(value as MessageNode, [...prefix, key]))
  }
  return out
}

export function diffMessageKeys(
  a: MessageNode,
  b: MessageNode,
): { missingInB: string[]; missingInA: string[] } {
  const pathsA = new Set(collectPaths(a))
  const pathsB = new Set(collectPaths(b))
  return {
    missingInB: [...pathsA].filter((p) => !pathsB.has(p)).sort(),
    missingInA: [...pathsB].filter((p) => !pathsA.has(p)).sort(),
  }
}
