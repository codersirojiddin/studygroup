/** The cheers a member can send. The server accepts only these names (see Hub.React in the Go backend). */
export const REACTIONS = [
  { name: "fire", glyph: "🔥", label: "Fire" },
  { name: "clap", glyph: "👏", label: "Applause" },
  { name: "heart", glyph: "❤️", label: "Love" },
  { name: "muscle", glyph: "💪", label: "Strong" },
  { name: "rocket", glyph: "🚀", label: "Rocket" },
] as const;

export type ReactionName = (typeof REACTIONS)[number]["name"];

/** A cheer as the server broadcasts it to everyone in the room. */
export type Reaction = { from: string; fromName: string; to: string; emoji: ReactionName };

export const glyphOf = (name: string) => REACTIONS.find((r) => r.name === name)?.glyph ?? "✨";
