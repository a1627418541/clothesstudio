"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Loader2, User } from "lucide-react";
import { diagnosisFormSchema, DiagnosisFormInput } from "@/lib/validators/diagnosis";
import { ZodError } from "zod";
import { PhotoUploadCard } from "@/components/diagnosis/photo-upload-card";
import { SiteHeader } from "@/components/ui/site-header";
import { EditorialLabel } from "@/components/ui/editorial-label";
import { DiagnosisProgress } from "@/components/diagnosis/diagnosis-progress";

const ROLES = [
  { key: "FACE_FRONT" as const, label: "Front Face" },
  { key: "FACE_SIDE" as const, label: "Side Face" },
  { key: "FULL_BODY" as const, label: "Full Body" },
] as const;

type UploadStatus = "idle" | "uploading" | "uploaded" | "error";
type SessionStatus = "initializing" | "ready" | "error";
type Step = "upload" | "info";

interface UploadState {
  status: UploadStatus;
  assetId: string | null;
  previewUrl: string | null;
  error: string | null;
}

interface RecommendationResult {
  id: string;
  status: string;
  primaryRecommendation: {
    title: string;
    summary: string;
    clothingAdvice: string;
    hairstyleAdvice: string;
    shoesAdvice: string;
    colorPalette: string[];
    avoidTips: string[];
  };
}

