"use client";

import { FormEvent, useMemo, useRef, useState } from "react";
import { ArrowLeft, Bell, CheckCircle2, ChevronDown, Download, GraduationCap, LayoutDashboard, LogIn, Pencil, Plus, Search, Settings, SlidersHorizontal, Trophy, UserPlus, Users } from "lucide-react";

import { ApiError, requestApi } from "../lib/api";

type Student = { id: string; name: string; email: string; initials: string; group: string; course: number; score: number; accent: string; faculty: string; semester: string; grades: { subject: string; score: number }[] };
type Screen = "login" | "dashboard" | "profile" | "admin";
type Notice = { type: "success" | "error" | "loading"; text: string } | null;
type UserRole = "teacher" | "student";
type Session = { token: string; user: { displayName: string; role: "user" | "teacher" | "admin" } };
type ApiStudent = {
  id: string;
  fullName: string;
  email: string;
  group: string;
  course: number;
  rating: number;
  specialty: string;
  semester: string;
  avatarColor: string;
  scores: { subject: string; value: number; semester: string }[];
};
type StudentPage = { data: ApiStudent[]; pagination: { pages: number } };

function isApiStudent(value: unknown): value is ApiStudent {
  if (!value || typeof value !== "object") return false;
  const student = value as Record<string, unknown>;
  return typeof student.id === "string"
    && typeof student.fullName === "string"
    && typeof student.email === "string"
    && typeof student.group === "string"
    && typeof student.course === "number"
    && typeof student.rating === "number"
    && typeof student.specialty === "string"
    && typeof student.semester === "string"
    && typeof student.avatarColor === "string"
    && Array.isArray(student.scores)
    && student.scores.every((score) => score && typeof score === "object"
      && typeof score.subject === "string" && typeof score.value === "number");
}

function isSession(value: unknown): value is Session {
  if (!value || typeof value !== "object") return false;
  const account = value as Record<string, unknown>;
  if (typeof account.token !== "string" || !account.token || !account.user || typeof account.user !== "object") return false;
  const user = account.user as Record<string, unknown>;
  return typeof user.displayName === "string" && !!user.displayName.trim()
    && (user.role === "user" || user.role === "teacher" || user.role === "admin");
}

function toStudent(student: ApiStudent): Student {
  return {
    id: student.id,
    name: student.fullName,
    email: student.email,
    initials: student.fullName.trim().split(/\s+/).slice(0, 2).map((name) => name[0]).join("").toUpperCase(),
    group: student.group,
    course: student.course,
    score: student.rating,
    faculty: student.specialty,
    semester: student.semester,
    accent: student.avatarColor,
    grades: student.scores.map((score) => ({ subject: score.subject, score: score.value })),
  };
}

function errorNotice(error: unknown): Notice {
  if (!(error instanceof ApiError)) return { type: "error", text: "Не вдалося обробити дані від сервера." };
  return {
    type: "error",
    text: error.requestId ? `${error.message} · ID запиту ${error.requestId}` : error.message,
  };
}

const navItems = [{ label: "Огляд", icon: LayoutDashboard }, { label: "Рейтинг студентів", icon: Trophy }, { label: "Студенти", icon: Users }, { label: "Налаштування", icon: Settings }];

