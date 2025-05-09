const express = require('express');
const bodyParser = require('body-parser');
const fs = require('fs');
const path = require('path');
const cors = require('cors');
const jwt = require('jsonwebtoken'); // <--- Добавьте эту строку

// Создаем экземпляр Express
const app = express();

// Используйте CORS middleware
app.use(cors());

app.use(bodyParser.json());

const usersFilePath = path.join(__dirname, 'users.json');
const transactionsFilePath = path.join(__dirname, 'transactions.json');
const categoriesFilePath = path.join(__dirname, 'categories.json');

// Секретный ключ для JWT. В реальном приложении его лучше хранить в переменных окружения.
const JWT_SECRET = 'nantkhun'; // <--- Замените на ваш секретный ключ

// Функция для чтения данных из JSON-файла
const readJsonFile = (filePath) => {
    if (!fs.existsSync(filePath)) {
        return [];
    }
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
};

// Функция для записи данных в JSON-файл
const writeJsonFile = (filePath, data) => {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), 'utf8');
};

// Middleware для проверки JWT токена
const authenticateToken = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    const token = authHeader && authHeader.split(' ')[1]; // Формат: Bearer TOKEN

    if (!token) {
        return res.status(401).json({ message: 'Требуется авторизация' });
    }

    jwt.verify(token, JWT_SECRET, (err, decoded) => {
        if (err) {
            return res.status(403).json({ message: 'Неверный или устаревший токен' });
        }
        req.user = decoded; // Сохраняем данные из токена в объекте запроса
        next();
    });
};


/* TRANSACTIONS */
// Маршрут для добавления транзакции
// Получение транзакций с фильтрацией и пагинацией
app.get('/api/transactions', authenticateToken, (req, res) => {
    const transactions = readJsonFile(transactionsFilePath);

    // Получаем только транзакции текущего пользователя
    let userTransactions = transactions.filter(t => t.user_id === req.user.id);

    // Применяем фильтры
    if (req.query.categoryId) {
        userTransactions = userTransactions.filter(t =>
            t.category_id === parseInt(req.query.categoryId, 10));
    }

    if (req.query.type) {
        userTransactions = userTransactions.filter(t => t.type === req.query.type);
    }

    if (req.query.startDate) {
        const startDate = new Date(req.query.startDate);
        userTransactions = userTransactions.filter(t =>
            new Date(t.transaction_date) >= startDate);
    }

    if (req.query.endDate) {
        const endDate = new Date(req.query.endDate);
        userTransactions = userTransactions.filter(t =>
            new Date(t.transaction_date) <= endDate);
    }

    // Подготовка к пагинации
    const offset = parseInt(req.query.offset, 10) || 0;
    const limit = parseInt(req.query.limit, 10) || userTransactions.length;

    // Применяем пагинацию
    const paginatedTransactions = userTransactions
        .sort((a, b) => new Date(b.transaction_date) - new Date(a.transaction_date))
        .slice(offset, offset + limit);

    res.json(paginatedTransactions);
});

// POST-метод для создания транзакции
app.post('/api/transactions', authenticateToken, (req, res) => {
    const { category_id, type, amount, transaction_date, comment } = req.body;

    // Проверка обязательных полей
    if (!category_id || !type || !amount || !transaction_date) {
        return res.status(400).json({
            message: 'Необходимо указать category_id, type, amount и transaction_date'
        });
    }

    // Проверка суммы - используем Math.abs для получения абсолютного значения
    const amountValue = Math.abs(parseFloat(amount));
    if (amountValue <= 0 || isNaN(amountValue)) {
        return res.status(400).json({ message: 'Сумма должна быть числом больше нуля' });
    }

    const transactions = readJsonFile(transactionsFilePath);

    const newTransaction = {
        id: transactions.length ? Math.max(...transactions.map(t => t.id)) + 1 : 1,
        user_id: req.user.id,
        category_id: parseInt(category_id, 10),
        type,
        amount: amountValue.toFixed(2), // Всегда сохраняем положительное значение
        transaction_date,
        comment: comment || null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    };

    transactions.push(newTransaction);
    writeJsonFile(transactionsFilePath, transactions);

    res.status(201).json(newTransaction);
});

