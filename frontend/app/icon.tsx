import { ImageResponse } from "next/og";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default function Icon() {
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
          borderRadius: 6,
        }}
      >
        <div
          style={{
            color: "#12b5d9",
            fontSize: 22,
            fontWeight: 800,
            fontFamily: "system-ui, sans-serif",
            letterSpacing: -1,
          }}
        >
          A
        </div>
      </div>
    ),
    { ...size },
  );
}
