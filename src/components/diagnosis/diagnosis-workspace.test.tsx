import { renderToStaticMarkup } from "react-dom/server";
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
});
