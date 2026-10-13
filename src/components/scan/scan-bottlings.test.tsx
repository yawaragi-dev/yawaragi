import { render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it, vi } from 'vitest'
import en from '~/messages/en.json'

vi.mock('@/lib/collection/expression-actions', () => ({ addOwnBottling: vi.fn() }))
vi.mock('@/i18n/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  Link: ({ children, href, ...rest }: { children: React.ReactNode; href: unknown }) => (
    <a href={JSON.stringify(href)} {...rest}>
      {children}
    </a>
  ),
}))

const { ScanBottlings } = await import('./scan-bottlings')

function renderSection(props: Partial<React.ComponentProps<typeof ScanBottlings>>) {
  return render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <ScanBottlings brandId={3776} lineName="Mizuo" suggestedName={null} own={[]} badge={<span>Read by AI</span>} {...props} />
    </NextIntlClientProvider>,
  )
}

describe('under a matched scan: the bottling', () => {
  it('shows nothing when the label says no more than the sake’s name and the visitor has no bottlings', () => {
    const { container } = renderSection({})
    expect(container.textContent).toBe('')
  })

  it('offers to add the bottling under the name read off the label', () => {
    renderSection({ suggestedName: 'Mizuo 一味 Junmai' })
    expect(screen.getByRole('button', { name: /Add this bottling/ }).textContent).toContain('Mizuo 一味 Junmai')
    expect(screen.queryByText('Is it one of these bottlings?')).toBeNull()
    // A name read by the model is marked as such.
    expect(screen.getByTestId('scan-bottlings-read').textContent).toContain('Read by AI')
  })

  it('asks which of the visitor’s bottlings it is, and says which one fits the label', () => {
    renderSection({
      suggestedName: 'Mizuo 一味 Junmai',
      own: [
        { id: 'b', name: 'Mizuo 一味 Junmai', fitsLabel: true },
        { id: 'a', name: 'Mizuo Junmai Ginjo', fitsLabel: false },
      ],
    })
    expect(screen.getByText('Is it one of these bottlings?')).toBeTruthy()
    const rows = screen.getAllByRole('link')
    expect(rows[0].textContent).toContain('fits this label')
    expect(rows[1].textContent).toContain('Your own entry')
    expect(rows[1].textContent).not.toContain('fits this label')
  })
})
