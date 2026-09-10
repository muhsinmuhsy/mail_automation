import { EmailProvider, type ProviderOptions } from './types';
import { ENABLED_PROVIDERS, PROVIDER_CAPABILITIES } from './registry';
// App password disabled — commented out for future re-enablement
// import { GmailProvider } from './gmail';
import { GmailApiProvider } from './gmail/provider';

export class EmailProviderFactory {
  static resolve(provider: string, options: ProviderOptions = {}): EmailProvider {
    if (!ENABLED_PROVIDERS.has(provider)) {
      throw new Error(`Provider ${provider} is not enabled`);
    }
    switch (provider) {
      case 'gmail': {
        if (options.authMethod === 'oauth2') return new GmailApiProvider(options.fetcher);
        // App password disabled — commented out for future re-enablement
        // if (options.authMethod === 'password') throw new Error('Gmail password authentication is not supported.');
        // // STARTTLS on port 587 is the validated primary production path. The
        // // registry supplies the canonical host/port; caller options override.
        // const cfg = PROVIDER_CAPABILITIES[provider];
        // return new GmailProvider({
        //   host: cfg?.smtpHost,
        //   port: cfg?.smtpPort,
        //   useStartTls: true,
        //   ...options,
        // });
        throw new Error('App password authentication is disabled. Use Continue with Google.');
      }
      default:
        throw new Error(`Unknown provider: ${provider}`);
    }
  }

  static getCapabilities(provider: string) {
    if (!ENABLED_PROVIDERS.has(provider)) {
      throw new Error(`Provider ${provider} is not enabled`);
    }
    return PROVIDER_CAPABILITIES[provider]?.capabilities;
  }

  static isEnabled(provider: string): boolean {
    return ENABLED_PROVIDERS.has(provider);
  }
}
