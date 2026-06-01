import { ImageResponse } from "next/og";

import { getAlleSimboloDataUrl } from "@/lib/alle-brand-icon";

export const size = { width: 32, height: 32 };
export const contentType = "image/png";

export default async function Icon() {
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
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={28}
          height={28}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { ...size },
  );
}
