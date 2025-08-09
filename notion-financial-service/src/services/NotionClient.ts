import { Client, APIErrorCode } from '@notionhq/client';
import { logger } from '../config/logger';
import {
  NotionPageBase,
  NotionProperty,
  NotionPropertyExtractors,
  NotionPropertyFormatters,
  DatabaseQuery,
} from '../types';

export interface NotionClientConfig {
  token: string;
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  requestTimeout?: number;
  rateLimit?: {
    requestsPerSecond: number;
  };
  cache?: {
    enabled: boolean;
    ttlMs: number;
    maxSize: number;
  };
}

interface CacheEntry<T> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface RequestMetrics {
  operationName: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  success: boolean;
  error?: Error;
  retryCount: number;
}

export class NotionError extends Error {
  constructor(
    message: string,
    public code?: string,
    public statusCode?: number,
    public details?: any,
  ) {
    super(message);
    this.name = 'NotionError';
  }
}

export class NotionRateLimitError extends NotionError {
  constructor(
    message: string,
    public retryAfter?: number,
  ) {
    super(message, 'RATE_LIMITED', 429);
    this.name = 'NotionRateLimitError';
  }
}

export class NotionAuthError extends NotionError {
  constructor(message: string) {
    super(message, 'UNAUTHORIZED', 401);
    this.name = 'NotionAuthError';
  }
}

export class NotionPermissionError extends NotionError {
  constructor(message: string) {
    super(message, 'FORBIDDEN', 403);
    this.name = 'NotionPermissionError';
  }
}

export class NotionNotFoundError extends NotionError {
  constructor(message: string) {
    super(message, 'NOT_FOUND', 404);
    this.name = 'NotionNotFoundError';
  }
}

export class NotionTimeoutError extends NotionError {
  constructor(message: string) {
    super(message, 'TIMEOUT', 408);
    this.name = 'NotionTimeoutError';
  }
}

export class NotionConnectionError extends NotionError {
  constructor(message: string) {
    super(message, 'CONNECTION_ERROR', 0);
    this.name = 'NotionConnectionError';
  }
}

export class NotionClient {
  private client: Client;
  private config: Required<NotionClientConfig>;
  private lastRequestTime = 0;
  private requestQueue: Array<() => void> = [];
  private cache = new Map<string, CacheEntry<any>>();
  private metrics: RequestMetrics[] = [];
  private isProcessingQueue = false;

  constructor(config: NotionClientConfig) {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 30000,
      requestTimeout: 30000,
      rateLimit: {
        requestsPerSecond: 3,
      },
      cache: {
        enabled: true,
        ttlMs: 300000, // 5 minutes
        maxSize: 1000,
      },
      ...config,
    };

    this.client = new Client({
      auth: this.config.token,
    });

    logger.info('NotionClient initialized', {
      maxRetries: this.config.maxRetries,
      rateLimit: this.config.rateLimit,
      cacheEnabled: this.config.cache.enabled,
      requestTimeout: this.config.requestTimeout,
    });