export default function Home() {
  const [screen, setScreen] = useState<Screen>("login");
  const [session, setSession] = useState<Session | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [listNotice, setListNotice] = useState<Notice>(null);
  const [selectedStudent, setSelectedStudent] = useState<Student | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [activeNav, setActiveNav] = useState("Рейтинг студентів");
  const pending = useRef(false);
  const userRole: UserRole = session?.user.role === "user" ? "student" : "teacher";
  const groups = [...new Set(students.map((student) => student.group))].sort();

  function endSession() {
    setSession(null);
    setStudents([]);
    setSelectedStudent(null);
    setListNotice(null);
    setScreen("login");
  }

  async function loadStudents() {
    setListNotice({ type: "loading", text: "Завантажуємо рейтинг…" });
    try {
      const students: Student[] = [];
      let page = 1;
      let pages: number;
      do {
        const result = await requestApi<unknown>(`/students?limit=100&page=${page}`);
        if (!result || typeof result !== "object") {
          throw new ApiError("Сервер повернув некоректний список студентів.");
        }
        const studentPage = result as StudentPage;
        if (!Array.isArray(studentPage.data) || !studentPage.data.every(isApiStudent)
          || !Number.isInteger(studentPage.pagination?.pages) || studentPage.pagination.pages < 0) {
          throw new ApiError("Сервер повернув некоректний список студентів.");
        }
        students.push(...studentPage.data.map(toStudent));
        pages = studentPage.pagination.pages;
        page += 1;
      } while (page <= pages);
      setStudents(students);
      setListNotice(null);
    } catch (error) {
      setListNotice(errorNotice(error));
    }
  }

  async function run(message: string, operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setNotice({ type: "loading", text: message });
    try {
      await operation();
    } catch (error) {
      if (session && error instanceof ApiError && error.status === 401) {
        endSession();
        setNotice(errorNotice(new ApiError("Сеанс завершився. Увійдіть знову.", 401, error.requestId)));
      } else {
        setNotice(errorNotice(error));
      }
    } finally {
      pending.current = false;
    }
  }

  function navigate(next: Screen) {
    if (pending.current) return;
    setNotice(null);
    setScreen(next);
  }

  if (!session) return <LoginScreen onLogin={(email, password) => run("Перевіряємо облікові дані…", async () => {
    const account = await requestApi<unknown>("/auth/login", { method: "POST", body: { email, password } });
    if (!isSession(account)) {
      throw new ApiError("Сервер повернув некоректні дані облікового запису.");
    }
    setSession(account);
    setScreen("dashboard");
    setNotice(null);
    await loadStudents();
  })} setNotice={setNotice} notice={notice} />;

  if (screen === "profile" && selectedStudent) return <RoleAwareProfileScreen
    student={selectedStudent} role={userRole} notice={notice}
    onBack={() => navigate("dashboard")} onEdit={() => navigate("admin")}
    onDelete={() => {
      if (pending.current || !window.confirm(`Видалити запис «${selectedStudent.name}»?`)) return;
      void run("Видаляємо запис…", async () => {
        await requestApi<void>(`/students/${selectedStudent.id}`, { method: "DELETE", token: session.token });
        setStudents((current) => current.filter((student) => student.id !== selectedStudent.id));
        setSelectedStudent(null);
        setScreen("dashboard");
        setNotice({ type: "success", text: "Студента видалено" });
      });
    }}
  />;

  if (screen === "admin") return <AdminScreen
    student={selectedStudent} groups={groups} onBack={() => navigate("dashboard")} notice={notice} setNotice={setNotice}
    onSave={(body) => run("Зберігаємо дані…", async () => {
      const savedResponse = await requestApi<unknown>(
        selectedStudent ? `/students/${selectedStudent.id}` : "/students",
        { method: selectedStudent ? "PUT" : "POST", token: session.token, body },
      );
      if (!isApiStudent(savedResponse)) throw new ApiError("Сервер повернув некоректний профіль студента.");
      const saved = toStudent(savedResponse);
      setStudents((current) => selectedStudent
        ? current.map((student) => student.id === saved.id ? saved : student)
        : [...current, saved]);
      setSelectedStudent(saved);
      setScreen("profile");
      setNotice({ type: "success", text: "Дані студента успішно збережено" });
    })}
  />;

  return <DashboardScreen students={students} role={userRole} activeNav={activeNav} setActiveNav={setActiveNav}
    displayName={session.user.displayName} listNotice={listNotice}
    onRetry={() => run("Завантажуємо рейтинг…", async () => { setNotice(null); await loadStudents(); })}
    onSelect={(student) => run("Завантажуємо профіль…", async () => {
      const profile = await requestApi<unknown>(`/students/${student.id}`);
      if (!isApiStudent(profile)) throw new ApiError("Сервер повернув некоректний профіль студента.");
      setSelectedStudent(toStudent(profile));
      setScreen("profile");
      setNotice(null);
    })}
    onCreate={() => { if (!pending.current) { setSelectedStudent(null); navigate("admin"); } }}
    onLogout={() => { if (!pending.current) { endSession(); setNotice(null); } }} notice={notice}
  />;
}

