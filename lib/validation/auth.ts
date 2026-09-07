// import { z } from 'zod';
// import { email, nonEmptyString } from './common';

// export const registerSchema = z.object({
//   name: nonEmptyString.max(100),
//   email,
//   password: z.string().min(8).max(100),
// });
//
// export const loginSchema = z.object({
//   email,
//   password: z.string().min(1),
// });
//
// export const forgotPasswordSchema = z.object({
//   email,
// });
//
// export const resetPasswordSchema = z.object({
//   token: z.string().min(1),
//   password: z.string().min(8).max(100),
// });
//
// export type RegisterInput = z.infer<typeof registerSchema>;
// export type LoginInput = z.infer<typeof loginSchema>;
// export type ForgotPasswordInput = z.infer<typeof forgotPasswordSchema>;
// export type ResetPasswordInput = z.infer<typeof resetPasswordSchema>;
