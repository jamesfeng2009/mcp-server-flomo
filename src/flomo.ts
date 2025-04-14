export class FlomoClient {
  private readonly apiUrl: string;

  constructor(apiKey: string) {
    this.apiUrl = apiKey;
  }

  async writeNote({content}: {content: string}) {
    try {
        if (!content) {
            throw new Error('Content is required');
        }

        const req = {
            content,
        };

        const res = await fetch(this.apiUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(req),
        });

        if (res.ok) {
            return res.json();
        } else {
            throw new Error(`Failed to write note: ${res.status} ${res.statusText}`);
        }
    } catch (error) {
      throw error;
    }
  }
}