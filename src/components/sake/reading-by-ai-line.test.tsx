import { fireEvent, render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import { ReadingByAiLine } from './reading-by-ai-line'

describe('"Reading by AI" on an own bottling named from a scan', () => {
  it('says once that the Latin name is a model\'s reading, and opens why', async () => {
    render(
      <ReadingByAiLine
        label="Reading by AI"
        title="Read by an AI model"
        body="The Latin spelling is how an AI model read the label's Japanese."
        closeLabel="Close"
      />,
    )
    const line = screen.getByTestId('bottling-reading-by-ai')
    expect(line.textContent).toBe('Reading by AI')
    fireEvent.click(line)
    expect(await screen.findByText("The Latin spelling is how an AI model read the label's Japanese.")).toBeTruthy()
  })
})
