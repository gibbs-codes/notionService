import { z } from 'zod';

export const AccountTypeSchema = z.enum([
  'checking',
  'savings',
  'credit_card',
  'investment',
  'retirement',
  'money_market',
  'cd',
  'loan',
  'other',
]);

export const AccountStatusSchema = z.enum([
  'active',
  'closed',
  'frozen',
  'pending',
]);

export const AccountBalanceSchema = z.object({
  id: z.string(),
  accountName: z.string().min(1, 'Account name is required'),
  accountType: AccountTypeSchema,
  currentBalance: z.number(),
  availableBalance: z.number(),
  lastUpdated: z.date(),
  status: AccountStatusSchema,
  institution: z.string().optional(),
  accountNumber: z.string().optional(),
  interestRate: z.number().min(0).max(100).optional(),
  minimumBalance: z.number().optional(),
  creditLimit: z.number().optional(),
  description: z.string().optional(),
});

export const CreateAccountBalanceSchema = AccountBalanceSchema.omit({
  id: true,
}).extend({
  status: AccountStatusSchema.default('active'),
  lastUpdated: z.date().default(() => new Date()),
});

export const UpdateAccountBalanceSchema = AccountBalanceSchema.partial().extend({
  id: z.string(),
});

export const BalanceUpdateSchema = z.object({
  id: z.string(),
  currentBalance: z.number(),
  availableBalance: z.number(),
  lastUpdated: z.date().default(() => new Date()),
});

export const BulkBalanceUpdateSchema = z.object({
  updates: z.array(BalanceUpdateSchema).min(1, 'At least one update is required'),
});

export type AccountType = z.infer<typeof AccountTypeSchema>;
export type AccountStatus = z.infer<typeof AccountStatusSchema>;
export type AccountBalance = z.infer<typeof AccountBalanceSchema>;
export type CreateAccountBalance = z.infer<typeof CreateAccountBalanceSchema>;
export type UpdateAccountBalance = z.infer<typeof UpdateAccountBalanceSchema>;
export type BalanceUpdate = z.infer<typeof BalanceUpdateSchema>;
export type BulkBalanceUpdate = z.infer<typeof BulkBalanceUpdateSchema>;

export const calculateNetWorth = (accounts: AccountBalance[]): number => {
  return accounts.reduce((total, account) => {
    switch (account.accountType) {
      case 'credit_card':
      case 'loan':
        return total - account.currentBalance;
      default:
        return total + account.currentBalance;
    }
  }, 0);
};

export const calculateTotalAssets = (accounts: AccountBalance[]): number => {
  return accounts
    .filter(account => !['credit_card', 'loan'].includes(account.accountType))
    .reduce((total, account) => total + account.currentBalance, 0);
};

export const calculateTotalLiabilities = (accounts: AccountBalance[]): number => {
  return accounts
    .filter(account => ['credit_card', 'loan'].includes(account.accountType))
    .reduce((total, account) => total + account.currentBalance, 0);
};

export const getCreditUtilization = (account: AccountBalance): number => {
  if (account.accountType !== 'credit_card' || !account.creditLimit) {
    return 0;
  }
  
  if (account.creditLimit === 0) return 0;
  
  return Math.min((account.currentBalance / account.creditLimit) * 100, 100);
};