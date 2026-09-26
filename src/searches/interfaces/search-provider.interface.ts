export interface SearchResultItem {
  title: string;
  url: string;
  snippet: string;
}

export interface SearchResponse {
  query: string;
  results: SearchResultItem[];
}

export interface SearchProvider {
  search(query: string, options?: { limit?: number }): Promise<SearchResponse>;
}
