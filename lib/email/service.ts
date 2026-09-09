import { EmailProviderFactory } from './providers/factory';
import { buildMimeMessage, type Attachment } from './mime';
import type { ProviderOptions, SendEmailResult } from './providers/types';

export interface SendEmailParams {
  provider: string;
  from: string;
  fromName?: string;
  to: string;
  toName?: string;
  subject: string;
  body: string;
  /** HTML alternative for multipart/alternative. When present, builds text+html. See §9. */
  bodyHtml?: string;
  attachment?: Attachment;
  attachments?: Attachment[];
  credentials: {
    email: string;
    secret: string;
  };
  /** Threaded to the provider for tests / custom transports. */
  providerOptions?: ProviderOptions;
  messageId?: string;
}

export type SendEmailOutcome = SendEmailResult;

/**
 * Builds a MIME message from the supplied parameters and dispatches it to the
 * resolved provider. The message body is encoded exactly once here (the
 * provider sends the already-rendered MIME message).
 */
export async function sendEmail(params: SendEmailParams): Promise<SendEmailOutcome> {
  const provider = EmailProviderFactory.resolve(params.provider, params.providerOptions);

  const mimeMessage = buildMimeMessage({
    from: params.from,
    fromName: params.fromName,
    to: params.to,
    toName: params.toName,
    subject: params.subject,
    body: params.body,
    bodyHtml: params.bodyHtml,
    attachments: params.attachments ?? (params.attachment ? [params.attachment] : undefined),
    messageId: params.messageId,
  });

  const result = await provider.sendEmail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    body: params.body,
    mimeMessage,
    attachments: params.attachments ?? (params.attachment ? [params.attachment] : undefined),
    credentials: params.credentials,
  });

  return {
    success: result.success,
    messageId: result.messageId,
    smtpResponse: result.smtpResponse,
    providerResponse: result.providerResponse,
    reconnectRequired: result.reconnectRequired,
    error: result.error,
    errorType: result.errorType,
  };
}
