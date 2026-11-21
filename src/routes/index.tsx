import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

// The game itself is a plain static site in public/stickclash (classic scripts, no build step),
// so it also runs by double-clicking index.html. This route just forwards to it.
const GAME_URL = "/stickclash/index.html";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "STICK CLASH — instant stickman fights on one device" },
      {
        name: "description",
        content:
          "Stickman fighting in your browser: play a bot or a friend on one keyboard or touchscreen. No install, no account, works offline.",
      },
      { property: "og:title", content: "STICK CLASH — instant stickman fights on one device" },
      {
        property: "og:description",
        content: "Couch multiplayer on ONE device: 3 wild modes, bot or friend, no installs or accounts.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: Index,
});

function Index() {
  useEffect(() => {
    window.location.replace(GAME_URL + window.location.search);
  }, []);
  return (
    <main className="flex min-h-screen items-center justify-center bg-background px-4">
      <a href={GAME_URL} className="rounded-md bg-primary px-6 py-3 text-lg font-bold text-primary-foreground">
        Play STICK CLASH
      </a>
    </main>
  );
}
