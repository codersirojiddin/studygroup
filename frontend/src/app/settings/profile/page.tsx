"use client";

import { Check, Loader2 } from "lucide-react";
import Link from "next/link";
import { useEffect, useState, type FormEvent } from "react";

import { AppShell, PageHeader } from "@/components/app-header";
import { SocialIcon } from "@/components/social-icons";
import { Alert, Button, Card, CardBody, ErrorText, Field, Input, Skeleton, Textarea } from "@/components/ui";
import { api } from "@/lib/api";
import { SOCIAL_PLATFORMS, type SocialPlatform } from "@/lib/socials";
import type { Me } from "@/lib/types";

const BIO_MAX = 160;
const handleRe = /^[a-z0-9_]{3,20}$/;

type SocialInputs = Record<SocialPlatform, string>;
const noSocials: SocialInputs = { instagram: "", twitter: "", youtube: "", tiktok: "", telegram: "" };

type Availability = { name: string; available: boolean; reason?: string };

export default function ProfileSettings() {
  const [me, setMe] = useState<Me | null>(null);
  const [username, setUsername] = useState("");
  const [bio, setBio] = useState("");
  const [socials, setSocials] = useState<SocialInputs>(noSocials);
  const [isPublic, setIsPublic] = useState(true);
  const [check, setCheck] = useState<Availability | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api<Me>("/api/me")
      .then((m) => {
        setMe(m);
        setUsername(m.username ?? "");
        setBio(m.bio);
        setSocials({ ...noSocials, ...m.socials });
        setIsPublic(m.profilePublic);
      })
      .catch((e: Error) => setError(e.message));
  }, []);

  const name = username.trim().toLowerCase().replace(/^@/, "");
  const handleChanged = me !== null && name !== (me.username ?? "") && name !== "";
  const formatError = name !== "" && !handleRe.test(name) ? "Use 3-20 characters: a-z, 0-9 and _." : null;

  // Ask the server whether the handle is free, once typing pauses.
  useEffect(() => {
    if (!handleChanged || formatError) return;
    const timer = setTimeout(async () => {
      try {
        const r = await api<{ available: boolean; reason?: string }>(
          `/api/users/check?username=${encodeURIComponent(name)}`,
        );
        setCheck({ name, ...r });
      } catch {
        /* the save itself reports real errors */
      }
    }, 350);
    return () => clearTimeout(timer);
  }, [name, handleChanged, formatError]);

  const result = check && check.name === name ? check : null;
  const checking = handleChanged && !formatError && !result;
  const taken = handleChanged && result !== null && !result.available;

  const socialsChanged =
    me !== null && SOCIAL_PLATFORMS.some((p) => socials[p.id].trim() !== (me.socials?.[p.id] ?? ""));
  const dirty =
    me !== null && (handleChanged || bio.trim() !== me.bio || isPublic !== me.profilePublic || socialsChanged);
  const canSave = dirty && !formatError && !taken && !checking && !saving;

  async function save(e: FormEvent) {
    e.preventDefault();
    if (!canSave) return;
    setSaving(true);
    setError(null);
    setSaved(false);
    try {
      const updated = await api<Me>("/api/me/profile", {
        method: "PATCH",
        body: JSON.stringify({
          username: handleChanged ? name : undefined,
          bio: bio.trim(),
          profilePublic: isPublic,
          // Replaces all links; the server turns pasted links into plain usernames.
          socials: socialsChanged
            ? Object.fromEntries(SOCIAL_PLATFORMS.map((p) => [p.id, socials[p.id].trim()]))
            : undefined,
        }),
      });
      setMe(updated);
      setUsername(updated.username ?? "");
      setBio(updated.bio);
      setSocials({ ...noSocials, ...updated.socials });
      setIsPublic(updated.profilePublic);
      setSaved(true);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <AppShell>
      <PageHeader
        title="Your profile"
        description="Choose how you appear to other people on Study Online."
        actions={
          me?.username && (
            <Link
              href={`/u/${me.username}`}
              className="inline-flex h-9 items-center rounded-lg border border-border bg-card px-4 text-sm font-medium shadow-xs hover:bg-accent"
            >
              View profile
            </Link>
          )
        }
      />

      {!me && !error && <Skeleton className="h-96 max-w-xl" />}

      {me && (
        <Card className="max-w-xl">
          <CardBody>
            <form onSubmit={save} className="flex flex-col gap-5">
              <Field label="Username" hint="Your public link will be /u/username. You can change it later.">
                <div className="relative">
                  <span className="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-sm text-muted-foreground">
                    @
                  </span>
                  <Input
                    value={username}
                    onChange={(e) => {
                      setUsername(e.target.value);
                      setSaved(false);
                    }}
                    className="pr-9 pl-7"
                    maxLength={21}
                    autoCapitalize="none"
                    autoCorrect="off"
                    spellCheck={false}
                    placeholder="yourname"
                  />
                  <span className="absolute top-1/2 right-3 -translate-y-1/2 text-muted-foreground">
                    {checking && <Loader2 className="size-4 animate-spin" />}
                    {handleChanged && result?.available && <Check className="size-4 text-brand" />}
                  </span>
                </div>
              </Field>
              <ErrorText>{formatError ?? (taken ? result?.reason : null)}</ErrorText>

              <Field label="Bio" hint={`${bio.length}/${BIO_MAX}`}>
                <Textarea
                  value={bio}
                  onChange={(e) => {
                    setBio(e.target.value);
                    setSaved(false);
                  }}
                  maxLength={BIO_MAX}
                  placeholder="What are you studying for?"
                />
              </Field>

              <fieldset className="flex min-w-0 flex-col gap-3 border-0 p-0">
                <legend className="text-sm font-medium">Social links</legend>
                <p className="text-xs text-muted-foreground">
                  Shown on your public profile so people can find you elsewhere. Paste a link or just your username.
                </p>
                {SOCIAL_PLATFORMS.map((p) => (
                  <div key={p.id} className="relative">
                    <SocialIcon
                      platform={p.id}
                      className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                    />
                    <Input
                      aria-label={p.label}
                      value={socials[p.id]}
                      onChange={(e) => {
                        setSocials((s) => ({ ...s, [p.id]: e.target.value }));
                        setSaved(false);
                      }}
                      placeholder={`${p.label}: ${p.placeholder}`}
                      className="pl-9"
                      maxLength={200}
                      autoCapitalize="none"
                      autoCorrect="off"
                      spellCheck={false}
                    />
                  </div>
                ))}
              </fieldset>

              <label className="flex items-start gap-3">
                <input
                  type="checkbox"
                  checked={isPublic}
                  onChange={(e) => {
                    setIsPublic(e.target.checked);
                    setSaved(false);
                  }}
                  className="mt-0.5 size-4 accent-brand"
                />
                <span>
                  <span className="block text-sm font-medium">Public profile</span>
                  <span className="block text-xs text-muted-foreground">
                    Anyone with the link can see your name, bio, study heatmap and streaks, and you show up in search.
                    Your email and what you study are never shown.
                  </span>
                </span>
              </label>

              <ErrorText>{error}</ErrorText>
              {saved && <Alert tone="brand">Saved.</Alert>}

              <div>
                <Button type="submit" variant="brand" disabled={!canSave} loading={saving}>
                  Save changes
                </Button>
              </div>
            </form>
          </CardBody>
        </Card>
      )}
    </AppShell>
  );
}
