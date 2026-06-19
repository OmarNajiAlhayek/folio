process.env.OTEL_TRACES_EXPORTER = 'none';
process.env.LOG_FORMAT = 'pretty';
/** MathJax path for equation PNG tests (Playwright dynamic import fails under Jest VM). */
process.env.EQUATION_RENDER_MATHJAX_ONLY = '1';
