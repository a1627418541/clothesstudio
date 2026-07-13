"use client";

import { Camera, Check, Loader2, RefreshCw, X } from "lucide-react";
import { useRef } from "react";

export type PhotoUploadStatus = "idle" | "uploading" | "uploaded" | "error";

interface PhotoUploadCardProps {
  role: string;
  label: string;
  status: PhotoUploadStatus;
  previewUrl?: string | null;
  error?: string | null;
  disabled?: boolean;
  onFileSelect: (file: File) => void;
  onRetry?: () => void;
}

const ROLE_HINTS: Record<string, string> = {
  FACE_FRONT: "Clear, well-lit front face",
  FACE_SIDE: "Side profile with visible jawline",
  FULL_BODY: "Full body, standing naturally",
};

export function PhotoUploadCard({
  role,
  label,
  status,
  previewUrl,
  error,
  disabled,
  onFileSelect,
  onRetry,
}: PhotoUploadCardProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const showPreview = status === "uploaded" && previewUrl;

  const openPicker = () => {
    if (!disabled) inputRef.current?.click();
  };

  const handleChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    onFileSelect(file);
    event.target.value = "";
  };

  return (
    <div
      onClick={openPicker}
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled || undefined}
      onKeyDown={(event) => {
        if (!disabled && (event.key === "Enter" || event.key === " ")) {
          event.preventDefault();
          openPicker();
        }
      }}
      className={[
        "group relative flex aspect-[4/5] flex-col items-center justify-center rounded-[2px] border border-dashed p-4 text-center transition-colors duration-200",
        "border-[var(--line)] bg-[var(--surface)] hover:border-[var(--oxblood)] hover:bg-white",
        status === "error" ? "border-[var(--error)] bg-[#fbf3f1]" : "",
        showPreview ? "border-solid border-[var(--line)]" : "",
        disabled ? "cursor-not-allowed opacity-60" : "cursor-pointer",
      ].join(" ")}
    >
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        disabled={disabled}
        className="sr-only"
        onChange={handleChange}
        aria-label={`Upload ${label}`}
      />

      {status === "uploading" ? (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-[2px] bg-[var(--surface)]/90 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-[var(--oxblood)]" aria-hidden="true" />
          <p className="mt-3 text-sm font-medium text-[var(--ink)]">Uploading photograph…</p>
        </div>
      ) : null}

      {showPreview ? (
        <div className="relative flex h-full w-full flex-col overflow-hidden">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewUrl} alt={`Uploaded ${label}`} className="h-full w-full object-cover" />
          <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-4 pt-12">
            <p className="text-xs font-semibold uppercase tracking-[0.12em] text-white">{label}</p>
          </div>
          <span className="absolute right-2 top-2 flex items-center gap-1 bg-[var(--success)] px-2 py-1 text-[0.62rem] font-semibold uppercase tracking-[0.12em] text-white">
            <Check className="h-3 w-3" aria-hidden="true" />
            Uploaded
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="mb-5 flex h-12 w-12 items-center justify-center border border-[var(--line)] text-[var(--muted-ink)] group-hover:border-[var(--oxblood)] group-hover:text-[var(--oxblood)]">
            {status === "error" ? <X className="h-5 w-5" aria-hidden="true" /> : <Camera className="h-5 w-5" aria-hidden="true" />}
          </div>
          <p className="text-sm font-semibold uppercase tracking-[0.1em] text-[var(--ink)]">{label}</p>
          <p className="mt-2 max-w-[12rem] text-xs leading-5 text-[var(--muted-ink)]">
            {ROLE_HINTS[role] || "Select a photograph"}
          </p>
          {status === "error" && error ? (
            <div className="mt-3">
              <p className="text-xs text-[var(--error)]">{error}</p>
              {onRetry ? (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onRetry();
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-[var(--oxblood)] hover:text-[var(--oxblood-hover)]"
                >
                  <RefreshCw className="h-3 w-3" aria-hidden="true" />
                  Retry
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      )}
    </div>
  );
}
