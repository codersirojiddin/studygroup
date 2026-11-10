import { SocialIcon } from "@/components/social-icons";
import { SOCIAL_PLATFORMS, socialText, socialUrl, type Socials } from "@/lib/socials";

/** A row of links to a person's other accounts. Renders nothing when there are none. */
export function SocialLinks({ socials }: { socials: Socials | undefined }) {
  const links = SOCIAL_PLATFORMS.flatMap((p) => {
    const handle = socials?.[p.id];
    return handle ? [{ ...p, handle }] : [];
  });
  if (links.length === 0) return null;

  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {links.map((l) => (
        <li key={l.id}>
          <a
            href={socialUrl(l.id, l.handle)}
            target="_blank"
            rel="noopener noreferrer nofollow"
            aria-label={`${l.label}: ${socialText(l.id, l.handle)} (opens in a new tab)`}
            className="group inline-flex max-w-full items-center gap-1.5 rounded-full border bg-card px-3 py-1.5 text-sm text-muted-foreground shadow-xs transition-all hover:-translate-y-0.5 hover:border-brand/50 hover:text-brand hover:shadow-card motion-reduce:transition-none motion-reduce:hover:translate-y-0"
          >
            <SocialIcon platform={l.id} className="size-4 shrink-0 transition-transform group-hover:scale-110" />
            <span className="truncate">{socialText(l.id, l.handle)}</span>
          </a>
        </li>
      ))}
    </ul>
  );
}