function LoginScreen({ onLogin, setNotice, notice }: { onLogin: (email: string, password: string) => Promise<void>; setNotice: (notice: Notice) => void; notice: Notice }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (notice?.type === "loading") return;
    if (!email.trim() || !password) {
      setNotice({ type: "error", text: "Заповніть email і пароль" });
      return;
    }
    void onLogin(email.trim(), password);
  };
  return <main className="auth-shell"><section className="auth-visual"><div className="brand auth-brand"><span className="brand-mark"><GraduationCap size={21} /></span><span>Рейтинг успішності студентів</span></div><div className="auth-copy"><p className="section-kicker">ОСВІТНІЙ ПОРТАЛ</p><h1>Твій прогрес<br /><span className="rating-title">Твій рейтинг</span><br /><em>Твої досягнення</em></h1><p>Платформа для перегляду академічних результатів, рейтингу студентів та навчального прогресу.</p></div><div className="auth-visual-footer"><span>Осінній семестр 2026</span><span>v1.0</span></div></section><section className="auth-form-wrap"><form className="auth-form" onSubmit={handleSubmit}><div className="mobile-brand"><span className="brand-mark"><GraduationCap size={21} /></span><strong>Рейтинг</strong></div><p className="section-kicker">ВІТАЄМО</p><h2>Увійти до системи</h2><p className="muted">Увійдіть за допомогою свого облікового запису.</p><label>Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@university.edu" /></label><label>Пароль<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder="Введіть пароль" /></label><button className="login-button" type="submit" disabled={notice?.type === "loading"}><LogIn size={17} /> Увійти</button>{notice && <StatusNotice notice={notice} />}</form></section></main>;
}