// PUT-метод для обновления транзакции
app.put('/api/transactions/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { category_id, type, amount, transaction_date, comment } = req.body;
    const transactions = readJsonFile(transactionsFilePath);

    const index = transactions.findIndex(t =>
        t.id === parseInt(id, 10) && t.user_id === req.user.id);

    if (index === -1) {
        return res.status(404).json({ message: 'Транзакция не найдена' });
    }

    // Проверяем сумму, если она указана
    let amountValue = transactions[index].amount;
    if (amount !== undefined) {
        amountValue = Math.abs(parseFloat(amount));
        if (amountValue <= 0 || isNaN(amountValue)) {
            return res.status(400).json({ message: 'Сумма должна быть числом больше нуля' });
        }
        amountValue = amountValue.toFixed(2);
    }

    // Обновляем транзакцию
    transactions[index] = {
        ...transactions[index],
        category_id: category_id ? parseInt(category_id, 10) : transactions[index].category_id,
        type: type || transactions[index].type,
        amount: amountValue,
        transaction_date: transaction_date || transactions[index].transaction_date,
        comment: comment !== undefined ? comment : transactions[index].comment,
        updated_at: new Date().toISOString()
    };

    writeJsonFile(transactionsFilePath, transactions);
    res.json(transactions[index]);
});

// Удаление транзакции
app.delete('/api/transactions/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const transactions = readJsonFile(transactionsFilePath);

    const index = transactions.findIndex(t =>
        t.id === parseInt(id, 10) && t.user_id === req.user.id);

    if (index === -1) {
        return res.status(404).json({ message: 'Транзакция не найдена' });
    }

    transactions.splice(index, 1);
    writeJsonFile(transactionsFilePath, transactions);
    res.json({ message: 'Транзакция успешно удалена', id: parseInt(id, 10) });
});


/* USERS */
// Маршрут для получения данных текущего пользователя
app.get('/api/users/me', authenticateToken, (req, res) => {
    console.log("User data request received:", req.user);
    const users = readJsonFile(usersFilePath);
    const user = users.find(u => u.id === req.user.id);

    if (!user) {
        return res.status(404).json({ message: 'Пользователь не найден' });
    }

    // Возвращаем данные пользователя без пароля
    res.json({
        id: user.id,
        email: user.email,
        name: user.name,
        created_at: user.created_at,
        updated_at: user.updated_at
    });
});

// Маршрут для логина пользователя
app.post('/api/users/login', (req, res) => {
    console.log("Login request received:", req.body);
    const { email, password } = req.body;
    const users = readJsonFile(usersFilePath);

    const user = users.find((u) => u.email === email && u.password === password);
    if (user) {
        // Создаем токен
        // Не включайте пароль или другую чувствительную информацию в payload токена
        const tokenPayload = {
            id: user.id,
            email: user.email,
            name: user.name
        };
        const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' }); // Токен действителен 1 час

        res.json({
            message: 'Успешный вход',
            user: { // Возвращаем только необходимую информацию о пользователе
                id: user.id,
                email: user.email,
                name: user.name
            },
            token, // <--- Возвращаем токен
        });
    } else {
        res.status(401).json({ message: 'Неверные учетные данные' });
    }
});

// Маршрут для регистрации нового пользователя
app.post('/api/users/register', (req, res) => {
    console.log("Register request received:", req.body);
    const { name, email, password } = req.body;
    const users = readJsonFile(usersFilePath);

    // Проверяем, существует ли уже пользователь с таким email
    const existingUser = users.find(u => u.email === email);
    if (existingUser) {
        return res.status(409).json({ message: 'Пользователь с таким email уже существует' });
    }

    // Создаем нового пользователя
    const newUser = {
        id: users.length ? users[users.length - 1].id + 1 : 1,
        name,
        email,
        password, // В реальном приложении пароль должен быть хэширован
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    // Добавляем пользователя в файл
    users.push(newUser);
    writeJsonFile(usersFilePath, users);

    // Создаем токен
    const tokenPayload = {
        id: newUser.id,
        email: newUser.email,
        name: newUser.name
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: '1h' });

    // Отправляем ответ
    res.status(201).json({
        message: 'Пользователь успешно зарегистрирован',
        user: {
            id: newUser.id,
            email: newUser.email,
            name: newUser.name
        },
        token
    });
});


