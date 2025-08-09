import { z } from 'zod';

export const SpendingRequestStatusSchema = z.enum([
  'pending',
  'approved',
  'denied',
]);

export const UrgencyLevelSchema = z.enum([
  'low',
  'medium',
  'high',
  'urgent',
]);

export const SpendingCategorySchema = z.enum([
  'groceries',
  'dining',
  'transportation',
  'utilities',
  'entertainment',
  'healthcare',
  'shopping',
  'travel',
  'education',
  'other',
]);

export const SpendingRequestSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Title is required'),
  amount: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
  category: SpendingCategorySchema,
  status: SpendingRequestStatusSchema,
  requestDate: z.date(),
  decidedDate: z.date().optional(),
  reasoning: z.string().optional(),
  urgencyLevel: UrgencyLevelSchema,
  tags: z.array(z.string()).default([]),
});

export const CreateSpendingRequestSchema = SpendingRequestSchema.omit({
  id: true,
  status: true,
  decidedDate: true,
  reasoning: true,
}).extend({
  status: z.literal('pending').default('pending'),
  requestDate: z.date().default(() => new Date()),
});

export const UpdateSpendingRequestSchema = SpendingRequestSchema.partial().extend({
  id: z.string(),
});

export const SpendingRequestDecisionSchema = z.object({
  id: z.string(),
  status: z.enum(['approved', 'denied']),
  reasoning: z.string().min(1, 'Decision reasoning is required'),
  decidedDate: z.date().default(() => new Date()),
});

export type SpendingRequestStatus = z.infer<typeof SpendingRequestStatusSchema>;
export type UrgencyLevel = z.infer<typeof UrgencyLevelSchema>;
export type SpendingCategory = z.infer<typeof SpendingCategorySchema>;
export type SpendingRequest = z.infer<typeof SpendingRequestSchema>;
export type CreateSpendingRequest = z.infer<typeof CreateSpendingRequestSchema>;
export type UpdateSpendingRequest = z.infer<typeof UpdateSpendingRequestSchema>;
export type SpendingRequestDecision = z.infer<typeof SpendingRequestDecisionSchema>;