import { isAbsolute, join, posix, win32 } from 'path';

function pathIsAbsolute(value: string): boolean {
  return (
    isAbsolute(value) || posix.isAbsolute(value) || win32.isAbsolute(value)
  );
}

/**
 * Manuscript storage root.
 *
 * `UPLOAD_DIR=/srv/folio/uploads` in the container is already absolute.
 * `path.join(cwd, absolute)` does not reset on that second segment, so the
 * seed and multer were creating `/srv/folio/backend/srv/folio/uploads`.
 */
export function resolveUploadRoot(
  uploadDir: string | undefined = process.env.UPLOAD_DIR,
  cwd: string = process.cwd(),
): string {
  const configured = uploadDir?.trim() ?? '';
  if (configured === '') {
    return join(cwd, '..', 'uploads');
  }
  if (pathIsAbsolute(configured)) {
    return configured;
  }
  return join(cwd, configured);
}
