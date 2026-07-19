# bypass.vip API

This project uses the bypass.vip Premium API to bypass supported links.

## Authentication

Send your API key in the `x-api-key` request header. Keep the key on your server and do not expose it in frontend code.

## Bypass a link

Send a `GET` request to:

```txt
https://api.bypass.vip/premium/bypass?url=LINK_TO_BYPASS
```

Example with cURL:

```sh
curl --get 'https://api.bypass.vip/premium/bypass' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data-urlencode 'url=https://example.com/your-link'
```

Example with JavaScript:

```js
const requestUrl = new URL('https://api.bypass.vip/premium/bypass');
requestUrl.searchParams.set('url', 'https://example.com/your-link');

const response = await fetch(requestUrl, {
  headers: {
    'x-api-key': process.env.BYPASS_API_KEY
  }
});

if (!response.ok) {
  throw new Error(`bypass.vip returned HTTP ${response.status}`);
}

const data = await response.json();
console.log(data.result);
```

A successful response contains the bypassed result:

```json
{
  "result": "https://destination.example/file"
}
```

The result can sometimes be another supported link. If needed, send that URL through the endpoint again. This project follows up to five results automatically.

## Refresh a result

To request a fresh result instead of a cached one, use the `refresh` endpoint with the same header and query parameter:

```sh
curl --get 'https://api.bypass.vip/premium/refresh' \
  --header 'x-api-key: YOUR_API_KEY' \
  --data-urlencode 'url=https://example.com/your-link'
```

## Configuration in this project

Add the following values to `.env`:

```env
BYPASS_API_KEY=your_api_key
BYPASS_API_AUTH_HEADER=x-api-key
```

