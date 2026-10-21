# Інформаційна система студентських рейтингів

Навчальний full-stack проєкт на Next.js, Express.js і MongoDB. Система призначена для перегляду академічного рейтингу, пошуку студентів, фільтрації за групами та збереження оцінок.

## Стек

- **Frontend:** Next.js 16, React, TypeScript, Tailwind CSS, Lucide React
- **Backend:** Express.js, Node.js, Mongoose
- **Database:** MongoDB

## Структура

```text
student-ratings/
  src/app/             Next.js сторінка рейтингу та стилі
  server/index.js      Express API, схеми Student, Grade і User
  server/seed.js       демонстраційні дані
  docker-compose.yml   MongoDB для локальної розробки
  .env.example         змінні середовища
```

## Запуск

Потрібні Node.js 20.19+ і Docker Desktop або локальний MongoDB.

```bash
npm install
copy .env.example .env
docker compose up -d mongodb
npm run seed
npm run dev:all
```

Frontend відкриється на `http://localhost:3000`, API працюватиме на `http://localhost:4000`.

Окремо:

```bash
npm run dev       # Next.js
npm run dev:api   # Express API
npm run build     # production build frontend
npm run lint      # ESLint
```

## API

- `GET /api/health` — стан API
- `POST /api/auth/login` — вхід і отримання Bearer-токена
- `GET /api/auth/me` — поточний авторизований користувач
- `GET /api/students?search=...&group=...&course=...&sort=average&order=desc&page=1&limit=20` — список студентів із фільтрами та пагінацією
- `GET /api/students/:id` — профіль студента з оцінками
- `POST /api/students` — створення студента, тільки admin
- `PUT /api/students/:id` — оновлення студента й оцінок, тільки admin
- `DELETE /api/students/:id` — видалення студента й оцінок, тільки admin
- `POST /api/grades` — додавання оцінки, тільки admin
- `GET /api/rankings?semester=Осінь%202024` — рейтинг за семестр

Демо-користувачі: `admin@university.edu / admin123` і `teacher@university.edu / teacher123`. Для захищених маршрутів передавайте заголовок `Authorization: Bearer <token>`.

## Модель даних

`Student` містить `fullName`, `group`, `course`, `specialty`, `semester`, масив `scores`, підсумковий `rating`, а також автоматичні `createdAt` і `updatedAt`. Для сумісності API додатково зберігає `firstName`, `lastName` та email.

`Grade` зберігає деталізацію оцінок за предметами й семестрами. API агрегує ці записи в `scores` і `rating` профілю студента.

`User` містить email, `passwordHash`, `role` (`user`, `teacher` або `admin`) і `displayName`. Паролі не зберігаються у відкритому вигляді: seed хешує їх через Node.js `scrypt`.
