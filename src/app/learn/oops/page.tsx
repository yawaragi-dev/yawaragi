// Teaches: any unhandled throw in a Server Component is caught by the nearest error.tsx up the tree
export default function OopsPage(): never {
  throw new Error('Deliberate crash — this tests error.tsx')
}
