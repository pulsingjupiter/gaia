export function GaiaLogo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none">
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
  );
}
