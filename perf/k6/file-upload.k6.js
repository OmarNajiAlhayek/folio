import http from 'k6/http';
import { check } from 'k6';
import { loadConfig, rampingStages } from './lib/config.js';
import { suiteThresholds, suiteConfig } from './lib/thresholds.js';

const config = loadConfig();
const cfg = suiteConfig('fileUpload');
const uploadSlug = config.uploadDraftSlug;

const pdfBytes = open('../fixtures/perf-upload.pdf', 'b');

export const options = {
  scenarios: {
    file_upload: rampingStages(cfg),
  },
  thresholds: suiteThresholds('fileUpload'),
};

export default function () {
  if (!config.authorToken || !uploadSlug) {
    throw new Error('perf config missing authorToken or uploadDraftSlug');
  }

  const formData = {
    file: http.file(pdfBytes, `perf-upload-${__VU}-${__ITER}.pdf`, 'application/pdf'),
  };

  const res = http.post(
    `${config.baseUrl}/submissions/${uploadSlug}/files?kind=manuscript`,
    formData,
    {
      headers: {
        Authorization: `Bearer ${config.authorToken}`,
        Accept: 'application/json',
      },
      tags: { endpoint: 'file_upload' },
    },
  );

  check(res, {
    'upload 2xx': (r) => r.status === 200 || r.status === 201,
  });
}

export function handleSummary(data) {
  const out = {
    suite: 'file-upload',
    startedAt: new Date().toISOString(),
    passed: !Object.values(data.metrics ?? {}).some((m) =>
      Object.values(m.thresholds ?? {}).some((t) => t.ok === false),
    ),
    metrics: data.metrics,
    root_group: data.root_group,
  };
  return {
    stdout: JSON.stringify(out, null, 2),
    'reports/file-upload.json': JSON.stringify(out),
  };
}
