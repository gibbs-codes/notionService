import { z } from 'zod';

export const DebtPrioritySchema = z.enum([
  'low',
  'medium',
  'high',
  'urgent',
]);

export const DebtTypeSchema = z.enum([
  'credit_card',
  'student_loan',
  'mortgage',
  'personal_loan',
  'auto_loan',
  'medical_debt',
  'other',
]);

export const DebtStatusSchema = z.enum([
  'active',
  'paid_off',
  'in_collections',
  'deferred',
]);

export const DebtInfoSchema = z.object({
  id: z.string(),
  creditor: z.string().min(1, 'Creditor name is required'),
  totalAmount: z.number().positive('Total amount must be positive'),
  remainingAmount: z.number().min(0, 'Remaining amount cannot be negative'),
  minimumPayment: z.number().positive('Minimum payment must be positive'),
  interestRate: z.number().min(0).max(100, 'Interest rate must be between 0 and 100'),
  dueDate: z.date(),
  priority: DebtPrioritySchema,
  debtType: DebtTypeSchema,
  status: DebtStatusSchema,
  description: z.string().optional(),
  createdDate: z.date().default(() => new Date()),
  lastPaymentDate: z.date().optional(),
  paidOffDate: z.date().optional(),
});

export const CreateDebtInfoSchema = DebtInfoSchema.omit({
  id: true,
  lastPaymentDate: true,
  paidOffDate: true,
}).extend({
  status: DebtStatusSchema.default('active'),
});

export const UpdateDebtInfoSchema = DebtInfoSchema.partial().extend({
  id: z.string(),
});

export const DebtPaymentSchema = z.object({
  id: z.string(),
  paymentAmount: z.number().positive('Payment amount must be positive'),
  paymentDate: z.date().default(() => new Date()),
  description: z.string().optional(),
});

export const PayOffDebtSchema = z.object({
  id: z.string(),
  finalPaymentAmount: z.number().positive('Final payment amount must be positive'),
  paidOffDate: z.date().default(() => new Date()),
});

export type DebtPriority = z.infer<typeof DebtPrioritySchema>;
export type DebtType = z.infer<typeof DebtTypeSchema>;
export type DebtStatus = z.infer<typeof DebtStatusSchema>;
export type DebtInfo = z.infer<typeof DebtInfoSchema>;
export type CreateDebtInfo = z.infer<typeof CreateDebtInfoSchema>;
export type UpdateDebtInfo = z.infer<typeof UpdateDebtInfoSchema>;
export type DebtPayment = z.infer<typeof DebtPaymentSchema>;
export type PayOffDebt = z.infer<typeof PayOffDebtSchema>;

export const calculateDebtProgress = (debt: DebtInfo): number => {
  if (debt.totalAmount === 0) return 100;
  const paidAmount = debt.totalAmount - debt.remainingAmount;
  return Math.min((paidAmount / debt.totalAmount) * 100, 100);
};

export const calculateMonthsToPayOff = (
  remainingAmount: number,
  monthlyPayment: number,
  annualInterestRate: number,
): number => {
  if (monthlyPayment <= 0 || remainingAmount <= 0) return 0;
  
  const monthlyRate = annualInterestRate / 100 / 12;
  
  if (monthlyRate === 0) {
    return Math.ceil(remainingAmount / monthlyPayment);
  }
  
  const months = -Math.log(1 - (remainingAmount * monthlyRate) / monthlyPayment) / Math.log(1 + monthlyRate);
  return Math.ceil(months);
};

export const calculateTotalInterest = (
  remainingAmount: number,
  monthlyPayment: number,
  annualInterestRate: number,
): number => {
  const months = calculateMonthsToPayOff(remainingAmount, monthlyPayment, annualInterestRate);
  const totalPaid = monthlyPayment * months;
  return Math.max(totalPaid - remainingAmount, 0);
};