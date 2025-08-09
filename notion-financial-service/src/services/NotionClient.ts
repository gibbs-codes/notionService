import { Client } from '@notionhq/client';
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
  rateLimit?: {
    requestsPerSecond: number;
  };
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

interface RetryContext {
  attempt: number;
  lastError: Error;
  delay: number;
}

export class NotionClient {
  private client: Client;
  private config: Required<NotionClientConfig>;
  private lastRequestTime = 0;
  private requestQueue: Array<() => void> = [];

  constructor(config: NotionClientConfig) {
    this.config = {
      maxRetries: 3,
      baseDelay: 1000,
      maxDelay: 10000,
      rateLimit: {
        requestsPerSecond: 3,
      },
      ...config,
    };

    this.client = new Client({
      auth: this.config.token,
    });

    logger.info('NotionClient initialized', {
      maxRetries: this.config.maxRetries,
      rateLimit: this.config.rateLimit,
    });
  }

  private async enforceRateLimit(): Promise<void> {
    const minInterval = 1000 / this.config.rateLimit.requestsPerSecond;
    const now = Date.now();
    const timeSinceLastRequest = now - this.lastRequestTime;

    if (timeSinceLastRequest < minInterval) {
      const delay = minInterval - timeSinceLastRequest;
      logger.debug('Rate limiting: waiting', { delay });
      await this.sleep(delay);
    }

    this.lastRequestTime = Date.now();
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
    if (error?.code) {
      switch (error.code) {
        case 'unauthorized':
          return new NotionAuthError(error.message || 'Unauthorized access to Notion API');
        case 'forbidden':
          return new NotionPermissionError(error.message || 'Insufficient permissions');
        case 'object_not_found':
          return new NotionNotFoundError(error.message || 'Resource not found');
        case 'rate_limited':
          const retryAfter = error?.headers?.['retry-after'];
          return new NotionRateLimitError(
            error.message || 'Rate limit exceeded',
            retryAfter ? parseInt(retryAfter) : undefined,
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
  ): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        await this.enforceRateLimit();
        
        logger.debug('Executing Notion operation', {
          operation: operationName,
          attempt: attempt + 1,
          maxRetries: this.config.maxRetries + 1,
        });

        const result = await operation();
        
        if (attempt > 0) {
          logger.info('Notion operation succeeded after retry', {
            operation: operationName,
            attempt: attempt + 1,
          });
        }

        return result;
      } catch (error: any) {
        lastError = this.handleNotionError(error);

        logger.warn('Notion operation failed', {
          operation: operationName,
          attempt: attempt + 1,
          error: lastError.message,
          code: lastError.code,
        });

        if (attempt === this.config.maxRetries) {
          break;
        }

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

    logger.error('Notion operation failed after all retries', {
      operation: operationName,
      maxRetries: this.config.maxRetries,
      finalError: lastError!.message,
    });

    throw lastError!;
  }

  async queryDatabase(
    databaseId: string,
    query: DatabaseQuery = {},
  ): Promise<NotionPageBase[]> {
    return this.withRetry(async () => {
      const response = await this.client.databases.query({
        database_id: databaseId,
        filter: query.filter,
        sorts: query.sorts,
        start_cursor: query.start_cursor,
        page_size: query.page_size || 100,
      });

      logger.debug('Database query successful', {
        databaseId,
        resultCount: response.results.length,
        hasMore: response.has_more,
      });

      return response.results as NotionPageBase[];
    }, `queryDatabase(${databaseId})`);
  }

  async createPage(
    databaseId: string,
    properties: Record<string, any>,
    content?: any[],
  ): Promise<NotionPageBase> {
    return this.withRetry(async () => {
      const response = await this.client.pages.create({
        parent: { database_id: databaseId },
        properties,
        children: content,
      });

      logger.info('Page created successfully', {
        databaseId,
        pageId: response.id,
        properties: Object.keys(properties),
      });

      return response as NotionPageBase;
    }, `createPage(${databaseId})`);
  }

  async updatePage(
    pageId: string,
    properties: Record<string, any>,
  ): Promise<NotionPageBase> {
    return this.withRetry(async () => {
      const response = await this.client.pages.update({
        page_id: pageId,
        properties,
      });

      logger.info('Page updated successfully', {
        pageId,
        properties: Object.keys(properties),
      });

      return response as NotionPageBase;
    }, `updatePage(${pageId})`);
  }

  async getPage(pageId: string): Promise<NotionPageBase> {
    return this.withRetry(async () => {
      const response = await this.client.pages.retrieve({
        page_id: pageId,
      });

      logger.debug('Page retrieved successfully', {
        pageId,
        lastEdited: (response as NotionPageBase).last_edited_time,
      });

      return response as NotionPageBase;
    }, `getPage(${pageId})`);
  }

  async getDatabaseSchema(databaseId: string): Promise<any> {
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
    }, `getDatabaseSchema(${databaseId})`);
  }

  // Property extraction utilities
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

  // Convenience methods using property extractors
  extractTitle(page: NotionPageBase, propertyName: string): string {
    return this.extractPropertyValue(page, propertyName, NotionPropertyExtractors.extractTitle) || '';
  }

  extractText(page: NotionPageBase, propertyName: string): string {
    return this.extractPropertyValue(page, propertyName, NotionPropertyExtractors.extractRichText) || '';
  }

  extractNumber(page: NotionPageBase, propertyName: string): number | null {
    return this.extractPropertyValue(page, propertyName, NotionPropertyExtractors.extractNumber);
  }

  extractSelect(page: NotionPageBase, propertyName: string): string | null {
    return this.extractPropertyValue(page, propertyName, NotionPropertyExtractors.extractSelect);
  }

  extractMultiSelect(page: NotionPageBase, propertyName: string): string[] {
    return this.extractPropertyValue(page, propertyName, NotionPropertyExtractors.extractMultiSelect) || [];
  }

  extractDate(page: NotionPageBase, propertyName: string): Date | null {
    return this.extractPropertyValue(page, propertyName, NotionPropertyExtractors.extractDate);
  }

  extractCheckbox(page: NotionPageBase, propertyName: string): boolean {
    return this.extractPropertyValue(page, propertyName, NotionPropertyExtractors.extractCheckbox) || false;
  }

  // Property formatting utilities
  formatTitle(text: string): any {
    return { title: NotionPropertyFormatters.formatTitle(text) };
  }

  formatText(text: string): any {
    return { rich_text: NotionPropertyFormatters.formatRichText(text) };
  }

  formatNumber(value: number): any {
    return { number: value };
  }

  formatSelect(value: string): any {
    return { select: NotionPropertyFormatters.formatSelect(value) };
  }

  formatMultiSelect(values: string[]): any {
    return { multi_select: NotionPropertyFormatters.formatMultiSelect(values) };
  }

  formatDate(date: Date): any {
    return { date: NotionPropertyFormatters.formatDate(date) };
  }

  formatDateTime(date: Date): any {
    return { date: NotionPropertyFormatters.formatDateTime(date) };
  }

  formatCheckbox(value: boolean): any {
    return { checkbox: value };
  }
}