"use client";

import { useState, useMemo, useEffect } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronLeft, Loader2, Sparkles, User } from "lucide-react";
import { diagnosisFormSchema, DiagnosisFormInput } from "@/lib/validators/diagnosis";
import { ZodError } from "zod";
import { PhotoUploadCard } from "@/components/diagnosis/photo-upload-card";

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
      <main className="min-h-screen bg-[#FAFAF8] px-4 py-10 md:px-6">
        <div className="mx-auto max-w-2xl rounded-3xl border border-[#E8E6E1] bg-white p-6 text-center shadow-sm md:p-10">
          <div className="mx-auto mb-6 flex h-16 w-16 items-center justify-center rounded-full bg-[#FFF9F7] text-[#B85C4F]">
            <Sparkles className="h-8 w-8" />
          </div>
          <h1 className="mb-2 text-2xl font-semibold text-[#1A1A1A] md:text-3xl">Your Style Report is Ready</h1>
          <p className="mb-8 text-[#6B6B6B]">
            We&apos;ve analyzed your photos and created a personalized style diagnosis.
          </p>
          <div className="mb-8 space-y-3 rounded-2xl bg-[#FAFAF8] p-5 text-left">
            <h2 className="text-lg font-semibold text-[#1A1A1A]">{rec.title}</h2>
            <p className="text-sm text-[#6B6B6B]">{rec.summary}</p>
          </div>
          <Link
            href={`/diagnosis/${result.id}`}
            className="inline-flex items-center justify-center gap-2 rounded-full bg-[#B85C4F] px-8 py-3 text-sm font-medium text-white transition-colors hover:bg-[#9A4A3F]"
          >
            View Full Report
            <ArrowRight className="h-4 w-4" />
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-[#FAFAF8] px-4 py-6 md:py-10">
      <div className="mx-auto max-w-3xl">
        <header className="mb-8 flex items-center gap-3 md:mb-10">
          <Link
            href="/"
            className="flex h-10 w-10 items-center justify-center rounded-full text-[#6B6B6B] transition-colors hover:bg-white hover:text-[#1A1A1A]"
          >
            <ChevronLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-xl font-semibold text-[#1A1A1A] md:text-2xl">AI Style Studio</h1>
            <p className="text-xs text-[#6B6B6B] md:text-sm">Personal style diagnosis powered by AI</p>
          </div>
        </header>

        <div className="mb-8 flex items-center justify-center gap-2 text-sm">
          {[
            { id: "upload", label: "Upload Photos" },
            { id: "info", label: "Your Profile" },
            { id: "report", label: "Your Report" },
          ].map((s, index) => {
            const isActive = step === s.id || (s.id === "upload" && step === "upload") || (s.id === "info" && step === "info");
            const isPast =
              (s.id === "upload" && step === "info") ||
              (s.id === "upload" && result) ||
              (s.id === "info" && result);
            return (
              <div key={s.id} className="flex items-center gap-2">
                <span
                  className={[
                    "flex h-7 w-7 items-center justify-center rounded-full text-xs font-medium",
                    isActive
                      ? "bg-[#B85C4F] text-white"
                      : isPast
                      ? "bg-[#2E7D5A] text-white"
                      : "bg-[#E8E6E1] text-[#6B6B6B]",
                  ].join(" ")}
                >
                  {isPast ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span
                  className={[
                    "hidden font-medium md:inline",
                    isActive || isPast ? "text-[#1A1A1A]" : "text-[#6B6B6B]",
                  ].join(" ")}
                >
                  {s.label}
                </span>
              </div>
            );
          })}
        </div>

        {sessionStatus === "error" && (
          <div className="mb-6 rounded-2xl border border-[#C73E3E]/30 bg-[#FEF6F6] p-4 text-center text-sm text-[#C73E3E]">
            Failed to initialize anonymous session. Please refresh.
          </div>
        )}

        {sessionStatus === "initializing" && (
          <div className="mb-6 flex items-center justify-center gap-2 rounded-2xl border border-[#E8E6E1] bg-white p-4 text-sm text-[#6B6B6B]">
            <Loader2 className="h-4 w-4 animate-spin text-[#B85C4F]" />
            Initializing session...
          </div>
        )}

        {step === "upload" ? (
          <section className="rounded-3xl border border-[#E8E6E1] bg-white p-5 shadow-sm md:p-8">
            <div className="mb-6">
              <h2 className="text-lg font-semibold text-[#1A1A1A] md:text-xl">Upload your photos</h2>
              <p className="mt-1 text-sm text-[#6B6B6B]">
                We need three photos to build an accurate style profile.
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
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

            {formErrors.photoAssetIds && (
              <p className="mt-4 text-sm text-[#C73E3E]">{formErrors.photoAssetIds}</p>
            )}

            <div className="mt-8 flex justify-end">
              <button
                type="button"
                disabled={!photosComplete}
                onClick={() => setStep("info")}
                className="inline-flex items-center gap-2 rounded-full bg-[#B85C4F] px-6 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#9A4A3F] disabled:cursor-not-allowed disabled:bg-[#E8E6E1] disabled:text-[#9B9B9B]"
              >
                Continue
                <ArrowRight className="h-4 w-4" />
              </button>
            </div>
          </section>
        ) : (
          <section className="rounded-3xl border border-[#E8E6E1] bg-white p-5 shadow-sm md:p-8">
            <div className="mb-6">
              <button
                type="button"
                onClick={() => setStep("upload")}
                className="mb-3 text-sm font-medium text-[#6B6B6B] hover:text-[#B85C4F]"
              >
                ← Back to photos
              </button>
              <h2 className="text-lg font-semibold text-[#1A1A1A] md:text-xl">Tell us about yourself</h2>
              <p className="mt-1 text-sm text-[#6B6B6B]">
                This helps us tailor the recommendations to your body and lifestyle.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-5">
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
                <div>
                  <label className="mb-2 block text-sm font-medium text-[#1A1A1A]">Gender</label>
                  <div className="grid grid-cols-3 gap-2">
                    {[
                      { value: "MALE", label: "Male" },
                      { value: "FEMALE", label: "Female" },
                      { value: "OTHER", label: "Other" },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        onClick={() => setForm({ ...form, gender: option.value })}
                        className={[
                          "rounded-xl border px-3 py-2.5 text-sm font-medium transition-colors",
                          form.gender === option.value
                            ? "border-[#B85C4F] bg-[#FFF9F7] text-[#B85C4F]"
                            : "border-[#E8E6E1] bg-white text-[#1A1A1A] hover:border-[#B85C4F]",
                        ].join(" ")}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                  {formErrors.gender && <p className="mt-1.5 text-sm text-[#C73E3E]">{formErrors.gender}</p>}
                </div>

                <div>
                  <label htmlFor="age" className="mb-2 block text-sm font-medium text-[#1A1A1A]">Age</label>
                  <div className="relative">
                    <input
                      id="age"
                      type="number"
                      min={13}
                      max={80}
                      value={form.age}
                      onChange={(e) => setForm({ ...form, age: e.target.value })}
                      className="w-full rounded-xl border border-[#E8E6E1] bg-white px-4 py-2.5 text-sm text-[#1A1A1A] outline-none transition-colors focus:border-[#B85C4F]"
                      placeholder="25"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#6B6B6B]">yrs</span>
                  </div>
                  {formErrors.age && <p className="mt-1.5 text-sm text-[#C73E3E]">{formErrors.age}</p>}
                </div>

                <div>
                  <label htmlFor="height" className="mb-2 block text-sm font-medium text-[#1A1A1A]">Height</label>
                  <div className="relative">
                    <User className="absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#6B6B6B]" />
                    <input
                      id="height"
                      type="number"
                      min={120}
                      max={230}
                      value={form.heightCm}
                      onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
                      className="w-full rounded-xl border border-[#E8E6E1] bg-white py-2.5 pl-10 pr-12 text-sm text-[#1A1A1A] outline-none transition-colors focus:border-[#B85C4F]"
                      placeholder="170"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#6B6B6B]">cm</span>
                  </div>
                  {formErrors.heightCm && <p className="mt-1.5 text-sm text-[#C73E3E]">{formErrors.heightCm}</p>}
                </div>

                <div>
                  <label htmlFor="weight" className="mb-2 block text-sm font-medium text-[#1A1A1A]">Weight</label>
                  <div className="relative">
                    <input
                      id="weight"
                      type="number"
                      min={30}
                      max={200}
                      value={form.weightKg}
                      onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
                      className="w-full rounded-xl border border-[#E8E6E1] bg-white px-4 py-2.5 pr-12 text-sm text-[#1A1A1A] outline-none transition-colors focus:border-[#B85C4F]"
                      placeholder="65"
                    />
                    <span className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-sm text-[#6B6B6B]">kg</span>
                  </div>
                  {formErrors.weightKg && <p className="mt-1.5 text-sm text-[#C73E3E]">{formErrors.weightKg}</p>}
                </div>
              </div>

              {submitError && (
                <div className="rounded-xl border border-[#C73E3E]/30 bg-[#FEF6F6] p-4 text-sm text-[#C73E3E]">
                  {submitError}
                </div>
              )}

              <button
                type="submit"
                disabled={!canSubmit || submitting}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-[#B85C4F] px-6 py-3.5 text-sm font-medium text-white transition-colors hover:bg-[#9A4A3F] disabled:cursor-not-allowed disabled:bg-[#E8E6E1] disabled:text-[#9B9B9B]"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Analyzing your style...
                  </>
                ) : (
                  <>Generate My Style Report</>
                )}
              </button>
            </form>
          </section>
        )}
      </div>
    </main>
  );
}
