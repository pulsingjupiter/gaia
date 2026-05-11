import { ImageResponse } from "next/og";

// Apple touch icon — 180x180 PNG. Reuses the leaf path from
// <GaiaLogo /> (src/components/shell/gaia-logo.tsx) so the home-screen
// icon stays visually identical to the sidebar header logo.

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
          // Subtle off-white card so the green leaf stays legible against
          // any iOS wallpaper. Apple auto-rounds the corners.
          background: "#F8FAFC",
        }}
      >
        <svg
          width="140"
          height="140"
          viewBox="0 0 32 32"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <linearGradient id="gaia-leaf" x1="0" x2="1" y1="0" y2="1">
              <stop offset="0%" stopColor="#34D399" />
              <stop offset="100%" stopColor="#10B981" />
            </linearGradient>
          </defs>
          <path
            d="M28 6c0 11-7 20-19 22 0-11 7-20 19-22z"
            fill="url(#gaia-leaf)"
          />
          <path
            d="M9 28c4-8 9-13 17-17"
            stroke="#FFFFFF"
            strokeWidth="1.6"
            strokeLinecap="round"
            opacity="0.85"
          />
        </svg>
      </div>
    ),
    { ...size }
  );
}
