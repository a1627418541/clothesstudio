import { renderToStaticMarkup } from "react-dom/server";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { DiagnosisProgress } from "./diagnosis-progress";
import { PhotoUploadCard } from "./photo-upload-card";

describe("diagnosis workspace", () => {
  it("announces the active step", () => {
    const html = renderToStaticMarkup(<DiagnosisProgress current="info" />);

    expect(html).toContain('aria-current="step"');
    expect(html).toContain("Your profile");
  });

  it("keeps an accessible upload name and portrait frame", () => {
    const html = renderToStaticMarkup(
      <PhotoUploadCard
        role="FACE_FRONT"
        label="Front face"
        status="idle"
        onFileSelect={vi.fn()}
      />
    );

    expect(html).toContain('aria-label="Upload Front face"');
    expect(html).toContain("aspect-[4/5]");
    expect(html).toContain("Clear, well-lit front face");
  });

  it("defaults to an approved total-outfit budget and includes it in the submitted payload", () => {
    const source = readFileSync(resolve("src/app/diagnosis/page.tsx"), "utf8");

    expect(source).toContain('budgetTier: "FROM_500_TO_1000"');
    expect(source).toContain("budgetTier: form.budgetTier");
  });

  it("connects consent and per-recommendation try-on requests in sequence", () => {
    const source = readFileSync(resolve("src/app/diagnosis/[id]/page.tsx"), "utf8");

    expect(source).toContain("/try-on-consent");
    expect(source).toContain("JSON.stringify({ consent: true, deleteGenerated: false })");
    expect(source).toContain("postPersonalTryOn({");
    expect(source).not.toContain("/recommendations/${recommendationId}/try-on`");
    const consentIndex = source.indexOf("const consentResponse");
    const refreshIndex = source.indexOf("await fetchDiagnosis();", consentIndex);
    const requestIndex = source.indexOf("postPersonalTryOn({", consentIndex);
    expect(consentIndex).toBeGreaterThan(-1);
    expect(refreshIndex).toBeGreaterThan(consentIndex);
    expect(requestIndex).toBeGreaterThan(refreshIndex);
    expect(source).toContain("onGenerateTryOn={() => void requestTryOn(recommendation.id)}");

    const requestSource = readFileSync(
      resolve("src/lib/personal-try-on/personal-try-on-request.ts"),
      "utf8"
    );
    expect(requestSource).toContain(
      "/recommendations/${input.recommendationId}/personal-try-on"
    );
    expect(source).toContain('"REGENERATE_COMPLETED"');
    expect(source).toContain('"RETRY_FAILED"');
  });
});
