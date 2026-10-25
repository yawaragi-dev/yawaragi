import { fireEvent, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { describe, expect, it } from 'vitest'
import en from '~/messages/en.json'
import type { BottlingDetails } from '@/lib/schemas/expression'
import { BottlingNameForm } from './bottling-name-form'

function form(initialDetails?: BottlingDetails) {
  render(
    <NextIntlClientProvider locale="en" messages={en} timeZone="UTC">
      <BottlingNameForm
        initialName="Ikekame"
        withDetails
        initialDetails={initialDetails}
        pending={false}
        failed={false}
        onSubmit={() => {}}
        onCancel={() => {}}
        testId="form"
      />
    </NextIntlClientProvider>,
  )
}

describe('the bottling form (design v1.9, V)', () => {
  it('shows grade, polishing, pasteurisation and the style pills, and keeps starter, koji and other words behind one link', () => {
    form()
    expect(screen.getByLabelText('Grade')).toBeTruthy()
    expect(screen.getByLabelText('Pasteurisation')).toBeTruthy()
    expect(screen.getByRole('option', { name: 'Pasteurised twice (usual)' })).toBeTruthy()
    expect(screen.getByRole('checkbox', { name: 'Genshu' })).toBeTruthy()
    expect(screen.queryByLabelText('Starter')).toBeNull()
    expect(screen.getByRole('button', { name: 'Starter, koji, other style words' })).toBeTruthy()
  })

  it('opens the hidden part by itself when the label read filled any of it', () => {
    form({ styles: ['Kimoto'] })
    expect(screen.getByLabelText<HTMLSelectElement>('Starter').value).toBe('kimoto')
    expect(screen.getByRole('option', { name: 'Yellow koji 黄麹' })).toBeTruthy()
  })

  it('links Pasteurisation and, once opened, Koji to their Learn entries', () => {
    form()
    expect(screen.getByRole('link', { name: 'About pasteurisation and nama' }).getAttribute('href')).toContain('/learn/nama')
    expect(screen.queryByRole('link', { name: 'About koji' })).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Starter, koji, other style words' }))
    const koji = screen.getByRole('link', { name: 'About koji' })
    expect(koji.getAttribute('href')).toContain('/learn/koji')
    expect(koji.getAttribute('target')).toBe('_blank')
  })
})