/* CATEGORIES */
// Получение всех категорий пользователя с рассчитанными балансами
app.get('/api/categories/summary', authenticateToken, (req, res) => {
    const allCategories = readJsonFile(categoriesFilePath);
    const allTransactions = readJsonFile(transactionsFilePath);

    // Фильтруем категории по user_id
    const userCategories = allCategories.filter(cat => cat.user_id === req.user.id);
    // Фильтруем транзакции по user_id
    const userTransactions = allTransactions.filter(t => t.user_id === req.user.id);

    const categoriesWithSummary = userCategories.map(category => {
        let categoryBalance = 0;
        userTransactions.forEach(transaction => {
            if (transaction.category_id === category.id) {
                if (transaction.type === 'income') {
                    categoryBalance += parseFloat(transaction.amount);
                } else if (transaction.type === 'expense') {
                    categoryBalance -= parseFloat(transaction.amount);
                }
            }
        });
        return {
            ...category,
            balance: categoryBalance.toFixed(2) // Добавляем баланс к объекту категории
        };
    });

    res.json(categoriesWithSummary);
});

// Получение всех категорий пользователя (базовый, без сумм)
app.get('/api/categories', authenticateToken, (req, res) => {
    const categories = readJsonFile(categoriesFilePath);
    // Фильтруем категории по user_id
    const userCategories = categories.filter(cat => cat.user_id === req.user.id);
    res.json(userCategories);
});

// Добавление новой категории
app.post('/api/categories', authenticateToken, (req, res) => {
    const { name, icon, color } = req.body;
    const categories = readJsonFile(categoriesFilePath);

    const newCategory = {
        id: categories.length ? Math.max(...categories.map(c => c.id)) + 1 : 1, // Генерация ID
        name,
        icon,
        color,
        user_id: req.user.id, // Привязываем категорию к пользователю
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
    };

    categories.push(newCategory);
    writeJsonFile(categoriesFilePath, categories);
    res.status(201).json(newCategory);
});

// Обновление категории
app.put('/api/categories/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const { name, icon, color } = req.body;
    const categories = readJsonFile(categoriesFilePath);

    const index = categories.findIndex(c => c.id === parseInt(id) && c.user_id === req.user.id);

    if (index === -1) {
        return res.status(404).json({ message: 'Категория не найдена или не принадлежит пользователю' });
    }

    // Обновляем категорию
    categories[index] = {
        ...categories[index],
        name: name || categories[index].name,
        icon: icon || categories[index].icon,
        color: color || categories[index].color,
        updated_at: new Date().toISOString()
    };

    writeJsonFile(categoriesFilePath, categories);
    res.json(categories[index]);
});

// Удаление категории
app.delete('/api/categories/:id', authenticateToken, (req, res) => {
    const { id } = req.params;
    const categories = readJsonFile(categoriesFilePath);

    const index = categories.findIndex(c => c.id === parseInt(id) && c.user_id === req.user.id);

    if (index === -1) {
        return res.status(404).json({ message: 'Категория не найдена или не принадлежит пользователю' });
    }

    // Удаляем категорию
    // const deletedCategory = categories[index]; // Если нужно вернуть удаленную категорию
    categories.splice(index, 1);

    writeJsonFile(categoriesFilePath, categories);
    res.json({ message: 'Категория успешно удалена', id: parseInt(id) });
});


/* BALANCE */
// Получение общего баланса пользователя
app.get('/api/balance', authenticateToken, (req, res) => {
    const transactions = readJsonFile(transactionsFilePath);

    // Получаем транзакции пользователя
    const userTransactions = transactions.filter(t => t.user_id === req.user.id);

    // Вычисляем баланс
    let balance = 0;
    userTransactions.forEach(transaction => {
        if (transaction.type === 'income') {
            balance += parseFloat(transaction.amount);
        } else if (transaction.type === 'expense') {
            balance -= parseFloat(transaction.amount);
        }
    });

    res.json({ amount: balance });
});

// Запуск сервера
const PORT = 8080;
app.listen(PORT, () => {
    console.log(`Сервер запущен на http://localhost:${PORT}`);
});