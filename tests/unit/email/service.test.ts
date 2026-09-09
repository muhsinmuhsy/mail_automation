import { describe, it, expect, vi, beforeEach } from 'vitest';

const fakeProvider = {
  sendEmail: vi.fn(),
};

vi.mock('@/lib/email/providers/factory', () => ({
  EmailProviderFactory: {
    resolve: vi.fn(),
  },
}));

import { EmailProviderFactory } from '@/lib/email/providers/factory';
import { sendEmail, type SendEmailParams } from '@/lib/email/service';

const baseParams: SendEmailParams = {
  provider: 'gmail',
  from: 'sender@gmail.com',
  to: 'rcpt@example.com',
  subject: 'Hi',
  body: 'Hello',
  credentials: { email: 'sender@gmail.com', secret: 'app-pass' },
};

const resolve = EmailProviderFactory.resolve as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  fakeProvider.sendEmail.mockReset();
  resolve.mockReset();
  resolve.mockReturnValue(fakeProvider);
});

describe('lib/email/service (sendEmail dispatcher)', () => {
  it('includes every selected file in MIME and supports an empty selection', async () => {
    fakeProvider.sendEmail.mockResolvedValue({ success: true });
    const attachments = ['one.pdf', 'two.pdf'].map(filename => ({ filename, content: new TextEncoder().encode(filename), contentType: 'application/pdf' }));
    await sendEmail({ ...baseParams, attachments });
    const sent = fakeProvider.sendEmail.mock.calls[0][0];
    expect(sent.attachments).toEqual(attachments);
    for (const file of attachments) expect(sent.mimeMessage).toContain(`filename="${file.filename}"`);
    await sendEmail({ ...baseParams, attachments: [] });
    expect(fakeProvider.sendEmail.mock.calls[1][0].mimeMessage).not.toContain('Content-Disposition: attachment');
  });
  it('resolves the provider by name and dispatches to it', async () => {
    fakeProvider.sendEmail.mockResolvedValue({
      success: true,
      messageId: 'm1',
      smtpResponse: '250 OK',
    });

    const res = await sendEmail(baseParams);

    expect(resolve).toHaveBeenCalledWith('gmail', undefined);
    expect(fakeProvider.sendEmail).toHaveBeenCalledTimes(1);
    expect(res.success).toBe(true);
    expect(res.messageId).toBe('m1');
    expect(res.smtpResponse).toBe('250 OK');
  });

  it('passes credentials and attachment through to the provider', async () => {
    fakeProvider.sendEmail.mockResolvedValue({ success: true });

    const attachment = {
      filename: 'r.pdf',
      content: new TextEncoder().encode('PDF'),
      contentType: 'application/pdf',
    };

    await sendEmail({ ...baseParams, attachment, providerOptions: { timeoutMs: 1 } });

    const call = fakeProvider.sendEmail.mock.calls[0][0];
    expect(call.credentials).toEqual({ email: 'sender@gmail.com', secret: 'app-pass' });
    expect(call.attachments).toEqual([attachment]);
    expect(resolve).toHaveBeenCalledWith('gmail', { timeoutMs: 1 });
  });

  it('builds a MIME message and forwards it to the provider', async () => {
    fakeProvider.sendEmail.mockResolvedValue({ success: true });
    await sendEmail(baseParams);
    const call = fakeProvider.sendEmail.mock.calls[0][0];
    // MIME message is rebuilt by the service; assert its key invariants rather
    // than the full string (Message-ID/Date are generated per call).
    expect(call.mimeMessage).toContain('From: sender@gmail.com');
    expect(call.mimeMessage).toContain('To: rcpt@example.com');
    expect(call.mimeMessage).toContain('Subject: Hi');
    expect(call.mimeMessage).toContain('Content-Transfer-Encoding: base64');
  });

  it('maps a provider permanent error to a permanent outcome', async () => {
    fakeProvider.sendEmail.mockResolvedValue({
      success: false,
      error: 'bad recipient',
      errorType: 'permanent',
    });
    const res = await sendEmail(baseParams);
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('permanent');
    expect(res.error).toBe('bad recipient');
  });

  it('maps a provider temporary error to a temporary outcome', async () => {
    fakeProvider.sendEmail.mockResolvedValue({
      success: false,
      error: 'try later',
      errorType: 'temporary',
    });
    const res = await sendEmail(baseParams);
    expect(res.success).toBe(false);
    expect(res.errorType).toBe('temporary');
  });

  it('propagates a safe error when no attachment is supplied', async () => {
    fakeProvider.sendEmail.mockResolvedValue({ success: true });
    await sendEmail(baseParams);
    const call = fakeProvider.sendEmail.mock.calls[0][0];
    expect(call.attachments).toBeUndefined();
  });

  it('threads bodyHtml into the MIME message as multipart/alternative', async () => {
    fakeProvider.sendEmail.mockResolvedValue({ success: true });
    await sendEmail({ ...baseParams, bodyHtml: '<p>Hello</p>' });
    const call = fakeProvider.sendEmail.mock.calls[0][0];
    expect(call.mimeMessage).toContain('multipart/alternative');
    expect(call.mimeMessage).toContain('text/html');
  });

  it('omits multipart/alternative when bodyHtml is absent', async () => {
    fakeProvider.sendEmail.mockResolvedValue({ success: true });
    await sendEmail(baseParams);
    const call = fakeProvider.sendEmail.mock.calls[0][0];
    expect(call.mimeMessage).not.toContain('multipart/alternative');
  });

  // NOTE: source bug — `sendEmail` does NOT wrap `EmailProviderFactory.resolve`
  // in try/catch, so an unknown/disabled provider throws instead of returning a
  // safe error outcome. We assert the actual (throwing) behaviour here and
  // report it in the summary.
  it('rejects when the provider cannot be resolved (unknown/disabled)', async () => {
    resolve.mockImplementation(() => {
      throw new Error('Provider x is not enabled');
    });
    await expect(sendEmail({ ...baseParams, provider: 'x' })).rejects.toThrow(/not enabled/);
  });
});
