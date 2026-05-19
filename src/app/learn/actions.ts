// Teaches: 'use server' — marks exports as server actions, callable from client components with no API route needed
'use server'

export async function addNote(
  _prev: { message: string },
  formData: FormData,
): Promise<{ message: string }> {
  const note = formData.get('note') as string
  if (!note?.trim()) return { message: 'Note cannot be empty' }
  return { message: `Saved: "${note}"` }
}