function DashboardScreen({ students, role, activeNav, setActiveNav, onSelect, onCreate, onLogout, notice, displayName, listNotice, onRetry }: { displayName: string; listNotice: Notice; onRetry: () => void; students: Student[]; role: UserRole; activeNav: string; setActiveNav: (label: string) => void; onSelect: (student: Student) => void; onCreate: () => void; onLogout: () => void; notice: Notice }) {
  const [query, setQuery] = useState("");
  const [sortAsc, setSortAsc] = useState(false);
  const [group, setGroup] = useState("Усі групи");
  const canManage = role === "teacher";
  const groups = [...new Set(students.map((student) => student.group))].sort();
  const topStudent = students.reduce<Student | undefined>((top, student) => !top || student.score > top.score ? student : top, undefined);
  const average = students.length ? (students.reduce((sum, student) => sum + student.score, 0) / students.length).toFixed(1) : "—";
  const filtered = useMemo(() => students.filter((student) => `${student.name} ${student.group}`.toLowerCase().includes(query.toLowerCase())).filter((student) => group === "Усі групи" || student.group === group).sort((a, b) => sortAsc ? a.score - b.score : b.score - a.score), [students, query, group, sortAsc]);
  return <main className={`app-shell ${canManage ? "can-manage" : "read-only"}`}><aside className="sidebar"><div className="brand"><span className="brand-mark"><GraduationCap size={21} /></span><span>Рейтинг</span></div><div className="workspace-label">ОСВІТНІЙ ПОРТАЛ</div><nav>{navItems.map(({ label, icon: Icon }) => <button className={`nav-item ${activeNav === label ? "active" : ""}`} key={label} onClick={() => setActiveNav(label)}><Icon size={18} /><span>{label}</span>{activeNav === label && <span className="nav-dot" />}</button>)}</nav><div className="sidebar-bottom"><div className="semester-card"><span className="eyebrow">ПОТОЧНИЙ СЕМЕСТР</span><strong>Осінь 2026</strong></div><button className="profile"><span className="profile-avatar">{displayName.split(/\s+/).slice(0, 2).map((name) => name[0]).join("")}</span><span><strong>{displayName}</strong><small>{canManage ? "Викладач" : "Студент"}</small></span><ChevronDown size={15} /></button><button className="logout-button" onClick={onLogout}>Вийти із системи</button></div></aside><section className="content-area"><header className="topbar"><div><p className="breadcrumb">Навчальний процес <span>/</span> {activeNav}</p><h1>{activeNav === "Студенти" ? "Студенти" : activeNav === "Налаштування" ? "Налаштування" : "Рейтинг студентів"}</h1></div><div className="top-actions"><button className="icon-button" aria-label="Сповіщення"><Bell size={19} /><span className="notification-dot" /></button><button className="export-button"><Download size={16} /> Експортувати</button></div></header><div className="content-scroll"><section className="intro-row"><div><p className="section-kicker">АКАДЕМІЧНІ ДОСЯГНЕННЯ</p><h2>{activeNav === "Налаштування" ? "Налаштування системи" : "Успішність групи"}</h2><p className="muted">{activeNav === "Налаштування" ? "Керування параметрами та доступом до системи." : "Порівнюйте результати та відстежуйте прогрес студентів."}</p></div>{canManage && activeNav !== "Налаштування" && <button className="primary-button" disabled={!!listNotice || notice?.type === "loading"} onClick={onCreate}><Plus size={17} /> Додати студента</button>}</section>{activeNav === "Налаштування" ? <SettingsPanel /> : listNotice ? <><StatusNotice notice={listNotice} />{listNotice.type === "error" && <button className="secondary-button" onClick={onRetry}>Повторити завантаження</button>}</> : <><section className="stats-grid"><StatCard label="Середній бал" value={average} suffix="/ 100" change="" note="" /><StatCard label="Студентів у рейтингу" value={String(students.length)} change="" note="" /><StatCard label="Найвищий результат" value={topStudent?.score.toFixed(1) || "—"} suffix="/ 100" change={topStudent?.name || "—"} note={topStudent?.group || "—"} trophy /></section><RankingTable groups={groups} students={filtered} query={query} setQuery={setQuery} group={group} setGroup={setGroup} sortAsc={sortAsc} setSortAsc={setSortAsc} onSelect={onSelect} /></>}{notice && <StatusNotice notice={notice} />}</div></section></main>;
}

function RankingTable({ groups, students, query, setQuery, group, setGroup, sortAsc, setSortAsc, onSelect }: { groups: string[]; students: Student[]; query: string; setQuery: (value: string) => void; group: string; setGroup: (value: string) => void; sortAsc: boolean; setSortAsc: (value: boolean) => void; onSelect: (student: Student) => void }) {
  return <section id="students-table" className="table-panel"><div className="panel-heading table-heading"><div><h3>Таблиця рейтингу</h3><p className="muted">{students.length} студентів · натисніть на рядок для перегляду профілю</p></div><div className="table-actions"><div className="search-box"><Search size={16} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Пошук студента..." /></div><select className="filter-select" value={group} onChange={(event) => setGroup(event.target.value)}><option>Усі групи</option>{groups.map((group) => <option key={group}>{group}</option>)}</select><button className="filter-button" onClick={() => setSortAsc(!sortAsc)}><SlidersHorizontal size={16} /> Бал {sortAsc ? "↑" : "↓"}</button></div></div><div className="table-scroll"><table><thead><tr><th>МІСЦЕ</th><th>СТУДЕНТ</th><th>ГРУПА</th><th>СЕРЕДНІЙ БАЛ</th><th /></tr></thead><tbody>{students.map((student, index) => <tr key={student.id} onClick={() => onSelect(student)}><td><span className={`rank ${index < 3 ? "top-rank" : ""}`}>{index < 3 ? <Trophy size={14} /> : index + 1}</span></td><td><div className="student-cell"><span className="student-avatar" style={{ background: student.accent }}>{student.initials}</span><strong>{student.name}</strong></div></td><td><span className="group-tag">{student.group}</span></td><td><strong className="score">{student.score.toFixed(1)}</strong> <span className="score-max">/ 100</span></td><td><button className="more-button" onClick={(event) => { event.stopPropagation(); onSelect(student); }} aria-label={`Відкрити профіль ${student.name}`}>•••</button></td></tr>)}</tbody></table></div>{students.length === 0 && <p className="empty-state">Студентів за заданими параметрами не знайдено.</p>}<div className="table-footer"><span>Показано {students.length} студентів</span><button className="next-button">Експортувати CSV <Download size={14} /></button></div></section>;
}

