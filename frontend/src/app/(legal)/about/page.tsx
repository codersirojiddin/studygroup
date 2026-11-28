import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "About" };

export default function AboutPage() {
  return (
    <>
      <h1>About Study Online</h1>
      <p>
        Study Online is a place to study together with people around the world. Join a study room, run a shared
        Pomodoro timer, track your focus time, keep a to-do list and see how you rank on the room&apos;s weekly
        leaderboard.
      </p>

      <h2>What you can do</h2>
      <ul>
        <li>Create public or private study rooms and invite friends with a code.</li>
        <li>Focus together with a shared Pomodoro timer and live presence.</li>
        <li>Chat with the room and keep the messages saved.</li>
        <li>Set a daily goal and follow your streak, weekly totals and heatmap.</li>
      </ul>

      <h2>Contact</h2>
      <p>
        Questions or feedback? Write to <a href="mailto:codersirojiddin@gmail.com">CONTACT_EMAIL</a>. See also our{" "}
        <Link href="/privacy">Privacy Policy</Link>, <Link href="/terms">Terms of Service</Link> and{" "}
        <Link href="/credits">Credits</Link>.
      </p>
    </>
  );
}