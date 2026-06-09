import { describe, expect, it, vi } from 'vitest'
import { MockLanguageModelV3 } from 'ai/test'
import { createAnthropicHaikuProvider } from './anthropic-haiku-provider'

// `@ai-sdk/provider` is not a direct dependency, so we derive the
// model's call-option and prompt shapes via type inference off the
// `MockLanguageModelV3` instance. `doGenerate` on the instance is the
// pure function form, so we don't have to extract it from the
// constructor's `function | result | result[]` union.
type DoGenerateFn = MockLanguageModelV3['doGenerate']
type DoGenerateOptions = Parameters<DoGenerateFn>[0]
type DoGenerateResult = Awaited<ReturnType<DoGenerateFn>>

// `ai/test` exports `MockLanguageModelV3` (V3 in AI SDK 6 — what the
// docstring on CLAUDE.md calls "MockLanguageModelV2" was the older name).
// We construct the mock with a fixed `doGenerate` shape mirroring what
// the Anthropic provider would otherwise return for a structured-output
// call.

const DASSAI_OBJECT = {
  source: 'llm_extracted',
  name_ja: '獺祭',
  brewery_ja: '旭酒造',
  confidence: 0.95,
}

function jpegBlob(payload = 'pretend-jpeg-bytes'): Blob {
  return new Blob([payload], { type: 'image/jpeg' })
}

async function doGenerateOk(): Promise<DoGenerateResult> {
  // The V3 result shape uses structured finishReason + per-bucket usage;
  // we fill in just enough to satisfy the type so the test focuses on
  // the parts that matter (the content the schema parses).
  return {
    content: [{ type: 'text', text: '' }],
    finishReason: { unified: 'stop', raw: undefined },
    usage: {
      inputTokens: {
        total: undefined,
        noCache: undefined,
        cacheRead: undefined,
        cacheWrite: undefined,
      },
      outputTokens: { total: undefined, text: undefined, reasoning: undefined },
    } as DoGenerateResult['usage'],
    warnings: [],
  }
}

function mockReturning(object: unknown): MockLanguageModelV3 {
  // `generateObject` reads the first text part of the model's response,
  // parses it as JSON, then validates against the schema. So the mock
  // just emits the JSON-stringified object.
  const doGenerate: DoGenerateFn = async (): Promise<DoGenerateResult> => ({
    ...(await doGenerateOk()),
    content: [{ type: 'text', text: JSON.stringify(object) }],
  })
  return new MockLanguageModelV3({ doGenerate })
}

