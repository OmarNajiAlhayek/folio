import * as Handlebars from 'handlebars';

/** Table-based shell aligned with Folio frontend tokens (ink, paper, accent). */
export const FOLIO_EMAIL_LAYOUT_PARTIAL = `<!DOCTYPE html>
<html lang="{{lang}}" dir="{{dir}}" xmlns="http://www.w3.org/1999/xhtml">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta http-equiv="X-UA-Compatible" content="IE=edge" />
  <title>Folio</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f3ee;" data-folio-email="1">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f4f3ee;">
    <tr>
      <td align="center" style="padding:24px 12px;">
        <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;">
          <tr>
            <td style="padding:0 0 16px 0;border-bottom:3px solid #c45c3e;">
              <span style="font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:bold;color:#0f172a;letter-spacing:-0.02em;">Folio</span>
            </td>
          </tr>
          <tr>
            <td style="background-color:#fffcf7;border:1px solid #e2e0d8;border-radius:8px;padding:32px 28px;font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#0f172a;">
              {{> @partial-block }}
            </td>
          </tr>
          <tr>
            <td style="padding:20px 8px 0;font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.5;color:#64748b;text-align:center;">
              Folio journal workflow &middot; This is an automated message.
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

export const FOLIO_EMAIL_BUTTON_PARTIAL = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:14px 0;">
  <tr>
    <td align="{{align}}">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td bgcolor="#c45c3e" style="border-radius:6px;">
            <a href="{{href}}" target="_blank" style="display:inline-block;padding:11px 22px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">{{label}}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

export const FOLIO_EMAIL_BUTTON_SECONDARY_PARTIAL = `<table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin:8px 0 14px;">
  <tr>
    <td align="{{align}}">
      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
        <tr>
          <td bgcolor="#fffcf7" style="border-radius:6px;border:2px solid #c45c3e;">
            <a href="{{href}}" target="_blank" style="display:inline-block;padding:9px 20px;font-family:Arial,Helvetica,sans-serif;font-size:15px;font-weight:bold;color:#c45c3e;text-decoration:none;">{{label}}</a>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

export const FOLIO_EMAIL_LINK_STYLE =
  'color:#3d5a4a;text-decoration:underline;';

let registered = false;

/** Idempotent; safe to call before every compile in tests. */
export function registerFolioEmailPartials(): void {
  if (registered) return;
  Handlebars.registerPartial('folio-email-layout', FOLIO_EMAIL_LAYOUT_PARTIAL);
  Handlebars.registerPartial('folio-email-button', FOLIO_EMAIL_BUTTON_PARTIAL);
  Handlebars.registerPartial(
    'folio-email-button-secondary',
    FOLIO_EMAIL_BUTTON_SECONDARY_PARTIAL,
  );
  registered = true;
}

/** @internal Test helper */
export function resetFolioEmailPartialsForTests(): void {
  registered = false;
  delete Handlebars.partials['folio-email-layout'];
  delete Handlebars.partials['folio-email-button'];
  delete Handlebars.partials['folio-email-button-secondary'];
}
