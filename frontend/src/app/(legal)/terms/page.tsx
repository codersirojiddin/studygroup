import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <>
      <h1>Terms of Service</h1>
      <p>Last updated: November 28, 2026</p>
      <p>By using Study Online you agree to these terms.</p>

      <h2>Your account</h2>
      <p>
        You are responsible for your account and for activity under it. Provide accurate information and keep your
        sign-in details safe.
      </p>

      <h2>Acceptable use</h2>
      <ul>
        <li>Do not harass, threaten or spam other users, in chat or elsewhere.</li>
        <li>Do not post illegal, hateful or sexually explicit content.</li>
        <li>Do not try to break, overload or gain unauthorized access to the service.</li>
        <li>Do not fake or manipulate study time to cheat leaderboards.</li>
      </ul>

      <h2>Rooms and content</h2>
      <p>
        You own what you post, and you allow us to store and display it to the people it is meant for (for example, a
        room&apos;s members). Room owners and moderators may remove members and messages in their rooms. We may remove
        content or accounts that break these terms.
      </p>

      <h2>Availability</h2>
      <p>
        The service is provided &quot;as is&quot; without warranties. We may change, pause or stop features at any
        time, and we are not liable for losses caused by downtime or lost data, to the extent the law allows.
      </p>

      <h2>Ending your use</h2>
      <p>You can stop using the service at any time. We may suspend accounts that violate these terms.</p>

      <h2>Changes and contact</h2>
      <p>
        We may update these terms and will change the date above. Questions:{" "}
        <a href="mailto:codersirojiddin@gmail.com">CONTACT_EMAIL</a>. See also our <Link href="/privacy">Privacy Policy</Link>.
      </p>
    </>
  );
}