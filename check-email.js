const Imap = require('imap');
const { simpleParser } = require('mailparser');

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
function extractSteamCode(text, subject) {
  // Проверяем, что письмо содержит информацию для нужного аккаунта
  if (!text.toLowerCase().includes('mainstreamwoodl')) {
    console.log('Письмо не для аккаунта mainstreamwoodl, пропускаем');
    return null;
  }

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

// Функция сохранения кода через GitHub API
async function saveCodeToGitHub(code) {
  const data = {
    code: code,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };

  try {
    const response = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/last-code.json`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'Accept': 'application/vnd.github.v3+json'
        },
        body: JSON.stringify({
          message: 'Update Steam code',
          content: Buffer.from(JSON.stringify(data, null, 2)).toString('base64'),
          sha: await getFileSha()
        })
      }
    );

    if (response.ok) {
      console.log('Код сохранён в GitHub:', code);
      return true;
    } else {
      console.error('Ошибка сохранения:', await response.text());
      return false;
    }
  } catch (err) {
    console.error('Ошибка при сохранении кода:', err);
    return false;
  }
}

// Получаем SHA существующего файла
async function getFileSha() {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${process.env.GITHUB_REPOSITORY}/contents/last-code.json`,
      {
        headers: {
          'Authorization': `token ${process.env.GITHUB_TOKEN}`,
          'Accept': 'application/vnd.github.v3+json'
        }
      }
    );

    if (response.ok) {
      const data = await response.json();
      return data.sha;
    }
  } catch (err) {
    console.log('Файл не существует, создаём новый');
  }
  return null;
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
                  
                  const code = extractSteamCode(text, subject);
                  if (code) {
                    console.log('Найден код Steam для mainstreamwoodl:', code);
                    latestCode = code;
                  }
                }
              });
            });
          });

          fetch.once('end', async () => {
            imap.end();
            if (latestCode) {
              await saveCodeToGitHub(latestCode);
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
