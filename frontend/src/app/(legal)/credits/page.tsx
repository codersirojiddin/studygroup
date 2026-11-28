import type { Metadata } from "next";

export const metadata: Metadata = { title: "Credits" };

export default function CreditsPage() {
  return (
    <>
      <h1>Credits</h1>
      <p>Study Online uses the following third-party work.</p>

      <h2>Sobo mascot</h2>
      <p>
        “
        <a href="https://rive.app/marketplace/28761-54484-sobo/" target="_blank" rel="noopener noreferrer">
          Sobo
        </a>
        ” by{" "}
        <a href="https://rive.app/@Patgrivet/" target="_blank" rel="noopener noreferrer">
          Patgrivet
        </a>{" "}
        is licensed under{" "}
        <a href="https://creativecommons.org/licenses/by/4.0/" target="_blank" rel="noopener noreferrer">
          CC BY 4.0
        </a>
        .
      </p>
      <p>Changes made: the background was removed and the animation file was adapted for use in this app.</p>
    </>
  );
}