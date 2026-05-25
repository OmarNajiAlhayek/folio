import { EquationRenderService } from './equation-render.service';

describe('EquationRenderService', () => {
  const service = new EquationRenderService();

  it('renders valid LaTeX to a PNG buffer', async () => {
    const buf = await service.renderLatexToPng('E=mc^2');
    expect(buf.length).toBeGreaterThan(100);
    expect(buf.subarray(0, 8).toString('hex')).toMatch(/^89504e47/);
  });

  it('throws on invalid LaTeX', async () => {
    await expect(service.renderLatexToPng('\\badcmd')).rejects.toThrow();
  });
});
