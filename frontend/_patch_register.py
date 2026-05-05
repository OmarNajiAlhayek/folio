from pathlib import Path
import re

root = Path(r"c:/Users/ASUS ROG/Documents/Projects/folio/frontend")
reg = root / "src/app/[locale]/register/page.tsx"
s = reg.read_text(encoding="utf-8")

inject = """

function fieldCls(err: boolean, extra = "") {
  const base =
    "rounded-lg border px-3 py-2 text-ink outline-none transition bg-surface focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface";
  const errCls = err ? "border-red-300" : "border-ink/15";
  return [base, errCls, extra].filter(Boolean).join(" ");
}

"""
s = s.replace('} from "@/lib/validation";\n\nexport default', '} from "@/lib/validation";' + inject + '\nexport default')
s = s.replace(
    'const t = useTranslations("Register");\n  const tv',
    'const t = useTranslations("Register");\n  const tNav = useTranslations("Nav");\n  const tv',
)

m = re.search(
    r'  return \(\s*<main className="mx-auto max-w-lg px-4 py-16">(?P<body>.*?)</main>\s*\);',
    s,
    re.S,
)
if not m:
    raise SystemExit("register: main block not found")
body = m.group("body")
body = re.sub(
    r'^\s*<h1 className="font-serif text-3xl font-semibold text-ink">\{t\("title"\)\}</h1>\s*<p className="mt-3 text-sm leading-relaxed text-ink/75">\{t\("hint"\)\}</p>\s*',
    "",
    body,
    count=1,
    flags=re.S,
)

body = body.replace(
    'className={`rounded-md border bg-white px-3 py-2 text-ink outline-none focus:border-accent ${fieldErrors.displayName ? "border-red-300" : "border-ink/15"}`}',
    "className={fieldCls(!!fieldErrors.displayName)}",
)
body = body.replace(
    'className={`rounded-md border bg-white px-3 py-2 text-ink outline-none focus:border-accent ${fieldErrors.email ? "border-red-300" : "border-ink/15"}`}',
    "className={fieldCls(!!fieldErrors.email)}",
)
body = body.replace(
    'className={`rounded-md border bg-white px-3 py-2 text-ink outline-none focus:border-accent ${fieldErrors.password ? "border-red-300" : "border-ink/15"}`}',
    "className={fieldCls(!!fieldErrors.password)}",
)
body = body.replace(
    'className={`rounded-md border bg-white px-3 py-2 text-ink outline-none placeholder:text-ink/35 focus:border-accent ${fieldErrors.affiliation ? "border-red-300" : "border-ink/15"}`}',
    'className={fieldCls(!!fieldErrors.affiliation, "placeholder:text-ink/35")}',
)
body = body.replace(
    'className={`rounded-md border bg-white px-3 py-2 font-mono text-sm text-ink outline-none placeholder:text-ink/35 focus:border-accent ${fieldErrors.orcid ? "border-red-300" : "border-ink/15"}`}',
    'className={fieldCls(!!fieldErrors.orcid, "font-mono text-sm placeholder:text-ink/35")}',
)
body = body.replace(
    'className={`resize-y rounded-md border bg-white px-3 py-2 text-ink outline-none placeholder:text-ink/35 focus:border-accent ${fieldErrors.reviewKeywords ? "border-red-300" : "border-ink/15"}`}',
    'className={fieldCls(!!fieldErrors.reviewKeywords, "resize-y placeholder:text-ink/35")}',
)

body = body.replace(
    '<form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4">',
    '<form onSubmit={onSubmit} className="mt-8 flex flex-col gap-4 lg:mt-0">',
)

new_main = f"""  return (
    <main className="mx-auto max-w-5xl px-4 py-12 sm:py-16">
      <div className="grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-14">
        <div className="hidden flex-col gap-6 lg:flex">
          <p className="font-serif text-xs font-semibold uppercase tracking-[0.2em] text-accent">
            {{tNav("brand")}}
          </p>
          <h1 className="font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
            {{t("title")}}
          </h1>
          <div className="h-px w-16 bg-linear-to-r from-accent to-accent-2/60" />
          <p className="max-w-md text-sm leading-relaxed text-ink/70">
            {{t("sideBlurb")}}
          </p>
          <p className="max-w-md text-sm leading-relaxed text-ink/75">
            {{t("hint")}}
          </p>
        </div>

        <div className="rounded-2xl border border-ink/10 bg-surface/95 p-6 shadow sm:p-8">
          <h1 className="font-serif text-3xl font-semibold text-ink lg:hidden">
            {{t("title")}}
          </h1>
          {body}
        </div>
      </div>
    </main>
  );"""

s2, n = re.subn(
    r'  return \(\s*<main className="mx-auto max-w-lg px-4 py-16">.*?</main>\s*\);',
    new_main,
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit(f"register replace failed n={n}")
reg.write_text(s2, encoding="utf-8")
print("register ok")
