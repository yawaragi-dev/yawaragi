import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '~/messages/en.json'
import { OtherCandidates } from './other-candidates'

const rows = [1, 2].map((n) => ({
  key: n,
  href: `/en/sake/${n}`,
  name: `Sake ${n}`,
  kanji: null,
  where: 'Brewery · Place',
  reason: 'Similar name',
}))

function renderRow(list = rows) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <OtherCandidates rows={list} />
    </NextIntlClientProvider>,
  )
}

describe('§5 Best guess — "Not sure?" under the card', () => {
  it('says how many other candidates there are and keeps them folded', () => {
    renderRow()
    const toggle = screen.getByRole('button', { name: 'Not sure? 2 other candidates' })
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(screen.queryByRole('link')).toBeNull()
  })

  it('opens the candidates in place, each a guess with its reason', () => {
    renderRow()
    fireEvent.click(screen.getByRole('button', { name: /Not sure\?/ }))
    expect(screen.getByRole('button', { name: /Not sure\?/ }).getAttribute('aria-expanded')).toBe('true')
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual(['/en/sake/1', '/en/sake/2'])
    expect(screen.getAllByText('Similar name')).toHaveLength(2)
  })

  it('reads in the singular for one', () => {
    renderRow(rows.slice(0, 1))
    expect(screen.getByRole('button', { name: 'Not sure? 1 other candidate' })).toBeTruthy()
  })

  it('renders nothing when there are none', () => {
    renderRow([])
    expect(screen.queryByRole('button')).toBeNull()
  })
})
