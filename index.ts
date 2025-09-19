import { existsSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import path from 'node:path';

import getConfig from './config.ts';
import { initLockFile } from './utils.ts';
import Telegram from './telegram.ts';
import Ent from './ent.ts';

const { values: options } = parseArgs({
  options: {
    home: {
      type: 'string',
    },
  },
});

const home = options.home || '.';
const historyFile = path.join(home, 'history.json');

console.log('Load config & history...');
const config = getConfig(home);

const lockFile = initLockFile(config);
try {
  const history: { id: string; date: Date }[] = [];
  if (existsSync(historyFile)) {
    history.push(
      ...JSON.parse(readFileSync(historyFile, 'utf8')).map((h: any) => ({
        id: h.id,
        date: new Date(h.date),
      }))
    );
  }

  const telegram = Telegram(config);
  const ent = Ent(config, history);

  console.log('Login...');
  const info = await ent.login();
  console.log('Logged in as ' + info.username);

  console.log('Get inbox...');
  const messages = await ent.inbox();
  console.log(`  -> ${messages.length} messages to send`);
  for (const msg of messages) {
    try {
      await telegram.sendMessage(msg);
      history.push({ id: msg.id, date: msg.date });
    } catch (e: any) {
      console.log('Error');
      const error = await e.response.json();
      console.log(error || e.message);
      console.log(e);
    }
  }

  console.log('Get notifications...');
  const notifs = await ent.notifications();
  console.log(`  -> ${notifs.length} messages to send`);
  for (const notif of notifs) {
    try {
      await telegram.sendMessage(notif);
      history.push({ id: notif.id, date: notif.date });
    } catch (e: any) {
      console.log('Error');
      const error = await e.response.json();
      console.log(error || e.message);
      console.log(e);
    }
  }

  console.log('Save history...');
  let synchistory = history;
  if (synchistory.length > 200) {
    synchistory = synchistory.slice(synchistory.length - 200);
  }
  writeFileSync(historyFile, JSON.stringify(synchistory, null, 2), 'utf8');

  console.log('Done.');
} finally {
  try {
    if (lockFile) rmSync(lockFile);
  } catch {}
}
