import { z } from 'zod';

export interface NotionRichText {
  type: 'text';
  text: {
    content: string;
    link?: { url: string } | null;
  };
  annotations: {
    bold: boolean;
    italic: boolean;
    strikethrough: boolean;
    underline: boolean;
    code: boolean;
    color: string;
  };
  plain_text: string;
  href?: string | null;
}

export interface NotionTitle {
  id: string;
  type: 'title';
  title: NotionRichText[];
}

export interface NotionRichTextProperty {
  id: string;
  type: 'rich_text';
  rich_text: NotionRichText[];
}

export interface NotionNumber {
  id: string;
  type: 'number';
  number: number | null;
}

export interface NotionSelect {
  id: string;
  type: 'select';
  select: {
    id: string;
    name: string;
    color: string;
  } | null;
}

export interface NotionMultiSelect {
  id: string;
  type: 'multi_select';
  multi_select: Array<{
    id: string;
    name: string;
    color: string;
  }>;
}

export interface NotionDate {
  id: string;
  type: 'date';
  date: {
    start: string;
    end?: string | null;
    time_zone?: string | null;
  } | null;
}

export interface NotionCheckbox {
  id: string;
  type: 'checkbox';
  checkbox: boolean;
}

export interface NotionUrl {
  id: string;
  type: 'url';
  url: string | null;
}

export interface NotionEmail {
  id: string;
  type: 'email';
  email: string | null;
}

export interface NotionPhoneNumber {
  id: string;
  type: 'phone_number';
  phone_number: string | null;
}

export type NotionProperty =
  | NotionTitle
  | NotionRichTextProperty
  | NotionNumber
  | NotionSelect
  | NotionMultiSelect
  | NotionDate
  | NotionCheckbox
  | NotionUrl
  | NotionEmail
  | NotionPhoneNumber;

export interface NotionPageBase {
  id: string;
  created_time: string;
  last_edited_time: string;
  created_by: {
    object: string;
    id: string;
  };
  last_edited_by: {
    object: string;
    id: string;
  };
  cover?: {
    type: string;
    [key: string]: any;
  } | null;
  icon?: {
    type: string;
    [key: string]: any;
  } | null;
  parent: {
    type: string;
    database_id?: string;
    page_id?: string;
  };
  archived: boolean;
  properties: Record<string, NotionProperty>;
  url: string;
  public_url?: string | null;
}

export const NotionPropertyExtractors = {
  extractTitle: (property: NotionProperty): string => {
    if (property.type === 'title' && property.title.length > 0) {
      return property.title.map(t => t.plain_text).join('');
    }
    return '';
  },

  extractRichText: (property: NotionProperty): string => {
    if (property.type === 'rich_text' && property.rich_text.length > 0) {
      return property.rich_text.map(t => t.plain_text).join('');
    }
    return '';
  },

  extractNumber: (property: NotionProperty): number | null => {
    if (property.type === 'number') {
      return property.number;
    }
    return null;
  },

  extractSelect: (property: NotionProperty): string | null => {
    if (property.type === 'select' && property.select) {
      return property.select.name;
    }
    return null;
  },

  extractMultiSelect: (property: NotionProperty): string[] => {
    if (property.type === 'multi_select') {
      return property.multi_select.map(option => option.name);
    }
    return [];
  },

  extractDate: (property: NotionProperty): Date | null => {
    if (property.type === 'date' && property.date?.start) {
      return new Date(property.date.start);
    }
    return null;
  },

  extractCheckbox: (property: NotionProperty): boolean => {
    if (property.type === 'checkbox') {
      return property.checkbox;
    }
    return false;
  },

  extractUrl: (property: NotionProperty): string | null => {
    if (property.type === 'url') {
      return property.url;
    }
    return null;
  },

  extractEmail: (property: NotionProperty): string | null => {
    if (property.type === 'email') {
      return property.email;
    }
    return null;
  },

  extractPhoneNumber: (property: NotionProperty): string | null => {
    if (property.type === 'phone_number') {
      return property.phone_number;
    }
    return null;
  },
};

export const NotionPropertyFormatters = {
  formatTitle: (text: string): NotionTitle['title'] => [
    {
      type: 'text' as const,
      text: {
        content: text,
      },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: 'default',
      },
      plain_text: text,
    },
  ],

  formatRichText: (text: string): NotionRichTextProperty['rich_text'] => [
    {
      type: 'text' as const,
      text: {
        content: text,
      },
      annotations: {
        bold: false,
        italic: false,
        strikethrough: false,
        underline: false,
        code: false,
        color: 'default',
      },
      plain_text: text,
    },
  ],

  formatSelect: (name: string): NotionSelect['select'] => ({
    name,
    id: '',
    color: 'default',
  }),

  formatMultiSelect: (names: string[]): NotionMultiSelect['multi_select'] =>
    names.map(name => ({
      name,
      id: '',
      color: 'default',
    })),

  formatDate: (date: Date): NotionDate['date'] => ({
    start: date.toISOString().split('T')[0]!,
  }),

  formatDateTime: (date: Date): NotionDate['date'] => ({
    start: date.toISOString(),
  }),
};

