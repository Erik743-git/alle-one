import { ImageResponse } from "next/og";

import { getAlleSimboloDataUrl } from "@/lib/alle-brand-icon";

export const size = { width: 180, height: 180 };
export const contentType = "image/png";

export default async function AppleIcon() {
  const src = await getAlleSimboloDataUrl();

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
          borderRadius: 36,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={140}
          height={140}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
