import { Blob } from 'buffer';
import { FormData } from 'formdata-node';
import ky from 'ky';
import { format } from 'date-fns';

function chunk(items, size) {
  const chunks = [];
  items = [].concat(...items);

  while (items.length) {
    chunks.push(items.splice(0, size));
  }

  return chunks;
}

export default function Telegram(config) {
  const token = config.telegram.token;
  const chatId = config.telegram.chatId;
  const throttling = config.telegram?.throttling || 0;

  let last = new Date().getTime() - throttling;
  const throttle = async () => {
    if (throttling > 0 && new Date().getTime() < last + throttling) {
      await new Promise((resolve) => setTimeout(resolve, throttling));
    }
    last = new Date().getTime();
  };
  const wait = async (time) => {
    return new Promise((resolve) => setTimeout(resolve, time));
  };

  const client = ky.create({
    prefixUrl: `https://api.telegram.org/bot${token}`,
    retry: {
      limit: 2,
      methods: ['get', 'post'],
      statusCodes: [429],
      delay: (attemptCount) => {
        if (attemptCount === 2) {
          return 61_000;
        } else {
          return 2 ** (attemptCount - 1) * 1_000;
        }
      },
    },
  });

  const escape = (text) => {
    if (!text) return '\\.';
    return text.replace(
      /(\_|\*|\[|\]|\(|\)|\~|\`|\>|\#|\+|\-|\=|\||\{|\}|\.|\!)/g,
      '\\$1'
    );
  };

  const sendAttachments = async (files, type) => {
    console.log(`Send ${files.length} attachments...`);
    if (files.length === 1) {
      await throttle();
      const api = {
        photo: 'sendPhoto',
        document: 'sendDocument',
        video: 'sendVideo',
        audio: 'sendAudio',
      };
      const file = files[0];
      const form = new FormData();
      form.append('chat_id', chatId);
      form.append('disable_notification', true);
      form.append(type, file.data, file.name);
      await client.post(api[type], { body: form });
    } else {
      for (const elts of chunk(files, 10)) {
        await throttle();
        const form = new FormData();
        form.append('chat_id', chatId);
        const media = [];
        for (const file of elts) {
          media.push({
            type: type,
            media: `attach://${file.name}`,
          });
          form.append(file.name, file.data, file.name);
        }
        form.append('media', JSON.stringify(media));
        await client.post('sendMediaGroup', { body: form });
        if (elts.length >= 10) {
          await wait(1 * 60 * 1_000 + 100); // wait a minute to avoid throttling
        }
      }
    }
  };

  const sendMessage = async (post) => {
    await throttle();

    await client.post('sendMessage', {
      json: {
        chat_id: chatId,
        parse_mode: 'HTML',
        text: `
<b>ENT - ${post.child}</b>  
${post.type} de ${post.from}  
${format(post.date, `'Le' dd/MM/yy 'à' hh:mm:ss`)}  
<b>${post.subject}</b>  
${post.html}`,
      },
    });

    if (post.attachments) {
      // send photos
      const images = post.attachments.filter((a) => a.type === 'image');
      if (images.length > 0) {
        await sendAttachments(images, 'photo');
      }

      // document (pdf par exemple)
      const docs = post.attachments.filter((a) => a.type === 'document');
      if (docs.length > 0) {
        await sendAttachments(docs, 'document');
      }

      // send videos
      const videos = post.attachments.filter((a) => a.type === 'video');
      if (videos.length > 0) {
        await sendAttachments(videos, 'video');
      }

      // notif pour les autres objets (audio ?)
      const others = post.attachments.filter(
        (a) => !['image', 'document', 'video'].includes(a.type)
      );
      if (others.length > 0) {
        await throttle();
        await client.post('sendMessage', {
          json: {
            chat_id: config.telegram.chatId,
            parse_mode: 'MarkdownV2',
            text: `${others.length} objet${
              others.length > 1 ? 's' : ''
            } de type ${others.map((o) => o.type).join(',')}`,
          },
        });
      }
    }
  };

  return { client, sendMessage };
}
