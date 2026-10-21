/* eslint-disable @typescript-eslint/no-require-imports */
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
require('dotenv').config();

const app = express();
const port = process.env.API_PORT || 4000;
const mongoUri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/student_ratings';
const tokenSecret = process.env.AUTH_SECRET || 'student-ratings-development-secret';

app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' }));
app.use(express.json());

const scoreSchema = new mongoose.Schema({ subject: { type: String, required: true }, value: { type: Number, min: 0, max: 100, required: true }, semester: { type: String, required: true } }, { _id: false });
const studentSchema = new mongoose.Schema({
  fullName: { type: String, required: true, trim: true },
  firstName: { type: String, trim: true },
  lastName: { type: String, trim: true },
  email: { type: String, required: true, unique: true, lowercase: true, trim: true },
  group: { type: String, required: true, trim: true },
  course: { type: Number, required: true, min: 1, max: 6 },
  specialty: { type: String, required: true, trim: true },
  semester: { type: String, required: true, trim: true },
  scores: { type: [scoreSchema], default: [] },
  rating: { type: Number, min: 0, max: 100, default: 0 },
  avatarColor: { type: String, default: '#f26a4f' },
}, { timestamps: true });
const gradeSchema = new mongoose.Schema({ student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true }, subject: { type: String, required: true }, value: { type: Number, required: true, min: 0, max: 100 }, semester: { type: String, required: true }, recordedBy: { type: String, default: 'system' } }, { timestamps: true });
gradeSchema.index({ student: 1, semester: 1 });
const userSchema = new mongoose.Schema({ email: { type: String, required: true, unique: true, lowercase: true, trim: true }, passwordHash: { type: String, required: true }, role: { type: String, enum: ['user', 'teacher', 'admin'], default: 'user' }, displayName: { type: String, required: true, trim: true } }, { timestamps: true });

const Student = mongoose.model('Student', studentSchema);
const Grade = mongoose.model('Grade', gradeSchema);
const User = mongoose.model('User', userSchema);

function encode(value) { return Buffer.from(JSON.stringify(value)).toString('base64url'); }
function hashPassword(password, salt = crypto.randomBytes(16).toString('hex')) { return `${salt}:${crypto.scryptSync(password, salt, 64).toString('hex')}`; }
function verifyPassword(password, storedHash) { const [salt, key] = storedHash.split(':'); if (!salt || !key) return false; const derived = crypto.scryptSync(password, salt, 64).toString('hex'); return crypto.timingSafeEqual(Buffer.from(key, 'hex'), Buffer.from(derived, 'hex')); }
function signToken(user) { const header = encode({ alg: 'HS256', typ: 'JWT' }); const payload = encode({ sub: user._id.toString(), email: user.email, name: user.displayName, role: user.role, exp: Date.now() + 8 * 60 * 60 * 1000 }); const signature = crypto.createHmac('sha256', tokenSecret).update(`${header}.${payload}`).digest('base64url'); return `${header}.${payload}.${signature}`; }
function getTokenPayload(token) { try { const [header, encodedPayload, signature] = token.split('.'); const expected = crypto.createHmac('sha256', tokenSecret).update(`${header}.${encodedPayload}`).digest('base64url'); if (!signature || signature.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null; const payload = JSON.parse(Buffer.from(encodedPayload, 'base64url').toString()); return payload.exp > Date.now() ? payload : null; } catch { return null; } }
function requireAuth(req, res, next) { const token = req.headers.authorization?.replace('Bearer ', ''); const user = token && getTokenPayload(token); if (!user) return res.status(401).json({ message: 'Потрібна авторизація' }); req.user = user; next(); }
function requireAdmin(req, res, next) { if (!['admin', 'teacher'].includes(req.user?.role)) return res.status(403).json({ message: 'Недостатньо прав для цієї операції' }); next(); }
function escapeRegex(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
function validId(id) { return mongoose.isValidObjectId(id); }
function splitName(fullName) { const parts = String(fullName || '').trim().split(/\s+/); return { firstName: parts.shift() || '', lastName: parts.join(' ') }; }
function normalizeStudentInput(body) { const name = body.fullName || `${body.firstName || ''} ${body.lastName || ''}`.trim(); const names = splitName(name); return { ...body, fullName: name, firstName: names.firstName, lastName: names.lastName, specialty: body.specialty || body.faculty || 'Комп’ютерні науки', semester: body.semester || 'Осінь 2026' }; }
function toStudentPayload(student, grades) { const scores = grades.map((grade) => ({ subject: grade.subject, value: grade.value, semester: grade.semester })); const values = scores.map((score) => score.value); const rating = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : Number(student.rating || 0); return { ...student, id: student._id, scores, grades, rating: Number(rating.toFixed(1)), average: Number(rating.toFixed(1)), gradesCount: grades.length }; }
function publicUser(user) { return { id: user._id, email: user.email, role: user.role, displayName: user.displayName }; }

app.get('/api/health', (_req, res) => res.json({ status: 'ok', service: 'student-ratings-api' }));

app.post('/api/auth/login', async (req, res) => {
  try { const user = await User.findOne({ email: req.body?.email?.toLowerCase() }); if (!user || !verifyPassword(req.body?.password || '', user.passwordHash)) return res.status(401).json({ message: 'Невірний email або пароль' }); res.json({ token: signToken(user), user: publicUser(user) }); }
  catch (error) { res.status(500).json({ message: 'Не вдалося виконати вхід', error: error.message }); }
});
app.get('/api/auth/me', requireAuth, async (req, res) => { const user = await User.findById(req.user.sub); if (!user) return res.status(401).json({ message: 'Користувача не знайдено' }); res.json({ user: publicUser(user) }); });

app.get('/api/students', async (req, res) => {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1); const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100); const semester = req.query.semester || 'Осінь 2026'; const filter = {};
    if (req.query.group) filter.group = req.query.group; if (req.query.course) filter.course = Number(req.query.course);
    if (req.query.search) { const search = new RegExp(escapeRegex(req.query.search), 'i'); filter.$or = [{ fullName: search }, { firstName: search }, { lastName: search }, { email: search }]; }
    const allStudents = await Student.find(filter).lean(); const grades = await Grade.find({ student: { $in: allStudents.map((student) => student._id) }, semester }).lean(); const byStudent = grades.reduce((result, grade) => { const key = grade.student.toString(); (result[key] ||= []).push(grade); return result; }, {});
    let result = allStudents.map((student) => toStudentPayload(student, byStudent[student._id.toString()] || [])); const direction = req.query.order === 'asc' ? 1 : -1;
    if (req.query.sort === 'name') result.sort((a, b) => a.fullName.localeCompare(b.fullName) * direction); else result.sort((a, b) => (a.rating - b.rating) * direction);
    const total = result.length; result = result.slice((page - 1) * limit, page * limit); res.json({ data: result, pagination: { page, limit, total, pages: Math.ceil(total / limit) } });
  } catch (error) { res.status(500).json({ message: 'Не вдалося отримати список студентів', error: error.message }); }
});

