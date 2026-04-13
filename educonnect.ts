import { createFetch } from 'ofetch';
import makeFetchCookie from 'fetch-cookie';
import { ProxyAgent } from 'undici';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const fetchWithCookies = makeFetchCookie(fetch);
const ofetch = createFetch({
  fetch: fetchWithCookies,
  Headers,
  AbortController,
  defaults: {
    headers: {
      Accept:
        'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
      'Accept-Language': 'fr',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Safari/537.36',
    },
    dispatcher: new ProxyAgent({ uri: 'http://localhost:9090' }),
  },
});

const starturl =
  'https://www.moncollege-ent.essonne.fr/auth/saml/authn/relative?callBack&#x3D;https%3A%2F%2Fwww.moncollege-ent.essonne.fr%2F';
const start = await ofetch.raw(starturl);

const [, csrf] = start._data.match(/input type="hidden" name="csrf_token" value="(.+)"/);
console.log(csrf);

const data = new FormData();
data.append('csrf_token', csrf);
data.append('shib_idp_ls_exception.shib_idp_session_ss', '');
data.append('shib_idp_ls_success.shib_idp_session_ss', 'false');
data.append('shib_idp_ls_value.shib_idp_session_ss', '');
data.append('shib_idp_ls_exception.shib_idp_persistent_ss', '');
data.append('shib_idp_ls_success.shib_idp_persistent_ss', 'false');
data.append('shib_idp_ls_value.shib_idp_persistent_ss', '');
data.append('shib_idp_ls_supported', '');
data.append('_eventId_proceed', '');

const res = await ofetch.raw(start.url, {
  method: 'POST',
  body: data,
});

console.log(res._data);
console.log(res.url);
