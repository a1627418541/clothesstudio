import { PersonalTryOnImageProvider } from "./personal-try-on-image-provider";

export const mockPersonalTryOnProvider: PersonalTryOnImageProvider = {
  generate: async () => ({
    url: "https://r2.example/personal-try-on/result.png",
    base64: null,
    error: null,
  }),
};
