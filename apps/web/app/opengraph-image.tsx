import { ImageResponse } from "next/og";

export const alt = "OppRadar: every funding round is a job opening that hasn't been posted yet.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OgImage() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        background: "#f4f2ee",
        padding: 72,
        fontFamily: "Georgia, serif",
        color: "#12151c",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 16,
          fontSize: 30,
          fontFamily: "sans-serif",
          fontWeight: 700,
        }}
      >
        <div
          style={{
            width: 36,
            height: 36,
            borderRadius: 999,
            border: "4px solid #12151c",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <div style={{ width: 10, height: 10, borderRadius: 999, background: "#e8551e" }} />
        </div>
        OppRadar
      </div>
      <div style={{ display: "flex", flexDirection: "column", fontSize: 76, lineHeight: 1.05 }}>
        <span>Every funding round is a job opening</span>
        <span style={{ color: "#e8551e", fontStyle: "italic" }}>
          that hasn&apos;t been posted yet.
        </span>
      </div>
      <div style={{ display: "flex", fontSize: 26, fontFamily: "sans-serif", color: "#5b6472" }}>
        Funding, acquisitions and hiring signals, scored for you and emailed first. Open source.
      </div>
    </div>,
    size,
  );
}
