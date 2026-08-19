import { ImageResponse } from "next/og";

export const alt =
  "InstructLint — verify that agent instructions match repository evidence";
export const size = {
  width: 1200,
  height: 630,
};
export const contentType = "image/png";

const badgeStyle = {
  border: "1px solid rgba(129, 230, 184, 0.35)",
  borderRadius: 999,
  color: "#b7f7d2",
  fontSize: 22,
  padding: "10px 18px",
};

export default function OpenGraphImage() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "stretch",
        background:
          "radial-gradient(circle at 88% 12%, rgba(43, 193, 124, 0.23), transparent 34%), #07100e",
        color: "#f0fff7",
        display: "flex",
        flexDirection: "column",
        fontFamily: "monospace",
        height: "100%",
        justifyContent: "space-between",
        padding: "58px 64px",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          color: "#81e6b8",
          display: "flex",
          fontSize: 25,
          letterSpacing: "0.12em",
        }}
      >
        INSTRUCTLINT / REPOSITORY VERIFICATION
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 26 }}>
        <div
          style={{
            display: "flex",
            fontFamily: "sans-serif",
            fontSize: 70,
            fontWeight: 750,
            letterSpacing: "-0.045em",
            lineHeight: 1.05,
            maxWidth: 1000,
          }}
        >
          Do your agent instructions match the repo?
        </div>
        <div
          style={{
            color: "#a9c5b8",
            display: "flex",
            fontFamily: "sans-serif",
            fontSize: 30,
          }}
        >
          Deterministic drift evidence and suggested instruction patches.
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <div style={badgeStyle}>AGENTS.md</div>
          <div style={badgeStyle}>CLAUDE.md</div>
          <div style={badgeStyle}>Copilot</div>
          <div style={badgeStyle}>Cursor</div>
        </div>
      </div>

      <div
        style={{
          alignItems: "center",
          borderTop: "1px solid rgba(129, 230, 184, 0.24)",
          display: "flex",
          fontSize: 24,
          justifyContent: "space-between",
          paddingTop: 24,
        }}
      >
        <div style={{ color: "#f0fff7", display: "flex", gap: 28 }}>
          <span>Free public-repo preview</span>
          <span style={{ color: "#81e6b8" }}>$1 USDC full report</span>
        </div>
        <div style={{ color: "#81e6b8", display: "flex" }}>x402 · Base</div>
      </div>
    </div>,
    size,
  );
}
