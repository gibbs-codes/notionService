import { z } from 'zod';

export const SpendingStatusSchema = z.enum([
  'Pending',
  'Approved',
  'Denied',
]);

export const UrgencyLevelSchema = z.enum([
  'Low',
  'Medium',
  'High',
  'Critical',
]);

export const SpendingCategorySchema = z.enum([
  'Food',
  'Entertainment',
  'Shopping',
  'Bills',
  'Emergency',
  'Other',
]);

export const SpendingRequestSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Title is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
  category: SpendingCategorySchema,
  status: SpendingStatusSchema,
  requestDate: z.date(),
  decisionDate: z.date().optional(),
  reasoning: z.string().optional(),
  urgency: UrgencyLevelSchema,
  tags: z.array(z.string()).default([]),
});

export const CreateSpendingRequestSchema = SpendingRequestSchema.omit({
  id: true,
  status: true,
  decisionDate: true,
  reasoning: true,
}).extend({
  status: z.literal('Pending').default('Pending'),
  requestDate: z.date().default(() => new Date()),
});

export const UpdateSpendingRequestSchema = SpendingRequestSchema.partial().extend({
  id: z.string(),
});

export const SpendingRequestDecisionSchema = z.object({
  id: z.string(),
  status: z.enum(['Approved', 'Denied']),
  reasoning: z.string().min(1, 'Decision reasoning is required'),
  decisionDate: z.date().default(() => new Date()),
});

export type SpendingStatus = z.infer<typeof SpendingStatusSchema>;
export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>;
export type SpendingCategory = z.infer<typeof SpendingCategorySchema>;
export type SpendingRequest = z.infer<typeof SpendingRequestSchema>;
export type CreateSpendingRequest = z.infer<typeof CreateSpendingRequestSchema>;
export type UpdateSpendingRequest = z.infer<typeof UpdateSpendingRequestSchema>;
export type SpendingRequestDecision = z.infer<typeof SpendingRequestDecisionSchema>;