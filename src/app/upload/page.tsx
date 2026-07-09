"use client";

import { useEffect, useState } from "react";

type UploadResult = {
  id: string;
  type: string;
  url: string;
  status: string;
};

const ROLES = [
  { key: "FACE_FRONT", label: "Face Front" },
  { key: "FACE_SIDE", label: "Face Side" },
  { key: "FULL_BODY", label: "Full Body" },
] as const;

export default function UploadPage() {
  const [sessionInfo, setSessionInfo] = useState<{ anonymousSessionId: string; isNew: boolean } | null>(null);
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
      .then((res) => res.json())
      .then((data) => setSessionInfo(data))
      .catch((err) => console.error("Failed to load anonymous session", err));
  }, []);

  async function handleUpload(role: string, file: File) {
    setLoading((prev) => ({ ...prev, [role]: true }));
    setErrors((prev) => ({ ...prev, [role]: null }));

    const formData = new FormData();
    formData.append("file", file);
    formData.append("role", role);

    try {
      const res = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || "Upload failed");
      }

      setResults((prev) => ({ ...prev, [role]: data }));
    } catch (err) {
      setErrors((prev) => ({
        ...prev,
        [role]: err instanceof Error ? err.message : "Unknown error",
      }));
    } finally {
      setLoading((prev) => ({ ...prev, [role]: false }));
    }
  }

  return (
    <main className="max-w-2xl mx-auto p-8">
      <h1 className="text-2xl font-bold mb-4">Sprint 1 Upload Test</h1>

      {sessionInfo ? (
        <div className="mb-6 p-4 bg-gray-100 rounded">
          <p className="text-sm text-gray-700">Anonymous Session ID: {sessionInfo.anonymousSessionId}</p>
          <p className="text-sm text-gray-700">Is New: {sessionInfo.isNew ? "Yes" : "No"}</p>
        </div>
      ) : (
        <p className="mb-6 text-gray-500">Loading anonymous session...</p>
      )}

      <div className="space-y-6">
        {ROLES.map(({ key, label }) => (
          <div key={key} className="border p-4 rounded">
            <label className="block font-medium mb-2">{label}</label>
            <input
              type="file"
              accept="image/*"
              disabled={loading[key]}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleUpload(key, file);
              }}
              className="block w-full text-sm"
            />
            {loading[key] && <p className="text-blue-600 mt-2">Uploading...</p>}
            {errors[key] && <p className="text-red-600 mt-2">{errors[key]}</p>}
            {results[key] && (
              <div className="mt-2 text-sm text-green-700">
                <p>ID: {results[key].id}</p>
                <p>Status: {results[key].status}</p>
                <a href={results[key].url} target="_blank" rel="noreferrer" className="underline break-all">
                  {results[key].url}
                </a>
              </div>
            )}
          </div>
        ))}
      </div>
    </main>
  );
}