app.get('/api/students/:id', async (req, res) => { try { if (!validId(req.params.id)) return res.status(400).json({ message: 'Некоректний id студента' }); const student = await Student.findById(req.params.id).lean(); if (!student) return res.status(404).json({ message: 'Студента не знайдено' }); const grades = await Grade.find({ student: student._id }).sort({ semester: -1, subject: 1 }).lean(); res.json(toStudentPayload(student, grades)); } catch (error) { res.status(500).json({ message: 'Не вдалося отримати профіль студента', error: error.message }); } });
app.post('/api/students', requireAuth, requireAdmin, async (req, res) => { try { const student = await Student.create(normalizeStudentInput(req.body)); res.status(201).json(toStudentPayload(student.toObject(), [])); } catch (error) { res.status(400).json({ message: 'Не вдалося створити студента', error: error.message }); } });
app.put('/api/students/:id', requireAuth, requireAdmin, async (req, res) => { try { if (!validId(req.params.id)) return res.status(400).json({ message: 'Некоректний id студента' }); const grades = req.body.grades || req.body.scores; const studentData = normalizeStudentInput(req.body); ['grades', 'scores', '_id', 'id', 'createdAt', 'updatedAt', 'average', 'rating', 'gradesCount'].forEach((field) => delete studentData[field]); const student = await Student.findByIdAndUpdate(req.params.id, studentData, { new: true, runValidators: true }).lean(); if (!student) return res.status(404).json({ message: 'Студента не знайдено' }); if (Array.isArray(grades)) { await Grade.deleteMany({ student: student._id }); await Grade.insertMany(grades.map((grade) => ({ subject: grade.subject, value: grade.value, semester: grade.semester || student.semester, student: student._id, recordedBy: req.user.email }))); } const savedGrades = await Grade.find({ student: student._id }).lean(); const rating = savedGrades.length ? savedGrades.reduce((sum, grade) => sum + grade.value, 0) / savedGrades.length : 0; await Student.findByIdAndUpdate(student._id, { rating: Number(rating.toFixed(1)), scores: savedGrades.map((grade) => ({ subject: grade.subject, value: grade.value, semester: grade.semester })) }); res.json(toStudentPayload({ ...student, rating }, savedGrades)); } catch (error) { res.status(400).json({ message: 'Не вдалося оновити студента', error: error.message }); } });
app.delete('/api/students/:id', requireAuth, requireAdmin, async (req, res) => { try { if (!validId(req.params.id)) return res.status(400).json({ message: 'Некоректний id студента' }); const student = await Student.findByIdAndDelete(req.params.id); if (!student) return res.status(404).json({ message: 'Студента не знайдено' }); await Grade.deleteMany({ student: student._id }); res.status(204).send(); } catch (error) { res.status(500).json({ message: 'Не вдалося видалити студента', error: error.message }); } });
app.post('/api/grades', requireAuth, requireAdmin, async (req, res) => { try { const grade = await Grade.create({ ...req.body, recordedBy: req.user.email }); res.status(201).json(grade); } catch (error) { res.status(400).json({ message: 'Не вдалося зберегти оцінку', error: error.message }); } });
app.get('/api/rankings', async (req, res) => { try { const semester = req.query.semester || 'Осінь 2026'; const rows = await Grade.aggregate([{ $match: { semester } }, { $group: { _id: '$student', average: { $avg: '$value' }, gradesCount: { $sum: 1 } } }, { $sort: { average: -1 } }, { $lookup: { from: 'students', localField: '_id', foreignField: '_id', as: 'student' } }, { $unwind: '$student' }, { $project: { _id: 0, student: '$student', average: { $round: ['$average', 1] }, gradesCount: 1 } }]); res.json(rows.map((row, index) => ({ rank: index + 1, ...row }))); } catch (error) { res.status(500).json({ message: 'Не вдалося сформувати рейтинг', error: error.message }); } });

async function start() { try { await mongoose.connect(mongoUri); console.log(`MongoDB connected: ${mongoUri}`); app.listen(port, () => console.log(`API running at http://localhost:${port}`)); } catch (error) { console.error('MongoDB connection failed:', error.message); process.exit(1); } }
if (require.main === module) start();
module.exports = { app, Student, Grade, User, hashPassword };
