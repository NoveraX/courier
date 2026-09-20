import { ImageResponse } from "next/og"

export const alt = "Courier — Type-Safe HTTP for Next.js"
export const size = { width: 1200, height: 630 }
export const contentType = "image/png"

export default async function OGImage() {
  return new ImageResponse(
    <div
      style={{
        background: "linear-gradient(135deg, #0a0b14 0%, #0f1029 40%, #130d24 100%)",
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "system-ui, sans-serif",
        position: "relative",
        overflow: "hidden",
      }}
    >
      {/* Gradient orb top-right */}
      <div
        style={{
          position: "absolute",
          top: -120,
          right: -80,
          width: 500,
          height: 500,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(138,92,246,0.25) 0%, transparent 70%)",
        }}
      />
      {/* Gradient orb bottom-left */}
      <div
        style={{
          position: "absolute",
          bottom: -100,
          left: -60,
          width: 400,
          height: 400,
          borderRadius: "50%",
          background: "radial-gradient(circle, rgba(99,179,237,0.2) 0%, transparent 70%)",
        }}
      />

      {/* Icon */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          marginBottom: 32,
        }}
      >
        <svg viewBox="0 0 212 180" width={142} height={120} aria-label="Courier">
          <path fill="#ffffff" d="M212 0H90a90 90 0 0 0 0 180h122l-52-50H90a40 40 0 0 1 0-80h70Z" />
        </svg>
      </div>

      {/* Title */}
      <div
        style={{
          fontSize: 72,
          fontWeight: 800,
          color: "#ffffff",
          letterSpacing: "-0.03em",
          marginBottom: 16,
        }}
      >
        courier
      </div>

      {/* Subtitle */}
      <div
        style={{
          fontSize: 28,
          color: "rgba(255,255,255,0.6)",
          maxWidth: 600,
          textAlign: "center",
          lineHeight: 1.4,
        }}
      >
        Type-Safe HTTP Client for Next.js
      </div>

      {/* Bottom bar */}
      <div
        style={{
          position: "absolute",
          bottom: 40,
          display: "flex",
          alignItems: "center",
          gap: 12,
          fontSize: 18,
          color: "rgba(255,255,255,0.35)",
        }}
      >
        <span>@noverax/courier</span>
        <span style={{ color: "rgba(255,255,255,0.15)" }}>|</span>
        <span>courier.noverax.cloud</span>
      </div>
    </div>,
    { ...size }
  )
}
