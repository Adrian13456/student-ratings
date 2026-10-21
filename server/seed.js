/* eslint-disable @typescript-eslint/no-require-imports */
const mongoose = require('mongoose');
require('dotenv').config();
const { Student, Grade, User, hashPassword } = require('./index');

const students = [
  ['Анна Коваленко', 'anna.kovalenko@example.com', 'КН-31', 3, 96.4, '#f26a4f'],
  ['Марія Бондар', 'maria.bondar@example.com', 'КН-32', 3, 94.8, '#e7a93b'],
  ['Олексій Шевченко', 'oleksii.shevchenko@example.com', 'КН-31', 3, 93.7, '#4d8f86'],
  ['Ірина Мельник', 'iryna.melnyk@example.com', 'КН-33', 3, 91.2, '#8b79b8'],
  ['Дмитро Ткаченко', 'dmytro.tkachenko@example.com', 'КН-32', 3, 89.6, '#6c9bbd'],
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student_ratings');
  await Student.deleteMany({});
  await Grade.deleteMany({});
  await User.deleteMany({});
  const semester = 'Осінь 2026';
  const created = await Student.insertMany(students.map(([fullName, email, group, course, rating, avatarColor]) => ({ fullName, email, group, course, specialty: 'Комп’ютерні науки', semester, rating, avatarColor })));
  await Grade.insertMany(created.flatMap((student, index) => [{ student: student._id, subject: 'Алгоритми та структури даних', value: students[index][4], semester }, { student: student._id, subject: 'Бази даних', value: students[index][4], semester }]));
  await User.insertMany([
    { email: process.env.ADMIN_EMAIL || 'admin@university.edu', passwordHash: hashPassword(process.env.ADMIN_PASSWORD || 'admin123'), displayName: 'Олена Петренко', role: 'admin' },
    { email: process.env.TEACHER_EMAIL || 'teacher@university.edu', passwordHash: hashPassword(process.env.TEACHER_PASSWORD || 'teacher123'), displayName: 'Іван Коваль', role: 'teacher' },
  ]);
  console.log(`Seeded ${created.length} students and 2 users.`);
  await mongoose.disconnect();
}
seed().catch((error) => { console.error(error); process.exit(1); });
