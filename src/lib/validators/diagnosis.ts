import { z } from "zod";

export const diagnosisPhotoAssetIdsSchema = z.object({
  FACE_FRONT: z.string().min(1, "Front face photo is required"),
  FACE_SIDE: z.string().min(1, "Side face photo is required"),
  FULL_BODY: z.string().min(1, "Full body photo is required"),
});

export const diagnosisFormSchema = z.object({
  gender: z.enum(["MALE", "FEMALE", "OTHER"]),
  age: z.number().int().min(13).max(80),
  heightCm: z.number().int().min(120).max(230),
  weightKg: z.number().int().min(30).max(200),
  photoAssetIds: diagnosisPhotoAssetIdsSchema,
  faceTryOnConsent: z.boolean().default(false),
});

export type DiagnosisFormInput = z.infer<typeof diagnosisFormSchema>;
