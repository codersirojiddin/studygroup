import type { SVGProps } from "react";

import type { SocialPlatform } from "@/lib/socials";

/** Simple line icons for the social networks, drawn to match the lucide icons used elsewhere. */
export function SocialIcon({ platform, ...props }: { platform: SocialPlatform } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...props}
    >
      {platform === "instagram" && (
        <>
          <rect x="3" y="3" width="18" height="18" rx="5" />
          <circle cx="12" cy="12" r="4" />
          <circle cx="17.5" cy="6.5" r="1" fill="currentColor" stroke="none" />
        </>
      )}
      {platform === "twitter" && (
        <>
          <path d="M4 4h3.6L20 20h-3.6z" />
          <path d="M4.5 19.5l6.6-7.2M19.5 4.5l-6.6 7.2" />
        </>
      )}
      {platform === "youtube" && (
        <>
          <rect x="2.5" y="5.5" width="19" height="13" rx="4" />
          <path d="M10 9.5v5l4.5-2.5z" fill="currentColor" />
        </>
      )}
      {platform === "tiktok" && (
        <>
          <path d="M14 4v10.5a3.5 3.5 0 1 1-3.5-3.5" />
          <path d="M14 4c.3 2.3 1.9 4 4.5 4.2" />
        </>
      )}
      {platform === "telegram" && (
        <>
          <path d="M21 4L3 11.2l5.5 2L10 19l3-3.5 4.5 3.3L21 4z" />
          <path d="M8.5 13.2L21 4" />
        </>
      )}
    </svg>
  );
}