export default function DiagnosisPage() {
  const [step, setStep] = useState<Step>("upload");
  const [uploads, setUploads] = useState<Record<string, UploadState>>({
    FACE_FRONT: { status: "idle", assetId: null, previewUrl: null, error: null },
    FACE_SIDE: { status: "idle", assetId: null, previewUrl: null, error: null },
    FULL_BODY: { status: "idle", assetId: null, previewUrl: null, error: null },
  });

  const [form, setForm] = useState({
    gender: "",
    age: "",
    heightCm: "",
    weightKg: "",
    faceTryOnConsent: false,
  });

  const [formErrors, setFormErrors] = useState<Partial<Record<keyof DiagnosisFormInput | "photoAssetIds", string>>>({});
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<RecommendationResult | null>(null);
  const [sessionStatus, setSessionStatus] = useState<SessionStatus>("initializing");

  useEffect(() => {
    fetch("/api/anonymous-session", { method: "GET", credentials: "include" })
      .then((res) => {
        if (!res.ok) {
          throw new Error(`Session initialization failed: ${res.status}`);
        }
        setSessionStatus("ready");
      })
      .catch(() => {
        setSessionStatus("error");
      });
  }, []);

  const photoAssetIds = useMemo(() => {
    const ids: Record<string, string> = {};
    for (const { key } of ROLES) {
      if (uploads[key].assetId) {
        ids[key] = uploads[key].assetId as string;
      }
    }
    return ids;
  }, [uploads]);

  const photosComplete = Object.keys(photoAssetIds).length === ROLES.length;

  async function handleFileSelect(role: string, file: File) {
    if (sessionStatus !== "ready") {
      setUploads((prev) => ({
        ...prev,
        [role]: {
          ...prev[role],
          status: "error",
          error: "Session not ready. Please wait.",
        },
      }));
      return;
    }

    const previewUrl = URL.createObjectURL(file);
    setUploads((prev) => ({
      ...prev,
      [role]: { status: "uploading", assetId: null, previewUrl, error: null },
    }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("role", role);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploads((prev) => ({
        ...prev,
        [role]: { status: "uploaded", assetId: data.id, previewUrl, error: null },
      }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploads((prev) => ({
        ...prev,
        [role]: { status: "error", assetId: null, previewUrl, error: message },
      }));
    }
  }

  function validateForm(): DiagnosisFormInput | null {
    const input = {
      gender: form.gender || undefined,
      age: form.age ? Number(form.age) : undefined,
      heightCm: form.heightCm ? Number(form.heightCm) : undefined,
      weightKg: form.weightKg ? Number(form.weightKg) : undefined,
      photoAssetIds,
      faceTryOnConsent: form.faceTryOnConsent,
    };

    try {
      return diagnosisFormSchema.parse(input);
    } catch (error) {
      if (error instanceof ZodError) {
        const errors: Partial<Record<keyof DiagnosisFormInput | "photoAssetIds", string>> = {};
        for (const issue of error.issues) {
          const path = issue.path.join(".");
          errors[path as keyof typeof errors] = issue.message;
        }
        setFormErrors(errors);
      }
      return null;
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitError(null);
    setFormErrors({});

    const valid = validateForm();
    if (!valid) return;

    setSubmitting(true);

    try {
      const res = await fetch("/api/diagnosis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(valid),
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Submission failed");
      }

      setResult(data);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Submission failed";
      setSubmitError(message);
    } finally {
      setSubmitting(false);
    }
  }

  const canSubmit =
    sessionStatus === "ready" &&
    photosComplete &&
    form.gender &&
    form.age &&
    form.heightCm &&
    form.weightKg;

  if (result) {
    const rec = result.primaryRecommendation;
    return (
      <div className="min-h-screen bg-[var(--paper)]">
        <SiteHeader actionHref="/diagnosis" actionLabel="New diagnosis" compact />
        <main className="editorial-shell py-20">
          <article className="mx-auto max-w-4xl border border-[var(--line)] bg-[var(--surface)] p-12 shadow-[0_28px_80px_rgba(50,39,29,0.1)]">
            <EditorialLabel>Report complete</EditorialLabel>
            <div className="mt-10 grid grid-cols-[1fr_260px] gap-12 border-y border-[var(--line)] py-10">
              <div>
                <h1 className="font-editorial text-6xl font-medium leading-[0.92] text-[var(--ink)]">
                  Your personal style report is ready.
                </h1>
                <p className="mt-6 max-w-xl leading-7 text-[var(--muted-ink)]">
                  Your photographs and profile have been translated into a clear primary direction and two alternatives.
                </p>
              </div>
              <div className="border-l border-[var(--line)] pl-8">
                <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Primary direction</p>
                <h2 className="mt-4 font-editorial text-4xl font-medium text-[var(--oxblood)]">{rec.title}</h2>
                <p className="mt-4 text-sm leading-6 text-[var(--muted-ink)]">{rec.summary}</p>
              </div>
            </div>
            <div className="mt-8 flex items-center justify-between">
              <p className="text-xs uppercase tracking-[0.16em] text-[var(--muted-ink)]">Edition prepared for this session</p>
              <Link href={`/diagnosis/${result.id}`} className="editorial-button px-7">
                View full report
                <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
            </div>
          </article>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[var(--paper)]">
      <SiteHeader actionHref="/" actionLabel="Back home" compact />
      <main className="py-14">
        <div className="editorial-shell max-w-[1180px]">
          <header className="mb-10 grid grid-cols-12 items-end gap-8">
            <div className="col-span-7">
              <EditorialLabel>Personal style diagnosis</EditorialLabel>
              <h1 className="mt-5 font-editorial text-6xl font-medium leading-none text-[var(--ink)]">
                Build your style profile.
              </h1>
            </div>
            <p className="col-span-5 max-w-md justify-self-end text-sm leading-6 text-[var(--muted-ink)]">
              Begin with three clear photographs, then add the practical details that shape proportion and context.
            </p>
          </header>

          <DiagnosisProgress current={step} />

          {sessionStatus === "error" ? (
            <div className="mt-8 border border-[var(--error)] bg-[#fbf3f1] p-4 text-sm text-[var(--error)]" role="alert">
              Failed to initialize the anonymous session. Refresh the page to try again.
            </div>
          ) : null}

          {sessionStatus === "initializing" ? (
            <div className="mt-8 flex items-center gap-3 border border-[var(--line)] bg-[var(--surface)] p-4 text-sm text-[var(--muted-ink)]" role="status">
              <Loader2 className="h-4 w-4 animate-spin text-[var(--oxblood)]" aria-hidden="true" />
              Initializing your private session…
            </div>
          ) : null}

          {step === "upload" ? (
            <section className="mt-10 grid grid-cols-12 gap-10 border-b border-[var(--line)] pb-12">
              <div className="col-span-3">
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oxblood)]">Step 01</p>
                <h2 className="mt-4 font-editorial text-4xl font-medium leading-none">Your photographs</h2>
                <p className="mt-5 text-sm leading-6 text-[var(--muted-ink)]">
                  Use recent, unfiltered photographs with your face and proportions clearly visible.
                </p>
                <ul className="mt-7 space-y-3 text-xs leading-5 text-[var(--muted-ink)]">
                  <li>Natural, even light</li>
                  <li>Simple background</li>
                  <li>No beauty filters</li>
                </ul>
              </div>
              <div className="col-span-9">
                <div className="grid grid-cols-3 gap-5">
                  {ROLES.map(({ key, label }) => (
                    <PhotoUploadCard
                      key={key}
                      role={key}
                      label={label}
                      status={uploads[key].status}
                      previewUrl={uploads[key].previewUrl}
                      error={uploads[key].error}
                      disabled={sessionStatus !== "ready"}
                      onFileSelect={(file) => handleFileSelect(key, file)}
                      onRetry={() => {
                        setUploads((prev) => ({
                          ...prev,
                          [key]: { status: "idle", assetId: null, previewUrl: null, error: null },
                        }));
                      }}
                    />
                  ))}
                </div>
                {formErrors.photoAssetIds ? <p className="mt-4 text-sm text-[var(--error)]">{formErrors.photoAssetIds}</p> : null}
                <div className="mt-8 flex items-center justify-between border-t border-[var(--line)] pt-6">
                  <p className="text-xs text-[var(--muted-ink)]">
                    {photosComplete ? "All three photographs are ready." : "Upload all three photographs to continue."}
                  </p>
                  <button type="button" disabled={!photosComplete} onClick={() => setStep("info")} className="editorial-button px-7 disabled:cursor-not-allowed disabled:opacity-40">
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </button>
                </div>
              </div>
            </section>
          ) : (
            <section className="mt-10 grid grid-cols-12 gap-10 border-b border-[var(--line)] pb-12">
              <aside className="col-span-4">
                <button type="button" onClick={() => setStep("upload")} className="inline-flex items-center gap-2 text-sm font-semibold text-[var(--muted-ink)] hover:text-[var(--oxblood)]">
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" />
                  Back to photographs
                </button>
                <p className="mt-10 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--oxblood)]">Step 02</p>
                <h2 className="mt-4 font-editorial text-5xl font-medium leading-none">Your profile</h2>
                <p className="mt-5 max-w-sm text-sm leading-6 text-[var(--muted-ink)]">
                  These practical measurements help the recommendation account for proportion. They do not change your uploaded photographs.
                </p>
              </aside>

              <form onSubmit={handleSubmit} className="col-span-8 border border-[var(--line)] bg-[var(--surface)] p-8">
                <div className="grid grid-cols-2 gap-6">
                  <fieldset>
                    <legend className="mb-3 text-xs font-semibold uppercase tracking-[0.14em] text-[var(--ink)]">Gender</legend>
                    <div className="grid grid-cols-3 gap-2">
                      {[{ value: "MALE", label: "Male" }, { value: "FEMALE", label: "Female" }, { value: "OTHER", label: "Other" }].map((option) => (
                        <button
                          key={option.value}
                          type="button"
                          onClick={() => setForm({ ...form, gender: option.value })}
                          className={[
                            "min-h-12 border px-3 text-sm font-semibold transition-colors",
                            form.gender === option.value
                              ? "border-[var(--oxblood)] bg-[#f7ecee] text-[var(--oxblood)]"
                              : "border-[var(--line)] text-[var(--ink)] hover:border-[var(--oxblood)]",
                          ].join(" ")}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    {formErrors.gender ? <p id="gender-error" className="mt-2 text-sm text-[var(--error)]">{formErrors.gender}</p> : null}
                  </fieldset>

                  <div>
                    <label htmlFor="age" className="mb-3 block text-xs font-semibold uppercase tracking-[0.14em]">Age</label>
                    <div className="relative">
                      <input id="age" type="number" min={13} max={80} value={form.age} onChange={(event) => setForm({ ...form, age: event.target.value })} className="editorial-field pr-14" placeholder="25" aria-describedby={formErrors.age ? "age-error" : undefined} />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-ink)]">yrs</span>
                    </div>
                    {formErrors.age ? <p id="age-error" className="mt-2 text-sm text-[var(--error)]">{formErrors.age}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="height" className="mb-3 block text-xs font-semibold uppercase tracking-[0.14em]">Height</label>
                    <div className="relative">
                      <User className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-ink)]" aria-hidden="true" />
                      <input id="height" type="number" min={120} max={230} value={form.heightCm} onChange={(event) => setForm({ ...form, heightCm: event.target.value })} className="editorial-field pl-11 pr-14" placeholder="170" aria-describedby={formErrors.heightCm ? "height-error" : undefined} />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-ink)]">cm</span>
                    </div>
                    {formErrors.heightCm ? <p id="height-error" className="mt-2 text-sm text-[var(--error)]">{formErrors.heightCm}</p> : null}
                  </div>

                  <div>
                    <label htmlFor="weight" className="mb-3 block text-xs font-semibold uppercase tracking-[0.14em]">Weight</label>
                    <div className="relative">
                      <input id="weight" type="number" min={30} max={200} value={form.weightKg} onChange={(event) => setForm({ ...form, weightKg: event.target.value })} className="editorial-field pr-14" placeholder="65" aria-describedby={formErrors.weightKg ? "weight-error" : undefined} />
                      <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[var(--muted-ink)]">kg</span>
                    </div>
                    {formErrors.weightKg ? <p id="weight-error" className="mt-2 text-sm text-[var(--error)]">{formErrors.weightKg}</p> : null}
                  </div>
                </div>

                <div className="mt-6 border border-[var(--line)] bg-[var(--paper)] p-5">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={form.faceTryOnConsent}
                      onChange={(event) => setForm({ ...form, faceTryOnConsent: event.target.checked })}
                      className="mt-0.5 h-4 w-4 accent-[var(--oxblood)]"
                    />
                    <span className="text-sm leading-6 text-[var(--muted-ink)]">
                      我同意将我的正面照片用于 AI 生成试穿效果图。该图仅用于本次诊断展示，不会用于其他目的。
                      <span className="block text-xs text-[var(--muted-ink)]/70 mt-1">AI 生成效果图仅供参考，效果因照片质量而异。</span>
                    </span>
                  </label>
                </div>

                {submitError ? <div className="mt-6 border border-[var(--error)] bg-[#fbf3f1] p-4 text-sm text-[var(--error)]" role="alert">{submitError}</div> : null}

                <div className="mt-8 flex items-center justify-between border-t border-[var(--line)] pt-6">
                  <p className="max-w-xs text-xs leading-5 text-[var(--muted-ink)]">
                    Complete every field before generating the report.
                  </p>
                  <button type="submit" disabled={!canSubmit || submitting} className="editorial-button min-w-[230px] px-7 disabled:cursor-not-allowed disabled:opacity-40">
                    {submitting ? <><Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />Analyzing your style…</> : <>Generate style report<ArrowRight className="h-4 w-4" aria-hidden="true" /></>}
                  </button>
                </div>
              </form>
            </section>
          )}
        </div>
      </main>
    </div>
  );
}
