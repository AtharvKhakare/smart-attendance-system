import { lazy, Suspense } from 'react';
import { Navigate, Outlet, Route, Routes } from 'react-router';
import AppShell from './components/AppShell.jsx';
import { Loading } from './components/UI.jsx';
import { useAuth } from './contexts/AuthContext.jsx';
import LoginPage from './pages/LoginPage.jsx';

const AttendancePage = lazy(() => import('./pages/AttendancePage.jsx'));
const ClassesPage = lazy(() => import('./pages/ClassesPage.jsx'));
const DashboardPage = lazy(() => import('./pages/DashboardPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const StudentsPage = lazy(() => import('./pages/StudentsPage.jsx'));
const AuditPage = lazy(() => import('./pages/AuditPage.jsx'));
const StudentPortalPage = lazy(() => import('./pages/StudentPortalPage.jsx'));
const page = (element) => <Suspense fallback={<Loading />}>{element}</Suspense>;

function RoleLayout({ role }) {
  const { user } = useAuth();
  if (!user) return <Navigate to={role === 'student' ? '/student/login' : '/login'} replace />;
  if (user.role !== role) {
    const destination = user.role === 'student' ? '/student/attendance' : user.role === 'admin' ? '/' : '/login';
    return <Navigate to={destination} replace />;
  }
  return <Outlet />;
}

function HomeRedirect() {
  const { user } = useAuth();
  return <Navigate to={user?.role === 'student' ? '/student/attendance' : user ? '/' : '/login'} replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<LoginPage audience="admin" />} />
      <Route path="/student/login" element={<LoginPage audience="student" />} />
      <Route element={<RoleLayout role="student" />}>
        <Route path="/student/attendance" element={page(<StudentPortalPage />)} />
      </Route>
      <Route element={<RoleLayout role="admin" />}>
        <Route element={<AppShell />}>
          <Route index element={page(<DashboardPage />)} />
          <Route path="students" element={page(<StudentsPage />)} />
          <Route path="classes" element={page(<ClassesPage />)} />
          <Route path="attendance" element={page(<AttendancePage />)} />
          <Route path="reports" element={page(<ReportsPage />)} />
          <Route path="audit" element={page(<AuditPage />)} />
        </Route>
      </Route>
      <Route path="*" element={<HomeRedirect />} />
    </Routes>
  );
}