function RoleAwareProfileScreen({ student, role, onBack, onEdit, onDelete, notice }: { notice: Notice; student: Student; role: UserRole; onBack: () => void; onEdit: () => void; onDelete: () => void }) {
  return <div className={role === "student" ? "student-profile" : "teacher-profile"}><ProfileScreen student={student} onBack={onBack} onEdit={role === "teacher" ? onEdit : undefined} notice={notice} />{role === "teacher" && <button className="profile-delete-button" disabled={notice?.type === "loading"} onClick={onDelete}>Видалити студента</button>}</div>;
}

function ProfileScreen({ student, onBack, onEdit, notice }: { student: Student; onBack: () => void; onEdit?: () => void; notice: Notice }) { return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark"><GraduationCap size={21} /></span><span>Рейтинг</span></div><div className="workspace-label">ПРОФІЛЬ СТУДЕНТА</div><button className="nav-item active" onClick={onBack}><Trophy size={18} /><span>Рейтинг студентів</span></button></aside><section className="content-area"><header className="topbar"><div><p className="breadcrumb">Рейтинг <span>/</span> Профіль студента</p><h1>Профіль студента</h1></div>{onEdit && <button className="export-button" disabled={notice?.type === "loading"} onClick={onEdit}><Pencil size={16} /> Редагувати</button>}</header><div className="content-scroll"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Назад до рейтингу</button><StatusNotice notice={notice} /><section className="profile-hero"><span className="profile-large-avatar" style={{ background: student.accent }}>{student.initials}</span><div><p className="section-kicker">СТУДЕНТ · {student.group}</p><h2>{student.name}</h2><p className="muted">{student.email}</p></div><div className="profile-score"><span>Середній бал</span><strong>{student.score.toFixed(1)} <small>/ 100</small></strong></div></section><section className="profile-grid"><article className="info-panel"><h3>Особиста інформація</h3><InfoRow label="Повне ім’я" value={student.name} /><InfoRow label="Email" value={student.email} /><InfoRow label="Факультет" value={student.faculty} /><InfoRow label="Група / курс" value={`${student.group} · ${student.course} курс`} /></article><article className="info-panel"><h3>Навчальні результати</h3>{student.grades.map((grade, index) => <div className="grade-row" key={`${grade.subject}-${index}`}><span>{grade.subject}</span><strong>{grade.score}<small> / 100</small></strong></div>)}</article></section></div></section></main>; }

function AdminScreen({ student, groups, onBack, onSave, setNotice, notice }: { student: Student | null; groups: string[]; onBack: () => void; onSave: (body: object) => Promise<void>; setNotice: (notice: Notice) => void; notice: Notice }) {
  const [form, setForm] = useState({ name: student?.name || "", email: student?.email || "", group: student?.group || groups[0] || "Феі-41", course: String(student?.course || 3), faculty: student?.faculty || "Факультет комп’ютерних наук", score: String(student?.score ?? 90) });
  const update = (field: string, value: string) => setForm((current) => ({ ...current, [field]: value }));
  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (notice?.type === "loading") return;
    if (!form.name.trim() || !form.email.trim() || !form.score) {
      setNotice({ type: "error", text: "Заповніть усі обов’язкові поля" });
      return;
    }
    void onSave({
      fullName: form.name.trim(),
      email: form.email.trim(),
      group: form.group,
      course: Number(form.course),
      specialty: form.faculty.trim(),
      semester: student?.semester,
      rating: Number(form.score),
    });
  };
  return <main className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-mark"><GraduationCap size={21} /></span><span>Рейтинг</span></div><div className="workspace-label">АДМІНІСТРУВАННЯ</div><button className="nav-item active"><UserPlus size={18} /><span>{student ? "Редагування" : "Новий студент"}</span></button></aside><section className="content-area"><header className="topbar"><div><p className="breadcrumb">Адміністрування <span>/</span> {student ? "Редагування" : "Новий студент"}</p><h1>{student ? "Редагувати студента" : "Додати студента"}</h1></div></header><div className="content-scroll"><button className="back-button" onClick={onBack}><ArrowLeft size={16} /> Скасувати</button><form className="admin-form" onSubmit={submit}><div className="form-section-title"><div><p className="section-kicker">ДАНІ СТУДЕНТА</p><h2>{student ? "Оновлення запису" : "Новий запис"}</h2></div><span className="required-note">* обов’язкові поля</span></div><div className="form-grid"><label>Повне ім’я *<input value={form.name} onChange={(event) => update("name", event.target.value)} placeholder="Наприклад, Анна Коваленко" /></label><label>Email *<input type="email" value={form.email} onChange={(event) => update("email", event.target.value)} placeholder="student@university.edu" /></label><label>Група *<select value={form.group} onChange={(event) => update("group", event.target.value)}>{[...new Set([...groups, form.group])].map((group) => <option key={group}>{group}</option>)}</select></label><label>Курс *<select value={form.course} onChange={(event) => update("course", event.target.value)}><option value="1">1 курс</option><option value="2">2 курс</option><option value="3">3 курс</option><option value="4">4 курс</option><option value="5">5 курс</option><option value="6">6 курс</option></select></label><label className="wide-field">Факультет<input value={form.faculty} onChange={(event) => update("faculty", event.target.value)} /></label><label>Середній бал *<input type="number" readOnly={!!student?.grades.length} min="0" max="100" step="0.1" value={form.score} onChange={(event) => update("score", event.target.value)} /></label></div><div className="form-actions"><button type="button" className="secondary-button" onClick={onBack}>Скасувати</button><button type="submit" className="primary-button" disabled={notice?.type === "loading"}><CheckCircle2 size={17} /> Зберегти запис</button></div>{notice && <StatusNotice notice={notice} />}</form></div></section></main>;
}

