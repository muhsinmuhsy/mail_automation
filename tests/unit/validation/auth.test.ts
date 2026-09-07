import { describe, it } from 'vitest';
// import { registerSchema, loginSchema, forgotPasswordSchema, resetPasswordSchema } from '@/lib/validation/auth';

describe('lib/validation/auth', () => {
  it.skip('auth validation schemas disabled — only Continue with Google is active', () => {});

  // describe('registerSchema', () => {
  //   it('accepts valid input', () => {
  //     expect(() =>
  //       registerSchema.parse({
  //         name: 'John Doe',
  //         email: 'john@example.com',
  //         password: 'securePass123',
  //       })
  //     ).not.toThrow();
  //   });
  //
  //   it('rejects empty name', () => {
  //     expect(() =>
  //       registerSchema.parse({
  //         name: '',
  //         email: 'john@example.com',
  //         password: 'securePass123',
  //       })
  //     ).toThrow();
  //   });
  //
  //   it('rejects invalid email', () => {
  //     expect(() =>
  //       registerSchema.parse({
  //         name: 'John Doe',
  //         email: 'not-an-email',
  //         password: 'securePass123',
  //       })
  //     ).toThrow();
  //   });
  //
  //   it('rejects short password', () => {
  //     expect(() =>
  //       registerSchema.parse({
  //         name: 'John Doe',
  //         email: 'john@example.com',
  //         password: 'short',
  //       })
  //     ).toThrow();
  //   });
  //
  //   it('rejects missing required fields', () => {
  //     expect(() => registerSchema.parse({})).toThrow();
  //   });
  // });
  //
  // describe('loginSchema', () => {
  //   it('accepts valid input', () => {
  //     expect(() =>
  //       loginSchema.parse({
  //         email: 'john@example.com',
  //         password: 'any-password',
  //       })
  //     ).not.toThrow();
  //   });
  //
  //   it('rejects invalid email', () => {
  //     expect(() =>
  //       loginSchema.parse({
  //         email: 'not-an-email',
  //         password: 'any-password',
  //       })
  //     ).toThrow();
  //   });
  //
  //   it('rejects empty password', () => {
  //     expect(() =>
  //       loginSchema.parse({
  //         email: 'john@example.com',
  //         password: '',
  //       })
  //     ).toThrow();
  //   });
  // });
  //
  // describe('forgotPasswordSchema', () => {
  //   it('accepts valid email', () => {
  //     expect(() =>
  //       forgotPasswordSchema.parse({ email: 'john@example.com' })
  //     ).not.toThrow();
  //   });
  //
  //   it('rejects invalid email', () => {
  //     expect(() =>
  //       forgotPasswordSchema.parse({ email: 'not-an-email' })
  //     ).toThrow();
  //   });
  // });
  //
  // describe('resetPasswordSchema', () => {
  //   it('accepts valid input', () => {
  //     expect(() =>
  //       resetPasswordSchema.parse({
  //         token: 'reset-token',
  //         password: 'newSecurePass123',
  //       })
  //     ).not.toThrow();
  //   });
  //
  //   it('rejects empty token', () => {
  //     expect(() =>
  //       resetPasswordSchema.parse({
  //         token: '',
  //         password: 'newSecurePass123',
  //       })
  //     ).toThrow();
  //   });
  //
  //   it('rejects short password', () => {
  //     expect(() =>
  //       resetPasswordSchema.parse({
  //         token: 'reset-token',
  //         password: 'short',
  //       })
  //     ).toThrow();
  //   });
  // });
});
