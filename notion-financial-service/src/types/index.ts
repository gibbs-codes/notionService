export * from './SpendingRequest';
export * from './FinancialGoal';
export * from './DebtInfo';
export * from './AccountBalance';
export * from './NotionProperty';

export interface ApiResponse<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
}

export interface PaginatedResponse<T> extends ApiResponse<T[]> {
  pagination?: {
    page: number;
    limit: number;
    total: number;
    hasNext: boolean;
    hasPrevious: boolean;
  };
}

export interface ErrorResponse {
  success: false;
  error: string;
  details?: Record<string, any>;
  timestamp: string;
}

export interface HealthCheckResponse {
  status: 'healthy' | 'unhealthy';
  timestamp: string;
  uptime: number;
  version: string;
  services: {
    notion: 'connected' | 'disconnected' | 'error';
    database: 'connected' | 'disconnected' | 'error';
  };
}