function SettingsPanel() { return <section className="settings-panel"><div className="setting-row"><div><strong>Сповіщення про зміни рейтингу</strong><p className="muted">Отримувати повідомлення про оновлення оцінок.</p></div><input type="checkbox" defaultChecked /></div><div className="setting-row"><div><strong>Поточний семестр</strong><p className="muted">Період, який використовується для розрахунків.</p></div><select><option>Осінь 2026</option><option>Весна 2027</option></select></div></section>; }
function InfoRow({ label, value }: { label: string; value: string }) { return <div className="info-row"><span>{label}</span><strong>{value}</strong></div>; }
function StatusNotice({ notice }: { notice: Notice }) { if (!notice) return null; return <div role={notice.type === "error" ? "alert" : "status"} className={`status-notice ${notice.type}`}><span className="status-notice-dot" />{notice.text}</div>; }
function StatCard({ label, value, suffix, change, note, positive, trophy }: { label: string; value: string; suffix?: string; change: string; note: string; positive?: boolean; trophy?: boolean }) { return <article className="stat-card"><div className="stat-label">{label} {trophy && <Trophy size={15} className="gold-icon" />}</div><div className="stat-value">{value}<small>{suffix}</small></div><div className={`stat-change ${positive ? "positive" : ""}`}>{positive && "↗ "}{change}</div><div className="stat-note">{note}</div></article>; }
