from pathlib import Path
import re
root = Path(r"c:/Users/ASUS ROG/Documents/Projects/folio/frontend")
login = root / "src/app/[locale]/login/page.tsx"
s = login.read_text(encoding="utf-8")
inject = """

function inputCls(err: boolean) {
  return `rounded-lg border px-3 py-2 text-ink outline-none transition focus-visible:border-accent focus-visible:ring-2 focus-visible:ring-accent/35 focus-visible:ring-offset-2 focus-visible:ring-offset-surface bg-surface-muted/80 ${
    err ? "border-red-300" : "border-ink/15"
  }`;
}

"""
s = s.replace('} from "@/lib/validation";\n\nexport default', '} from "@/lib/validation";' + inject + '\nexport default')
s = s.replace('const t = useTranslations("Login");\n  const tv', 'const t = useTranslations("Login");\n  const tNav = useTranslations("Nav");\n  const tv')
new_main = """  return (
    <main className=\"mx-auto max-w-5xl px-4 py-12 sm:py-16\">
      <div className=\"grid gap-10 lg:grid-cols-2 lg:items-start lg:gap-14\">
        <div className=\"hidden flex-col gap-6 lg:flex\">
          <p className=\"font-serif text-xs font-semibold uppercase tracking-[0.2em] text-accent\">
            {tNav(\"brand\")}
          </p>
          <h1 className=\"font-serif text-3xl font-semibold tracking-tight text-ink sm:text-4xl\">
            {t(\"title\")}
          </h1>
          <div className=\"h-px w-16 bg-linear-to-r from-accent to-accent-2/60\" />
          <p className=\"max-w-md text-sm leading-relaxed text-ink/70\">
            {t(\"sideBlurb\")}
          </p>
        </div>

        <div className=\"rounded-2xl border border-ink/10 bg-surface/95 p-6 shadow sm:p-8\">
          <h1 className=\"font-serif text-3xl font-semibold text-ink lg:hidden\">
            {t(\"title\")}
          </h1>
          {showDevHint && (
            <p className=\"mt-3 text-xs leading-relaxed text-ink/50 lg:mt-0\">
              {t(\"demoHint\", {
                email: \"editor@folio.local\",
                password: \"Editor123!\",
                seedCmd: \"npm run seed\",
                backend: \"backend\",
              })}
            </p>
          )}
          <form onSubmit={onSubmit} className=\"mt-8 flex flex-col gap-4\">
            {error && (
              <p className=\"rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800\">
                {error}
              </p>
            )}
            <label className=\"flex flex-col gap-1 text-sm\">
              <span className=\"font-medium text-ink\">{t(\"email\")}</span>
              <input
                type=\"text\"
                inputMode=\"email\"
                autoComplete=\"email\"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setEmailError(null);
                }}
                aria-invalid={!!emailError}
                className={inputCls(!!emailError)}
              />
              {emailError && (
                <span className=\"text-sm text-red-700\">{emailError}</span>
              )}
            </label>
            <label className=\"flex flex-col gap-1 text-sm\">
              <span className=\"font-medium text-ink\">{t(\"password\")}</span>
              <input
                type=\"password\"
                autoComplete=\"current-password\"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  setPasswordError(null);
                }}
                aria-invalid={!!passwordError}
                className={inputCls(!!passwordError)}
              />
              {passwordError && (
                <span className=\"text-sm text-red-700\">{passwordError}</span>
              )}
            </label>
            <button
              type=\"submit\"
              disabled={loading}
              className=\"mt-2 rounded-md bg-accent py-2.5 text-sm font-medium text-white disabled:opacity-60\"
            >
              {loading ? t(\"signingIn\") : t(\"signIn\")}
            </button>
          </form>
          <p className=\"mt-6 text-center text-sm text-ink/70\">
            {t(\"noAccount\")}{\" \"}
            <Link
              href=\"/register\"
              className=\"font-medium text-accent hover:underline\"
            >
              {t(\"registerLink\")}
            </Link>
          </p>
        </div>
      </div>
    </main>
  );"""
s2, n = re.subn(
    r'  return \(\s*<main className="mx-auto max-w-md px-4 py-16">.*?</main>\s*\);',
    new_main,
    s,
    count=1,
    flags=re.S,
)
if n != 1:
    raise SystemExit(f"login main replace failed, n={n}")
login.write_text(s2, encoding="utf-8")
print("login ok")
