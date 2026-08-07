type BookStackRequestOptions = {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  body?: unknown;
};

export class BookStackClient {
  private readonly baseUrl: string;
  private readonly tokenId: string;
  private readonly tokenSecret: string;

  constructor() {
    const baseUrl = process.env.BOOKSTACK_BASE_URL;
    const tokenId = process.env.BOOKSTACK_TOKEN_ID;
    const tokenSecret = process.env.BOOKSTACK_TOKEN_SECRET;

    if (!baseUrl || !tokenId || !tokenSecret) {
      throw new Error(
        "Faltan variables BOOKSTACK_BASE_URL, BOOKSTACK_TOKEN_ID o BOOKSTACK_TOKEN_SECRET"
      );
    }

    this.baseUrl = baseUrl.replace(/\/$/, "");
    this.tokenId = tokenId;
    this.tokenSecret = tokenSecret;
  }

  private async request<T>(
    path: string,
    options: BookStackRequestOptions = {}
  ): Promise<T> {
    const url = `${this.baseUrl}${path}`;

    const response = await fetch(url, {
      method: options.method ?? "GET",
      headers: {
        "Authorization": `Token ${this.tokenId}:${this.tokenSecret}`,
        "Content-Type": "application/json",
        "Accept": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    });

    const text = await response.text();

    if (!response.ok) {
      throw new Error(
        `BookStack API error ${response.status} ${response.statusText}: ${text}`
      );
    }

    if (!text) {
      return {} as T;
    }

    return JSON.parse(text) as T;
  }

  async listBooks() {
    return this.request("/api/books");
  }

  async listChapters() {
    return this.request("/api/chapters");
  }

  async search(query: string) {
    return this.request(`/api/search?query=${encodeURIComponent(query)}`);
  }

  async listShelves() {
    return this.request("/api/shelves");
  }

  async getShelf(shelfId: number) {
    return this.request(`/api/shelves/${shelfId}`);
  }

  async getBook(bookId: number) {
    return this.request(`/api/books/${bookId}`);
  }

  async getChapter(chapterId: number) {
    return this.request(`/api/chapters/${chapterId}`);
  }

  async listPages(params: { bookId?: number; chapterId?: number; page?: number; count?: number } = {}) {
    const search = new URLSearchParams();

    if (params.bookId) search.set("book_id", String(params.bookId));
    if (params.chapterId) search.set("chapter_id", String(params.chapterId));
    if (params.count) search.set("count", String(params.count));

    const qs = search.toString();

    return this.request(`/api/pages${qs ? `?${qs}` : ""}`);
  }

  async getPage(pageId: number) {
    return this.request(`/api/pages/${pageId}`);
  }

  async createPage(params: {
    name: string;
    book_id?: number;
    chapter_id?: number;
    markdown: string;
    tags?: Array<{ name: string; value?: string }>;
  }) {
    if (!params.book_id && !params.chapter_id) {
      throw new Error("Debes enviar book_id o chapter_id para crear una página");
    }

    return this.request("/api/pages", {
      method: "POST",
      body: params
    });
  }

  async updatePage(params: {
    pageId: number;
    name?: string;
    markdown: string;
    tags?: Array<{ name: string; value?: string }>;
  }) {
    return this.request(`/api/pages/${params.pageId}`, {
      method: "PUT",
      body: {
        name: params.name,
        markdown: params.markdown,
        tags: params.tags
      }
    });
  }
}
