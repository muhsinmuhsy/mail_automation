import { describe, it, expect } from 'vitest';
import {
  RecipientPreviewChangedError,
  IdempotencyKeyReusedError,
  CampaignCreationBusyError,
  NoEligibleRecipientsError,
  RecipientActionRequiredError,
  UnsupportedFieldError,
  ResendEntryInvalidError,
  PayloadTooLargeError,
} from '@/lib/errors';
import { ERROR_CODES } from '@/lib/errors/error-codes';
import { fromAppError } from '@/lib/errors/error-handler';

describe('lib/errors — campaign deduplication error subclasses', () => {
  it('RecipientPreviewChangedError has 409 status and correct code', () => {
    const err = new RecipientPreviewChangedError('changed', { preCheck: { foo: 1 } });
    expect(err.httpStatus).toBe(409);
    expect(err.code).toBe('RECIPIENT_PREVIEW_CHANGED');
    expect(err.message).toBe('changed');
    expect(err.details).toEqual({ preCheck: { foo: 1 } });
  });

  it('IdempotencyKeyReusedError has 409 status', () => {
    const err = new IdempotencyKeyReusedError();
    expect(err.httpStatus).toBe(409);
    expect(err.code).toBe('IDEMPOTENCY_KEY_REUSED');
  });

  it('CampaignCreationBusyError has 503 status', () => {
    const err = new CampaignCreationBusyError('busy', { retryAfterSeconds: 2 });
    expect(err.httpStatus).toBe(503);
    expect(err.code).toBe('CAMPAIGN_CREATION_BUSY');
    expect(err.details).toEqual({ retryAfterSeconds: 2 });
  });

  it('NoEligibleRecipientsError has 422 status', () => {
    const err = new NoEligibleRecipientsError();
    expect(err.httpStatus).toBe(422);
    expect(err.code).toBe('NO_ELIGIBLE_RECIPIENTS');
  });

  it('RecipientActionRequiredError has 422 status', () => {
    const err = new RecipientActionRequiredError('action needed', { unknownTokens: ['{{x}}'] });
    expect(err.httpStatus).toBe(422);
    expect(err.code).toBe('RECIPIENT_ACTION_REQUIRED');
    expect(err.details).toEqual({ unknownTokens: ['{{x}}'] });
  });

  it('UnsupportedFieldError has 422 status', () => {
    const err = new UnsupportedFieldError('bad fields', { fields: ['duplicate_action'] });
    expect(err.httpStatus).toBe(422);
    expect(err.code).toBe('UNSUPPORTED_FIELD');
  });

  it('ResendEntryInvalidError has 422 status', () => {
    const err = new ResendEntryInvalidError();
    expect(err.httpStatus).toBe(422);
    expect(err.code).toBe('RESEND_ENTRY_INVALID');
  });

  it('PayloadTooLargeError has 413 status', () => {
    const err = new PayloadTooLargeError();
    expect(err.httpStatus).toBe(413);
    expect(err.code).toBe('PAYLOAD_TOO_LARGE');
  });

  it('ERROR_CODES includes all new codes', () => {
    expect(ERROR_CODES.RECIPIENT_PREVIEW_CHANGED).toBe('RECIPIENT_PREVIEW_CHANGED');
    expect(ERROR_CODES.IDEMPOTENCY_KEY_REUSED).toBe('IDEMPOTENCY_KEY_REUSED');
    expect(ERROR_CODES.CAMPAIGN_CREATION_BUSY).toBe('CAMPAIGN_CREATION_BUSY');
    expect(ERROR_CODES.NO_ELIGIBLE_RECIPIENTS).toBe('NO_ELIGIBLE_RECIPIENTS');
    expect(ERROR_CODES.RECIPIENT_ACTION_REQUIRED).toBe('RECIPIENT_ACTION_REQUIRED');
    expect(ERROR_CODES.UNSUPPORTED_FIELD).toBe('UNSUPPORTED_FIELD');
    expect(ERROR_CODES.RESEND_ENTRY_INVALID).toBe('RESEND_ENTRY_INVALID');
    expect(ERROR_CODES.PAYLOAD_TOO_LARGE).toBe('PAYLOAD_TOO_LARGE');
  });

  it('fromAppError serializes details for RecipientPreviewChangedError', () => {
    const err = new RecipientPreviewChangedError('changed', { preCheck: { eligibleCount: 5 } });
    const { status, body } = fromAppError(err);
    expect(status).toBe(409);
    expect(body.error.type).toBe('RECIPIENT_PREVIEW_CHANGED');
    expect(body.error.details).toEqual({ preCheck: { eligibleCount: 5 } });
  });

  it('fromAppError serializes retryAfter for CampaignCreationBusyError', () => {
    const err = new CampaignCreationBusyError('busy', { retryAfterSeconds: 5 });
    const { status, body } = fromAppError(err);
    expect(status).toBe(503);
    expect(body.error.retryAfter).toBe(5);
  });
});
