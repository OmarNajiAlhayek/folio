import { join } from 'path';
import { resolveUploadRoot } from './upload-root';

describe('resolveUploadRoot', () => {
  const cwd = '/srv/folio/backend';

  it('uses an absolute UPLOAD_DIR as-is', () => {
    expect(resolveUploadRoot('/srv/folio/uploads', cwd)).toBe(
      '/srv/folio/uploads',
    );
  });

  it('joins a relative UPLOAD_DIR onto the working directory', () => {
    expect(resolveUploadRoot('../uploads', cwd)).toBe(
      join(cwd, '..', 'uploads'),
    );
  });

  it('defaults to ../uploads when UPLOAD_DIR is empty', () => {
    expect(resolveUploadRoot(undefined, cwd)).toBe(join(cwd, '..', 'uploads'));
    expect(resolveUploadRoot('   ', cwd)).toBe(join(cwd, '..', 'uploads'));
  });
});
