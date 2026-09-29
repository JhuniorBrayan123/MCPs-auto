export interface JenkinsConfig {
  baseUrl: string;
  user: string;
  token: string;
  timeoutMs: number;
  insecureTls: boolean;
}

export class JenkinsHttpError extends Error {
  constructor(
    public status: number,
    public statusText: string,
    public url: string,
    bodySnippet?: string
  ) {
    super(
      `Jenkins respondió ${status} ${statusText} para ${url}${
        bodySnippet ? `\n${bodySnippet}` : ""
      }`
    );
    this.name = "JenkinsHttpError";
  }
}

/**
 * Convierte una ruta de job "carpeta/subcarpeta/job" (como se ve en la UI)
 * a la ruta de la API de Jenkins "job/carpeta/job/subcarpeta/job/job",
 * que es como Jenkins expone folders (plugin CloudBees Folders) vía REST.
 */
export function jobApiPath(jobPath: string): string {
  const segments = jobPath
    .split("/")
    .map((s) => s.trim())
    .filter(Boolean);
  if (segments.length === 0) {
    throw new Error("jobPath no puede estar vacío");
  }
  return segments.map((s) => `job/${encodeURIComponent(s)}`).join("/");
}

export class JenkinsClient {
  private crumbCache: { field: string; value: string } | null = null;
  private crumbFetchFailed = false;

  constructor(private config: JenkinsConfig) {
    if (config.insecureTls) {
      // Solo afecta a este proceso Node; documentado como opción insegura
      // para labs con certificados autofirmados sin CA de confianza.
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
    }
  }

  private authHeader(): string {
    const raw = `${this.config.user}:${this.config.token}`;
    return `Basic ${Buffer.from(raw, "utf8").toString("base64")}`;
  }

  private buildUrl(path: string, params?: Record<string, string | number | undefined>): string {
    const url = new URL(
      path.startsWith("/") ? path.slice(1) : path,
      this.config.baseUrl.endsWith("/") ? this.config.baseUrl : `${this.config.baseUrl}/`
    );
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined) url.searchParams.set(key, String(value));
      }
    }
    return url.toString();
  }

  private async fetchWithTimeout(url: string, init: RequestInit): Promise<Response> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.config.timeoutMs);
    try {
      return await fetch(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
  }

  private async getCrumb(): Promise<{ field: string; value: string } | null> {
    if (this.crumbCache) return this.crumbCache;
    if (this.crumbFetchFailed) return null;
    try {
      const url = this.buildUrl("crumbIssuer/api/json");
      const res = await this.fetchWithTimeout(url, {
        headers: { Authorization: this.authHeader() },
      });
      if (!res.ok) {
        // Muchas instancias corren sin CSRF crumb habilitado: no es un error fatal.
        this.crumbFetchFailed = true;
        return null;
      }
      const body = (await res.json()) as { crumbRequestField: string; crumb: string };
      this.crumbCache = { field: body.crumbRequestField, value: body.crumb };
      return this.crumbCache;
    } catch {
      this.crumbFetchFailed = true;
      return null;
    }
  }

  async getJson<T = unknown>(
    path: string,
    params?: Record<string, string | number | undefined>
  ): Promise<T> {
    const url = this.buildUrl(path, params);
    const res = await this.fetchWithTimeout(url, {
      headers: { Authorization: this.authHeader(), Accept: "application/json" },
    });
    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      throw new JenkinsHttpError(res.status, res.statusText, url, snippet.slice(0, 500));
    }
    return (await res.json()) as T;
  }

  async getText(path: string, params?: Record<string, string | number | undefined>): Promise<string> {
    const url = this.buildUrl(path, params);
    const res = await this.fetchWithTimeout(url, {
      headers: { Authorization: this.authHeader() },
    });
    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      throw new JenkinsHttpError(res.status, res.statusText, url, snippet.slice(0, 500));
    }
    return await res.text();
  }

  /** POST con crumb CSRF automático (si Jenkins lo requiere) y body form-urlencoded opcional. */
  async postForm(
    path: string,
    params?: Record<string, string | number | undefined>,
    form?: Record<string, string>
  ): Promise<Response> {
    const url = this.buildUrl(path, params);
    const crumb = await this.getCrumb();
    const headers: Record<string, string> = { Authorization: this.authHeader() };
    if (crumb) headers[crumb.field] = crumb.value;

    let body: string | undefined;
    if (form && Object.keys(form).length > 0) {
      headers["Content-Type"] = "application/x-www-form-urlencoded";
      body = new URLSearchParams(form).toString();
    }

    const res = await this.fetchWithTimeout(url, { method: "POST", headers, body });
    if (!res.ok) {
      const snippet = await res.text().catch(() => "");
      throw new JenkinsHttpError(res.status, res.statusText, url, snippet.slice(0, 500));
    }
    return res;
  }
}
