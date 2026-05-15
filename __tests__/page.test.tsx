import { render, screen } from '@testing-library/react'
import { expect, test, vi } from 'vitest'
import Home from '../src/app/page'

vi.mock('next/image', () => ({
  default: ({ src, alt }: { src: string; alt: string }) => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} />
  ),
}))

test('Home page renders without crashing', () => {
  render(<Home />)
  expect(screen.getByRole('heading', { level: 1 })).toBeDefined()
})
