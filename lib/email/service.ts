import { EmailProviderFactory } from './providers/factory';
import { buildMimeMessage } from './mime';

export interface SendEmailParams {
  provider: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  attachment?: {
    filename: string;
    content: ArrayBuffer;
    contentType: string;
  };
  credentials: {
    email: string;
    secret: string;
  };
}

export async function sendEmail(params: SendEmailParams) {
  const provider = EmailProviderFactory.resolve(params.provider);
  const mimeMessage = buildMimeMessage({
    from: params.from,
    to: params.to,
    subject: params.subject,
    body: params.body,
    attachment: params.attachment,
  });

  return provider.sendEmail({
    from: params.from,
    to: params.to,
    subject: params.subject,
    body: params.body,
    mimeMessage,
    credentials: params.credentials,
  });
}
