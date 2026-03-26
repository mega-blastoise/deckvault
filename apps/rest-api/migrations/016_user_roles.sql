ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user';

UPDATE users SET role = 'admin' WHERE email IN ('rustycloud42@protonmail.com', 'nicholasgalante1997@gmail.com');
