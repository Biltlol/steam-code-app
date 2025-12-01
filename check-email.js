const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');

// Конфигурация IMAP для Gmail
const imap = new Imap({
  user: process.env.GMAIL_USER,
  password: process.env.GMAIL_PASSWORD,
  host: 'imap.gmail.com',
  port: 993,
  tls: true,
  tlsOptions: { rejectUnauthorized: false }
});

// Функция для извлечения кода Steam из текста
function extractSteamCode(text) {
  // Ищем код формата: 5 символов (буквы и цифры)
  const patterns = [
    /(?:код|code|verification code)[\s:]*([A-Z0-9]{5})/i,
    /([A-Z0-9]{5})\s*(?:ваш|your|код|code)/i,
    /([A-Z0-9]{3}-[A-Z0-9]{3})/i,
    /\b([A-Z0-9]{5})\b/g
  ];

  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match) {
      return match[1].replace('-', '');
    }
  }
  return null;
}

// Функция чтения последнего сохранённого кода
function getLastCode() {
  try {
    if (fs.existsSync('last-code.json')) {
      const data = JSON.parse(fs.readFileSync('last-code.json', 'utf8'));
      return data;
    }
  } catch (err) {
    console.log('Нет сохранённого кода');
  }
  return null;
}

// Функция сохранения нового кода
function saveCode(code) {
  const data = {
    code: code,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };
  fs.writeFileSync('last-code.json', JSON.stringify(data, null, 2));
  console.log('Код сохранён:', code);
}

// Основная функция проверки почты
function checkEmail() {
  return new Promise((resolve, reject) => {
    imap.once('ready', () => {
      imap.openBox('INBOX', false, (err, box) => {
        if (err) {
          reject(err);
          return;
        }

        const tenMinutesAgo = new Date(Date.now() - 10 * 60 * 1000);
        const searchCriteria = [
          ['FROM', 'noreply@steampowered.com'],
          ['SINCE', tenMinutesAgo]
        ];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            reject(err);
            return;
          }

          if (results.length === 0) {
            console.log('Новых писем от Steam не найдено');
            imap.end();
            resolve(null);
            return;
          }

          console.log(`Найдено ${results.length} писем от Steam`);

          const fetch = imap.fetch(results, { bodies: '' });
          let latestCode = null;

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) {
                  console.error('Ошибка парсинга письма:', err);
                  return;
                }

                const subject = parsed.subject || '';
                const text = parsed.text || '';
                
                if (subject.toLowerCase().includes('steam guard') || 
                    text.toLowerCase().includes('код') ||
                    text.toLowerCase().includes('code')) {
                  
                  const code = extractSteamCode(text);
                  if (code) {
                    console.log('Найден код Steam:', code);
                    latestCode = code;
                  }
                }
              });
            });
          });

          fetch.once('end', () => {
            imap.end();
            if (latestCode) {
              saveCode(latestCode);
              resolve(latestCode);
            } else {
              resolve(null);
            }
          });

          fetch.once('error', (err) => {
            imap.end();
            reject(err);
          });
        });
      });
    });

    imap.once('error', (err) => {
      reject(err);
    });

    imap.connect();
  });
}

// Запуск скрипта
checkEmail()
  .then((code) => {
    if (code) {
      console.log('✅ Код успешно получен и сохранён');
    } else {
      console.log('ℹ️ Новых кодов не найдено');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Ошибка:', err);
    process.exit(1);
  });
