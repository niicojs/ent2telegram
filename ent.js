import { ProxyAgent } from 'undici';
import { createFetch } from 'ofetch';
import makeFetchCookie from 'fetch-cookie';
import sanitizeHtml from 'sanitize-html';

export default function Ent(config) {
  const fetchWithCookies = makeFetchCookie(fetch);
  const ofetch = createFetch({
    fetch: fetchWithCookies,
    Headers,
    AbortController,
  });

  let client = ofetch.create({
    baseURL: config.ent_url,
  });
  if (config.proxy) {
    process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
    client = client.create({
      dispatcher: new ProxyAgent({
        uri: config.proxy,
      }),
    });
  }

  let child = '';

  const login = async () => {
    await client('/');
    await client('/auth/login', {
      method: 'POST',
      body: new URLSearchParams({
        email: config.login.user,
        password: config.login.password,
      }),
    });
    const info = await client('/auth/oauth2/userinfo');
    const childId = info.childrenIds.at(0);
    child = info.children[childId].firstName;
    return info;
  };

  const inbox = async () => {
    const unread = await client('/conversation/count/INBOX?unread=true');
    console.log(unread);
  };

  const notifications = async () => {
    const notifs = await client(
      '/timeline/lastNotifications?type=ARCHIVE&type=BLOG&type=CALENDAR&type=COLLABORATIVEEDITOR&type=COLLABORATIVEWALL&type=COMMUNITY&type=EXERCIZER&type=FORMULAIRE&type=FORUM&type=HOMEWORKS&type=MESSAGERIE&type=MINDMAP&type=NEWS&type=PAGES&type=POLL&type=PRESENCES&type=RACK&type=RBS&type=SCHOOLBOOK&type=SCRAPBOOK&type=SHAREBIGFILES&type=SUPPORT&type=TIMELINE&type=TIMELINEGENERATOR&type=USERBOOK&type=USERBOOK_MOOD&type=USERBOOK_MOTTO&type=WIKI&type=WORKSPACE&page=0'
    );

    const clean = (html) =>
      sanitizeHtml(html, { allowedTags: ['b', 'i', 'u', 's', 'a'] });

    return notifs.results.map((p) => ({
      id: p._id,
      type: p.type,
      child,
      date: new Date(p.date.$date),
      from: clean(p.params.usernam),
      subject: clean(p.params.subject || p.params.resourceName),
      html: clean(p.message).replace(/(\r?\n)+/g, '\n'),
    }));
  };

  https: return { login, inbox, notifications };
}
