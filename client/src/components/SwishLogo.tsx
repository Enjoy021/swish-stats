export function SwishLogo({ size = 48, className = "" }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 64 64"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="Swish Stats logo"
      className={className}
    >
      {/* Hoop / rim */}
      <ellipse cx="32" cy="22" rx="14" ry="4" stroke="currentColor" strokeWidth="2.5" opacity="0.9" />
      
      {/* Net lines */}
      <path d="M20 22 L24 40" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <path d="M26 25 L28 42" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <path d="M32 26 L32 44" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <path d="M38 25 L36 42" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      <path d="M44 22 L40 40" stroke="currentColor" strokeWidth="1.2" opacity="0.4" />
      
      {/* Net cross lines */}
      <path d="M22 28 L42 28" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
      <path d="M24 34 L40 34" stroke="currentColor" strokeWidth="0.8" opacity="0.25" />
      
      {/* Basketball */}
      <circle cx="42" cy="14" r="8" stroke="hsl(17 100% 60%)" strokeWidth="2.5" fill="none" />
      {/* Ball lines */}
      <path d="M42 6 L42 22" stroke="hsl(17 100% 60%)" strokeWidth="1.2" />
      <path d="M34 14 L50 14" stroke="hsl(17 100% 60%)" strokeWidth="1.2" />
      <path d="M36 8.5 Q42 14 36 19.5" stroke="hsl(17 100% 60%)" strokeWidth="1" />
      <path d="M48 8.5 Q42 14 48 19.5" stroke="hsl(17 100% 60%)" strokeWidth="1" />
      
      {/* Motion / swish lines */}
      <path d="M14 10 L18 12" stroke="hsl(17 100% 60%)" strokeWidth="1.5" strokeLinecap="round" opacity="0.6" />
      <path d="M12 14 L17 15" stroke="hsl(17 100% 60%)" strokeWidth="1.5" strokeLinecap="round" opacity="0.4" />
      <path d="M14 18 L18 17" stroke="hsl(17 100% 60%)" strokeWidth="1.5" strokeLinecap="round" opacity="0.3" />
      
      {/* Bottom text area line */}
      <text x="32" y="56" textAnchor="middle" fill="currentColor" fontSize="7" fontWeight="700" fontFamily="'DM Sans', sans-serif" letterSpacing="1.5">
        SWISH STATS
      </text>
    </svg>
  );
}

export function SwishLogoFull({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col items-center ${className}`}>
      <SwishLogo size={80} />
      <p className="text-[10px] text-muted-foreground mt-1 tracking-wider uppercase">
        Powered by Swish N' Dish
      </p>
    </div>
  );
}
