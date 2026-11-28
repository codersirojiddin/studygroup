import type { Metadata } from "next";

export const metadata: Metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <>
      <h1>Privacy Policy</h1>
      <p>Last updated: November 28, 2026</p>
      <p>This policy explains what Study Online collects, why, and the choices you have.</p>

      <h2>What we collect</h2>
      <ul>
        <li>Account data: your email address and display name, and your sign-in details if you use Google.</li>
        <li>Study data: your study sessions and their duration, daily goal, to-do tasks, and streak statistics.</li>
        <li>Room data: rooms you create or join, your role in them, and the chat messages you send.</li>
        <li>Presence: whether you are online in a room and what you are studying, shown to that room&apos;s members.</li>
      </ul>

      <h2>How we use it</h2>
      <p>
        We use this data only to run the service: to sign you in, show your progress, power rooms, the shared timer,
        leaderboards and chat, and keep the service secure.
      </p>

      <h2>Cookies</h2>
      <p>We use first-party cookies to keep you signed in. We do not use them to track you across other websites.</p>

      <h2>Who can see your data</h2>
      <p>
        Members of a room can see your display name, online status, focus time in that room, and your messages there.
        If you set a username, your public profile and study heatmap are visible to others. Private rooms are
        accessible by invite code only.
      </p>

      <h2>Service providers</h2>
      <p>
        We store data with a managed PostgreSQL provider (Neon), which also handles sign-in. If you choose Google
        sign-in, Google shares your basic profile with us.
      </p>

      <h2>Your choices</h2>
      <p>
        You can change your display name in your account settings, leave rooms, delete your own messages and tasks,
        and ask us to delete your account and data by writing to <a href="mailto:codersirojiddin@gmail.com">CONTACT_EMAIL</a>.
      </p>

      <h2>Changes</h2>
      <p>If we change this policy, we will update the date above.</p>
    </>
  );
}