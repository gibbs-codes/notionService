import { z } from 'zod';

export const FinancialGoalStatusSchema = z.enum([
  'active',
  'completed',
  'paused',
]);

export const GoalPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'critical',
]);

export const GoalCategorySchema = z.enum([
  'emergency_fund',
  'retirement',
  'vacation',
  'home_purchase',
  'debt_payoff',
  'education',
  'investment',
  'major_purchase',
  'other',
]);

export const FinancialGoalSchema = z.object({
  id: z.string(),
  title: z.string().min(1, 'Title is required'),
  targetAmount: z.number().positive('Target amount must be positive'),
  currentAmount: z.number().min(0, 'Current amount cannot be negative').default(0),
  deadline: z.date().optional(),
  priority: GoalPrioritySchema,
  category: GoalCategorySchema,
  status: FinancialGoalStatusSchema,
  description: z.string().optional(),
  createdDate: z.date().default(() => new Date()),
  completedDate: z.date().optional(),
});

export const CreateFinancialGoalSchema = FinancialGoalSchema.omit({
  id: true,
  completedDate: true,
}).extend({
  status: FinancialGoalStatusSchema.default('active'),
});

export const UpdateFinancialGoalSchema = FinancialGoalSchema.partial().extend({
  id: z.string(),
});

export const GoalProgressUpdateSchema = z.object({
  id: z.string(),
  amountToAdd: z.number().positive('Amount must be positive'),
  description: z.string().optional(),
});

export const CompleteGoalSchema = z.object({
  id: z.string(),
  completedDate: z.date().default(() => new Date()),
});

export type FinancialGoalStatus = z.infer<typeof FinancialGoalStatusSchema>;
export type GoalPriority = z.infer<typeof GoalPrioritySchema>;
export type GoalCategory = z.infer<typeof GoalCategorySchema>;
export type FinancialGoal = z.infer<typeof FinancialGoalSchema>;
export type CreateFinancialGoal = z.infer<typeof CreateFinancialGoalSchema>;
export type UpdateFinancialGoal = z.infer<typeof UpdateFinancialGoalSchema>;
export type GoalProgressUpdate = z.infer<typeof GoalProgressUpdateSchema>;
export type CompleteGoal = z.infer<typeof CompleteGoalSchema>;

export const calculateGoalProgress = (goal: FinancialGoal): number => {
  if (goal.targetAmount === 0) return 0;
  return Math.min((goal.currentAmount / goal.targetAmount) * 100, 100);
};

export const calculateRemainingAmount = (goal: FinancialGoal): number => {
  return Math.max(goal.targetAmount - goal.currentAmount, 0);
};