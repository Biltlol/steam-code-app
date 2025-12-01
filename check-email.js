const Imap = require('imap');
const { simpleParser } = require('mailparser');
const fs = require('fs');
const path = require('path');

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
  console.log('=== Анализ письма ===');
  console.log('Subject:', subject);
  console.log('Text preview:', text.substring(0, 500));
  
  // Проверяем, что письмо содержит информацию для нужного аккаунта
  if (!text.toLowerCase().includes('mainstreamwoodl')) {
    console.log('❌ Письмо не для аккаунта mainstreamwoodl');
    return null;
  }
  
  console.log('✅ Письмо для аккаунта mainstreamwoodl');

  // Ищем код - различные паттерны
  const patterns = [
    // Стандартный формат Steam Guard кода (5 символов)
    /(?:код|code|verification code|access code)[\s:]*([A-Z0-9]{5})/i,
    /([A-Z0-9]{5})\s*(?:ваш|your|код|code|is your)/i,
    // Формат с дефисом
    /([A-Z0-9]{3}-[A-Z0-9]{3})/i,
    /([A-Z0-9]{2}-[A-Z0-9]{3})/i,
    // Просто 5 заглавных букв/цифр подряд
    /\b([A-Z0-9]{5})\b/g,
    // В HTML теге
    /<[^>]*>([A-Z0-9]{5})<\/[^>]*>/gi,
    // После двоеточия или тире
    /[:—-]\s*([A-Z0-9]{5})/i
  ];

  for (let i = 0; i < patterns.length; i++) {
    const pattern = patterns[i];
    console.log(`Пробуем паттерн ${i + 1}:`, pattern);
    
    const matches = text.match(pattern);
    if (matches) {
      console.log('Найдены совпадения:', matches);
      
      // Берём первое совпадение
      let code = matches[1] || matches[0];
      code = code.replace(/[-\s]/g, '').toUpperCase();
      
      // Проверяем что это похоже на код (5 символов, буквы и цифры)
      if (code.length === 5 && /^[A-Z0-9]{5}$/.test(code)) {
        console.log('✅ Найден код:', code);
        return code;
      }
    }
  }
  
  console.log('❌ Код не найден');
  return null;
}

// Функция сохранения кода в файл
function saveCodeToFile(code) {
  const data = {
    code: code,
    timestamp: new Date().toISOString(),
    expiresAt: new Date(Date.now() + 5 * 60 * 1000).toISOString()
  };

  try {
    const filePath = path.join(__dirname, 'last-code.json');
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    console.log('✅ Код сохранён в файл:', code);
    return true;
  } catch (err) {
    console.error('❌ Ошибка при сохранении кода:', err);
    return false;
  }
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

        // Ищем письма за последние 30 минут
        const thirtyMinutesAgo = new Date(Date.now() - 30 * 60 * 1000);
        const searchCriteria = [
          ['FROM', 'noreply@steampowered.com'],
          ['SINCE', thirtyMinutesAgo]
        ];

        imap.search(searchCriteria, (err, results) => {
          if (err) {
            reject(err);
            return;
          }

          if (results.length === 0) {
            console.log('📭 Новых писем от Steam не найдено');
            imap.end();
            resolve(null);
            return;
          }

          console.log(`📧 Найдено ${results.length} писем от Steam`);

          const fetch = imap.fetch(results, { bodies: '', markSeen: false });
          let latestCode = null;
          let emailsProcessed = 0;

          fetch.on('message', (msg) => {
            msg.on('body', (stream) => {
              simpleParser(stream, async (err, parsed) => {
                if (err) {
                  console.error('❌ Ошибка парсинга письма:', err);
                  return;
                }

                emailsProcessed++;
                
                const subject = parsed.subject || '';
                const textContent = parsed.text || '';
                const htmlContent = parsed.html || '';
                
                // Ищем код в обоих форматах
                const textToSearch = textContent + '\n' + htmlContent;
                
                console.log(`\n--- Письмо ${emailsProcessed} ---`);
                
                if (subject.toLowerCase().includes('steam') || 
                    textToSearch.toLowerCase().includes('код') ||
                    textToSearch.toLowerCase().includes('code') ||
                    textToSearch.toLowerCase().includes('guard')) {
                  
                  const code = extractSteamCode(textToSearch, subject);
                  if (code && !latestCode) {
                    latestCode = code;
                  }
                }
              });
            });
          });

          fetch.once('end', async () => {
            imap.end();
            
            console.log(`\n📊 Обработано писем: ${emailsProcessed}`);
            
            if (latestCode) {
              console.log('🎉 Найден код Steam Guard:', latestCode);
              saveCodeToFile(latestCode);
              resolve(latestCode);
            } else {
              console.log('😔 Код не найден ни в одном письме');
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
      console.log('\n✅ Код успешно получен и сохранён');
    } else {
      console.log('\nℹ️ Новых кодов не найдено');
    }
    process.exit(0);
  })
  .catch((err) => {
    console.error('\n❌ Ошибка:', err);
    process.exit(1);
  });
