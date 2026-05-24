import { ImageResponse } from 'next/og'

export const alt = 'Yawaragi — a companion for discovering sake.'
export const size = { width: 1200, height: 630 }
export const contentType = 'image/png'

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          background: '#171717',
          color: '#fafafa',
          fontFamily:
            "system-ui, -apple-system, 'Hiragino Sans', 'Noto Sans CJK JP', 'Yu Gothic', sans-serif",
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 420,
            height: '100%',
            fontSize: 320,
            fontWeight: 500,
            background: '#0a0a0a',
          }}
        >
          和
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'column',
            justifyContent: 'center',
            padding: '0 64px',
            gap: 24,
            flex: 1,
          }}
        >
          <div style={{ fontSize: 96, fontWeight: 600, letterSpacing: -2 }}>
            Yawaragi
          </div>
          <div style={{ fontSize: 36, color: '#d4d4d8', lineHeight: 1.3 }}>
            A companion for discovering sake.
          </div>
          <div
            style={{
              fontSize: 22,
              color: '#71717a',
              marginTop: 32,
              letterSpacing: 1,
            }}
          >
            yawaragi.dev
          </div>
        </div>
      </div>
    ),
    size,
  )
}
