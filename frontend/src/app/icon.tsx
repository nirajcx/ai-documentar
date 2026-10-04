import { ImageResponse } from "next/og";

export const size = {
  width: 32,
  height: 32,
};
export const contentType = "image/png";

export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 18,
          background: "#047857", // Emerald 700
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          borderRadius: "8px",
          fontWeight: 800,
          fontFamily: "sans-serif",
          boxShadow: "inset 0 0 4px rgba(255,255,255,0.3)",
        }}
      >
        AD
      </div>
    ),
    {
      ...size,
    }
  );
}
