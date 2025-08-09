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
    start: date.toISOString().split('T')[0],
  }),

  formatDateTime: (date: Date): NotionDate['date'] => ({
    start: date.toISOString(),
  }),
};

export const DatabaseQuerySchema = z.object({
  filter: z.record(z.any()).optional(),
  sorts: z.array(z.object({
    property: z.string(),
    direction: z.enum(['ascending', 'descending']),
  })).optional(),
  start_cursor: z.string().optional(),
  page_size: z.number().min(1).max(100).optional(),
});

export type DatabaseQuery = z.infer<typeof DatabaseQuerySchema>;