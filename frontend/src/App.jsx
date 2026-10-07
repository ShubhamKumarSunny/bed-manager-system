import React, { useEffect, lazy, Suspense } from "react"
import { HeroHighlight, Highlight } from "@/components/ui/hero-highlight"
import { FloatingNav } from "@/components/ui/floating-navbar"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { motion } from "framer-motion"
import { Home, User, MessageSquare, ArrowRight } from "lucide-react"
import { Routes, Route, Navigate, Link } from 'react-router-dom'
import { useDispatch, useSelector } from 'react-redux'
import { restoreSession, selectIsAuthenticated, selectCurrentUser } from '@/features/auth/authSlice'
import Login from './pages/Login'
import ProtectedRoute from './components/ProtectedRoute'
import Unauthorized from './pages/Unauthorized'
import NotFound from './pages/NotFound'

// Route-level code splitting: each dashboard is loaded on demand
const Dashboard = lazy(() => import('./pages/Dashboard'))
const AdminDashboard = lazy(() => import('./pages/AdminDashboard'))
const ManagerDashboard = lazy(() => import('./pages/ManagerDashboard'))
const StaffDashboard = lazy(() => import('./pages/StaffDashboard'))
const OccupantStatusDashboard = lazy(() => import('./pages/OccupantStatusDashboard'))
const ErStaffDashboard = lazy(() => import('./pages/ErStaffDashboard'))
const Profile = lazy(() => import('./pages/Profile'))
const TermsAndConditions = lazy(() => import('./pages/TermsAndConditions'))
const PrivacyPolicy = lazy(() => import('./pages/PrivacyPolicy'))
const About = lazy(() => import('./pages/About'))

