import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { normalizeOrcidId } from './orcid-id.util';

export type OrcidTokenResponse = {
  accessToken: string;
  orcid: string;
  name?: string;
};

export type OrcidPersonProfile = {
  orcid: string;
  displayName: string;
  email: string | null;
  emailVerified: boolean;
  affiliation: string | null;
};

type OrcidPersonJson = {
  name?: {
    'given-names'?: { value?: string };
    'family-name'?: { value?: string };
  };
  emails?: {
    email?: Array<{
      email?: string;
      verified?: boolean;
      primary?: boolean;
    }>;
  };
  'researcher-urls'?: {
    'researcher-url'?: Array<{ url?: { value?: string } }>;
  };
};

@Injectable()
export class OrcidOAuthService {
  private readonly logger = new Logger(OrcidOAuthService.name);

  constructor(private readonly config: ConfigService) {}

  isEnabled(): boolean {
    return (
      this.config.get<string>('ORCID_ENABLED', 'false') === 'true' &&
      !!this.config.get<string>('ORCID_CLIENT_ID') &&
      !!this.config.get<string>('ORCID_CLIENT_SECRET')
    );
  }

  private apiBase(): string {
    return (
      this.config.get<string>('ORCID_API_BASE')?.replace(/\/+$/, '') ??
      'https://sandbox.orcid.org'
    );
  }

  private publicApiBase(): string {
    return (
      this.config.get<string>('ORCID_PUBLIC_API_BASE')?.replace(/\/+$/, '') ??
      'https://pub.sandbox.orcid.org'
    );
  }

  redirectUri(): string {
    const explicit = this.config.get<string>('ORCID_REDIRECT_URI')?.trim();
    if (explicit) {
      return explicit.replace(/\/+$/, '');
    }
    const appBase = this.config
      .get<string>('APP_BASE_URL', '')
      .replace(/\/+$/, '');
    return `${appBase}/api/v1/auth/orcid/callback`;
  }

  scopes(): string {
    return (
      this.config.get<string>('ORCID_SCOPES') ?? '/authenticate /read-limited'
    );
  }

  buildAuthorizeUrl(state: string): string {
    const params = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('ORCID_CLIENT_ID'),
      response_type: 'code',
      scope: this.scopes(),
      redirect_uri: this.redirectUri(),
      state,
    });
    return `${this.apiBase()}/oauth/authorize?${params.toString()}`;
  }

  async exchangeCode(code: string): Promise<OrcidTokenResponse> {
    if (this.isMockMode()) {
      return this.mockExchange(code);
    }
    const body = new URLSearchParams({
      client_id: this.config.getOrThrow<string>('ORCID_CLIENT_ID'),
      client_secret: this.config.getOrThrow<string>('ORCID_CLIENT_SECRET'),
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.redirectUri(),
    });
    const res = await fetch(`${this.apiBase()}/oauth/token`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(
        `ORCID token exchange failed (${res.status}): ${text.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException({
        message: 'ORCID sign-in is temporarily unavailable',
        code: 'ORCID_UNAVAILABLE',
      });
    }
    const json = (await res.json()) as {
      access_token?: string;
      orcid?: string;
      name?: string;
    };
    const orcid = json.orcid ? normalizeOrcidId(json.orcid) : null;
    if (!json.access_token || !orcid) {
      throw new ServiceUnavailableException({
        message: 'ORCID sign-in returned an incomplete response',
        code: 'ORCID_UNAVAILABLE',
      });
    }
    return {
      accessToken: json.access_token,
      orcid,
      name: json.name,
    };
  }

  async fetchPerson(
    accessToken: string,
    orcid: string,
  ): Promise<OrcidPersonProfile> {
    if (this.isMockMode()) {
      return this.mockPerson(orcid);
    }
    const res = await fetch(`${this.publicApiBase()}/v3.0/${orcid}/person`, {
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    });
    if (!res.ok) {
      const text = await res.text();
      this.logger.warn(
        `ORCID person fetch failed (${res.status}): ${text.slice(0, 200)}`,
      );
      throw new ServiceUnavailableException({
        message: 'Could not load your ORCID profile',
        code: 'ORCID_UNAVAILABLE',
      });
    }
    const json = (await res.json()) as OrcidPersonJson;
    const given = json.name?.['given-names']?.value?.trim() ?? '';
    const family = json.name?.['family-name']?.value?.trim() ?? '';
    const displayName = [given, family].filter(Boolean).join(' ').trim();
    const emails = json.emails?.email ?? [];
    const primary =
      emails.find((e) => e.primary && e.email) ??
      emails.find((e) => e.verified && e.email) ??
      emails.find((e) => e.email);
    const email = primary?.email?.trim().toLowerCase() ?? null;
    const emailVerified = primary?.verified === true;
    return {
      orcid,
      displayName: displayName || `ORCID ${orcid}`,
      email,
      emailVerified,
      affiliation: null,
    };
  }

  private isMockMode(): boolean {
    return (
      this.config.get<string>('NODE_ENV') === 'test' &&
      this.config.get<string>('ORCID_MOCK_ENABLED') === 'true'
    );
  }

  private mockExchange(code: string): OrcidTokenResponse {
    const map: Record<string, OrcidTokenResponse> = {
      'mock-new-user': {
        accessToken: 'mock-token-new',
        orcid: '0000-0001-2345-6789',
        name: 'Mock New User',
      },
      'mock-existing-orcid': {
        accessToken: 'mock-token-existing',
        orcid: '0000-0002-1825-0097',
        name: 'Mock Existing',
      },
      'mock-email-conflict': {
        accessToken: 'mock-token-conflict',
        orcid: '0000-0003-3333-3333',
        name: 'Mock Conflict',
      },
      'mock-link': {
        accessToken: 'mock-token-link',
        orcid: '0000-0004-4444-4444',
        name: 'Mock Link',
      },
    };
    const hit = map[code];
    if (!hit) {
      throw new ServiceUnavailableException({
        message: 'Invalid mock ORCID code',
        code: 'ORCID_UNAVAILABLE',
      });
    }
    return hit;
  }

  private mockPerson(orcid: string): OrcidPersonProfile {
    const profiles: Record<string, OrcidPersonProfile> = {
      '0000-0001-2345-6789': {
        orcid: '0000-0001-2345-6789',
        displayName: 'Mock New User',
        email: `orcid-new-${Date.now()}@folio.local`,
        emailVerified: true,
        affiliation: 'Mock University',
      },
      '0000-0002-1825-0097': {
        orcid: '0000-0002-1825-0097',
        displayName: 'Mock Existing',
        email: 'mock-existing@folio.local',
        emailVerified: true,
        affiliation: null,
      },
      '0000-0003-3333-3333': {
        orcid: '0000-0003-3333-3333',
        displayName: 'Mock Conflict',
        email:
          this.config.get<string>('ORCID_MOCK_EMAIL_CONFLICT') ??
          'author@folio.local',
        emailVerified: true,
        affiliation: null,
      },
      '0000-0004-4444-4444': {
        orcid: '0000-0004-4444-4444',
        displayName: 'Mock Link Target',
        email: `orcid-link-${Date.now()}@folio.local`,
        emailVerified: true,
        affiliation: null,
      },
    };
    const hit = profiles[orcid];
    if (!hit) {
      return {
        orcid,
        displayName: `ORCID ${orcid}`,
        email: null,
        emailVerified: false,
        affiliation: null,
      };
    }
    return hit;
  }
}
