import sanitizeHtml from 'sanitize-html';
import type { Config } from './config.ts';
import type { Attach } from './telegram.ts';
import { chromium, type Page } from 'playwright-chromium';

const clean = (html: string) =>
  sanitizeHtml(html, {
    allowedTags: ['b', 'i', 'u', 's', 'a', 'div', 'p', 'br'],
  })
    .replace(/(<br ?\/?>)|(<div>)|(<p>)/g, '\n')
    .replace(/(<\/div>)|(<\/p>)/g, '')
    .replace(/(\n)+/g, '\n');

export default function Ent(config: Config, history: { id: string; date: Date }[]) {
  let base_url = config.ent_url;
  if (!base_url.endsWith('/')) base_url += '/';
  let page: Page;
  let child = '';
  let child_id = '';

  const http_get_json = async (path: string) => {
    const url = `${base_url}${path}`;
    const cookies = await page.context().cookies(url);
    const data = await page.request.get(url, {
      headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
    });
    return await data.json();
  };

  const http_get_binary = async (path: string) => {
    const url = `${base_url}${path}`;
    const cookies = await page.context().cookies(url);
    const data = await page.request.get(url, {
      headers: { Cookie: cookies.map((c) => `${c.name}=${c.value}`).join('; ') },
    });
    return await data.body();
  };

  const login = async () => {
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ locale: 'fr-FR' });
    page = await context.newPage();
    await page.route('**/*.{png,jpg,jpeg}', (route) => route.abort());
    await page.goto(`${base_url}auth/saml/authn/relative?callBack=${encodeURIComponent(base_url)}`);
    await page.getByRole('textbox', { name: 'Identifiant *' }).click();
    await page.getByRole('textbox', { name: 'Identifiant *' }).fill(config.login.user);
    await page.getByRole('textbox', { name: 'Mot de passe *' }).click();
    await page.getByRole('textbox', { name: 'Mot de passe *' }).fill(config.login.password);
    await page.getByRole('button', { name: 'Se connecter' }).click();
    await page.waitForLoadState('networkidle');
    const rows = await page.locator('#credentials-content form div.row ').all();
    for (const row of rows) {
      const label = await row.locator('label').textContent();
      if (label?.includes(config.school)) {
        await row.locator('button').click();
      }
    }
    await page.waitForLoadState('networkidle');
    await page.getByRole('link', { name: 'Messagerie Messagerie' }).click();

    const info = await http_get_json('auth/oauth2/userinfo');
    for (const id in info.children) {
      if (info.children[id].firstName === config.child) {
        child_id = id;
        child = info.children[id].firstName;
      }
    }

    if (!child_id) throw new Error('Child not found in userinfo');

    return info;
  };

  const guessType = (info: { contentType: string }) => {
    if (info.contentType.startsWith('image')) {
      return 'photo';
    } else if (info.contentType.startsWith('video')) {
      return 'video';
    }
    return 'document';
  };

  const inbox = async () => {
    const data = await http_get_json('conversation/list/inbox?page=0&unread=false');

    let messages = data.map((m: any) => ({
      id: m.id as string,
      type: 'Message',
      child: child as string,
      date: new Date(m.date),
      from: m.displayNames.find((d: any) => d[0] === m.from)[1],
      subject: m.subject as string,
      html: '',
      attachments: [] as Attach[],
    }));

    // filter already read
    messages = messages.filter((p: any) => !history.find((h) => h.id === p.id));

    // get details for unread
    if (messages.length > 0) {
      for (const msg of messages) {
        const detail = await http_get_json(`conversation/api/messages/${msg.id}`);
        msg.html = clean(detail.body as string);
        msg.attachments = await Promise.all(
          detail.attachments.map(async (a: any) => ({
            id: a.id,
            name: a.filename,
            type: guessType(a),
            data: await http_get_binary(`conversation/message/${msg.id}/attachment/${a.id}`),
          })),
        );
      }
    }

    return messages;
  };

  const notifications = async () => {
    const path =
      'timeline/lastNotifications?type=APPOINTMENTS&type=ARCHIVE&type=BLOG&type=CALENDAR&type=COLLABORATIVEEDITOR&type=COLLABORATIVEWALL&type=COMMUNITIES&type=COMMUNITY&type=EXERCIZER&type=FORMULAIRE&type=FORUM&type=HOMEWORKS&type=MAGNETO&type=MESSAGERIE&type=MINDMAP&type=NABOOK&type=PAGES&type=POLL&type=RACK&type=RBS&type=SCHOOLBOOK&type=SCRAPBOOK&type=SHAREBIGFILES&type=SUPPORT&type=TIMELINE&type=TIMELINEGENERATOR&type=USERBOOK&type=USERBOOK_MOOD&type=USERBOOK_MOTTO&type=WIKI&type=WORKSPACE&type=NEWS&page=0';
    const data = await http_get_json(path);

    let notifs = (data.results as any[]).map((p) => ({
      id: p._id,
      type: p.type,
      child,
      date: new Date(p.date.$date),
      from: clean(p.params.username),
      subject: clean(p.params.subject || p.params.info || p.params.formName || p.params.resourceName),
      html: clean(p.message).replace(/(\r?\n)+/g, '\n'),
    }));

    notifs = notifs.filter((p) => !history.find((h) => h.id === p.id));

    return notifs;
  };

  const cleanUp = async () => {
    await page.context().close();
    await page.close();
  };

  return { login, inbox, notifications, cleanUp };
}
