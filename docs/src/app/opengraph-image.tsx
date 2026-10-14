import { ImageResponse } from "next/og"

export const alt = "Courier — type-safe HTTP for any framework"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

const MARK = "M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z"

export default async function OGImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        background: "#08090a",
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: -260,
          left: 100,
          width: 1000,
          height: 620,
          background: "radial-gradient(ellipse at center, rgba(125,185,255,0.16), transparent 62%)",
        }}
      />
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          height: 44,
          padding: "0 20px",
          border: "1px solid rgba(255,255,255,0.12)",
          borderRadius: 999,
          background: "#101114",
          color: "#a8aeb7",
          fontSize: 21,
        }}
      >
        <svg aria-hidden="true" viewBox="0 0 212 180" width={20} height={17}>
          <path fill="#7db9ff" d={MARK} />
        </svg>
        Inferred types · no schema files · any backend
      </div>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          marginTop: 34,
          fontSize: 80,
          fontWeight: 700,
          lineHeight: 1.04,
          letterSpacing: "-0.04em",
          color: "#f7f8f8",
        }}
      >
        <div style={{ display: "flex" }}>Type-safe HTTP for</div>
        <div style={{ display: "flex" }}>
          <span style={{ color: "#7db9ff" }}>any</span>&nbsp;framework
        </div>
      </div>
      <div style={{ display: "flex", marginTop: 22, fontSize: 28, color: "#a8aeb7" }}>
        Define your API once, in plain TypeScript, against any REST backend
      </div>
      <div
        style={{
          position: "absolute",
          left: 60,
          right: 60,
          bottom: 48,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            color: "#f7f8f8",
            fontSize: 30,
            fontWeight: 700,
          }}
        >
          <svg aria-hidden="true" viewBox="0 0 212 180" width={38} height={32}>
            <path fill="#f7f8f8" d={MARK} />
          </svg>
          courier
        </div>
        <div
          style={{
            display: "flex",
            height: 48,
            alignItems: "center",
            padding: "0 20px",
            border: "1px solid rgba(255,255,255,0.12)",
            borderRadius: 10,
            background: "#101114",
            color: "#a8aeb7",
            fontSize: 22,
          }}
        >
          $&nbsp;<span style={{ color: "#f7f8f8" }}>npx @noverax/create-courier</span>
        </div>
      </div>
    </div>,
    { ...size }
  )
}
