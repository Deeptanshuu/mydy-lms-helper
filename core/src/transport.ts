export interface Page {
  /** Final URL after redirects. */
  url: string
  status: number
  html: string
}

export interface Transport {
  get(url: string): Promise<Page>
  post(url: string, form: Record<string, string>): Promise<Page>
  /** Streams a file. The caller must consume or cancel the body. */
  download(url: string): Promise<Response>
}
