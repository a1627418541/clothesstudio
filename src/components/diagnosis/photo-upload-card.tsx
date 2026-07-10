"use client";

import { Camera, Loader2, RefreshCw, X } from "lucide-react";
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

  const handleClick = () => {
    if (!disabled) {
      inputRef.current?.click();
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onFileSelect(file);
      e.target.value = "";
    }
  };

  const showPreview = status === "uploaded" && previewUrl;

  return (
    <div
      onClick={handleClick}
      role="button"
      tabIndex={disabled ? -1 : 0}
      onKeyDown={(e) => {
        if (!disabled && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          handleClick();
        }
      }}
      className={[
        "group relative flex aspect-square flex-col items-center justify-center rounded-2xl border-2 border-dashed p-4 text-center transition-all",
        "border-[#E8E6E1] bg-white hover:border-[#B85C4F] hover:bg-[#FFF9F7]",
        status === "error" ? "border-[#C73E3E] bg-[#FEF6F6]" : "",
        showPreview ? "border-solid border-[#E8E6E1] bg-[#FAFAF8]" : "",
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

      {status === "uploading" && (
        <div className="absolute inset-0 z-10 flex flex-col items-center justify-center rounded-2xl bg-white/80 backdrop-blur-sm">
          <Loader2 className="h-8 w-8 animate-spin text-[#B85C4F]" />
          <p className="mt-3 text-sm font-medium text-[#1A1A1A]">Uploading...</p>
        </div>
      )}

      {showPreview ? (
        <div className="relative flex h-full w-full flex-col overflow-hidden rounded-xl">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={previewUrl}
            alt={`Uploaded ${label}`}
            className="h-full w-full object-cover"
          />
          <div className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/60 to-transparent p-3">
            <p className="text-xs font-medium text-white">{label}</p>
          </div>
          <span className="absolute right-2 top-2 flex h-5 w-5 items-center justify-center rounded-full bg-[#2E7D5A] text-white">
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path d="M2 6L5 9L10 3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
        </div>
      ) : (
        <div className="flex flex-col items-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-[#FAFAF8] text-[#6B6B6B] group-hover:bg-[#FFF0EC] group-hover:text-[#B85C4F]">
            {status === "error" ? <X className="h-5 w-5" /> : <Camera className="h-5 w-5" />}
          </div>
          <p className="text-sm font-medium text-[#1A1A1A]">{label}</p>
          <p className="mt-1 text-xs text-[#6B6B6B]">{ROLE_HINTS[role] || "Tap to upload"}</p>
          {status === "error" && error && (
            <div className="mt-3">
              <p className="text-xs text-[#C73E3E]">{error}</p>
              {onRetry && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onRetry();
                  }}
                  className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-[#B85C4F] hover:text-[#9A4A3F]"
                >
                  <RefreshCw className="h-3 w-3" />
                  Retry
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
