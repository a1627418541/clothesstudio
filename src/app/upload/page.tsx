"use client";

import { useEffect, useState } from "react";
import { Check, Loader2, Upload } from "lucide-react";
import { EditorialLabel } from "@/components/ui/editorial-label";
import { SiteHeader } from "@/components/ui/site-header";

type UploadResult = {
  id: string;
  type: string;
  url: string;
  status: string;
};

const roles = [
  {
    key: "FACE_FRONT",
    number: "01",
    label: "Front portrait",
    instruction: "A clear, straight-on portrait in even light.",
  },
  {
    key: "FACE_SIDE",
    number: "02",
    label: "Side profile",
    instruction: "A clean profile view with your face unobstructed.",
  },
  {
    key: "FULL_BODY",
    number: "03",
    label: "Full silhouette",
    instruction: "A head-to-toe photograph in fitted, neutral clothing.",
  },
] as const;

export default function UploadPage() {
  const [sessionInfo, setSessionInfo] = useState<{
    anonymousSessionId: string;
    isNew: boolean;
  } | null>(null);
  const [results, setResults] = useState<Record<string, UploadResult | null>>({
    FACE_FRONT: null,
    FACE_SIDE: null,
    FULL_BODY: null,
  });
  const [loading, setLoading] = useState<Record<string, boolean>>({
    FACE_FRONT: false,
    FACE_SIDE: false,
    FULL_BODY: false,
  });
  const [errors, setErrors] = useState<Record<string, string | null>>({
    FACE_FRONT: null,
    FACE_SIDE: null,
    FULL_BODY: null,
  });

  useEffect(() => {
    fetch("/api/anonymous-session")
      .then((response) => response.json())
      .then((data) => setSessionInfo(data))
      .catch((error) =>
        console.error("Failed to load anonymous session", error)
      );
  }, []);

  async function handleUpload(role: string, file: File) {
    setLoading((previous) => ({ ...previous, [role]: true }));
    setErrors((previous) => ({ ...previous, [role]: null }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("role", role);

    try {
      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setResults((previous) => ({ ...previous, [role]: data }));
    } catch (error) {
      setErrors((previous) => ({
        ...previous,
        [role]: error instanceof Error ? error.message : "Unknown error",
      }));
    } finally {
      setLoading((previous) => ({ ...previous, [role]: false }));
    }
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <SiteHeader actionHref="/diagnosis" actionLabel="Full diagnosis" compact />

      <main className="editorial-shell max-w-[1240px] py-12">
        <header className="grid grid-cols-[1fr_420px] gap-16 border-b border-[var(--line)] pb-10">
          <div>
            <EditorialLabel>Internal image pipeline</EditorialLabel>
            <h1 className="mt-6 max-w-3xl font-editorial text-7xl font-medium leading-[0.88]">
              Upload validation
            </h1>
          </div>
          <div className="self-end">
            <p className="text-sm leading-7 text-[var(--muted-ink)]">
              Validate each required photograph independently before entering the
              full diagnosis flow. This page uses the same upload endpoint and
              anonymous session as production.
            </p>
            <div className="mt-5 border-t border-[var(--line)] pt-4">
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--muted-ink)]">
                Anonymous session
              </p>
              {sessionInfo ? (
                <div className="mt-2 flex items-center justify-between gap-5">
                  <code className="truncate text-xs text-[var(--ink)]">
                    {sessionInfo.anonymousSessionId}
                  </code>
                  <span className="shrink-0 text-xs text-[var(--oxblood)]">
                    {sessionInfo.isNew ? "New session" : "Active session"}
                  </span>
                </div>
              ) : (
                <p className="mt-2 text-xs text-[var(--muted-ink)]">
                  Loading session…
                </p>
              )}
            </div>
          </div>
        </header>

        <section className="grid grid-cols-3 gap-6 py-10" aria-label="Upload slots">
          {roles.map(({ key, number, label, instruction }) => {
            const result = results[key];
            const error = errors[key];
            const isLoading = loading[key];

            return (
              <article
                key={key}
                className="border border-[var(--line)] bg-[var(--surface)]"
              >
                <div className="flex items-center justify-between border-b border-[var(--line)] px-6 py-4">
                  <span className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--oxblood)]">
                    Frame {number}
                  </span>
                  <span className="text-[10px] uppercase tracking-[0.14em] text-[var(--muted-ink)]">
                    {result ? "Uploaded" : "Required"}
                  </span>
                </div>

                <div className="p-6">
                  <div className="flex aspect-[4/5] flex-col items-center justify-center border border-dashed border-[var(--line-strong)] bg-[#eee8df] px-8 text-center">
                    {isLoading ? (
                      <>
                        <Loader2
                          className="h-8 w-8 animate-spin text-[var(--oxblood)]"
                          aria-hidden="true"
                        />
                        <p className="mt-5 text-xs font-semibold uppercase tracking-[0.14em]">
                          Uploading
                        </p>
                      </>
                    ) : result ? (
                      <>
                        <span className="flex h-12 w-12 items-center justify-center rounded-full border border-[var(--oxblood)] text-[var(--oxblood)]">
                          <Check className="h-5 w-5" aria-hidden="true" />
                        </span>
                        <p className="mt-5 font-editorial text-3xl">Frame received</p>
                        <p className="mt-2 text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">
                          Status: {result.status}
                        </p>
                      </>
                    ) : (
                      <>
                        <Upload
                          className="h-7 w-7 text-[var(--oxblood)]"
                          aria-hidden="true"
                        />
                        <p className="mt-5 font-editorial text-3xl">{label}</p>
                        <p className="mt-3 text-sm leading-6 text-[var(--muted-ink)]">
                          {instruction}
                        </p>
                      </>
                    )}
                  </div>

                  <label className="editorial-button mt-5 flex w-full cursor-pointer justify-center px-5">
                    {result ? "Replace photograph" : "Choose photograph"}
                    <input
                      type="file"
                      accept="image/*"
                      disabled={isLoading}
                      onChange={(event) => {
                        const file = event.target.files?.[0];
                        if (file) void handleUpload(key, file);
                      }}
                      className="sr-only"
                    />
                  </label>

                  {error ? (
                    <p
                      className="mt-4 border-l-2 border-[var(--error)] pl-3 text-xs leading-5 text-[var(--error)]"
                      role="alert"
                    >
                      {error}
                    </p>
                  ) : null}

                  {result ? (
                    <div className="mt-4 border-t border-[var(--line)] pt-4 text-xs leading-5 text-[var(--muted-ink)]">
                      <p className="truncate">Asset {result.id}</p>
                      <a
                        href={result.url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block font-semibold text-[var(--oxblood)] hover:text-[var(--oxblood-hover)]"
                      >
                        Open uploaded asset
                      </a>
                    </div>
                  ) : null}
                </div>
              </article>
            );
          })}
        </section>

        <footer className="flex items-center justify-between border-t border-[var(--line)] py-6">
          <p className="text-xs uppercase tracking-[0.14em] text-[var(--muted-ink)]">
            QA surface · production upload contract
          </p>
          <p className="text-xs text-[var(--muted-ink)]">
            JPG, PNG or WebP · one image per frame
          </p>
        </footer>
      </main>
    </div>
  );
}
