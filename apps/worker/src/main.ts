import { createDatabase } from '@shared-vps/database';
import { createLogger, readApiConfig } from '@shared-vps/runtime';
import { BackgroundRuntime } from '@shared-vps/api/background';
const log = createLogger('worker');
async function main() {
  const config = readApiConfig(); log.level = config.LOG_LEVEL;
  const db = createDatabase(config.DATABASE_URL);
  const runtime = new BackgroundRuntime(db,config,'STANDALONE',log);
  let closing = false;
  const stop = async () => {
    if(closing)return;closing=true;
    const deadline=setTimeout(()=>process.exit(1),25000).unref();
    try{await runtime.close();await db.$disconnect();}finally{clearTimeout(deadline);}
  };
  process.once('SIGINT',()=>{void stop();});process.once('SIGTERM',()=>{void stop();});
  await db.$connect(); runtime.start();
  log.info({mode:'STANDALONE'},'Durable worker started; no Telegram polling process is created');
}
main().catch(()=>{log.error({category:'worker-startup'},'Worker startup failed; check protected configuration');process.exitCode=1;});
