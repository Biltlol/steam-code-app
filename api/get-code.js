const fs = require('fs');

module.exports = async (req, res) => {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запроса
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Принимаем только POST запросы
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Метод не разрешён' });
    return;
  }

  try {
    const { accessKey } = req.body;

    // Проверяем ключ доступа
    const validKey = process.env.ACCESS_KEY;
    if (!accessKey || accessKey !== validKey) {
      res.status(403).json({ error: 'Неверный ключ доступа' });
      return;
    }

    // Читаем последний сохранённый код
    const lastCodePath = './last-code.json';
    
    if (!fs.existsSync(lastCodePath)) {
      res.status(404).json({ 
        error: 'Код не найден. Попробуйте запросить вход в Steam.',
        code: null 
      });
      return;
    }

    const data = JSON.parse(fs.readFileSync(lastCodePath, 'utf8'));
    
    // Проверяем, не истёк ли код (5 минут)
    const expiresAt = new Date(data.expiresAt);
    if (expiresAt < new Date()) {
      res.status(410).json({ 
        error: 'Код истёк. Запросите новый вход в Steam.',
        code: null 
      });
      return;
    }

    // Возвращаем код
    res.status(200).json({
      code: data.code,
      timestamp: data.timestamp,
      expiresAt: data.expiresAt
    });

  } catch (err) {
    console.error('Ошибка:', err);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  }
};