function App() {
  const dispatch = useDispatch();
  const isAuthenticated = useSelector(selectIsAuthenticated);
  const currentUser = useSelector(selectCurrentUser);
  const [hasCheckedSession, setHasCheckedSession] = React.useState(false);

  // Restore session on app load (only once)
  useEffect(() => {
    const checkSession = async () => {
      await dispatch(restoreSession());
      setHasCheckedSession(true);
    };
    if (!hasCheckedSession) {
      checkSession();
    }
  }, [dispatch, hasCheckedSession]);

  const navItems = [
    { name: "Home", link: "/", icon: <Home className="h-4 w-4 text-neutral-500 dark:text-white" /> },
    { name: "Login", link: "/login", icon: <User className="h-4 w-4 text-neutral-500 dark:text-white" /> },
    { name: "About", link: "/about", icon: <MessageSquare className="h-4 w-4 text-neutral-500 dark:text-white" /> },
  ];

  // Show floating nav on home page and login (when not authenticated)
  const shouldShowNav = !isAuthenticated;

  const loadingScreen = (
    <div className="dark bg-black text-white min-h-screen flex items-center justify-center">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-500 mx-auto mb-4"></div>
        <p className="text-neutral-400">Loading...</p>
      </div>
    </div>
  );

  // Wait for session to be checked before rendering routes
  if (!hasCheckedSession) {
    return loadingScreen;
  }

  // Helper function to get role-based redirect path
  const getRoleDashboard = () => {
    if (!currentUser) return '/dashboard';
    switch (currentUser.role) {
      case 'hospital_admin':
        return '/admin/dashboard';
      case 'manager':
        return '/manager/dashboard';
      case 'ward_staff':
        return '/staff/dashboard';
      case 'er_staff':
        return '/er/dashboard';
      default:
        return '/dashboard';
    }
  };

  return (
    <div className="dark bg-black text-white min-h-screen">
      {shouldShowNav && <FloatingNav navItems={navItems} />}
      <Suspense fallback={loadingScreen}>
      <Routes>
        <Route path="/login" element={!isAuthenticated ? <Login /> : <Navigate to={getRoleDashboard()} replace />} />
        <Route path="/about" element={<About />} />

        {/* Home page - landing page for unauthenticated users */}
        <Route path="/" element={!isAuthenticated ? <HomePage /> : <Navigate to={getRoleDashboard()} />} />

        {/* Dashboard - only accessible when authenticated */}
        <Route
          path="/dashboard"
          element={isAuthenticated ? <Dashboard /> : <Navigate to="/login" />}
        />

        {/* Role-Based Dashboard Routes */}
        <Route
          path="/admin/dashboard"
          element={
            <ProtectedRoute allowedRoles={['hospital_admin']}>
              <AdminDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/dashboard"
          element={
            <ProtectedRoute allowedRoles={['manager']}>
              <ManagerDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/manager/occupants"
          element={
            <ProtectedRoute allowedRoles={['manager', 'hospital_admin']}>
              <OccupantStatusDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/staff/dashboard"
          element={
            <ProtectedRoute allowedRoles={['ward_staff']}>
              <StaffDashboard />
            </ProtectedRoute>
          }
        />
        <Route
          path="/er/dashboard"
          element={
            <ProtectedRoute allowedRoles={['er_staff']}>
              <ErStaffDashboard />
            </ProtectedRoute>
          }
        />

        {/* Profile Page - Accessible to all authenticated users */}
        <Route
          path="/profile"
          element={
            <ProtectedRoute allowedRoles={['hospital_admin', 'manager', 'ward_staff', 'er_staff', 'technical_team']}>
              <Profile />
            </ProtectedRoute>
          }
        />

        {/* Unauthorized Access Page */}
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Terms and Privacy Pages */}
        <Route path="/terms" element={<TermsAndConditions />} />
        <Route path="/privacy" element={<PrivacyPolicy />} />

        {/* Anything else */}
        <Route path="*" element={<NotFound />} />
      </Routes>
      </Suspense>
    </div>
  )
}

// Home page component for unauthenticated users
function HomePage() {
  const features = [
    {
      emoji: "🛏️",
      title: "Real-time Updates",
      description: "Live bed status synchronization across all wards with instant notifications",
      span: "col-span-1 row-span-1"
    },
    {
      emoji: "📊",
      title: "Smart Analytics",
      description: "Data-driven insights on occupancy trends and forecasting for better planning",
      span: "col-span-1 row-span-1"
    },
    {
      emoji: "💼",
      title: "Role-Based Access",
      description: "Secure, customized dashboards for ICU managers, ward staff, and administrators",
      span: "col-span-1 row-span-1"
    },
    {
      emoji: "🏥",
      title: "Ward Management",
      description: "Efficiently manage multiple wards with centralized bed allocation and tracking. Real-time visibility into bed availability, patient status, and operational workflows.",
      span: "col-span-2 row-span-1"
    },
    {
      emoji: "🚨",
      title: "Emergency Requests",
      description: "Quick emergency admission workflows with intelligent bed recommendations",
      span: "col-span-1 row-span-1"
    },
    {
      emoji: "📱",
      title: "Mobile Optimized",
      description: "Full functionality on tablets and mobile devices for on-the-go management",
      span: "col-span-1 row-span-1"
    },
    {
      emoji: "📈",
      title: "Advanced Forecasting",
      description: "Predictive analytics for discharge planning, staff scheduling, and capacity optimization",
      span: "col-span-2 row-span-1"
    }
  ];

  return (
    <HeroHighlight>
      {/* Header with generous padding to avoid navbar overlap */}
      <div className="pt-32 pb-12">
        <motion.h1
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1], delay: 0.4 }}
          className="text-2xl px-4 md:text-4xl lg:text-5xl font-bold text-neutral-700 dark:text-white max-w-6xl leading-relaxed lg:leading text-center mx-auto "
        >
          <div className="text-5xl sm:text-6xl">Bed Manager</div>
          <div className="text-xl leading-10">Real-time clarity for <Highlight className="text-black dark:text-white"> critical decisions.</Highlight></div>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1], delay: 0.5 }}
          className="mt-5 max-w-2xl mx-auto px-6 text-center text-base text-neutral-400"
        >
          A hospital bed management platform with live bed tracking, emergency admission
          workflows, cleaning queues and occupancy forecasting, tailored to every role on the floor.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1], delay: 0.6 }}
          className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3 px-6"
        >
          <Link
            to="/login"
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-lg bg-white px-6 py-3 text-sm font-semibold text-black transition-colors hover:bg-neutral-200"
          >
            Try the live demo
            <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/about"
            className="inline-flex w-full sm:w-auto items-center justify-center rounded-lg border border-neutral-700 bg-neutral-900/60 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-neutral-800"
          >
            About the project
          </Link>
        </motion.div>
      </div>

      {/* Bento Grid Feature Cards - Responsive */}
      <motion.div
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1], delay: 0.6 }}
        className="max-w-6xl mx-auto px-4 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 auto-rows-max pb-20"
      >
        {features.map((feature, index) => (
          <motion.div
            key={index}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, delay: 0.7 + index * 0.1 }}
            className={`${feature.span.replace('col-span-2', 'sm:col-span-2 col-span-1')}`}
          >
            <Card className="h-full border-neutral-800 bg-neutral-900 backdrop-blur hover:bg-neutral-800/50 transition-all hover:shadow-lg hover:shadow-neutral-700/20">
              <CardHeader>
                <div className="text-5xl mb-3">{feature.emoji}</div>
                <CardTitle className="text-white text-lg">{feature.title}</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-neutral-300 text-sm leading-relaxed">{feature.description}</p>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </motion.div>

      {/* Footer that appears at the bottom when scrolling */}
      <motion.footer
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.8, ease: [0.22, 0.61, 0.36, 1], delay: 0.9 }}
        className="w-full text-center py-6 text-sm font-normal text-neutral-500 dark:text-neutral-400 bg-transparent"
      >
        Built by Team 25 with ❤️
      </motion.footer>
    </HeroHighlight>
  )
}

export default App
