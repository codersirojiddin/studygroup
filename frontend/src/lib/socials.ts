/** Social networks a profile can link to. The API stores only the handle; links are built here. */
export type SocialPlatform = "instagram" | "twitter" | "youtube" | "tiktok" | "telegram";
export type Socials = Partial<Record<SocialPlatform, string>>;

export const SOCIAL_PLATFORMS: { id: SocialPlatform; label: string; placeholder: string }[] = [
  { id: "instagram", label: "Instagram", placeholder: "username or instagram.com/…" },
  { id: "twitter", label: "X (Twitter)", placeholder: "username or x.com/…" },
  { id: "youtube", label: "YouTube", placeholder: "@handle or youtube.com/@…" },
  { id: "tiktok", label: "TikTok", placeholder: "@username or tiktok.com/@…" },
  { id: "telegram", label: "Telegram", placeholder: "username or t.me/… (profile or channel)" },
];

const youtubeChannelId = /^UC[A-Za-z0-9_-]{22}$/;

/** The public URL for a stored handle. The handle is encoded, and the host is fixed. */
export function socialUrl(platform: SocialPlatform, handle: string): string {
  const h = encodeURIComponent(handle);
  switch (platform) {
    case "instagram":
      return `https://instagram.com/${h}`;
    case "twitter":
      return `https://x.com/${h}`;
    case "youtube":
      return youtubeChannelId.test(handle) ? `https://www.youtube.com/channel/${h}` : `https://www.youtube.com/@${h}`;
    case "tiktok":
      return `https://www.tiktok.com/@${h}`;
    case "telegram":
      return `https://t.me/${h}`;
  }
}

/** What to show next to the icon. */
export function socialText(platform: SocialPlatform, handle: string): string {
  if (platform === "youtube" && youtubeChannelId.test(handle)) return "YouTube channel";
  return `@${handle}`;
}
