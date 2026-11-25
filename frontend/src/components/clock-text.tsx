import { cx } from "@/components/ui";

/**
 * A clock such as "12:34" whose digits tick: only the digit that changed slides up into place.
 * Use with a tabular or monospaced font so the width never jumps. Screen readers get the plain text.
 */
export function ClockText({ value, className }: { value: string; className?: string }) {
  return (
    <span className={className}>
      <span aria-hidden>
        {[...value].map((ch, i) => (
          // The key includes the character, so React re-mounts (and re-animates) just the changed digit.
          <span key={`${i}:${ch}`} className={cx(ch !== ":" && "animate-digit")}>
            {ch}
          </span>
        ))}
      </span>
      <span className="sr-only">{value}</span>
    </span>
  );
}
