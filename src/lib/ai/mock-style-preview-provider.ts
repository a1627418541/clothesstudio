import { StylePreviewImageProvider } from "./style-preview-image-provider";

const MOCK_IMAGES: Record<number, string> = {
  1: "https://images.unsplash.com/photo-1489987707025-afc232f7ea0f?w=1024&q=80",
  2: "https://images.unsplash.com/photo-1507679799987-c73779587ccf?w=1024&q=80",
  3: "https://images.unsplash.com/photo-1529139574466-a303027c1d8b?w=1024&q=80",
};

export const mockStylePreviewProvider: StylePreviewImageProvider = {
  generate: async ({ prompt }) => {
    const hash = prompt.split("").reduce((acc, char) => acc + char.charCodeAt(0), 0);
    const rank = (hash % 3) + 1;
    return { url: MOCK_IMAGES[rank] };
  },
};
