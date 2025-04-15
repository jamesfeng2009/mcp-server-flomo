const defaultApiUrl = "https://flomoapp.com/iwh/XXXX/XXXX/";

let currentApiUrl = process.env.FLOMO_API_URL || defaultApiUrl;

export const config = {
  get flomoApiUrl() {
    return currentApiUrl;
  },
  setFlomoApiUrl(url: string) {
    currentApiUrl = url;
  }
}; 