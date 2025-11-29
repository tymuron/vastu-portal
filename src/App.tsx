import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import LoginPage from './pages/LoginPage';
import StudentLayout from './components/layout/StudentLayout';
import StudentDashboard from './pages/student/Dashboard';
import WeekView from './pages/student/WeekView';
import DayView from './pages/student/DayView';

import TeacherLayout from './components/layout/TeacherLayout';
import CourseEditor from './pages/teacher/CourseEditor';

import Students from './pages/teacher/Students';
import { AuthProvider } from './contexts/AuthContext';

function App() {
    return (
        <AuthProvider>
            <Router>
                <Routes>
                    <Route path="/login" element={<LoginPage />} />

                    {/* Student Routes */}
                    <Route path="/student" element={<StudentLayout />}>
                        <Route index element={<StudentDashboard />} />
                        <Route path="week/:weekId" element={<WeekView />} />
                        <Route path="week/:weekId/day/:dayId" element={<DayView />} />
                    </Route>

                    {/* Teacher Routes */}
                    <Route path="/teacher" element={<TeacherLayout />}>
                        <Route index element={<CourseEditor />} />
                        <Route path="course-editor" element={<CourseEditor />} />
                        <Route path="students" element={<Students />} />
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
