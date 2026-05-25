import { apiUpload } from "@/lib/api";
import type { ConstructorContent } from "@/lib/constructor-content.types";

export type ImportConstructorDocxResult = {
  content: ConstructorContent;
  warnings: string[];
  warningCodes?: string[];
};

export async function importConstructorDocx(
  file: File,
): Promise<ImportConstructorDocxResult> {
  return apiUpload("/submissions/import-docx-to-constructor", file) as Promise<
    ImportConstructorDocxResult
  >;
}
