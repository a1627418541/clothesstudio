"use client";

import { useState, useMemo } from "react";
import Link from "next/link";
import { diagnosisFormSchema, DiagnosisFormInput } from "@/lib/validators/diagnosis";
import { ZodError } from "zod";

const ROLES = [
  { key: "FACE_FRONT" as const, label: "Front face photo" },
  { key: "FACE_SIDE" as const, label: "Side face photo" },
  { key: "FULL_BODY" as const, label: "Full body photo" },
];

type UploadStatus = "idle" | "uploading" | "uploaded" | "error";

interface UploadState {
  status: UploadStatus;
  assetId: string | null;
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
  const [uploads, setUploads] = useState<Record<string, UploadState>>({
    FACE_FRONT: { status: "idle", assetId: null, error: null },
    FACE_SIDE: { status: "idle", assetId: null, error: null },
    FULL_BODY: { status: "idle", assetId: null, error: null },
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

  const photoAssetIds = useMemo(() => {
    const ids: Record<string, string> = {};
    for (const { key } of ROLES) {
      if (uploads[key].assetId) {
        ids[key] = uploads[key].assetId as string;
      }
    }
    return ids;
  }, [uploads]);

  async function handleFileSelect(role: string, file: File) {
    setUploads((prev) => ({ ...prev, [role]: { status: "uploading", assetId: null, error: null } }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("role", role);

    try {
      const res = await fetch("/api/upload", { method: "POST", body: formData });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setUploads((prev) => ({ ...prev, [role]: { status: "uploaded", assetId: data.id, error: null } }));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Upload failed";
      setUploads((prev) => ({ ...prev, [role]: { status: "error", assetId: null, error: message } }));
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
    Object.keys(photoAssetIds).length === ROLES.length &&
    form.gender &&
    form.age &&
    form.heightCm &&
    form.weightKg;

  if (result) {
    const rec = result.primaryRecommendation;
    return (
      <main className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-4">Your Primary Style Preview</h1>
        <div className="space-y-4 border rounded-lg p-4">
          <h2 className="text-xl font-semibold">{rec.title}</h2>
          <p>{rec.summary}</p>
          <p><strong>Clothing:</strong> {rec.clothingAdvice}</p>
          <p><strong>Hair:</strong> {rec.hairstyleAdvice}</p>
          <p><strong>Shoes:</strong> {rec.shoesAdvice}</p>
          <p><strong>Colors:</strong> {rec.colorPalette.join(", ")}</p>
          <p><strong>Avoid:</strong> {rec.avoidTips.join(", ")}</p>
        </div>
        <div className="mt-6 flex gap-4">
          <Link
            href={`/diagnosis/${result.id}`}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            View Details
          </Link>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 border rounded hover:bg-gray-50"
          >
            Start Over
          </button>
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-2xl mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Style Diagnosis</h1>

      <section className="space-y-4 mb-8">
        {ROLES.map(({ key, label }) => {
          const upload = uploads[key];
          return (
            <div key={key} className="border rounded-lg p-4">
              <label className="block font-medium mb-2">{label}</label>
              <input
                type="file"
                accept="image/*"
                className="block w-full text-sm"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleFileSelect(key, file);
                }}
              />
              <p className="mt-2 text-sm">
                Status:{" "}
                <span
                  className={
                    upload.status === "error"
                      ? "text-red-600"
                      : upload.status === "uploaded"
                      ? "text-green-600"
                      : "text-gray-600"
                  }
                >
                  {upload.status}
                </span>
              </p>
              {upload.error && <p className="text-sm text-red-600 mt-1">{upload.error}</p>}
            </div>
          );
        })}
        {formErrors.photoAssetIds && <p className="text-sm text-red-600">{formErrors.photoAssetIds}</p>}
      </section>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block font-medium mb-1">Gender</label>
          <select
            value={form.gender}
            onChange={(e) => setForm({ ...form, gender: e.target.value })}
            className="w-full border rounded p-2"
            required
          >
            <option value="">Select gender</option>
            <option value="MALE">Male</option>
            <option value="FEMALE">Female</option>
            <option value="OTHER">Other</option>
          </select>
          {formErrors.gender && <p className="text-sm text-red-600 mt-1">{formErrors.gender}</p>}
        </div>

        <div>
          <label className="block font-medium mb-1">Age</label>
          <input
            type="number"
            min={13}
            max={80}
            value={form.age}
            onChange={(e) => setForm({ ...form, age: e.target.value })}
            className="w-full border rounded p-2"
            required
          />
          {formErrors.age && <p className="text-sm text-red-600 mt-1">{formErrors.age}</p>}
        </div>

        <div>
          <label className="block font-medium mb-1">Height (cm)</label>
          <input
            type="number"
            min={120}
            max={230}
            value={form.heightCm}
            onChange={(e) => setForm({ ...form, heightCm: e.target.value })}
            className="w-full border rounded p-2"
            required
          />
          {formErrors.heightCm && <p className="text-sm text-red-600 mt-1">{formErrors.heightCm}</p>}
        </div>

        <div>
          <label className="block font-medium mb-1">Weight (kg)</label>
          <input
            type="number"
            min={30}
            max={200}
            value={form.weightKg}
            onChange={(e) => setForm({ ...form, weightKg: e.target.value })}
            className="w-full border rounded p-2"
            required
          />
          {formErrors.weightKg && <p className="text-sm text-red-600 mt-1">{formErrors.weightKg}</p>}
        </div>

        {submitError && <p className="text-red-600">{submitError}</p>}

        <button
          type="submit"
          disabled={!canSubmit || submitting}
          className="px-6 py-2 bg-blue-600 text-white rounded disabled:opacity-50 hover:bg-blue-700"
        >
          {submitting ? "Submitting..." : "Submit Diagnosis"}
        </button>
      </form>
    </main>
  );
}
