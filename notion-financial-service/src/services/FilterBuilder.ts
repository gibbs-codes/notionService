export interface NotionFilter {
  property: string;
  [key: string]: any;
}

export interface NotionSort {
  property: string;
  direction: 'ascending' | 'descending';
}

export class FilterBuilder {
  private filters: NotionFilter[] = [];

  // Text property filters
  textEquals(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      rich_text: {
        equals: value,
      },
    });
    return this;
  }

  textContains(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      rich_text: {
        contains: value,
      },
    });
    return this;
  }

  textStartsWith(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      rich_text: {
        starts_with: value,
      },
    });
    return this;
  }

  textIsEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      rich_text: {
        is_empty: true,
      },
    });
    return this;
  }

  textIsNotEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      rich_text: {
        is_not_empty: true,
      },
    });
    return this;
  }

  // Title property filters
  titleEquals(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      title: {
        equals: value,
      },
    });
    return this;
  }

  titleContains(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      title: {
        contains: value,
      },
    });
    return this;
  }

  titleStartsWith(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      title: {
        starts_with: value,
      },
    });
    return this;
  }

  // Number property filters
  numberEquals(property: string, value: number): FilterBuilder {
    this.filters.push({
      property,
      number: {
        equals: value,
      },
    });
    return this;
  }

  numberGreaterThan(property: string, value: number): FilterBuilder {
    this.filters.push({
      property,
      number: {
        greater_than: value,
      },
    });
    return this;
  }

  numberLessThan(property: string, value: number): FilterBuilder {
    this.filters.push({
      property,
      number: {
        less_than: value,
      },
    });
    return this;
  }

  numberGreaterThanOrEqual(property: string, value: number): FilterBuilder {
    this.filters.push({
      property,
      number: {
        greater_than_or_equal_to: value,
      },
    });
    return this;
  }

  numberLessThanOrEqual(property: string, value: number): FilterBuilder {
    this.filters.push({
      property,
      number: {
        less_than_or_equal_to: value,
      },
    });
    return this;
  }

  numberIsEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      number: {
        is_empty: true,
      },
    });
    return this;
  }

  numberIsNotEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      number: {
        is_not_empty: true,
      },
    });
    return this;
  }

  // Select property filters
  selectEquals(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      select: {
        equals: value,
      },
    });
    return this;
  }

  selectIsEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      select: {
        is_empty: true,
      },
    });
    return this;
  }

  selectIsNotEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      select: {
        is_not_empty: true,
      },
    });
    return this;
  }

  // Multi-select property filters
  multiSelectContains(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      multi_select: {
        contains: value,
      },
    });
    return this;
  }

  multiSelectDoesNotContain(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      multi_select: {
        does_not_contain: value,
      },
    });
    return this;
  }

  multiSelectIsEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      multi_select: {
        is_empty: true,
      },
    });
    return this;
  }

  multiSelectIsNotEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      multi_select: {
        is_not_empty: true,
      },
    });
    return this;
  }

  // Date property filters
  dateEquals(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        equals: value,
      },
    });
    return this;
  }

  dateBefore(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        before: value,
      },
    });
    return this;
  }

  dateAfter(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        after: value,
      },
    });
    return this;
  }

  dateOnOrBefore(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        on_or_before: value,
      },
    });
    return this;
  }

  dateOnOrAfter(property: string, value: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        on_or_after: value,
      },
    });
    return this;
  }

  dateIsEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        is_empty: true,
      },
    });
    return this;
  }

  dateIsNotEmpty(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        is_not_empty: true,
      },
    });
    return this;
  }

  // Checkbox property filters
  checkboxEquals(property: string, value: boolean): FilterBuilder {
    this.filters.push({
      property,
      checkbox: {
        equals: value,
      },
    });
    return this;
  }

  // Date range helpers
  dateRange(property: string, startDate: string, endDate: string): FilterBuilder {
    return this.dateOnOrAfter(property, startDate).dateOnOrBefore(property, endDate);
  }

  dateThisWeek(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        this_week: {},
      },
    });
    return this;
  }

  dateThisMonth(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        this_month: {},
      },
    });
    return this;
  }

  dateThisYear(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        this_year: {},
      },
    });
    return this;
  }

  datePastWeek(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        past_week: {},
      },
    });
    return this;
  }

  datePastMonth(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        past_month: {},
      },
    });
    return this;
  }

  datePastYear(property: string): FilterBuilder {
    this.filters.push({
      property,
      date: {
        past_year: {},
      },
    });
    return this;
  }

  // Build the final filter object
  build(): any {
    if (this.filters.length === 0) {
      return undefined;
    }

    if (this.filters.length === 1) {
      return this.filters[0];
    }

    return {
      and: this.filters,
    };
  }

  // Logical operators
  static and(filters: NotionFilter[]): any {
    return {
      and: filters,
    };
  }

  static or(filters: NotionFilter[]): any {
    return {
      or: filters,
    };
  }

  // Clear filters
  clear(): FilterBuilder {
    this.filters = [];
    return this;
  }

  // Get current filters
  getFilters(): NotionFilter[] {
    return [...this.filters];
  }
}

export class SortBuilder {
  private sorts: NotionSort[] = [];

  ascending(property: string): SortBuilder {
    this.sorts.push({
      property,
      direction: 'ascending',
    });
    return this;
  }

  descending(property: string): SortBuilder {
    this.sorts.push({
      property,
      direction: 'descending',
    });
    return this;
  }

  // Timestamp sorts
  createdTimeAscending(): SortBuilder {
    this.sorts.push({
      property: 'created_time',
      direction: 'ascending',
    });
    return this;
  }

  createdTimeDescending(): SortBuilder {
    this.sorts.push({
      property: 'created_time',
      direction: 'descending',
    });
    return this;
  }

  lastEditedTimeAscending(): SortBuilder {
    this.sorts.push({
      property: 'last_edited_time',
      direction: 'ascending',
    });
    return this;
  }

  lastEditedTimeDescending(): SortBuilder {
    this.sorts.push({
      property: 'last_edited_time',
      direction: 'descending',
    });
    return this;
  }

  build(): NotionSort[] {
    return [...this.sorts];
  }

  clear(): SortBuilder {
    this.sorts = [];
    return this;
  }

  getSorts(): NotionSort[] {
    return [...this.sorts];
  }
}

// Convenience functions
export const filter = (): FilterBuilder => new FilterBuilder();
export const sort = (): SortBuilder => new SortBuilder();