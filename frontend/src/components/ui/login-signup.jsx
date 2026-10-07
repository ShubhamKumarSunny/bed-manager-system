"use client";

import * as React from "react";
import { useState, useRef, useEffect } from "react";
import { useDispatch, useSelector } from 'react-redux';
import { useNavigate, useLocation } from 'react-router-dom';
import { login as loginAction, register as registerAction } from '@/features/auth/authSlice';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { z } from 'zod';
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Separator } from "@/components/ui/separator";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Eye,
  EyeOff,
  Lock,
  Mail,
  X,
  BarChart3,
  Briefcase,
  BedDouble,
  Siren,
} from "lucide-react";
import { Select, SelectTrigger, SelectContent, SelectItem, SelectValue } from '@/components/ui/select';
import { HeroHighlight } from "@/components/ui/hero-highlight";
import Toast from '@/components/ui/Toast';

const DEMO_PASSWORD = 'demo1234';
const DEMO_ACCOUNTS = [
  { label: 'Hospital Admin', description: 'Analytics, forecasting, reports', email: 'admin@hospital.com', icon: BarChart3, color: 'text-blue-400' },
  { label: 'ICU Manager', description: 'Beds, requests, discharges', email: 'manager.icu@hospital.com', icon: Briefcase, color: 'text-purple-400' },
  { label: 'Ward Staff', description: 'Bed status and cleaning queue', email: 'staff.general@hospital.com', icon: BedDouble, color: 'text-green-400' },
  { label: 'ER Staff', description: 'Availability and bed requests', email: 'er@hospital.com', icon: Siren, color: 'text-red-400' },
];

const dashboardPathForRole = (role) => ({
  hospital_admin: '/admin/dashboard',
  manager: '/manager/dashboard',
  ward_staff: '/staff/dashboard',
  er_staff: '/er/dashboard',
}[role] || '/dashboard');

