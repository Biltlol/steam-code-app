module.exports = async (req, res) => {
  // Разрешаем CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS, GET');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  // Обработка preflight запроса
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  // Принимаем только POST запросы
  if (req.method !== 'POST') {
    console.log(req);
    res.status(402).json({ statusText: req });
    return;
  }

  try {
    console.log(req);
    const { accessKey } = req.body;

    // Проверяем ключ доступа
    const validKey = process.env.ACCESS_KEY;
    if (!accessKey || accessKey !== validKey) {
      res.status(403).json({ error: 'Неверный ключ доступа' });
      return;
    }

    // Читаем код из GitHub репозитория
    const repoOwner = process.env.GITHUB_REPO_OWNER || 'Biltlol';
    const repoName = process.env.GITHUB_REPO_NAME || 'steam-code-app';
    
    const githubUrl = `https://raw.githubusercontent.com/${repoOwner}/${repoName}/main/last-code.json`;
    console.log(githubUrl);
    
    const response = await fetch(githubUrl);
    
    if (!response.ok) {
      res.status(404).json({ 
        error: 'Код не найден. Попробуйте запросить вход в Steam.',
        code: null 
      });
      return;
    }
    console.log(response.json());
    const data = await response.json();
    
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
    const fff = req.body;
    res.status(500).json({ error: err.message, req: fff });
  }
};