export const DatabaseQuerySchema = z.object({
  filter: z.record(z.string(), z.any()).optional(),
  sorts: z.array(z.object({
    property: z.string(),
    direction: z.enum(['ascending', 'descending']),
  })).optional(),
  start_cursor: z.string().optional(),
  page_size: z.number().min(1).max(100).optional(),
});

export type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;

// Helper functions to convert Notion API responses to our types
export const NotionConverters = {
  // Convert Notion page to our SpendingRequest type
  pageToSpendingRequest: (page: NotionPageBase): any => {
    return {
      id: page.id,
      title: (page.properties['Title'] && NotionPropertyExtractors.extractTitle(page.properties['Title'])) ||
             (page.properties['Title'] && NotionPropertyExtractors.extractRichText(page.properties['Title'])),
      amount: page.properties['Amount'] && NotionPropertyExtractors.extractNumber(page.properties['Amount']),
      description: page.properties['Description'] && NotionPropertyExtractors.extractRichText(page.properties['Description']),
      category: page.properties['Category'] && NotionPropertyExtractors.extractSelect(page.properties['Category']),
      status: page.properties['Status'] && NotionPropertyExtractors.extractSelect(page.properties['Status']),
      requestDate: (page.properties['Request Date'] && NotionPropertyExtractors.extractDate(page.properties['Request Date'])) ||
                   new Date(page.created_time),
      decisionDate: page.properties['Decision Date'] && NotionPropertyExtractors.extractDate(page.properties['Decision Date']),
      reasoning: page.properties['Reasoning'] && NotionPropertyExtractors.extractRichText(page.properties['Reasoning']),
      urgency: page.properties['Urgency'] && NotionPropertyExtractors.extractSelect(page.properties['Urgency']),
      tags: page.properties['Tags'] && NotionPropertyExtractors.extractMultiSelect(page.properties['Tags']),
    };
  },

  // Convert our SpendingRequest to Notion page properties
  spendingRequestToNotionProperties: (request: any): Record<string, any> => {
    const properties: Record<string, any> = {};

    if (request.title) {
      properties['Title'] = NotionPropertyFormatters.formatTitle(request.title);
    }
    if (request.amount !== undefined) {
      properties['Amount'] = { number: request.amount };
    }
    if (request.description) {
      properties['Description'] = NotionPropertyFormatters.formatRichText(request.description);
    }
    if (request.category) {
      properties['Category'] = NotionPropertyFormatters.formatSelect(request.category);
    }
    if (request.status) {
      properties['Status'] = NotionPropertyFormatters.formatSelect(request.status);
    }
    if (request.requestDate) {
      properties['Request Date'] = NotionPropertyFormatters.formatDate(request.requestDate);
    }
    if (request.decisionDate) {
      properties['Decision Date'] = NotionPropertyFormatters.formatDate(request.decisionDate);
    }
    if (request.reasoning) {
      properties['Reasoning'] = NotionPropertyFormatters.formatRichText(request.reasoning);
    }
    if (request.urgency) {
      properties['Urgency'] = NotionPropertyFormatters.formatSelect(request.urgency);
    }
    if (request.tags && request.tags.length > 0) {
      properties['Tags'] = NotionPropertyFormatters.formatMultiSelect(request.tags);
    }

    return properties;
  },

  // Safe property extraction with fallbacks
  safeExtractText: (properties: Record<string, NotionProperty>, propertyName: string): string => {
    const property = properties[propertyName];
    if (!property) return '';

    if (property.type === 'title' && property.title) {
      return property.title.map(t => t.plain_text).join('');
    }
    if (property.type === 'rich_text' && property.rich_text) {
      return property.rich_text.map(t => t.plain_text).join('');
    }
    return '';
  },

  safeExtractNumber: (properties: Record<string, NotionProperty>, propertyName: string): number | null => {
    const property = properties[propertyName];
    if (!property || property.type !== 'number') return null;
    return property.number;
  },

  safeExtractSelect: (properties: Record<string, NotionProperty>, propertyName: string): string | null => {
    const property = properties[propertyName];
    if (!property || property.type !== 'select' || !property.select) return null;
    return property.select.name;
  },

  safeExtractDate: (properties: Record<string, NotionProperty>, propertyName: string): Date | null => {
    const property = properties[propertyName];
    if (!property || property.type !== 'date' || !property.date?.start) return null;
    return new Date(property.date.start);
  },

  safeExtractMultiSelect: (properties: Record<string, NotionProperty>, propertyName: string): string[] => {
    const property = properties[propertyName];
    if (!property || property.type !== 'multi_select') return [];
    return property.multi_select.map(option => option.name);
  },
};

// Validation helpers
export const NotionValidators = {
  validateSpendingRequestProperties: (properties: Record<string, any>): boolean => {
    const requiredFields = ['Title', 'Amount', 'Category', 'Status', 'Urgency'];
    return requiredFields.every(field => properties[field] !== undefined);
  },

  validatePropertyType: (property: NotionProperty, expectedType: string): boolean => {
    return property.type === expectedType;
  },
};