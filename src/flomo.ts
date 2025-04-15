/**
 * Flomo client used to interact with the Flomo API.
 */
export class FlomoClient {
  private readonly apiUrl: string;

  /**
   * Create a new Flomo client.
   * @param apiUrl - The API URL of the Flomo API.
   */
  constructor({ apiUrl }: { apiUrl: string }) {
    this.apiUrl = apiUrl;
    console.error('[FlomoClient] Initialized with API URL:', this.apiUrl);
  }

  /**
   * Write a note to Flomo.
   * @param content - The content of the note.
   * @returns The response from the Flomo API.
   */
  async writeNote({ content }: { content: string }) {
    console.error('[FlomoClient] Starting writeNote with content:', content.substring(0, 50) + (content.length > 50 ? '...' : ''));
    try {
      if (!content) {
        console.error('[FlomoClient] Content is empty');
        throw new Error("invalid content");
      }

      const req = {
        content,
      };
      console.error('[FlomoClient] Sending request to:', this.apiUrl);
      console.error('[FlomoClient] Request payload:', JSON.stringify(req, null, 2));

      try {
        const resp = await fetch(this.apiUrl.trim(), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": "MCP-Server-Flomo/1.0"
          },
          body: JSON.stringify(req),
        });
        
        console.error('[FlomoClient] Response status:', resp.status, resp.statusText);
        console.error('[FlomoClient] Response headers:', JSON.stringify(Object.fromEntries([...resp.headers]), null, 2));

        if (!resp.ok) {
          console.error('[FlomoClient] Request failed with status:', resp.status, resp.statusText);
          const errorText = await resp.text();
          console.error('[FlomoClient] Error response:', errorText);
          try {
            return JSON.parse(errorText);
          } catch (e) {
            return { error: `request failed with status ${resp.status} ${resp.statusText}`, raw: errorText };
          }
        }

        const responseText = await resp.text();
        console.error('[FlomoClient] Raw response text:', responseText);
        
        let result;
        try {
          result = JSON.parse(responseText);
          console.error('[FlomoClient] Parsed result:', JSON.stringify(result, null, 2));
        } catch (e) {
          console.error('[FlomoClient] Failed to parse response as JSON:', e);
          return { error: 'Failed to parse JSON response', raw: responseText };
        }

        if (result && result.memo && result.memo.slug) {
          const memoUrl = `https://v.flomoapp.com/mine/?memo_id=${result.memo.slug}`;
          result.memo.url = memoUrl;
          console.error('[FlomoClient] Added memo URL:', memoUrl);
        } else {
          console.error('[FlomoClient] No memo slug found in response');
        }

        return result;
      } catch (networkError: any) {
        console.error('[FlomoClient] Network error:', networkError);
        return { error: `Network error: ${networkError.message}` };
      }
    } catch (e) {
      console.error('[FlomoClient] Error in writeNote:', e);
      return { error: e instanceof Error ? e.message : 'Unknown error' };
    }
  }
}
