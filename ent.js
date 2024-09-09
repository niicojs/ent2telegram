import { ProxyAgent } from 'undici';
import { createFetch } from 'ofetch';
import makeFetchCookie from 'fetch-cookie';
import sanitizeHtml from 'sanitize-html';

const clean = (html) =>
  sanitizeHtml(html, {
    allowedTags: ['b', 'i', 'u', 's', 'a', 'div', 'br'],
  })
    .replace(/(\<br ?\/?\>)|(\<div\>)/g, '\n')
    .replace(/(\<\/div\>)/g, '')
    .replace(/(\n)+/g, '\n');

export default function Ent(config, history) {
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

  const guessType = (info) => {
    if (info.contentType.startsWith('image')) {
      return 'photo';
    } else if (info.contentType.startsWith('video')) {
      return 'video';
    }
    return 'document';
  };

  const inbox = async () => {
    // get inbox
    const data = await client('/conversation/list/inbox?page=0&unread=false');

    let messages = data.map((m) => ({
      id: m.id,
      type: 'Message',
      child,
      date: new Date(m.date),
      from: m.displayNames.find((d) => d[0] === m.from)[1],
      subject: m.subject,
      html: '',
      attachments: [],
    }));

    // filter already read
    messages = messages.filter((p) => !history.find((h) => h.id === p.id));

    // get details for unread
    if (messages.length > 0) {
      for (const msg of messages) {
        const detail = await client(`/conversation/message/${msg.id}`);
        msg.html = clean(detail.body);
        msg.attachments = await Promise.all(
          detail.attachments.map(async (a) => ({
            id: a.id,
            name: a.filename,
            type: guessType(a),
            data: await client(
              `/conversation/message/${msg.id}/attachment/${a.id}`
            ),
          }))
        );
      }
    }

    return messages;
  };

  const notifications = async () => {
    const data = await client(
      '/timeline/lastNotifications?type=ARCHIVE&type=BLOG&type=CALENDAR&type=COLLABORATIVEEDITOR&type=COLLABORATIVEWALL&type=COMMUNITY&type=EXERCIZER&type=FORMULAIRE&type=FORUM&type=HOMEWORKS&type=MINDMAP&type=NEWS&type=PAGES&type=POLL&type=PRESENCES&type=RACK&type=RBS&type=SCHOOLBOOK&type=SCRAPBOOK&type=SHAREBIGFILES&type=SUPPORT&type=TIMELINE&type=TIMELINEGENERATOR&type=USERBOOK&type=USERBOOK_MOOD&type=USERBOOK_MOTTO&type=WIKI&type=WORKSPACE&page=0'
    );

    let notifs = data.results.map((p) => ({
      id: p._id,
      type: p.type,
      child,
      date: new Date(p.date.$date),
      from: clean(p.params.username),
      subject: clean(p.params.subject || p.params.resourceName),
      html: clean(p.message).replace(/(\r?\n)+/g, '\n'),
    }));

    notifs = notifs.filter((p) => !history.find((h) => h.id === p.id));

    return notifs;
  };

  return { login, inbox, notifications };
}
