import { EmailProvider } from './types';
import { ENABLED_PROVIDERS, PROVIDER_CAPABILITIES } from './registry';
import { GmailProvider } from './gmail';

export class EmailProviderFactory {
  static resolve(provider: string): EmailProvider {
    if (!ENABLED_PROVIDERS.has(provider)) {
      throw new Error(`Provider ${provider} is not enabled`);
    }
    switch (provider) {
      case 'gmail':
        return new GmailProvider();
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
