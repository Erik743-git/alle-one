import { ImageResponse } from "next/og";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default function AppleIcon() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#08182f",
          borderRadius: 32,
        }}
      >
        <div
          style={{
            color: "#12b5d9",
            fontSize: 96,
            fontWeight: 800,
            fontFamily: "system-ui, sans-serif",
            letterSpacing: -4,
          }}
        >
          A
        </div>
      </div>
    ),
    { ...size },
  );
}