    // Start cache cleanup interval
    if (this.config.cache.enabled) {
      setInterval(() => this.cleanupCache(), 60000); // Cleanup every minute
    }
  }

  private cleanupCache(): void {
    const now = Date.now();
    let removedCount = 0;

    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        removedCount++;
      }
    }

    // If cache is too large, remove oldest entries
    if (this.cache.size > this.config.cache.maxSize) {
      const entries = Array.from(this.cache.entries())
        .sort(([, a], [, b]) => a.timestamp - b.timestamp);
      
      const excess = this.cache.size - this.config.cache.maxSize;
      for (let i = 0; i < excess; i++) {
        this.cache.delete(entries[i][0]);
        removedCount++;
      }
    }

    if (removedCount > 0) {
      logger.debug('Cache cleanup completed', { 
        removedEntries: removedCount,
        remainingEntries: this.cache.size,
      });
    }
  }

  private getCacheKey(operation: string, params: any): string {
    return `${operation}:${JSON.stringify(params)}`;
  }

  private getFromCache<T>(key: string): T | null {
    if (!this.config.cache.enabled) return null;

    const entry = this.cache.get(key);
    if (!entry) return null;

    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    return entry.data;
  }

  private setCache<T>(key: string, data: T, ttl?: number): void {
    if (!this.config.cache.enabled) return;

    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      ttl: ttl || this.config.cache.ttlMs,
    };

    this.cache.set(key, entry);
  }

  private startMetrics(operationName: string): RequestMetrics {
    const metrics: RequestMetrics = {
      operationName,
      startTime: Date.now(),
      success: false,
      retryCount: 0,
    };

    this.metrics.push(metrics);
    
    // Keep only last 1000 metrics
    if (this.metrics.length > 1000) {
      this.metrics.shift();
    }

    return metrics;
  }

  private endMetrics(metrics: RequestMetrics, success: boolean, error?: Error, retryCount = 0): void {
    metrics.endTime = Date.now();
    metrics.duration = metrics.endTime - metrics.startTime;
    metrics.success = success;
    metrics.error = error;
    metrics.retryCount = retryCount;

    logger.debug('Request metrics', {
      operation: metrics.operationName,
      duration: metrics.duration,
      success: metrics.success,
      retryCount: metrics.retryCount,
      error: error?.message,
    });
  }

  private async enforceRateLimit(): Promise<void> {
    return new Promise((resolve) => {
      const minInterval = 1000 / this.config.rateLimit.requestsPerSecond;
      const now = Date.now();
      const timeSinceLastRequest = now - this.lastRequestTime;

      if (timeSinceLastRequest < minInterval) {
        const delay = minInterval - timeSinceLastRequest;
        logger.debug('Rate limiting: waiting', { delay });
        
        this.requestQueue.push(() => {
          this.lastRequestTime = Date.now();
          resolve();
        });

        if (!this.isProcessingQueue) {
          this.processQueue();
        }
      } else {
        this.lastRequestTime = now;
        resolve();
      }
    });
  }

  private async processQueue(): Promise<void> {
    if (this.isProcessingQueue) return;
    this.isProcessingQueue = true;

    while (this.requestQueue.length > 0) {
      const minInterval = 1000 / this.config.rateLimit.requestsPerSecond;
      await this.sleep(minInterval);
      
      const nextRequest = this.requestQueue.shift();
      if (nextRequest) {
        nextRequest();
      }
    }

    this.isProcessingQueue = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private calculateBackoffDelay(attempt: number, baseDelay: number): number {
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 0.1 * exponentialDelay;
    return Math.min(exponentialDelay + jitter, this.config.maxDelay);
  }

  private handleNotionError(error: any): NotionError {
    // Handle connection/network errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND' || error.code === 'ECONNRESET') {
      return new NotionConnectionError(`Connection error: ${error.message}`);
    }

    if (error.code === 'ETIMEDOUT' || error.message?.includes('timeout')) {
      return new NotionTimeoutError(`Request timeout: ${error.message}`);
    }

    // Handle Notion API specific errors
    if (error?.code) {
      switch (error.code) {
        case APIErrorCode.Unauthorized:
          return new NotionAuthError(error.message || 'Unauthorized access to Notion API');
        case APIErrorCode.Forbidden:
          return new NotionPermissionError(error.message || 'Insufficient permissions');
        case APIErrorCode.ObjectNotFound:
          return new NotionNotFoundError(error.message || 'Resource not found');
        case APIErrorCode.RateLimited:
          const retryAfter = error?.headers?.['retry-after'];
          return new NotionRateLimitError(
            error.message || 'Rate limit exceeded',
            retryAfter ? parseInt(retryAfter) : undefined,
          );
        case APIErrorCode.InternalServerError:
          return new NotionError(
            error.message || 'Internal server error',
            'INTERNAL_ERROR',
            500,
            error,
          );
        case APIErrorCode.ServiceUnavailable:
          return new NotionError(
            error.message || 'Service unavailable',
            'SERVICE_UNAVAILABLE',
            503,
            error,
          );
        default:
          return new NotionError(
            error.message || 'Unknown Notion API error',
            error.code,
            error.status,
            error,
          );
      }
    }

    // Handle HTTP status codes
    if (error?.status === 429) {
      return new NotionRateLimitError('Rate limit exceeded');
    }

    return new NotionError(
      error?.message || 'Unknown error occurred',
      'UNKNOWN',
      error?.status,
      error,
    );
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    operationName: string,
    cacheKey?: string,
  ): Promise<T> {
    const metrics = this.startMetrics(operationName);
    let lastError: Error;
    let retryCount = 0;

    // Check cache first
    if (cacheKey) {
      const cached = this.getFromCache<T>(cacheKey);
      if (cached) {
        this.endMetrics(metrics, true);
        logger.debug('Cache hit', { operation: operationName, cacheKey });
        return cached;
      }
    }

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.enforceRateLimit();
        
        logger.debug('Executing Notion operation', {
          operation: operationName,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries + 1,
        });

        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new NotionTimeoutError('Request timeout')), this.config.requestTimeout);
        });

        const result = await Promise.race([operation(), timeoutPromise]);
        
        // Cache successful results
        if (cacheKey && result) {
          this.setCache(cacheKey, result);
        }

        this.endMetrics(metrics, true, undefined, retryCount);

        if (attempt > 0) {
          logger.info('Notion operation succeeded after retry', {
            operation: operationName,
            attempt: attempt + 1,
            retryCount,
          });
        }

        return result;
      } catch (error: any) {
        lastError = this.handleNotionError(error);
        retryCount++;

        logger.warn('Notion operation failed', {
          operation: operationName,
          attempt: attempt + 1,
          error: lastError.message,
          code: lastError.code,
          statusCode: lastError.statusCode,
        });

        if (attempt === this.config.maxRetries) {
          break;
        }

        // Check if error is retryable
        if (lastError instanceof NotionAuthError || 
            lastError instanceof NotionPermissionError ||
            lastError instanceof NotionNotFoundError) {
          logger.error('Non-retryable Notion error', {
            operation: operationName,
            error: lastError.message,
            code: lastError.code,
          });
          break;
        }

        // Handle rate limiting with custom delay
        if (lastError instanceof NotionRateLimitError && lastError.retryAfter) {
          const delay = lastError.retryAfter * 1000;
          logger.info('Rate limited, waiting for retry-after', {
            operation: operationName,
            retryAfter: lastError.retryAfter,
          });
          await this.sleep(delay);
        } else {
          const delay = this.calculateBackoffDelay(attempt, this.config.baseDelay);
          logger.info('Retrying after backoff delay', {
            operation: operationName,
            attempt: attempt + 1,
            delay,
          });
          await this.sleep(delay);
        }
      }
    }

    this.endMetrics(metrics, false, lastError!, retryCount);

    logger.error('Notion operation failed after all retries', {
      operation: operationName,
      maxRetries: this.config.maxRetries,
      finalError: lastError!.message,
      retryCount,
    });

    throw lastError!;
  }

  // Core Methods
  async queryDatabase(
    databaseId: string,
    filter?: any,
    sorts?: any,
  ): Promise<NotionPageBase[]> {
    const cacheKey = this.getCacheKey('queryDatabase', { databaseId, filter, sorts });
    
    return this.withRetry(async () => {
      const response = await this.client.databases.query({
        database_id: databaseId,
        filter,
        sorts,
        page_size: 100,
      });

      logger.debug('Database query successful', {
        databaseId,
        resultCount: response.results.length,
        hasMore: response.has_more,
      });

      return response.results as NotionPageBase[];
    }, `queryDatabase(${databaseId})`, cacheKey);
  }

  async createPage(
    databaseId: string,
    properties: any,
  ): Promise<string> {
    return this.withRetry(async () => {
      const response = await this.client.pages.create({
        parent: { database_id: databaseId },
        properties,
      });

      logger.info('Page created successfully', {
        databaseId,
        pageId: response.id,
        properties: Object.keys(properties),
      });

      return response.id;
    }, `createPage(${databaseId})`);
  }

  async updatePage(
    pageId: string,
    properties: any,
  ): Promise<void> {
    return this.withRetry(async () => {
      await this.client.pages.update({
        page_id: pageId,
        properties,
      });

      logger.info('Page updated successfully', {
        pageId,
        properties: Object.keys(properties),
      });

      // Invalidate cache entries for this page
      for (const key of this.cache.keys()) {
        if (key.includes(pageId)) {
          this.cache.delete(key);
        }
      }
    }, `updatePage(${pageId})`);
  }

  async getPage(pageId: string): Promise<NotionPageBase> {
    const cacheKey = this.getCacheKey('getPage', { pageId });
    
    return this.withRetry(async () => {
      const response = await this.client.pages.retrieve({
        page_id: pageId,
      });

      logger.debug('Page retrieved successfully', {
        pageId,
        lastEdited: (response as NotionPageBase).last_edited_time,
      });

      return response as NotionPageBase;
    }, `getPage(${pageId})`, cacheKey);
  }

  async getDatabaseSchema(databaseId: string): Promise<any> {
    const cacheKey = this.getCacheKey('getDatabaseSchema', { databaseId });
    
    return this.withRetry(async () => {
      const response = await this.client.databases.retrieve({
        database_id: databaseId,
      });

      logger.debug('Database schema retrieved', {
        databaseId,
        title: response.title,
        propertyCount: Object.keys(response.properties).length,
      });

      return response;
    }, `getDatabaseSchema(${databaseId})`, cacheKey);
  }

  // Property Utilities
  extractTitle(property: NotionProperty): string {
    try {
      return NotionPropertyExtractors.extractTitle(property);
    } catch (error) {
      logger.error('Failed to extract title property', { error: (error as Error).message });
      return '';
    }
  }

  extractNumber(property: NotionProperty): number | null {
    try {
      return NotionPropertyExtractors.extractNumber(property);
    } catch (error) {
      logger.error('Failed to extract number property', { error: (error as Error).message });
      return null;
    }
  }

  extractSelect(property: NotionProperty): string | null {
    try {
      return NotionPropertyExtractors.extractSelect(property);
    } catch (error) {
      logger.error('Failed to extract select property', { error: (error as Error).message });
      return null;
    }
  }

  extractDate(property: NotionProperty): Date | null {
    try {
      return NotionPropertyExtractors.extractDate(property);
    } catch (error) {
      logger.error('Failed to extract date property', { error: (error as Error).message });
      return null;
    }
  }

  extractMultiSelect(property: NotionProperty): string[] {
    try {
      return NotionPropertyExtractors.extractMultiSelect(property);
    } catch (error) {
      logger.error('Failed to extract multi-select property', { error: (error as Error).message });
      return [];
    }
  }

  extractText(property: NotionProperty): string {
    try {
      return NotionPropertyExtractors.extractRichText(property);
    } catch (error) {
      logger.error('Failed to extract text property', { error: (error as Error).message });
      return '';
    }
  }

  // Property Formatters
  formatTitleProperty(value: string): any {
    return { title: NotionPropertyFormatters.formatTitle(value) };
  }

  formatNumberProperty(value: number): any {
    return { number: value };
  }

  formatSelectProperty(value: string): any {
    return { select: NotionPropertyFormatters.formatSelect(value) };
  }

  formatDateProperty(value: Date): any {
    return { date: NotionPropertyFormatters.formatDate(value) };
  }

  formatTextProperty(value: string): any {
    return { rich_text: NotionPropertyFormatters.formatRichText(value) };
  }

  formatMultiSelectProperty(values: string[]): any {
    return { multi_select: NotionPropertyFormatters.formatMultiSelect(values) };
  }

  // Legacy methods for backward compatibility
  formatTitle = this.formatTitleProperty;
  formatNumber = this.formatNumberProperty;
  formatSelect = this.formatSelectProperty;
  formatDate = this.formatDateProperty;
  formatText = this.formatTextProperty;
  formatMultiSelect = this.formatMultiSelectProperty;

  // Utility methods for page property extraction
  extractPropertyValue<T = any>(
    page: NotionPageBase,
    propertyName: string,
    extractor: (property: NotionProperty) => T,
  ): T | null {
    const property = page.properties[propertyName];
    if (!property) {
      logger.warn('Property not found', { pageId: page.id, propertyName });
      return null;
    }

    try {
      return extractor(property);
    } catch (error) {
      logger.error('Failed to extract property value', {
        pageId: page.id,
        propertyName,
        propertyType: property.type,
        error: (error as Error).message,
      });
      return null;
    }
  }

  // Performance and monitoring methods
  getMetrics(): {
    totalRequests: number;
    successRate: number;
    averageResponseTime: number;
    errorsByType: Record<string, number>;
    cacheHitRate: number;
  } {
    if (this.metrics.length === 0) {
      return {
        totalRequests: 0,
        successRate: 0,
        averageResponseTime: 0,
        errorsByType: {},
        cacheHitRate: 0,
      };
    }

    const successful = this.metrics.filter(m => m.success).length;
    const totalRequests = this.metrics.length;
    const successRate = (successful / totalRequests) * 100;

    const completedMetrics = this.metrics.filter(m => m.duration !== undefined);
    const averageResponseTime = completedMetrics.length > 0
      ? completedMetrics.reduce((sum, m) => sum + m.duration!, 0) / completedMetrics.length
      : 0;

    const errorsByType: Record<string, number> = {};
    this.metrics.filter(m => !m.success && m.error).forEach(m => {
      const errorType = m.error!.constructor.name;
      errorsByType[errorType] = (errorsByType[errorType] || 0) + 1;
    });

    return {
      totalRequests,
      successRate,
      averageResponseTime,
      errorsByType,
      cacheHitRate: 0, // Would need to track cache hits separately
    };
  }

  clearCache(): void {
    this.cache.clear();
    logger.info('Cache cleared');
  }

  getCacheStats(): { size: number; maxSize: number; hitRate: number } {
    return {
      size: this.cache.size,
      maxSize: this.config.cache.maxSize,
      hitRate: 0, // Would need to track hits/misses
    };
  }
}