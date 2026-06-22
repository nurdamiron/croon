# Task: Личный кабинет клиента — полная реализация

## Стек
Next.js 14 App Router, TypeScript, PostgreSQL + Prisma, NextAuth JWT, Tailwind CSS, AWS S3.

## Архитектурные ограничения
- Prisma schema: `npx prisma db push` (no migrations)
- `lib/data.ts` — централизованные DB-запросы
- Admin API routes используют `checkAdmin()` inline
- Уведомления уже есть для админа через web-push и Telegram — для клиента нужен email
- Email пользователя менять нельзя (только name и phone в profile)
- Статусы заказа: NEW → CONFIRMED → PROCESSING → SHIPPED → DELIVERED | PICKED_UP | CANCELLED
- Brand colors: `brand`/`brand-hover` (#006EBE/#0055a0) — для публичных страниц
- Admin colors: `admin`/`admin-hover` (#5c6ac4/#4c5ab4)

## Существующие файлы (ключевые)
- `frontend/src/app/account/page.tsx` — главная страница аккаунта
- `frontend/src/app/api/account/profile/route.ts` — GET/PUT профиля
- `frontend/src/app/api/account/orders/route.ts` — GET истории заказов
- `frontend/src/app/api/orders/route.ts` — POST создания заказа
- `frontend/src/app/api/admin/orders/[id]/route.ts` — PATCH статуса заказа (admin)
- `frontend/src/lib/data.ts` — централизованные DB-запросы
- `frontend/prisma/schema.prisma` — схема БД

## Блок 1 — Критично

### 1. Email-уведомления клиенту (Resend или Nodemailer)
- При оформлении заказа: подтверждение + состав товаров
- При смене статуса: CONFIRMED, SHIPPED, DELIVERED
- Шаблоны на русском языке
- Env var: `RESEND_API_KEY` или `SMTP_*`

### 2. Смена пароля из личного кабинета
- Форма: текущий пароль → новый пароль → подтверждение
- API: PATCH /api/account/password
- Валидация: bcrypt verify текущего, min 8 chars нового

### 3. Forgot password / сброс пароля
- Форма "Забыли пароль?" на странице логина
- Генерация токена (crypto.randomBytes), TTL 1 час
- Отправка ссылки на email
- Страница /reset-password?token=...
- Модель PasswordResetToken в Prisma (id, token, userId, expiresAt, usedAt)

### 4. Таймлайн заказа
- Модель OrderStatusHistory в Prisma (id, orderId, status, createdAt, note?)
- При каждой смене статуса (в admin PATCH route) — запись в историю
- В личном кабинете: визуальный прогресс-бар с датами

### 5. Отмена заказа клиентом
- Если статус NEW — кнопка "Отменить заказ"
- API: PATCH /api/account/orders/[id]/cancel
- Возврат стока при отмене
- Запись в OrderStatusHistory

## Блок 2 — Важно

### 6. Избранное в БД
- Модель Favorite (id, userId, productId, createdAt)
- API: GET/POST/DELETE /api/account/favorites
- Синхронизация: при логине — мержить localStorage в БД

### 7. Повторить заказ
- Кнопка "Повторить заказ" в истории
- Клиентская логика: добавить все товары заказа в localStorage корзину
- Redirect на /cart

### 8. Отзывы на товары
- Модель Review (id, userId, productId, rating 1-5, text, createdAt, isApproved bool)
- Форма на странице товара (только для авторизованных, только купивших товар)
- API: POST /api/reviews, GET /api/reviews?productId=...
- Модерация: страница /admin/reviews (list + approve/delete)

## Блок 3 — Позже (только планируем)
9. Сохранённые адреса
10. Бонусная программа
