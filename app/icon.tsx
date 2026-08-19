import { ImageResponse } from "next/og";

export const size = {
  width: 512,
  height: 512,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    <div
      style={{
        alignItems: "center",
        background:
          "radial-gradient(circle at 78% 18%, rgba(68, 244, 170, 0.3), transparent 36%), #07100e",
        border: "18px solid #183a2f",
        color: "#e9fff7",
        display: "flex",
        fontFamily: "monospace",
        height: "100%",
        justifyContent: "center",
        width: "100%",
      }}
    >
      <div
        style={{
          alignItems: "center",
          border: "5px solid #44f4aa",
          borderRadius: 72,
          boxShadow: "0 0 60px rgba(68, 244, 170, 0.24)",
          display: "flex",
          fontSize: 170,
          fontWeight: 800,
          height: 332,
          justifyContent: "center",
          letterSpacing: "-0.12em",
          paddingRight: 20,
          width: 332,
        }}
      >
        IL
      </div>
    </div>,
    size,
  );
}
