import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import StudentLayout from './components/layout/StudentLayout';
import StudentDashboard from './pages/student/Dashboard';
import WeekView from './pages/student/WeekView';
import DayView from './pages/student/DayView';
import LiveStreams from './pages/student/LiveStreams';
import Library from './pages/student/Library';
import Profile from './pages/student/Profile';

import TeacherLayout from './components/layout/TeacherLayout';
import CourseEditor from './pages/teacher/CourseEditor';
import Students from './pages/teacher/Students';
import ManageStreams from './pages/teacher/ManageStreams';
import ManageLibrary from './pages/teacher/ManageLibrary';

import { AuthProvider } from './contexts/AuthContext';
import RegisterPage from './pages/RegisterPage';
import ForgotPasswordPage from './pages/ForgotPasswordPage';
import UpdatePasswordPage from './pages/UpdatePasswordPage';

function App() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
        return (
            <div className="min-h-screen flex items-center justify-center bg-gray-100 p-4">
                <div className="bg-white p-8 rounded-xl shadow-lg max-w-lg w-full border border-red-200 text-center">
                    <h1 className="text-2xl font-bold text-red-600 mb-4">Configuration Error</h1>
                    <p className="text-gray-700 mb-4">
                        The application is missing required environment variables.
                    </p>
                    <div className="bg-gray-50 p-4 rounded text-left text-sm font-mono text-gray-600 mb-6">
                        <p>Please set the following in your deployment settings:</p>
                        <ul className="list-disc list-inside mt-2">
                            {!supabaseUrl && <li>VITE_SUPABASE_URL</li>}
                            {!supabaseKey && <li>VITE_SUPABASE_ANON_KEY</li>}
                        </ul>
                    </div>
                    <p className="text-sm text-gray-500">
                        If you are the developer, check your <code>.env</code> file or deployment dashboard.
                    </p>
                </div>
            </div>
        );
    }

    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/register" element={<RegisterPage />} />
                    <Route path="/forgot-password" element={<ForgotPasswordPage />} />
                    <Route path="/update-password" element={<UpdatePasswordPage />} />

                    {/* Student Routes */}
                    <Route path="/student" element={<StudentLayout />}>
                        <Route index element={<StudentDashboard />} />
                        <Route path="week/:weekId" element={<WeekView />} />
                        <Route path="week/:weekId/day/:dayId" element={<DayView />} />
                        <Route path="streams" element={<LiveStreams />} />
                        <Route path="library" element={<Library />} />
                        <Route path="profile" element={<Profile />} />
                    </Route>

                    {/* Teacher Routes */}
                    <Route path="/teacher" element={<TeacherLayout />}>
                        <Route index element={<CourseEditor />} />
                        <Route path="course-editor" element={<CourseEditor />} />
                        <Route path="students" element={<Students />} />
                        <Route path="streams" element={<ManageStreams />} />
                        <Route path="library" element={<ManageLibrary />} />
                        <Route path="settings" element={<div className="text-center p-10">Настройки (В разработке)</div>} />
                    </Route>

                    {/* Default redirect */}
                    <Route path="/" element={<Navigate to="/login" replace />} />
                </Routes>
            </Router>
        </AuthProvider>
    );
}

export default App;
