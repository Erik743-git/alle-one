import { ImageResponse } from "next/og";

import { getAlleSimboloDataUrl } from "@/lib/alle-brand-icon";

type PwaIconOptions = {
  size: number;
  padding: number;
  borderRadius?: number;
};

export async function createPwaIconResponse({
  size,
  padding,
  borderRadius = 0,
}: PwaIconOptions): Promise<ImageResponse> {
  const src = await getAlleSimboloDataUrl();
  const logoSize = size - padding * 2;

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
          borderRadius,
        }}
      >
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={src}
          alt=""
          width={logoSize}
          height={logoSize}
          style={{ objectFit: "contain" }}
        />
      </div>
    ),
    { width: size, height: size },
  );
}