describe('createAnthropicHaikuProvider', () => {
  it('parses a schema-valid model response into a LabelScanExtraction', async () => {
    const provider = createAnthropicHaikuProvider({
      model: mockReturning(DASSAI_OBJECT),
      zdrActive: true,
      nodeEnv: 'test',
    })

    const result = await provider.extractLabel(jpegBlob())

    expect(result).toEqual(DASSAI_OBJECT)
  })

  it('throws when the model returns a response missing required fields', async () => {
    // The model omitted `confidence` — the schema requires it. We expect
    // the AI SDK's structured-output validation to throw before our
    // provider's belt-and-braces `parse` even runs. Either way the
    // promise rejects: that's the contract callers depend on.
    const provider = createAnthropicHaikuProvider({
      model: mockReturning({ source: 'llm_extracted', name_ja: '獺祭', brewery_ja: '旭酒造' }),
      zdrActive: true,
      nodeEnv: 'test',
    })

    await expect(provider.extractLabel(jpegBlob())).rejects.toThrow()
  })

  it('throws when the model tries to set source to anything other than llm_extracted', async () => {
    // The schema pins `source` to the literal `'llm_extracted'`.
    // A model that tries to relabel its guess as canonical Sakenowa
    // data must fail at the parse seam, not silently propagate.
    const provider = createAnthropicHaikuProvider({
      model: mockReturning({ ...DASSAI_OBJECT, source: 'sakenowa' }),
      zdrActive: true,
      nodeEnv: 'test',
    })

    await expect(provider.extractLabel(jpegBlob())).rejects.toThrow()
  })

  it('sends the image to the model as inline base64 bytes, not a URL', async () => {
    // Capture the call options. CLAUDE.md "Anthropic Files API ban":
    // the image MUST travel as a Uint8Array inline part, never as a
    // URL that the provider might lift to /v1/files. Asserting on the
    // shape we hand to the AI SDK is the same check the audit script
    // codifies, one level deeper.
    let capturedOptions: DoGenerateOptions | undefined
    const captureDoGenerate: DoGenerateFn = async (
      options,
    ): Promise<DoGenerateResult> => {
      capturedOptions = options
      return {
        ...(await doGenerateOk()),
        content: [{ type: 'text', text: JSON.stringify(DASSAI_OBJECT) }],
      }
    }
    const model = new MockLanguageModelV3({ doGenerate: captureDoGenerate })
    const provider = createAnthropicHaikuProvider({
      model,
      zdrActive: true,
      nodeEnv: 'test',
    })

    await provider.extractLabel(jpegBlob('actual-bytes'))

    expect(capturedOptions).toBeDefined()
    // The user message carries text + the image as a file part with
    // binary data (Uint8Array) and the image media type.
    const userMessage = capturedOptions!.prompt.find((msg) => msg.role === 'user')
    expect(userMessage).toBeDefined()
    const userContent = userMessage!.content
    if (!Array.isArray(userContent)) throw new Error('expected array user content')
    const filePart = userContent.find(
      (part) => 'type' in part && part.type === 'file',
    )
    expect(filePart).toBeDefined()
    // The AI SDK normalises an `ImagePart` (the user-facing shape) into a
    // `FilePart` on the provider-facing prompt. `data` is the raw bytes
    // (Uint8Array / Buffer / base64 string), and `mediaType` carries the
    // image type. Critically, the data is NOT a URL — that's what we're
    // asserting here.
    if (!filePart || !('data' in filePart)) throw new Error('expected file part with data')
    // The data must be the raw bytes (Uint8Array / Buffer / base64
    // string), NOT a URL. A URL would let the Anthropic provider lift
    // the upload to /v1/files (which is forbidden by CLAUDE.md and the
    // audit script). Assert the positive shape AND the negative.
    expect(filePart.data instanceof URL).toBe(false)
    const isInlineBytes =
      filePart.data instanceof Uint8Array ||
      filePart.data instanceof ArrayBuffer ||
      typeof filePart.data === 'string'
    expect(isInlineBytes).toBe(true)
    expect(filePart.mediaType).toMatch(/^image\//)
  })

  it('warns once (does NOT throw) in production when ZDR is not active', async () => {
    // ADR-0009 documents 7-day standard Anthropic retention as the
    // acceptable baseline; ZDR is the pre-DACH-launch upgrade, not a
    // hard prerequisite. The provider warns to keep the maintainer
    // honest about flipping ZDR_ACTIVE once the contract lands, but
    // does not refuse to serve traffic — that would brick prod scans
    // for a documented-as-acceptable retention posture.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider = createAnthropicHaikuProvider({
      model: mockReturning(DASSAI_OBJECT),
      zdrActive: false,
      nodeEnv: 'production',
    })

    await expect(provider.extractLabel(jpegBlob())).resolves.toEqual(DASSAI_OBJECT)
    expect(warn).toHaveBeenCalledTimes(1)
    expect(warn.mock.calls[0][0]).toMatch(/Zero Data Retention is not active/)

    // Second call on the same provider must not re-warn — memoised
    // per-factory so a busy production cold start logs once, not on
    // every scan.
    await provider.extractLabel(jpegBlob())
    expect(warn).toHaveBeenCalledTimes(1)

    warn.mockRestore()
  })

  it('does not warn in non-production even when ZDR is not active', async () => {
    // Local dev + CI don't need the reminder; the warning is for the
    // operator who'd be looking at production logs.
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const provider = createAnthropicHaikuProvider({
      model: mockReturning(DASSAI_OBJECT),
      zdrActive: false,
      nodeEnv: 'development',
    })

    await expect(provider.extractLabel(jpegBlob())).resolves.toEqual(DASSAI_OBJECT)
    expect(warn).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