export default function LoginCardSection() {
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const location = useLocation();
  const { status } = useSelector((state) => state.auth);
  const [toast, setToast] = useState(null);

  const [showLoginPw, setShowLoginPw] = useState(false);
  const [showSignupPw, setShowSignupPw] = useState(false);
  const [activeTab, setActiveTab] = useState("login");
  const [role, setRole] = useState('ward_staff');
  const [ward, setWard] = useState('');
  const [department, setDepartment] = useState('');
  const nameRef = useRef(null);
  const loginEmailRef = useRef(null);
  const loginPwRef = useRef(null);
  const signupEmailRef = useRef(null);
  const signupPwRef = useRef(null);
  const [termsChecked, setTermsChecked] = useState(false);
  const [showTermsModal, setShowTermsModal] = useState(false);
  const [showPrivacyModal, setShowPrivacyModal] = useState(false);

  const [errors, setErrors] = useState({});
  const isSubmitting = status === 'loading';
  const [demoLoading, setDemoLoading] = useState(null);

  const handleDemoLogin = async (account) => {
    setErrors({});
    setDemoLoading(account.email);
    const resultAction = await dispatch(loginAction({ email: account.email, password: DEMO_PASSWORD }));
    setDemoLoading(null);
    if (loginAction.fulfilled.match(resultAction)) {
      navigate(dashboardPathForRole(resultAction.payload.user.role));
    } else {
      setErrors({ loginPassword: resultAction.payload || 'Demo login failed' });
    }
  };

  // Show notification from navigation state (e.g., after account deletion)
  useEffect(() => {
    if (location.state?.notification) {
      setToast(location.state.notification);
      // Clear the navigation state
      window.history.replaceState({}, document.title);
    }
  }, [location]);

  // Background is provided by HeroHighlight; particle canvas removed.

  const loginSchema = z.object({
    email: z.string().min(1, 'Required').email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
  });

  const signupSchema = z.object({
    role: z.string().min(1, 'Role is required'),
    name: z.string().min(2, 'Full name is required'),
    email: z.string().min(1, 'Required').email('Invalid email'),
    password: z.string().min(6, 'Password must be at least 6 characters'),
    ward: z.string().optional(),
    department: z.string().optional(),
    terms: z.literal(true, { errorMap: () => ({ message: 'You must accept Terms & Privacy' }) }),
  }).refine((data) => {
    // Ward is required for ward_staff and manager roles
    if ((data.role === 'ward_staff' || data.role === 'manager') && !data.ward) {
      return false;
    }
    return true;
  }, {
    message: 'Ward is required for Ward Staff and Manager roles',
    path: ['ward'],
  });

  return (
    <HeroHighlight center={false} containerClassName="fixed inset-0 text-zinc-50">
      <style>{`
        /* === Card minimal fade-up animation === */
        .card-animate {
          opacity: 0;
          transform: translateY(20px);
          animation: fadeUp 0.8s cubic-bezier(.22,.61,.36,1) 0.4s forwards;
        }
        @keyframes fadeUp {
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
      {/* Subtle vignette */}
      <div
        className="absolute inset-0 pointer-events-none [background:radial-gradient(80%_60%_at_50%_30%,rgba(0,0,0,0.03),transparent_60%)]" />
      {/* Animated accent lines removed */}
      {/* Header removed: branding and contact button intentionally omitted */}
      {/* Centered Login Card with Tabs (Login / Sign Up) */}
      <div className="min-h-screen w-full grid place-items-center px-4 pt-12 pb-8">
        <Card className="relative z-[5100] card-animate w-full max-w-md lg:max-w-3xl border border-neutral-200/5 bg-white/5 dark:border-neutral-700 dark:bg-neutral-900/60 backdrop-blur supports-[backdrop-filter]:bg-neutral-900/60">
          <CardHeader className="space-y-1 text-left pl-4 pr-4 pt-6">
            <CardTitle className="text-2xl">Welcome</CardTitle>
            <CardDescription className="text-zinc-400">Log in or create an account</CardDescription>
          </CardHeader>

          <CardContent className="pl-4 pr-4">
            {/* Controlled Tabs: only render the active panel to prevent stacking */}
            <Tabs value={activeTab} onValueChange={setActiveTab} className="auth-tabs w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">Log In</TabsTrigger>
                <TabsTrigger value="signup">Sign Up</TabsTrigger>
              </TabsList>

              <div className="tab-shell mt-6">
                {activeTab === "login" && (
                  <div className="tab-panel space-y-5">
                    <div className="grid gap-2 text-left">
                      <Label htmlFor="login-email" className="text-zinc-300">Email</Label>
                      <div className="relative">
                        <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        <Input ref={loginEmailRef} id="login-email" type="email" placeholder="you@example.com" className="pl-10 bg-zinc-950 border-zinc-800 text-zinc-50 placeholder:text-zinc-600" />
                      </div>
                      {errors.loginEmail && <p className="text-xs text-red-400 mt-1">{errors.loginEmail}</p>}
                    </div>

                    <div className="grid gap-2 text-left">
                      <Label htmlFor="login-password" className="text-zinc-300">Password</Label>
                      <div className="relative">
                        <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                        <Input ref={loginPwRef} id="login-password" type={showLoginPw ? "text" : "password"} placeholder="••••••••" className="pl-10 pr-10 bg-zinc-950 border-zinc-800 text-zinc-50 placeholder:text-zinc-600" />
                        <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-zinc-400 hover:text-zinc-200" onClick={() => setShowLoginPw(v => !v)} aria-label={showLoginPw ? "Hide password" : "Show password"}>
                          {showLoginPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div className="flex items-center">
                      <div className="flex items-center gap-2">
                        <Checkbox id="remember" className="border-zinc-700 data-[state=checked]:bg-zinc-50 data-[state=checked]:text-zinc-900" />
                        <Label htmlFor="remember" className="text-zinc-400">Remember me</Label>
                      </div>
                    </div>

                    <Button disabled={isSubmitting} onClick={async (e) => {
                      e.preventDefault(); // Prevent form submission/page refresh
                      setErrors({});
                      try {
                        const payload = {
                          email: loginEmailRef.current?.value || '',
                          password: loginPwRef.current?.value || '',
                        };
                        const result = loginSchema.safeParse(payload);
                        if (!result.success) {
                          const fieldErrors = {};
                          for (const issue of result.error.issues) {
                            fieldErrors[issue.path[0] === 'email' ? 'loginEmail' : 'loginPassword'] = issue.message;
                          }
                          setErrors(fieldErrors);
                          return;
                        }

                        // Call login action
                        const resultAction = await dispatch(loginAction(payload));
                        if (loginAction.fulfilled.match(resultAction)) {
                          // Success - navigate to role-specific dashboard
                          navigate(dashboardPathForRole(resultAction.payload.user.role));
                        } else {
                          // Error - show message
                          setErrors({ loginPassword: resultAction.payload || 'Login failed' });
                        }
                      } catch {
                        setErrors({ loginPassword: 'An unexpected error occurred' });
                      }
                    }} className="w-full h-10 rounded-lg bg-zinc-50 text-zinc-900 hover:bg-zinc-200">
                      {isSubmitting ? 'Logging in...' : 'Continue'}
                    </Button>
                    {errors.loginPassword && <p className="text-xs text-red-400 mt-1">{errors.loginPassword}</p>}

                    {/* One-click demo accounts (created by the backend seed script) */}
                    <div className="pt-2">
                      <div className="flex items-center gap-3 mb-3">
                        <Separator className="flex-1 bg-zinc-800" />
                        <span className="text-[11px] uppercase tracking-widest text-zinc-500">or explore a demo account</span>
                        <Separator className="flex-1 bg-zinc-800" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {DEMO_ACCOUNTS.map((account) => (
                          <button
                            key={account.email}
                            type="button"
                            disabled={isSubmitting}
                            onClick={() => handleDemoLogin(account)}
                            className="group rounded-lg border border-zinc-800 bg-zinc-950/60 px-3 py-2.5 text-left transition-colors hover:border-cyan-500/50 hover:bg-zinc-900 disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <span className="flex items-center gap-2 text-sm font-medium text-zinc-100">
                              <account.icon className={`h-4 w-4 ${account.color}`} />
                              {demoLoading === account.email ? 'Signing in...' : account.label}
                            </span>
                            <span className="mt-0.5 block text-xs text-zinc-500">{account.description}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* <div className="relative">
                      <Separator className="bg-zinc-800" />
                      <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-neutral-900/70 px-2 text-[11px] uppercase tracking-widest text-zinc-500">or</span>
                    </div> */}

                    {/* <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline" className="h-10 rounded-lg border-zinc-800 bg-zinc-950 text-zinc-50 hover:bg-neutral-900/80"><Github className="h-4 w-4 mr-2" /> GitHub</Button>
                      <Button variant="outline" className="h-10 rounded-lg border-zinc-800 bg-zinc-950 text-zinc-50 hover:bg-neutral-900/80"><Chrome className="h-4 w-4 mr-2" /> Google</Button>
                    </div> */}
                  </div>
                )}

                {activeTab === "signup" && (
                  <div className="tab-panel space-y-5">
                    {/* Two-column layout on desktop, single column on mobile */}
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                      {/* Left Column: Role, Ward, Department */}
                      <div className="space-y-5">
                        <div className="grid gap-2 text-left">
                          <Label htmlFor="role" className="text-zinc-300">Role</Label>
                          <Select value={role} onValueChange={setRole}>
                            <SelectTrigger className="w-full h-10">
                              <SelectValue placeholder="Select role" />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="hospital_admin">Hospital Admin</SelectItem>
                              <SelectItem value="er_staff">ER Staff</SelectItem>
                              <SelectItem value="ward_staff">Ward Staff</SelectItem>
                              <SelectItem value="manager">Manager</SelectItem>
                            </SelectContent>
                          </Select>
                          {errors.role && <p className="text-xs text-red-400 mt-1">{errors.role}</p>}
                        </div>

                        {/* Ward Selection - Required for ward_staff and manager */}
                        {(role === 'ward_staff' || role === 'manager') && (
                          <div className="grid gap-2 text-left">
                            <Label htmlFor="ward" className="text-zinc-300">
                              Ward <span className="text-red-400">*</span>
                            </Label>
                            <Select value={ward} onValueChange={setWard}>
                              <SelectTrigger className="w-full h-10">
                                <SelectValue placeholder="Select ward" />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="ICU">ICU</SelectItem>
                                <SelectItem value="General">General</SelectItem>
                                <SelectItem value="Emergency">Emergency</SelectItem>
                              </SelectContent>
                            </Select>
                            {errors.ward && <p className="text-xs text-red-400 mt-1">{errors.ward}</p>}
                          </div>
                        )}

                        {/* Department - Optional for all roles */}
                        <div className="grid gap-2 text-left">
                          <Label htmlFor="department" className="text-zinc-300">Department (Optional)</Label>
                          <Input
                            id="department"
                            type="text"
                            placeholder="e.g., Cardiology, Surgery"
                            value={department}
                            onChange={(e) => setDepartment(e.target.value)}
                            className="h-10 bg-zinc-950 border-zinc-800 text-zinc-50 placeholder:text-zinc-600"
                          />
                          {errors.department && <p className="text-xs text-red-400 mt-1">{errors.department}</p>}
                        </div>
                      </div>

                      {/* Right Column: Name, Email, Password */}
                      <div className="space-y-5">
                        <div className="grid gap-2 text-left">
                          <Label htmlFor="name" className="text-zinc-300">Full Name</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            <Input ref={nameRef} id="name" type="text" placeholder="John Doe" className="h-10 pl-10 bg-zinc-950 border-zinc-800 text-zinc-50 placeholder:text-zinc-600" />
                          </div>
                          {errors.name && <p className="text-xs text-red-400 mt-1">{errors.name}</p>}
                        </div>

                        <div className="grid gap-2 text-left">
                          <Label htmlFor="signup-email" className="text-zinc-300">Email</Label>
                          <div className="relative">
                            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            <Input ref={signupEmailRef} id="signup-email" type="email" placeholder="you@example.com" className="h-10 pl-10 bg-zinc-950 border-zinc-800 text-zinc-50 placeholder:text-zinc-600" />
                          </div>
                          {errors.email && <p className="text-xs text-red-400 mt-1">{errors.email}</p>}
                        </div>

                        <div className="grid gap-2 text-left">
                          <Label htmlFor="signup-password" className="text-zinc-300">Password</Label>
                          <div className="relative">
                            <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-zinc-500" />
                            <Input ref={signupPwRef} id="signup-password" type={showSignupPw ? "text" : "password"} placeholder="••••••••" className="h-10 pl-10 pr-10 bg-zinc-950 border-zinc-800 text-zinc-50 placeholder:text-zinc-600" />
                            <button type="button" className="absolute right-2 top-1/2 -translate-y-1/2 p-2 rounded-md text-zinc-400 hover:text-zinc-200" onClick={() => setShowSignupPw(v => !v)} aria-label={showSignupPw ? "Hide password" : "Show password"}>
                              {showSignupPw ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                            </button>
                          </div>
                          {errors.password && <p className="text-xs text-red-400 mt-1">{errors.password}</p>}
                        </div>
                      </div>
                    </div>

                    {/* Agreement and Button - Full Width */}
                    <div className="flex items-center gap-2">
                      <Checkbox checked={termsChecked} onCheckedChange={setTermsChecked} id="terms" className="border-zinc-700 data-[state=checked]:bg-zinc-50 data-[state=checked]:text-zinc-900" />
                      <Label htmlFor="terms" className="text-zinc-400 text-sm">
                        I agree to the{' '}
                        <button 
                          type="button"
                          onClick={(e) => { e.preventDefault(); setShowTermsModal(true); }}
                          className="text-cyan-400 hover:text-cyan-300 underline"
                        >
                          Terms & Conditions
                        </button>
                        {' '}and{' '}
                        <button 
                          type="button"
                          onClick={(e) => { e.preventDefault(); setShowPrivacyModal(true); }}
                          className="text-cyan-400 hover:text-cyan-300 underline"
                        >
                          Privacy Policy
                        </button>
                      </Label>
                    </div>

                    <Button disabled={isSubmitting} onClick={async (e) => {
                      e.preventDefault(); // Prevent form submission/page refresh
                      setErrors({});
                      try {
                        const payload = {
                          role,
                          name: nameRef.current?.value || '',
                          email: signupEmailRef.current?.value || '',
                          password: signupPwRef.current?.value || '',
                          ward: ward || undefined,
                          department: department || undefined,
                          terms: termsChecked,
                        };

                        const result = signupSchema.safeParse(payload);
                        if (!result.success) {
                          const fieldErrors = {};
                          for (const issue of result.error.issues) {
                            fieldErrors[issue.path[0]] = issue.message;
                          }
                          setErrors(fieldErrors);
                          return;
                        }

                        // Prepare registration data
                        const registrationData = {
                          name: payload.name,
                          email: payload.email,
                          password: payload.password,
                          role: payload.role
                        };

                        // Add optional fields only if they have values
                        if (payload.ward) registrationData.ward = payload.ward;
                        if (payload.department) registrationData.department = payload.department;

                        // Call register action
                        const resultAction = await dispatch(registerAction(registrationData));

                        if (registerAction.fulfilled.match(resultAction)) {
                          // Success - navigate to role-specific dashboard
                          navigate(dashboardPathForRole(resultAction.payload.user.role));
                        } else {
                          // Error - show message
                          setErrors({ signupError: resultAction.payload || 'Registration failed' });
                        }
                      } catch {
                        setErrors({ signupError: 'An unexpected error occurred' });
                      }
                    }} className="w-full h-10 rounded-lg bg-zinc-50 text-zinc-900 hover:bg-zinc-200">
                      {isSubmitting ? 'Creating account...' : 'Create account'}
                    </Button>
                    {errors.signupError && (
                      <div className="p-3 rounded-lg bg-red-500/10 border border-red-500/20">
                        <p className="text-sm text-red-400">{errors.signupError}</p>
                      </div>
                    )}
                    {/* 
                    <div className="relative">
                      <Separator className="bg-zinc-800" />
                      <span className="absolute left-1/2 -translate-x-1/2 -top-3 bg-neutral-900/70 px-2 text-[11px] uppercase tracking-widest text-zinc-500">or</span>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <Button variant="outline" className="h-10 rounded-lg border-zinc-800 bg-zinc-950 text-zinc-50 hover:bg-neutral-900/80"><Github className="h-4 w-4 mr-2" /> GitHub</Button>
                      <Button variant="outline" className="h-10 rounded-lg border-zinc-800 bg-zinc-950 text-zinc-50 hover:bg-neutral-900/80"><Chrome className="h-4 w-4 mr-2" /> Google</Button>
                    </div> */}
                  </div>
                )}
              </div>
            </Tabs>
          </CardContent>

          {/* <CardFooter className="flex items-center justify-center text-sm text-zinc-400">
            Need help? <a className="ml-1 text-zinc-200 hover:underline" href="#">Contact support</a>
          </CardFooter> */}
        </Card>
      </div>

      {/* Terms & Conditions Modal */}
      {showTermsModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="sticky top-0 bg-neutral-900 border-b border-neutral-700 p-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Terms and Conditions</h2>
              <button 
                onClick={() => setShowTermsModal(false)}
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-5rem)] p-6 text-zinc-300 space-y-4 text-left">
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">1. Acceptance of Terms</h3>
                <p className="text-left">By creating an account and accessing the Bed Manager System, you agree to be bound by these Terms and Conditions.</p>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">2. User Responsibilities</h3>
                <ul className="list-disc list-outside space-y-1 ml-6 text-left">
                  <li>Provide accurate and complete information during registration</li>
                  <li>Keep your login credentials secure and confidential</li>
                  <li>Use the System only for its intended medical and administrative purposes</li>
                  <li>Comply with all applicable healthcare regulations and privacy laws</li>
                </ul>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">3. Data Privacy and Security</h3>
                <p className="text-left">The System handles sensitive medical information. You must comply with HIPAA and maintain patient confidentiality at all times.</p>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">4. Role-Based Access</h3>
                <p className="text-left">Your access is determined by your assigned role. Do not attempt to access areas beyond your authorization level.</p>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">5. System Usage</h3>
                <ul className="list-disc list-outside space-y-1 ml-6 text-left">
                  <li>Updates to bed status must be accurate and timely</li>
                  <li>Patient information must be entered correctly</li>
                  <li>System resources must not be misused</li>
                </ul>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">6. Account Termination</h3>
                <p className="text-left">The hospital reserves the right to suspend or terminate your account for violations of these terms.</p>
              </section>
              <p className="text-sm text-zinc-500 pt-4 border-t border-neutral-700 text-left">Last Updated: December 2, 2025</p>
            </div>
          </div>
        </div>
      )}

      {/* Privacy Policy Modal */}
      {showPrivacyModal && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
          <div className="relative bg-neutral-900 border border-neutral-700 rounded-lg max-w-3xl w-full max-h-[80vh] overflow-hidden">
            <div className="sticky top-0 bg-neutral-900 border-b border-neutral-700 p-4 flex items-center justify-between">
              <h2 className="text-2xl font-bold text-white">Privacy Policy</h2>
              <button 
                onClick={() => setShowPrivacyModal(false)}
                className="p-2 hover:bg-neutral-800 rounded-lg transition-colors"
              >
                <X className="w-5 h-5 text-zinc-400" />
              </button>
            </div>
            <div className="overflow-y-auto max-h-[calc(80vh-5rem)] p-6 text-zinc-300 space-y-4 text-left">
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">1. Information We Collect</h3>
                <ul className="list-disc list-outside space-y-1 ml-6 text-left">
                  <li>User account information (name, email, role, ward)</li>
                  <li>Bed status data and occupancy information</li>
                  <li>Patient information entered by authorized staff</li>
                  <li>System activity logs</li>
                </ul>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">2. How We Use Your Information</h3>
                <p className="text-left">We use collected information to manage hospital bed availability, facilitate staff communication, and ensure patient safety.</p>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">3. Data Security</h3>
                <ul className="list-disc list-outside space-y-1 ml-6 text-left">
                  <li>Encrypted data transmission (HTTPS)</li>
                  <li>Password hashing and secure authentication</li>
                  <li>Role-based access control</li>
                  <li>Regular security audits</li>
                </ul>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">4. Data Sharing</h3>
                <p className="text-left">Your information is shared only with authorized hospital staff and when required by law. We never sell personal data.</p>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">5. Patient Data Protection</h3>
                <p className="text-left">All patient information is treated with highest confidentiality in compliance with HIPAA regulations.</p>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">6. Your Rights</h3>
                <ul className="list-disc list-outside space-y-1 ml-6 text-left">
                  <li>Access your personal information</li>
                  <li>Request corrections to inaccurate data</li>
                  <li>Delete your account (subject to retention requirements)</li>
                  <li>Report privacy concerns</li>
                </ul>
              </section>
              <section>
                <h3 className="text-xl font-semibold text-white mb-2">7. Contact Information</h3>
                <p className="text-left">For privacy questions: privacy@hospital.com</p>
              </section>
              <p className="text-sm text-zinc-500 pt-4 border-t border-neutral-700 text-left">Last Updated: December 2, 2025</p>
            </div>
          </div>
        </div>
      )}

      {/* Toast Notification */}
      {toast && (
        <Toast
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={() => setToast(null)}
          duration={5000}
        />
      )}
    </HeroHighlight>
  );
}
