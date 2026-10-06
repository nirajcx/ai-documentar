import type { DocumentStatus } from "./types";

export const MAX_PDF_BYTES = 25 * 1024 * 1024;
export const indexing = (status: DocumentStatus) => ["queued", "parsing", "chunking", "embedding"].includes(status);
export const documentStatusLabel: Record<DocumentStatus, string> = {
  queued: "Queued", parsing: "Reading pages", chunking: "Splitting text", embedding: "Creating embeddings",
  ready: "Ready", needs_ocr: "Needs OCR", failed: "Failed",
};
export function pdfValidationError(file: Pick<File, "name" | "size">): string | null {
  if (!file.name.toLowerCase().endsWith(".pdf")) return "Only PDF files are supported.";
  if (!file.size) return "The file is empty.";
  if (file.size > MAX_PDF_BYTES) return "Each PDF must be 25 MB or smaller.";
  return null;
}
