import React, { useState, useEffect, useMemo, useReducer } from 'react';
import {
  LayoutDashboard, Users, Calculator, FileText, CalendarDays,
  Building2, ShieldCheck, Settings as SettingsIcon, Plus,
  Download, Upload, Trash2, Edit3, Check, X, Search, Filter,
  ChevronRight, AlertCircle, TrendingUp, Wallet, Printer,
  FileSpreadsheet, Banknote, Clock, UserPlus, Eye, ArrowRight,
  CheckCircle2, Circle, FileDown, Building,
  Award, Target, GraduationCap, Briefcase, FileSignature, Bell,
  AlertTriangle, HardHat, BarChart3, Network, ClipboardList,
  TrendingDown, MapPin, Star, MessageSquare, Send, ThumbsUp,
  UserCheck, Flag, Activity, BookOpen, PieChart, Layers
} from 'lucide-react';

// ============================================================================
// EGYPTIAN PAYROLL CONSTANTS (2026)
// Sources: PwC Tax Summary Egypt (reviewed 04 Feb 2026), Law 91/2005 as amended,
// Law 148/2019 (Social Insurance), Law 14/2025 (New Labour Law, effective 1 Sep 2025)
// ============================================================================
const DEFAULT_SETTINGS = {
  taxYear: 2026,
  currency: 'EGP',

  // Income Tax — Law 91 of 2005 (as amended). Progressive brackets on annual income.
  annualPersonalExemption: 20000,
  disabledPersonalExemption: 30000,
  taxBrackets: [
    { from: 0,       to: 40000,    rate: 0.000 },
    { from: 40000,   to: 55000,    rate: 0.100 },
    { from: 55000,   to: 70000,    rate: 0.150 },
    { from: 70000,   to: 200000,   rate: 0.200 },
    { from: 200000,  to: 400000,   rate: 0.225 },
    { from: 400000,  to: 1200000,  rate: 0.250 },
    { from: 1200000, to: Infinity, rate: 0.275 },
  ],

  // Social Insurance — Law 148 of 2019. 15% annual cap adjustment until 2027.
  socialInsurance: {
    minMonthlyInsurable: 2700,     // 2026 floor
    maxMonthlyInsurable: 16700,    // 2026 ceiling (annual 200,400)
    employeeRate: 0.11,
    employerRate: 0.1875,
  },

  // Universal Health Insurance — separate from social insurance, no cap
  healthInsurance: {
    employeeRate: 0.01,
    employerRate: 0.0325,
  },

  // Law 14/2025
  minimumWage: 7000,                // Private sector, EGP/month
  workingHoursPerWeek: 48,
  workingHoursPerDay: 8,
  workingDaysPerMonth: 26,
  maxPresenceHoursPerDay: 12,
  overtimeDayMultiplier: 1.35,      // +35% day
  overtimeNightMultiplier: 1.70,    // +70% night
  restDayMultiplier: 2.00,          // Full day wage + rest day
  annualIncrementMin: 0.03,         // 3% minimum of insured salary (new requirement)

  // Training Fund (30+ employees)
  trainingFund: {
    ratePerEmployee: 0.0025,
    minPerEmployee: 10,
    maxPerEmployee: 30,
    thresholdEmployees: 30,
  },

  // Leave entitlements under Law 14/2025
  leave: {
    year1: 15,
    year2plus: 21,
    after10yrsOrAge50: 30,
    disability: 45,
    maternityMonths: 4,
    maternityMaxTimes: 3,
    paternityDays: 1,
    paternityMaxTimes: 3,
  },

  // Company details
  company: {
    nameEn: 'Mobica',
    nameAr: 'موبيكا',
    taxCardNumber: '',
    commercialRegister: '',
    socialInsuranceNumber: '',
    eInvoicingId: '',
    address: 'Cairo, Egypt',
    bankName: 'CIB',
    bankAccount: '',
    iban: '',
  },
};

// Egyptian banks commonly used for payroll
const EGYPTIAN_BANKS = [
  { code: 'CIB',   name: 'Commercial International Bank',    swift: 'CIBEEGCX' },
  { code: 'NBE',   name: 'National Bank of Egypt',           swift: 'NBEGEGCX' },
  { code: 'QNB',   name: 'QNB Alahli',                       swift: 'QNBAEGCX' },
  { code: 'AAIB',  name: 'Arab African International Bank',  swift: 'ARAIEGCX' },
  { code: 'ADIB',  name: 'Abu Dhabi Islamic Bank - Egypt',   swift: 'ABDIEGCA' },
  { code: 'BDC',   name: 'Banque du Caire',                  swift: 'BCAIEGCX' },
  { code: 'HDB',   name: 'Housing & Development Bank',       swift: 'HDBKEGCA' },
  { code: 'FAB',   name: 'First Abu Dhabi Bank Misr',        swift: 'FABMEGCX' },
  { code: 'AB',    name: 'Alex Bank',                        swift: 'ALEXEGCX' },
  { code: 'CA',    name: 'Crédit Agricole Egypt',            swift: 'AGRIEGCX' },
  { code: 'BM',    name: 'Banque Misr',                      swift: 'BMISEGCX' },
];

const DEPARTMENTS = [
  'Executive', 'Finance', 'HR', 'Engineering', 'Production',
  'Installation', 'Supply Chain', 'Sales', 'Showroom', 'IT',
  'Technical Office', 'Tenders', 'Marketing', 'Legal', 'QA/QC'
];

const CONTRACT_TYPES = ['Unlimited', 'Fixed-Term', 'Part-Time', 'Seasonal', 'Remote'];

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

// ============================================================================
// CALCULATION ENGINE
// ============================================================================

function calculateProgressiveTax(annualTaxableIncome, brackets) {
  if (annualTaxableIncome <= 0) return 0;
  let tax = 0;
  for (const b of brackets) {
    if (annualTaxableIncome <= b.from) break;
    const taxable = Math.min(annualTaxableIncome, b.to) - b.from;
    tax += taxable * b.rate;
  }
  return tax;
}

function calculatePayroll(employee, settings, adjustments = {}) {
  const {
    overtimeHoursDay = 0,
    overtimeHoursNight = 0,
    restDayHours = 0,
    commission = 0,
    bonus = 0,
    otherAllowances = 0,
    loanDeduction = 0,
    advanceDeduction = 0,
    absenceDays = 0,
    unpaidLeaveDays = 0,
  } = adjustments;

  const basic = Number(employee.basicSalary) || 0;
  const housingAllowance = Number(employee.housingAllowance) || 0;
  const transportAllowance = Number(employee.transportAllowance) || 0;
  const mealAllowance = Number(employee.mealAllowance) || 0;
  const otherFixedAllowances = Number(employee.otherAllowances) || 0;

  // Fixed salary = basic + fixed allowances (per Law 14/2025 definition)
  const fixedSalary = basic + housingAllowance + transportAllowance + mealAllowance + otherFixedAllowances;

  // Hourly rate based on standard 8h/day, ~208h/month (48h * 52 / 12)
  const hoursPerMonth = (settings.workingHoursPerWeek * 52) / 12;
  const hourlyRate = fixedSalary / hoursPerMonth;

  const overtimeDayPay = overtimeHoursDay * hourlyRate * settings.overtimeDayMultiplier;
  const overtimeNightPay = overtimeHoursNight * hourlyRate * settings.overtimeNightMultiplier;
  const restDayPay = restDayHours * hourlyRate * settings.restDayMultiplier;

  const absenceDeduction = absenceDays * (fixedSalary / settings.workingDaysPerMonth);
  const unpaidLeaveDeduction = unpaidLeaveDays * (fixedSalary / settings.workingDaysPerMonth);

  const variableSalary = overtimeDayPay + overtimeNightPay + restDayPay + commission + bonus + otherAllowances;
  const grossSalary = fixedSalary + variableSalary - absenceDeduction - unpaidLeaveDeduction;

  // Social insurance: on fixed salary, bounded by statutory floor/ceiling
  // Certain allowances up to 30% can be excluded (housing/meal) but we apply conservative approach
  // Using fixed salary for insurable base — this is the standard practice
  const insurableBase = Math.min(
    Math.max(fixedSalary, settings.socialInsurance.minMonthlyInsurable),
    settings.socialInsurance.maxMonthlyInsurable
  );
  const socialInsuranceEmployee = insurableBase * settings.socialInsurance.employeeRate;
  const socialInsuranceEmployer = insurableBase * settings.socialInsurance.employerRate;

  // Health insurance: on total gross (simplified — separate UHI rules apply in rolled-out governorates)
  const healthInsuranceEmployee = grossSalary * settings.healthInsurance.employeeRate;
  const healthInsuranceEmployer = grossSalary * settings.healthInsurance.employerRate;

  // Income tax — annualized method (monthly withholding estimate)
  const annualGross = grossSalary * 12;
  const annualSocialInsuranceEmp = socialInsuranceEmployee * 12;
  const exemption = employee.isDisabled
    ? settings.disabledPersonalExemption
    : settings.annualPersonalExemption;

  const annualTaxable = Math.max(0, annualGross - annualSocialInsuranceEmp - exemption);
  const annualTax = calculateProgressiveTax(annualTaxable, settings.taxBrackets);
  const monthlyTax = annualTax / 12;

  const totalDeductions = socialInsuranceEmployee + healthInsuranceEmployee
    + monthlyTax + loanDeduction + advanceDeduction;
  const netSalary = grossSalary - totalDeductions;

  const trainingFundMonthly = settings.socialInsurance.minMonthlyInsurable
    * settings.trainingFund.ratePerEmployee;
  const trainingFundCapped = Math.min(
    Math.max(trainingFundMonthly, settings.trainingFund.minPerEmployee / 12),
    settings.trainingFund.maxPerEmployee / 12
  );

  const totalEmployerCost = grossSalary
    + socialInsuranceEmployer
    + healthInsuranceEmployer
    + trainingFundCapped;

  return {
    basic, housingAllowance, transportAllowance, mealAllowance, otherFixedAllowances,
    fixedSalary, hourlyRate,
    overtimeDayPay, overtimeNightPay, restDayPay, commission, bonus, otherAllowances,
    absenceDeduction, unpaidLeaveDeduction,
    variableSalary, grossSalary,
    insurableBase,
    socialInsuranceEmployee, socialInsuranceEmployer,
    healthInsuranceEmployee, healthInsuranceEmployer,
    annualTaxable, annualTax, monthlyTax,
    loanDeduction, advanceDeduction,
    totalDeductions, netSalary,
    trainingFundCapped,
    totalEmployerCost,
  };
}

// End-of-service gratuity under Law 14/2025:
// 0.5 month/year for first 5 years, 1 month/year thereafter
function calculateEndOfService(yearsOfService, monthlyFixedSalary) {
  const firstPortion = Math.min(yearsOfService, 5) * 0.5;
  const secondPortion = Math.max(0, yearsOfService - 5) * 1.0;
  return (firstPortion + secondPortion) * monthlyFixedSalary;
}

function calculateLeaveEntitlement(yearsOfService, age, isDisabled, settings) {
  if (isDisabled) return settings.leave.disability;
  if (yearsOfService >= 10 || age >= 50) return settings.leave.after10yrsOrAge50;
  if (yearsOfService < 1) return settings.leave.year1;
  return settings.leave.year2plus;
}

// ============================================================================
// STORAGE LAYER (persistent via window.storage)
// ============================================================================

const STORAGE_KEYS = {
  settings: 'mobica-payroll:settings',
  employees: 'mobica-payroll:employees',
  payrollRuns: 'mobica-payroll:payroll-runs',
  leaveRecords: 'mobica-payroll:leave-records',
  meta: 'mobica-payroll:meta',
  // HR Suite
  attendance: 'mobica-hr:attendance',
  goals: 'mobica-hr:goals',
  reviews: 'mobica-hr:reviews',
  jobs: 'mobica-hr:jobs',
  candidates: 'mobica-hr:candidates',
  courses: 'mobica-hr:courses',
  enrollments: 'mobica-hr:enrollments',
  documents: 'mobica-hr:documents',
  requests: 'mobica-hr:requests',
  disciplinary: 'mobica-hr:disciplinary',
  incidents: 'mobica-hr:incidents',
};

async function storageGet(key, fallback) {
  try {
    if (typeof window !== 'undefined' && window.storage) {
      const result = await window.storage.get(key);
      if (result && result.value) return JSON.parse(result.value);
    }
  } catch (e) { /* key not found is fine */ }
  return fallback;
}

async function storageSet(key, value) {
  try {
    if (typeof window !== 'undefined' && window.storage) {
      await window.storage.set(key, JSON.stringify(value));
    }
  } catch (e) {
    console.error('Storage set failed:', e);
  }
}

// ============================================================================
// FORMATTING HELPERS
// ============================================================================

const fmt = (n) => (Number(n) || 0).toLocaleString('en-EG', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const fmtEGP = (n) => `EGP ${fmt(n)}`;
const fmtCompact = (n) => {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1e9) return `${(v / 1e9).toFixed(2)}B`;
  if (Math.abs(v) >= 1e6) return `${(v / 1e6).toFixed(2)}M`;
  if (Math.abs(v) >= 1e3) return `${(v / 1e3).toFixed(1)}K`;
  return v.toFixed(0);
};

const monthLabel = (m, y) => `${MONTHS[m]} ${y}`;

const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

// ============================================================================
// SEED DATA (sample Mobica employees for demonstration)
// ============================================================================

const SEED_EMPLOYEES = [
  {
    id: uid(), code: 'MOB-0001',
    nameEn: 'Ahmed Ragaa', nameAr: 'أحمد رجاء',
    nationalId: '28501011234567', socialInsuranceNumber: 'SI-0000001', taxCardNumber: 'TC-0000001',
    department: 'Engineering', position: 'Engineering Director',
    hireDate: '2012-03-15', birthDate: '1978-05-01',
    contractType: 'Unlimited',
    basicSalary: 85000, housingAllowance: 15000, transportAllowance: 5000,
    mealAllowance: 2000, otherAllowances: 0,
    bankCode: 'CIB', bankAccount: '100012345678', iban: 'EG380019000500000100012345678',
    isDisabled: false, status: 'Active',
  },
  {
    id: uid(), code: 'MOB-0002',
    nameEn: 'Wael Embaby', nameAr: 'وائل إمبابي',
    nationalId: '27808157654321', socialInsuranceNumber: 'SI-0000002', taxCardNumber: 'TC-0000002',
    department: 'Production', position: 'Manufacturing Director',
    hireDate: '2008-06-01', birthDate: '1972-08-15',
    contractType: 'Unlimited',
    basicSalary: 95000, housingAllowance: 18000, transportAllowance: 6000,
    mealAllowance: 2000, otherAllowances: 0,
    bankCode: 'CIB', bankAccount: '100022345678', iban: 'EG380019000500000100022345678',
    isDisabled: false, status: 'Active',
  },
  {
    id: uid(), code: 'MOB-0003',
    nameEn: 'Yehia El Dardiry', nameAr: 'يحيى الدرديري',
    nationalId: '28203201122334', socialInsuranceNumber: 'SI-0000003', taxCardNumber: 'TC-0000003',
    department: 'Supply Chain', position: 'Supply Chain Director',
    hireDate: '2015-01-10', birthDate: '1982-03-20',
    contractType: 'Unlimited',
    basicSalary: 72000, housingAllowance: 12000, transportAllowance: 5000,
    mealAllowance: 2000, otherAllowances: 0,
    bankCode: 'NBE', bankAccount: '200012345678', iban: 'EG210003000100000200012345678',
    isDisabled: false, status: 'Active',
  },
  {
    id: uid(), code: 'MOB-0004',
    nameEn: 'Mahmoud Sayed', nameAr: 'محمود سيد',
    nationalId: '28611053344556', socialInsuranceNumber: 'SI-0000004', taxCardNumber: 'TC-0000004',
    department: 'Tenders', position: 'Tenders Manager',
    hireDate: '2018-09-01', birthDate: '1986-11-05',
    contractType: 'Unlimited',
    basicSalary: 48000, housingAllowance: 8000, transportAllowance: 3500,
    mealAllowance: 1500, otherAllowances: 0,
    bankCode: 'CIB', bankAccount: '100032345678', iban: 'EG380019000500000100032345678',
    isDisabled: false, status: 'Active',
  },
  {
    id: uid(), code: 'MOB-0005',
    nameEn: 'Fatma Hassan', nameAr: 'فاطمة حسن',
    nationalId: '29003184455667', socialInsuranceNumber: 'SI-0000005', taxCardNumber: 'TC-0000005',
    department: 'HR', position: 'HR Manager',
    hireDate: '2020-02-15', birthDate: '1990-03-18',
    contractType: 'Unlimited',
    basicSalary: 32000, housingAllowance: 5000, transportAllowance: 2500,
    mealAllowance: 1500, otherAllowances: 0,
    bankCode: 'QNB', bankAccount: '300012345678', iban: 'EG250006700500000300012345678',
    isDisabled: false, status: 'Active',
  },
  {
    id: uid(), code: 'MOB-0006',
    nameEn: 'Karim Mostafa', nameAr: 'كريم مصطفى',
    nationalId: '29512157788990', socialInsuranceNumber: 'SI-0000006', taxCardNumber: 'TC-0000006',
    department: 'Sales', position: 'Senior Account Manager',
    hireDate: '2022-05-01', birthDate: '1995-12-15',
    contractType: 'Unlimited',
    basicSalary: 18000, housingAllowance: 3000, transportAllowance: 2000,
    mealAllowance: 1000, otherAllowances: 0,
    bankCode: 'CIB', bankAccount: '100042345678', iban: 'EG380019000500000100042345678',
    isDisabled: false, status: 'Active',
  },
  {
    id: uid(), code: 'MOB-0007',
    nameEn: 'Mona Ahmed', nameAr: 'منى أحمد',
    nationalId: '29807221100998', socialInsuranceNumber: 'SI-0000007', taxCardNumber: 'TC-0000007',
    department: 'Finance', position: 'Senior Accountant',
    hireDate: '2023-01-15', birthDate: '1998-07-22',
    contractType: 'Unlimited',
    basicSalary: 12000, housingAllowance: 2000, transportAllowance: 1500,
    mealAllowance: 1000, otherAllowances: 0,
    bankCode: 'NBE', bankAccount: '200022345678', iban: 'EG210003000100000200022345678',
    isDisabled: false, status: 'Active',
  },
  {
    id: uid(), code: 'MOB-0008',
    nameEn: 'Hassan Ibrahim', nameAr: 'حسن إبراهيم',
    nationalId: '27504065566778', socialInsuranceNumber: 'SI-0000008', taxCardNumber: 'TC-0000008',
    department: 'Installation', position: 'Site Supervisor',
    hireDate: '2010-08-01', birthDate: '1975-04-06',
    contractType: 'Unlimited',
    basicSalary: 9500, housingAllowance: 1500, transportAllowance: 1500,
    mealAllowance: 800, otherAllowances: 0,
    bankCode: 'BM', bankAccount: '500012345678', iban: 'EG900002500100000500012345678',
    isDisabled: false, status: 'Active',
  },
];

// ============================================================================
// HR SUITE — CONSTANTS
// ============================================================================

const PERFORMANCE_RATINGS = [
  { value: 5, label: 'Exceptional',  color: 'emerald',  desc: 'Consistently exceeds all expectations' },
  { value: 4, label: 'Exceeds',      color: 'green',    desc: 'Regularly surpasses expectations' },
  { value: 3, label: 'Meets',        color: 'amber',    desc: 'Meets all role expectations' },
  { value: 2, label: 'Developing',   color: 'orange',   desc: 'Approaching expectations' },
  { value: 1, label: 'Below',        color: 'red',      desc: 'Does not meet expectations — PIP' },
];

const GOAL_STATUSES = ['Not Started', 'In Progress', 'At Risk', 'Completed', 'Cancelled'];

const JOB_STATUSES = ['Draft', 'Open', 'Interviewing', 'Offer Extended', 'Filled', 'Closed'];

const CANDIDATE_STAGES = [
  'Applied', 'Screening', 'Phone Interview', 'Technical',
  'Final Interview', 'Offer', 'Hired', 'Rejected', 'Withdrew'
];

const COURSE_CATEGORIES = [
  'Technical', 'Safety', 'Leadership', 'Compliance',
  'Onboarding', 'Soft Skills', 'Language', 'Quality'
];

const DOCUMENT_TYPES = [
  { key: 'national_id',      label: 'National ID',             requiresExpiry: true,  mandatory: true },
  { key: 'passport',         label: 'Passport',                requiresExpiry: true,  mandatory: false },
  { key: 'work_permit',      label: 'Work Permit',             requiresExpiry: true,  mandatory: false },
  { key: 'contract',         label: 'Employment Contract',     requiresExpiry: false, mandatory: true },
  { key: 'tax_card',         label: 'Tax Card',                requiresExpiry: false, mandatory: true },
  { key: 'si_card',          label: 'Social Insurance Card',   requiresExpiry: false, mandatory: true },
  { key: 'military_cert',    label: 'Military Service Cert.',  requiresExpiry: false, mandatory: false },
  { key: 'education',        label: 'Education Certificate',   requiresExpiry: false, mandatory: false },
  { key: 'medical_cert',     label: 'Medical Certificate',     requiresExpiry: true,  mandatory: false },
  { key: 'driving_license',  label: 'Driving License',         requiresExpiry: true,  mandatory: false },
  { key: 'nda',              label: 'NDA / Confidentiality',   requiresExpiry: false, mandatory: false },
];

const REQUEST_TYPES = [
  { key: 'leave',       label: 'Leave Request',         needsDates: true  },
  { key: 'letter_bank', label: 'HR Letter — Bank',      needsDates: false },
  { key: 'letter_emb',  label: 'HR Letter — Embassy',   needsDates: false },
  { key: 'letter_gen',  label: 'HR Letter — General',   needsDates: false },
  { key: 'expense',     label: 'Expense Reimbursement', needsDates: false },
  { key: 'loan',        label: 'Salary Loan',           needsDates: false },
  { key: 'advance',     label: 'Salary Advance',        needsDates: false },
  { key: 'cert',        label: 'Employment Certificate',needsDates: false },
  { key: 'other',       label: 'Other',                 needsDates: false },
];

const REQUEST_STATUSES = ['Pending', 'Approved', 'Rejected', 'Cancelled', 'Completed'];

// Law 14/2025 — disciplinary gradations
const DISCIPLINARY_ACTIONS = [
  { key: 'verbal',      label: 'Verbal Warning',        severity: 1 },
  { key: 'written',     label: 'Written Warning',       severity: 2 },
  { key: 'final',       label: 'Final Written Warning', severity: 3 },
  { key: 'suspension',  label: 'Suspension (unpaid)',   severity: 4 },
  { key: 'fine',        label: 'Fine (within limits)',  severity: 4 },
  { key: 'dismissal',   label: 'Termination for Cause', severity: 5 },
];

const INCIDENT_TYPES = [
  'Injury', 'Near Miss', 'Property Damage', 'Fire',
  'Chemical Exposure', 'Equipment Failure', 'Environmental', 'Security'
];

const INCIDENT_SEVERITY = [
  { key: 'minor',        label: 'Minor',        color: 'stone'  },
  { key: 'moderate',     label: 'Moderate',     color: 'amber'  },
  { key: 'serious',      label: 'Serious',      color: 'orange' },
  { key: 'major',        label: 'Major',        color: 'red'    },
  { key: 'catastrophic', label: 'Catastrophic', color: 'red'    },
];

const ATTENDANCE_STATUSES = [
  { key: 'present',   label: 'Present',   color: 'emerald' },
  { key: 'late',      label: 'Late',      color: 'amber'   },
  { key: 'absent',    label: 'Absent',    color: 'red'     },
  { key: 'leave',     label: 'On Leave',  color: 'blue'    },
  { key: 'off',       label: 'Day Off',   color: 'stone'   },
  { key: 'holiday',   label: 'Holiday',   color: 'stone'   },
];

const MOBICA_LOCATIONS = [
  'Cairo HQ', 'Borg El Arab Factory 1', 'Borg El Arab Factory 2',
  'Borg El Arab Factory 3', '10th of Ramadan', 'Obour',
  'Alexandria Showroom', 'Cairo Festival City Showroom',
  'London Office'
];

// ============================================================================
// HR SUITE — SEED DATA
// ============================================================================

const todayISO = () => new Date().toISOString().slice(0, 10);
const dateAddDays = (d, days) => {
  const dt = new Date(d);
  dt.setDate(dt.getDate() + days);
  return dt.toISOString().slice(0, 10);
};

const SEED_GOALS = [
  {
    id: uid(), employeeCode: 'MOB-0001',
    title: 'Launch Mobica Brain V2 across all six factories',
    description: 'Deploy the multi-agent system to Engineering, Production, Installation, Supply Chain, Technical, and Tenders departments with adoption >80%.',
    category: 'Strategic', weight: 40, progress: 75, status: 'In Progress',
    dueDate: dateAddDays(todayISO(), 45), cycle: 'Q2-2026',
  },
  {
    id: uid(), employeeCode: 'MOB-0002',
    title: 'Reduce engineering drawing revision cycle by 30%',
    description: 'Automate drawing release workflow with SAP integration.',
    category: 'Operational', weight: 30, progress: 50, status: 'In Progress',
    dueDate: dateAddDays(todayISO(), 60), cycle: 'Q2-2026',
  },
  {
    id: uid(), employeeCode: 'MOB-0003',
    title: 'Improve line OEE to 85% on Factory 2',
    description: 'Deploy condition monitoring on main CNC lines, reduce unplanned downtime.',
    category: 'Operational', weight: 35, progress: 40, status: 'In Progress',
    dueDate: dateAddDays(todayISO(), 75), cycle: 'Q2-2026',
  },
  {
    id: uid(), employeeCode: 'MOB-0005',
    title: 'Close TMG Phase 3 tender with >18% margin',
    description: 'Lead commercial negotiation and technical submission for Talaat Moustafa Group Phase 3.',
    category: 'Commercial', weight: 45, progress: 65, status: 'In Progress',
    dueDate: dateAddDays(todayISO(), 30), cycle: 'Q2-2026',
  },
  {
    id: uid(), employeeCode: 'MOB-0004',
    title: 'Reduce inventory holding costs by 12%',
    description: 'Implement Kanban on fast-movers, renegotiate MOQs with top 20 suppliers.',
    category: 'Operational', weight: 35, progress: 25, status: 'At Risk',
    dueDate: dateAddDays(todayISO(), 90), cycle: 'Q2-2026',
  },
];

const SEED_REVIEWS = [
  {
    id: uid(), employeeCode: 'MOB-0002', reviewerCode: 'MOB-0001',
    cycle: 'Q1-2026', type: 'Quarterly',
    ratingOverall: 4, ratingExecution: 4, ratingLeadership: 4,
    ratingTechnical: 5, ratingCollaboration: 4,
    strengths: 'Deep technical ownership of the drawing release process. Strong command of CAD stack and CNC programming. Respected by the production team.',
    improvements: 'Delegation — continues to hold technical work closer than required for a director-level role. Coach on structured handoffs.',
    comments: 'On track for expanded scope. Consider leading a cross-functional digital workflow initiative.',
    status: 'Completed', completedAt: dateAddDays(todayISO(), -20),
  },
  {
    id: uid(), employeeCode: 'MOB-0005', reviewerCode: 'MOB-0001',
    cycle: 'Q1-2026', type: 'Quarterly',
    ratingOverall: 5, ratingExecution: 5, ratingLeadership: 4,
    ratingTechnical: 4, ratingCollaboration: 5,
    strengths: 'Exceptional commercial instinct. Consistently lifts tender win rates. Builds strong client relationships at all levels.',
    improvements: 'Document tender intel more systematically so the team learns from each bid cycle.',
    comments: 'Highest-performing commercial lead this quarter.',
    status: 'Completed', completedAt: dateAddDays(todayISO(), -15),
  },
  {
    id: uid(), employeeCode: 'MOB-0003', reviewerCode: 'MOB-0001',
    cycle: 'Q2-2026', type: 'Quarterly',
    ratingOverall: 0, ratingExecution: 0, ratingLeadership: 0,
    ratingTechnical: 0, ratingCollaboration: 0,
    strengths: '', improvements: '', comments: '',
    status: 'Draft', completedAt: null,
  },
];

const SEED_JOBS = [
  {
    id: uid(), reqCode: 'REQ-2026-001',
    title: 'Senior Mechanical Design Engineer',
    department: 'Engineering', location: 'Borg El Arab Factory 1',
    employmentType: 'Unlimited', headcount: 2,
    salaryMin: 18000, salaryMax: 28000,
    status: 'Open', postedDate: dateAddDays(todayISO(), -20),
    description: 'Design office furniture systems for premium hospitality and corporate clients.',
    requirements: 'BSc Mechanical Engineering, 5+ years furniture/joinery, SolidWorks, AutoCAD.',
  },
  {
    id: uid(), reqCode: 'REQ-2026-002',
    title: 'Installation Site Supervisor',
    department: 'Installation', location: 'Cairo HQ',
    employmentType: 'Unlimited', headcount: 3,
    salaryMin: 12000, salaryMax: 18000,
    status: 'Interviewing', postedDate: dateAddDays(todayISO(), -35),
    description: 'Lead on-site installation teams for hospitality and commercial fit-outs.',
    requirements: '7+ years installation, team leadership, English B2+.',
  },
  {
    id: uid(), reqCode: 'REQ-2026-003',
    title: 'Key Account Manager — Hospitality',
    department: 'Sales', location: 'Cairo HQ',
    employmentType: 'Unlimited', headcount: 1,
    salaryMin: 25000, salaryMax: 40000,
    status: 'Open', postedDate: dateAddDays(todayISO(), -10),
    description: 'Own strategic hospitality accounts (Four Seasons, Emaar, Marriott). Drive repeat pipeline.',
    requirements: '8+ years B2B hospitality/contract furniture sales, existing relationships, English fluent.',
  },
  {
    id: uid(), reqCode: 'REQ-2026-004',
    title: 'CNC Machine Operator',
    department: 'Production', location: 'Borg El Arab Factory 2',
    employmentType: 'Unlimited', headcount: 8,
    salaryMin: 7500, salaryMax: 11000,
    status: 'Open', postedDate: dateAddDays(todayISO(), -5),
    description: 'Operate CNC routers and edge-banders on production lines.',
    requirements: 'Technical secondary diploma, 2+ years CNC, ability to read drawings.',
  },
];

const SEED_CANDIDATES = [
  {
    id: uid(), jobReqCode: 'REQ-2026-002', name: 'Omar Mostafa',
    email: 'omar.m@example.com', phone: '+20 100 111 2233',
    stage: 'Technical', rating: 4,
    appliedDate: dateAddDays(todayISO(), -28),
    nextInterview: dateAddDays(todayISO(), 3),
    notes: 'Strong background at Artoc. Led 40-person install crew on Madinaty phases.',
    resumeUrl: '',
  },
  {
    id: uid(), jobReqCode: 'REQ-2026-002', name: 'Mahmoud El-Sharkawy',
    email: 'm.sharkawy@example.com', phone: '+20 122 555 6677',
    stage: 'Phone Interview', rating: 3,
    appliedDate: dateAddDays(todayISO(), -22),
    nextInterview: dateAddDays(todayISO(), 5),
    notes: 'Ex-IKEA Cairo. Good process discipline but lower on-site leadership exposure.',
    resumeUrl: '',
  },
  {
    id: uid(), jobReqCode: 'REQ-2026-001', name: 'Nada Gamal',
    email: 'nada.gamal@example.com', phone: '+20 111 888 9900',
    stage: 'Final Interview', rating: 5,
    appliedDate: dateAddDays(todayISO(), -40),
    nextInterview: dateAddDays(todayISO(), 2),
    notes: 'Outstanding portfolio. Interned at Steelcase. Publication on sustainable joinery.',
    resumeUrl: '',
  },
  {
    id: uid(), jobReqCode: 'REQ-2026-003', name: 'Karim Abdel-Aziz',
    email: 'karim.aa@example.com', phone: '+20 100 444 5566',
    stage: 'Applied', rating: 0,
    appliedDate: dateAddDays(todayISO(), -3),
    nextInterview: null,
    notes: '',
    resumeUrl: '',
  },
  {
    id: uid(), jobReqCode: 'REQ-2026-004', name: 'Ahmed Samir',
    email: '', phone: '+20 127 332 1100',
    stage: 'Screening', rating: 3,
    appliedDate: dateAddDays(todayISO(), -4),
    nextInterview: null,
    notes: 'Technical diploma Alexandria. 3 years at Ariston.',
    resumeUrl: '',
  },
];

const SEED_COURSES = [
  {
    id: uid(), code: 'SAF-001', title: 'Factory Floor Safety Induction',
    category: 'Safety', duration: 4, deliveryMode: 'In-Person',
    mandatory: true, validityMonths: 12, cost: 200,
    description: 'Mandatory induction for all new factory floor hires. PPE, emergency response, machine guarding.',
  },
  {
    id: uid(), code: 'SAF-002', title: 'Lockout/Tagout (LOTO)',
    category: 'Safety', duration: 3, deliveryMode: 'In-Person',
    mandatory: true, validityMonths: 24, cost: 250,
    description: 'For anyone performing machinery maintenance. LOTO procedures and audit.',
  },
  {
    id: uid(), code: 'ONB-001', title: 'Mobica — Company, Brand, Legacy',
    category: 'Onboarding', duration: 2, deliveryMode: 'In-Person',
    mandatory: true, validityMonths: null, cost: 0,
    description: 'Company history, brand pillars, five business segments, 45-year legacy.',
  },
  {
    id: uid(), code: 'TEC-001', title: 'SolidWorks for Furniture Design',
    category: 'Technical', duration: 40, deliveryMode: 'Hybrid',
    mandatory: false, validityMonths: null, cost: 4500,
    description: 'Advanced parametric modeling and assemblies for furniture engineering team.',
  },
  {
    id: uid(), code: 'LEAD-001', title: 'Mobica Leadership Foundations',
    category: 'Leadership', duration: 24, deliveryMode: 'In-Person',
    mandatory: false, validityMonths: null, cost: 7500,
    description: 'For first-line managers and team leaders. Coaching, feedback, delegation.',
  },
  {
    id: uid(), code: 'COM-001', title: 'Egyptian Labour Law 14/2025 Essentials',
    category: 'Compliance', duration: 6, deliveryMode: 'Online',
    mandatory: true, validityMonths: 24, cost: 150,
    description: 'For all supervisors and department heads. New labour law changes effective Sept 2025.',
  },
  {
    id: uid(), code: 'QLT-001', title: 'ISO 9001 Awareness',
    category: 'Quality', duration: 4, deliveryMode: 'Online',
    mandatory: false, validityMonths: null, cost: 100,
    description: 'QMS principles, internal audits, non-conformance handling.',
  },
];

const SEED_ENROLLMENTS = [
  { id: uid(), employeeCode: 'MOB-0008', courseCode: 'SAF-001',
    status: 'Completed', completedDate: dateAddDays(todayISO(), -120),
    expiryDate: dateAddDays(todayISO(), 245), score: 95 },
  { id: uid(), employeeCode: 'MOB-0008', courseCode: 'SAF-002',
    status: 'Completed', completedDate: dateAddDays(todayISO(), -300),
    expiryDate: dateAddDays(todayISO(), 430), score: 88 },
  { id: uid(), employeeCode: 'MOB-0007', courseCode: 'SAF-001',
    status: 'Completed', completedDate: dateAddDays(todayISO(), -365),
    expiryDate: dateAddDays(todayISO(), 0), score: 82 },
  { id: uid(), employeeCode: 'MOB-0002', courseCode: 'LEAD-001',
    status: 'In Progress', completedDate: null, expiryDate: null, score: null },
  { id: uid(), employeeCode: 'MOB-0003', courseCode: 'COM-001',
    status: 'Enrolled', completedDate: null, expiryDate: null, score: null },
  { id: uid(), employeeCode: 'MOB-0005', courseCode: 'COM-001',
    status: 'Completed', completedDate: dateAddDays(todayISO(), -45),
    expiryDate: dateAddDays(todayISO(), 685), score: 91 },
];

const SEED_DOCUMENTS = [
  { id: uid(), employeeCode: 'MOB-0001', type: 'national_id',
    documentNumber: '27001051234567', issueDate: '2015-03-01', expiryDate: '2032-03-01',
    status: 'Valid', notes: '' },
  { id: uid(), employeeCode: 'MOB-0001', type: 'passport',
    documentNumber: 'A12345678', issueDate: '2019-06-10', expiryDate: dateAddDays(todayISO(), 45),
    status: 'Expiring Soon', notes: '' },
  { id: uid(), employeeCode: 'MOB-0008', type: 'driving_license',
    documentNumber: 'DL-998877', issueDate: '2020-01-01', expiryDate: dateAddDays(todayISO(), -10),
    status: 'Expired', notes: '' },
  { id: uid(), employeeCode: 'MOB-0002', type: 'national_id',
    documentNumber: '27212201234567', issueDate: '2018-07-15', expiryDate: '2035-07-15',
    status: 'Valid', notes: '' },
];

const SEED_REQUESTS = [
  { id: uid(), employeeCode: 'MOB-0003', type: 'leave',
    subject: 'Annual Leave — 5 days',
    details: 'Family trip, 5 working days',
    startDate: dateAddDays(todayISO(), 14), endDate: dateAddDays(todayISO(), 20),
    status: 'Pending', submittedAt: dateAddDays(todayISO(), -2),
    approverCode: 'MOB-0001', approvedAt: null, comment: '' },
  { id: uid(), employeeCode: 'MOB-0008', type: 'letter_bank',
    subject: 'HR Letter — CIB loan application',
    details: 'Required for personal loan application at CIB — salary confirmation, tenure, position',
    startDate: null, endDate: null,
    status: 'Approved', submittedAt: dateAddDays(todayISO(), -7),
    approverCode: 'MOB-0001', approvedAt: dateAddDays(todayISO(), -5), comment: 'Issued.' },
  { id: uid(), employeeCode: 'MOB-0004', type: 'advance',
    subject: 'Salary Advance — EGP 10,000',
    details: 'Medical expenses. Repayment over 4 months.',
    startDate: null, endDate: null,
    status: 'Pending', submittedAt: dateAddDays(todayISO(), -1),
    approverCode: 'MOB-0001', approvedAt: null, comment: '' },
  { id: uid(), employeeCode: 'MOB-0005', type: 'letter_emb',
    subject: 'HR Letter — UK Visa',
    details: 'Business trip UK for tender meeting. Need employment letter.',
    startDate: null, endDate: null,
    status: 'Completed', submittedAt: dateAddDays(todayISO(), -14),
    approverCode: 'MOB-0001', approvedAt: dateAddDays(todayISO(), -13), comment: 'Letter issued on letterhead.' },
];

const SEED_DISCIPLINARY = [
  { id: uid(), employeeCode: 'MOB-0008',
    action: 'verbal', date: dateAddDays(todayISO(), -90),
    incident: 'Late to site 3 times within 2 weeks',
    resolution: 'Verbal warning issued. Attendance to be monitored for 30 days.',
    issuedBy: 'MOB-0001', acknowledged: true, acknowledgedAt: dateAddDays(todayISO(), -89),
    notes: '' },
];

const SEED_INCIDENTS = [
  { id: uid(), incidentCode: 'INC-2026-003',
    date: dateAddDays(todayISO(), -18), time: '14:30',
    location: 'Borg El Arab Factory 2', type: 'Near Miss',
    severity: 'moderate',
    description: 'CNC router bit ejection near operator. No injury. Operator was wearing full PPE.',
    reportedBy: 'MOB-0003', peopleInvolved: '',
    rootCause: 'Bit clamp not fully tightened after changeover. Operator did not verify.',
    correctiveAction: 'Revised changeover SOP to include torque verification. Retraining scheduled for all operators.',
    status: 'Closed', closedDate: dateAddDays(todayISO(), -10) },
  { id: uid(), incidentCode: 'INC-2026-004',
    date: dateAddDays(todayISO(), -5), time: '09:15',
    location: 'Borg El Arab Factory 1', type: 'Injury',
    severity: 'minor',
    description: 'Cut to hand during manual panel handling. First aid applied on site.',
    reportedBy: 'MOB-0006', peopleInvolved: '',
    rootCause: 'Gloves not worn. PPE discipline lapse.',
    correctiveAction: 'Re-brief line supervisors. Increase spot checks. Consider cut-resistant gloves as standard.',
    status: 'Open', closedDate: null },
];

// Generate 30 days of attendance for seed employees
const generateSeedAttendance = () => {
  const records = [];
  const seedCodes = ['MOB-0001','MOB-0002','MOB-0003','MOB-0004','MOB-0005','MOB-0006','MOB-0007','MOB-0008'];
  const today = new Date();
  for (let d = 0; d < 30; d++) {
    const date = new Date(today);
    date.setDate(date.getDate() - d);
    const dateStr = date.toISOString().slice(0, 10);
    const dow = date.getDay();
    const isWeekend = (dow === 5 || dow === 6);
    for (const code of seedCodes) {
      if (isWeekend) {
        records.push({ id: uid(), employeeCode: code, date: dateStr,
          status: 'off', checkIn: null, checkOut: null, hoursWorked: 0, overtimeHours: 0, note: '' });
      } else {
        const r = Math.random();
        let status, checkIn, checkOut, hoursWorked, overtimeHours = 0;
        if (r < 0.90) {
          status = 'present';
          checkIn = '08:' + (Math.floor(Math.random() * 15)).toString().padStart(2, '0');
          checkOut = '17:' + (Math.floor(Math.random() * 60)).toString().padStart(2, '0');
          hoursWorked = 8 + (Math.random() < 0.3 ? Math.random() * 2 : 0);
          if (hoursWorked > 8.5) overtimeHours = hoursWorked - 8;
        } else if (r < 0.95) {
          status = 'late';
          checkIn = '09:' + (15 + Math.floor(Math.random() * 45)).toString().padStart(2, '0');
          checkOut = '17:30';
          hoursWorked = 7;
        } else if (r < 0.98) {
          status = 'leave';
          checkIn = null; checkOut = null; hoursWorked = 0;
        } else {
          status = 'absent';
          checkIn = null; checkOut = null; hoursWorked = 0;
        }
        records.push({ id: uid(), employeeCode: code, date: dateStr,
          status, checkIn, checkOut, hoursWorked: Math.round(hoursWorked * 100) / 100,
          overtimeHours: Math.round(overtimeHours * 100) / 100, note: '' });
      }
    }
  }
  return records;
};

// ============================================================================
// UI COMPONENTS
// ============================================================================

function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-3xl' }) {
  if (!isOpen) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-stone-900/60 backdrop-blur-sm">
      <div className={`bg-stone-50 ${maxWidth} w-full max-h-[90vh] overflow-hidden rounded-sm shadow-2xl border border-stone-300 flex flex-col`}>
        <div className="flex items-center justify-between px-8 py-5 border-b border-stone-300 bg-gradient-to-r from-stone-100 to-stone-50">
          <h2 className="text-2xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{title}</h2>
          <button onClick={onClose} className="text-stone-500 hover:text-stone-900 transition">
            <X size={20} />
          </button>
        </div>
        <div className="overflow-y-auto flex-1">
          {children}
        </div>
      </div>
    </div>
  );
}

function Button({ children, onClick, variant = 'primary', size = 'md', disabled = false, type = 'button', className = '' }) {
  const variants = {
    primary: 'bg-stone-900 text-stone-50 hover:bg-stone-800 border border-stone-900',
    secondary: 'bg-stone-50 text-stone-900 hover:bg-stone-100 border border-stone-400',
    gold: 'bg-amber-900 text-amber-50 hover:bg-amber-800 border border-amber-900',
    danger: 'bg-red-900 text-red-50 hover:bg-red-800 border border-red-900',
    ghost: 'bg-transparent text-stone-700 hover:bg-stone-200 border border-transparent',
  };
  const sizes = {
    sm: 'px-3 py-1.5 text-xs tracking-wide',
    md: 'px-5 py-2.5 text-sm tracking-wide',
    lg: 'px-7 py-3 text-base tracking-wide',
  };
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={disabled}
      className={`${variants[variant]} ${sizes[size]} uppercase transition disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2 ${className}`}
      style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}
    >
      {children}
    </button>
  );
}

function Label({ children }) {
  return (
    <label className="block text-[10px] uppercase tracking-[0.15em] text-stone-500 mb-1.5" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>
      {children}
    </label>
  );
}

function Input({ value, onChange, type = 'text', placeholder, disabled = false, className = '' }) {
  return (
    <input
      type={type}
      value={value ?? ''}
      onChange={(e) => onChange(type === 'number' ? (e.target.value === '' ? '' : Number(e.target.value)) : e.target.value)}
      placeholder={placeholder}
      disabled={disabled}
      className={`w-full px-3 py-2 bg-white border border-stone-300 text-stone-900 text-sm focus:outline-none focus:border-stone-900 transition ${className}`}
      style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
    />
  );
}

function Select({ value, onChange, options, className = '' }) {
  return (
    <select
      value={value ?? ''}
      onChange={(e) => onChange(e.target.value)}
      className={`w-full px-3 py-2 bg-white border border-stone-300 text-stone-900 text-sm focus:outline-none focus:border-stone-900 transition ${className}`}
      style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
    >
      {options.map((o) => (
        typeof o === 'string'
          ? <option key={o} value={o}>{o}</option>
          : <option key={o.value} value={o.value}>{o.label}</option>
      ))}
    </select>
  );
}

function StatCard({ label, value, sublabel, icon: Icon, accent = 'stone' }) {
  const accents = {
    stone: 'border-stone-300 text-stone-900',
    gold: 'border-amber-700 text-amber-900',
    green: 'border-emerald-700 text-emerald-900',
    red: 'border-red-700 text-red-900',
  };
  return (
    <div className={`bg-stone-50 border ${accents[accent]} p-6 relative overflow-hidden`}>
      <div className="flex items-start justify-between">
        <div>
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500 mb-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>{label}</p>
          <p className="text-3xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{value}</p>
          {sublabel && <p className="text-xs text-stone-500 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{sublabel}</p>}
        </div>
        {Icon && <Icon size={20} className="text-stone-400" />}
      </div>
    </div>
  );
}

// ============================================================================
// VIEWS
// ============================================================================

function DashboardView({ employees, payrollRuns, settings, onNavigate }) {
  const activeEmployees = employees.filter(e => e.status === 'Active');
  const totalPayroll = useMemo(() => {
    return activeEmployees.reduce((sum, e) => {
      const calc = calculatePayroll(e, settings);
      return sum + calc.grossSalary;
    }, 0);
  }, [activeEmployees, settings]);

  const totalEmployerCost = useMemo(() => {
    return activeEmployees.reduce((sum, e) => {
      const calc = calculatePayroll(e, settings);
      return sum + calc.totalEmployerCost;
    }, 0);
  }, [activeEmployees, settings]);

  const totalSI = useMemo(() => {
    return activeEmployees.reduce((sum, e) => {
      const calc = calculatePayroll(e, settings);
      return sum + calc.socialInsuranceEmployee + calc.socialInsuranceEmployer;
    }, 0);
  }, [activeEmployees, settings]);

  const totalTax = useMemo(() => {
    return activeEmployees.reduce((sum, e) => {
      const calc = calculatePayroll(e, settings);
      return sum + calc.monthlyTax;
    }, 0);
  }, [activeEmployees, settings]);

  const lastRun = payrollRuns[0];
  const nextRunDate = new Date();
  nextRunDate.setDate(nextRunDate.getDate() + (28 - nextRunDate.getDate()));

  // Department breakdown
  const deptBreakdown = useMemo(() => {
    const map = {};
    activeEmployees.forEach(e => {
      const calc = calculatePayroll(e, settings);
      map[e.department] = (map[e.department] || 0) + calc.grossSalary;
    });
    return Object.entries(map).sort((a, b) => b[1] - a[1]);
  }, [activeEmployees, settings]);

  const belowMinWage = activeEmployees.filter(e => {
    const fixed = (e.basicSalary || 0) + (e.housingAllowance || 0) + (e.transportAllowance || 0) + (e.mealAllowance || 0) + (e.otherAllowances || 0);
    return fixed < settings.minimumWage;
  });

  return (
    <div className="p-10 space-y-8">
      <div className="flex items-end justify-between border-b border-stone-300 pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Overview</p>
          <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Payroll Command Center</h1>
          <p className="text-sm text-stone-600 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            Tax Year {settings.taxYear} · Compliant with Law 91/2005, Law 148/2019, Law 14/2025
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10px] uppercase tracking-[0.2em] text-stone-500" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Today</p>
          <p className="text-lg text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>
            {new Date().toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="Active Headcount" value={activeEmployees.length} sublabel={`of ${employees.length} total`} icon={Users} />
        <StatCard label="Monthly Gross Payroll" value={fmtCompact(totalPayroll)} sublabel="EGP" icon={Wallet} accent="gold" />
        <StatCard label="Total Employer Cost" value={fmtCompact(totalEmployerCost)} sublabel="EGP inc. SI & taxes" icon={TrendingUp} />
        <StatCard label="Statutory Deductions" value={fmtCompact(totalSI + totalTax)} sublabel={`SI ${fmtCompact(totalSI)} · Tax ${fmtCompact(totalTax)}`} icon={ShieldCheck} accent="green" />
      </div>

      {belowMinWage.length > 0 && (
        <div className="bg-red-50 border border-red-300 p-6 flex gap-4 items-start">
          <AlertCircle className="text-red-700 flex-shrink-0 mt-0.5" size={20} />
          <div>
            <p className="text-sm text-red-900 tracking-wide uppercase" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 600 }}>
              Minimum Wage Compliance Alert
            </p>
            <p className="text-sm text-red-800 mt-1" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              {belowMinWage.length} employee(s) below the EGP {settings.minimumWage.toLocaleString()} private-sector minimum wage set by the National Wages Council.
            </p>
            <ul className="mt-3 text-xs text-red-800 space-y-0.5">
              {belowMinWage.map(e => <li key={e.id}>· {e.nameEn} ({e.code}) — {e.department}</li>)}
            </ul>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-stone-50 border border-stone-300 p-8">
          <h3 className="text-2xl tracking-tight mb-6" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Payroll by Department</h3>
          <div className="space-y-4">
            {deptBreakdown.map(([dept, amount]) => {
              const pct = (amount / totalPayroll) * 100;
              return (
                <div key={dept}>
                  <div className="flex justify-between items-baseline mb-1.5">
                    <span className="text-sm text-stone-800" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>{dept}</span>
                    <span className="text-xs text-stone-600 tabular-nums" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                      {fmtEGP(amount)} <span className="text-stone-400">({pct.toFixed(1)}%)</span>
                    </span>
                  </div>
                  <div className="h-[3px] bg-stone-200 overflow-hidden">
                    <div
                      className="h-full bg-amber-800 transition-all duration-500"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        <div className="bg-gradient-to-br from-stone-900 to-stone-800 text-stone-50 p-8 border border-stone-900">
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-400 mb-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Next Action</p>
          <h3 className="text-3xl tracking-tight mb-3" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>
            Run {monthLabel(new Date().getMonth(), new Date().getFullYear())} Payroll
          </h3>
          <p className="text-sm text-stone-300 mb-8 leading-relaxed" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            Salary withholding tax is due to the ETA by the 15th of the following month. Social insurance filings (Forms 1 & 6) due the same date.
          </p>
          <button
            onClick={() => onNavigate('payroll')}
            className="w-full bg-amber-700 hover:bg-amber-600 text-amber-50 px-5 py-3 text-xs uppercase tracking-[0.2em] transition inline-flex items-center justify-center gap-2"
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}
          >
            Go to Payroll Run <ArrowRight size={14} />
          </button>
          <div className="mt-6 pt-6 border-t border-stone-700 text-xs space-y-1.5 text-stone-400" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            <p>· Withholding tax filing due: 15th next month</p>
            <p>· Social insurance filing due: 15th next month</p>
            <p>· Annual reconciliation due: 31 January</p>
          </div>
        </div>
      </div>

      <div className="bg-stone-50 border border-stone-300 p-8">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-2xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Recent Payroll Runs</h3>
          <button onClick={() => onNavigate('payroll')} className="text-xs uppercase tracking-[0.2em] text-amber-800 hover:text-amber-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>
            View all →
          </button>
        </div>
        {payrollRuns.length === 0 ? (
          <p className="text-stone-500 text-sm text-center py-8" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            No payroll runs yet. Create your first one from the Payroll tab.
          </p>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-stone-300 text-[10px] uppercase tracking-[0.15em] text-stone-500">
                <th className="text-left py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Period</th>
                <th className="text-left py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Employees</th>
                <th className="text-right py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Gross</th>
                <th className="text-right py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Net</th>
                <th className="text-right py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Status</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              {payrollRuns.slice(0, 5).map(run => {
                const totalG = run.entries.reduce((s, e) => s + e.calc.grossSalary, 0);
                const totalN = run.entries.reduce((s, e) => s + e.calc.netSalary, 0);
                return (
                  <tr key={run.id} className="border-b border-stone-200">
                    <td className="py-3 text-stone-900">{monthLabel(run.month, run.year)}</td>
                    <td className="py-3 text-stone-700">{run.entries.length}</td>
                    <td className="py-3 text-right text-stone-900 tabular-nums">{fmtEGP(totalG)}</td>
                    <td className="py-3 text-right text-stone-900 tabular-nums">{fmtEGP(totalN)}</td>
                    <td className="py-3 text-right">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-1 ${run.paid ? 'bg-emerald-100 text-emerald-900' : run.approved ? 'bg-amber-100 text-amber-900' : 'bg-stone-200 text-stone-700'}`}>
                        {run.paid ? 'Paid' : run.approved ? 'Approved' : 'Draft'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// EMPLOYEES VIEW
// ----------------------------------------------------------------------------

function EmployeesView({ employees, setEmployees, settings }) {
  const [search, setSearch] = useState('');
  const [deptFilter, setDeptFilter] = useState('All');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);

  const filtered = employees.filter(e => {
    const matchesSearch = [e.nameEn, e.nameAr, e.code, e.nationalId, e.position, e.department]
      .some(f => (f || '').toString().toLowerCase().includes(search.toLowerCase()));
    const matchesDept = deptFilter === 'All' || e.department === deptFilter;
    return matchesSearch && matchesDept;
  });

  function save(emp) {
    if (editing) {
      setEmployees(employees.map(e => e.id === emp.id ? emp : e));
    } else {
      setEmployees([...employees, { ...emp, id: uid() }]);
    }
    setShowModal(false);
    setEditing(null);
  }

  function remove(id) {
    if (confirm('Remove this employee? This action cannot be undone.')) {
      setEmployees(employees.filter(e => e.id !== id));
    }
  }

  return (
    <div className="p-10 space-y-6">
      <div className="flex items-end justify-between border-b border-stone-300 pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Personnel</p>
          <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Employees</h1>
          <p className="text-sm text-stone-600 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            {employees.length} total · {employees.filter(e => e.status === 'Active').length} active
          </p>
        </div>
        <Button onClick={() => { setEditing(null); setShowModal(true); }} variant="gold">
          <UserPlus size={14} /> Add Employee
        </Button>
      </div>

      <div className="flex gap-3 items-center">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-stone-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, code, ID, department, position..."
            className="w-full pl-10 pr-3 py-2.5 bg-white border border-stone-300 text-sm focus:outline-none focus:border-stone-900"
            style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
          />
        </div>
        <Select
          value={deptFilter}
          onChange={setDeptFilter}
          options={['All', ...DEPARTMENTS]}
          className="w-52"
        />
      </div>

      <div className="bg-stone-50 border border-stone-300 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 border-b border-stone-300">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-stone-600">
              <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Code</th>
              <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Employee</th>
              <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Department</th>
              <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Position</th>
              <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Fixed Salary</th>
              <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Net</th>
              <th className="text-center px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Status</th>
              <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Actions</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            {filtered.map(emp => {
              const calc = calculatePayroll(emp, settings);
              return (
                <tr key={emp.id} className="border-b border-stone-200 hover:bg-stone-100 transition">
                  <td className="px-4 py-3 text-xs text-stone-500 tabular-nums">{emp.code}</td>
                  <td className="px-4 py-3">
                    <div className="text-stone-900 font-medium">{emp.nameEn}</div>
                    <div className="text-xs text-stone-500" dir="rtl" lang="ar">{emp.nameAr}</div>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{emp.department}</td>
                  <td className="px-4 py-3 text-stone-700">{emp.position}</td>
                  <td className="px-4 py-3 text-right text-stone-900 tabular-nums">{fmtEGP(calc.fixedSalary)}</td>
                  <td className="px-4 py-3 text-right text-stone-900 tabular-nums">{fmtEGP(calc.netSalary)}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`text-[10px] uppercase tracking-wide px-2 py-1 ${emp.status === 'Active' ? 'bg-emerald-100 text-emerald-900' : 'bg-stone-200 text-stone-600'}`}>
                      {emp.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-1">
                      <button
                        onClick={() => { setEditing(emp); setShowModal(true); }}
                        className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-200 transition"
                      >
                        <Edit3 size={14} />
                      </button>
                      <button
                        onClick={() => remove(emp.id)}
                        className="p-1.5 text-stone-500 hover:text-red-700 hover:bg-red-50 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-12 text-center text-stone-500">
                  No employees match your filter.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <Modal
        isOpen={showModal}
        onClose={() => { setShowModal(false); setEditing(null); }}
        title={editing ? 'Edit Employee' : 'Add Employee'}
        maxWidth="max-w-5xl"
      >
        <EmployeeForm
          initial={editing}
          onSave={save}
          onCancel={() => { setShowModal(false); setEditing(null); }}
          settings={settings}
        />
      </Modal>
    </div>
  );
}

function EmployeeForm({ initial, onSave, onCancel, settings }) {
  const [form, setForm] = useState(initial || {
    code: '', nameEn: '', nameAr: '', nationalId: '',
    socialInsuranceNumber: '', taxCardNumber: '',
    department: 'Engineering', position: '',
    hireDate: new Date().toISOString().slice(0, 10), birthDate: '',
    contractType: 'Unlimited',
    basicSalary: 0, housingAllowance: 0, transportAllowance: 0, mealAllowance: 0, otherAllowances: 0,
    bankCode: 'CIB', bankAccount: '', iban: '',
    isDisabled: false, status: 'Active',
  });

  const calc = useMemo(() => calculatePayroll(form, settings), [form, settings]);

  function update(field, value) { setForm(f => ({ ...f, [field]: value })); }

  function submit() {
    if (!form.nameEn || !form.code) {
      alert('Employee code and English name are required.');
      return;
    }
    onSave(form);
  }

  return (
    <div className="p-8 space-y-8">
      {/* Identity */}
      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-amber-800 mb-4 pb-2 border-b border-stone-200" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>
          Identity & Employment
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <Label>Employee Code *</Label>
            <Input value={form.code} onChange={(v) => update('code', v)} placeholder="MOB-0000" />
          </div>
          <div>
            <Label>National ID</Label>
            <Input value={form.nationalId} onChange={(v) => update('nationalId', v)} placeholder="14 digits" />
          </div>
          <div>
            <Label>Name (English) *</Label>
            <Input value={form.nameEn} onChange={(v) => update('nameEn', v)} />
          </div>
          <div>
            <Label>Name (Arabic)</Label>
            <Input value={form.nameAr} onChange={(v) => update('nameAr', v)} />
          </div>
          <div>
            <Label>Social Insurance No.</Label>
            <Input value={form.socialInsuranceNumber} onChange={(v) => update('socialInsuranceNumber', v)} />
          </div>
          <div>
            <Label>Tax Card No.</Label>
            <Input value={form.taxCardNumber} onChange={(v) => update('taxCardNumber', v)} />
          </div>
          <div>
            <Label>Department</Label>
            <Select value={form.department} onChange={(v) => update('department', v)} options={DEPARTMENTS} />
          </div>
          <div>
            <Label>Position</Label>
            <Input value={form.position} onChange={(v) => update('position', v)} />
          </div>
          <div>
            <Label>Hire Date</Label>
            <Input type="date" value={form.hireDate} onChange={(v) => update('hireDate', v)} />
          </div>
          <div>
            <Label>Birth Date</Label>
            <Input type="date" value={form.birthDate} onChange={(v) => update('birthDate', v)} />
          </div>
          <div>
            <Label>Contract Type</Label>
            <Select value={form.contractType} onChange={(v) => update('contractType', v)} options={CONTRACT_TYPES} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={form.status} onChange={(v) => update('status', v)} options={['Active', 'On Leave', 'Terminated', 'Suspended']} />
          </div>
          <div className="col-span-2 flex items-center gap-2 pt-6">
            <input
              type="checkbox"
              checked={form.isDisabled}
              onChange={(e) => update('isDisabled', e.target.checked)}
              id="isDisabled"
              className="w-4 h-4"
            />
            <label htmlFor="isDisabled" className="text-xs text-stone-700" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              Employee with disability (EGP {settings.disabledPersonalExemption.toLocaleString()} exemption applies)
            </label>
          </div>
        </div>
      </section>

      {/* Salary */}
      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-amber-800 mb-4 pb-2 border-b border-stone-200" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>
          Fixed Salary Components (EGP / Month)
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <div>
            <Label>Basic Salary *</Label>
            <Input type="number" value={form.basicSalary} onChange={(v) => update('basicSalary', v)} />
          </div>
          <div>
            <Label>Housing</Label>
            <Input type="number" value={form.housingAllowance} onChange={(v) => update('housingAllowance', v)} />
          </div>
          <div>
            <Label>Transport</Label>
            <Input type="number" value={form.transportAllowance} onChange={(v) => update('transportAllowance', v)} />
          </div>
          <div>
            <Label>Meal</Label>
            <Input type="number" value={form.mealAllowance} onChange={(v) => update('mealAllowance', v)} />
          </div>
          <div>
            <Label>Other Fixed</Label>
            <Input type="number" value={form.otherAllowances} onChange={(v) => update('otherAllowances', v)} />
          </div>
        </div>
      </section>

      {/* Banking */}
      <section>
        <h3 className="text-xs uppercase tracking-[0.2em] text-amber-800 mb-4 pb-2 border-b border-stone-200" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>
          Banking Details
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <Label>Bank</Label>
            <Select
              value={form.bankCode}
              onChange={(v) => update('bankCode', v)}
              options={EGYPTIAN_BANKS.map(b => ({ value: b.code, label: `${b.code} — ${b.name}` }))}
            />
          </div>
          <div>
            <Label>Account Number</Label>
            <Input value={form.bankAccount} onChange={(v) => update('bankAccount', v)} />
          </div>
          <div>
            <Label>IBAN</Label>
            <Input value={form.iban} onChange={(v) => update('iban', v)} placeholder="EG380019..." />
          </div>
        </div>
      </section>

      {/* Calculation preview */}
      <section className="bg-stone-100 border border-stone-300 p-6">
        <h3 className="text-xs uppercase tracking-[0.2em] text-stone-600 mb-4" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>
          Live Calculation Preview
        </h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Fixed Salary</p>
            <p className="text-xl tabular-nums" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(calc.fixedSalary)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Social Insurance</p>
            <p className="text-xl tabular-nums text-red-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>-{fmtEGP(calc.socialInsuranceEmployee)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-stone-500">Monthly Tax</p>
            <p className="text-xl tabular-nums text-red-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>-{fmtEGP(calc.monthlyTax)}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-amber-800">Net Take-Home</p>
            <p className="text-xl tabular-nums text-amber-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(calc.netSalary)}</p>
          </div>
          <div className="col-span-full pt-4 border-t border-stone-300 flex justify-between text-xs text-stone-600">
            <span>Total employer cost: <span className="text-stone-900 tabular-nums">{fmtEGP(calc.totalEmployerCost)}</span> · Employer SI: {fmtEGP(calc.socialInsuranceEmployer)} · Employer HI: {fmtEGP(calc.healthInsuranceEmployer)}</span>
          </div>
        </div>
      </section>

      <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
        <Button onClick={onCancel} variant="ghost">Cancel</Button>
        <Button onClick={submit} variant="primary">
          <Check size={14} /> {initial ? 'Save Changes' : 'Create Employee'}
        </Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// PAYROLL RUN VIEW
// ----------------------------------------------------------------------------

function PayrollRunView({ employees, payrollRuns, setPayrollRuns, settings }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth());
  const [year, setYear] = useState(now.getFullYear());
  const [adjustments, setAdjustments] = useState({});
  const [showAdjustmentsFor, setShowAdjustmentsFor] = useState(null);
  const [viewingRun, setViewingRun] = useState(null);

  const activeEmployees = employees.filter(e => e.status === 'Active');
  const entries = useMemo(() => activeEmployees.map(e => ({
    employeeId: e.id,
    employee: e,
    calc: calculatePayroll(e, settings, adjustments[e.id] || {})
  })), [activeEmployees, adjustments, settings]);

  const totals = entries.reduce((acc, e) => ({
    gross: acc.gross + e.calc.grossSalary,
    net: acc.net + e.calc.netSalary,
    tax: acc.tax + e.calc.monthlyTax,
    siEmployee: acc.siEmployee + e.calc.socialInsuranceEmployee,
    siEmployer: acc.siEmployer + e.calc.socialInsuranceEmployer,
    hiEmployee: acc.hiEmployee + e.calc.healthInsuranceEmployee,
    hiEmployer: acc.hiEmployer + e.calc.healthInsuranceEmployer,
    employerCost: acc.employerCost + e.calc.totalEmployerCost,
  }), { gross: 0, net: 0, tax: 0, siEmployee: 0, siEmployer: 0, hiEmployee: 0, hiEmployer: 0, employerCost: 0 });

  function commitRun() {
    if (!confirm(`Commit ${monthLabel(month, year)} payroll? ${entries.length} employees, net EGP ${fmt(totals.net)}.`)) return;
    const newRun = {
      id: uid(),
      month, year,
      date: new Date().toISOString(),
      entries: entries.map(e => ({
        employeeId: e.employeeId,
        employeeCode: e.employee.code,
        employeeName: e.employee.nameEn,
        employeeNameAr: e.employee.nameAr,
        bankCode: e.employee.bankCode,
        bankAccount: e.employee.bankAccount,
        iban: e.employee.iban,
        calc: e.calc,
        adjustments: adjustments[e.employeeId] || {},
      })),
      approved: true,
      paid: false,
      totals,
    };
    setPayrollRuns([newRun, ...payrollRuns]);
    setAdjustments({});
    alert(`Payroll run committed. Total net payout: ${fmtEGP(totals.net)}`);
  }

  function markPaid(runId) {
    setPayrollRuns(payrollRuns.map(r => r.id === runId ? { ...r, paid: true, paidDate: new Date().toISOString() } : r));
  }

  return (
    <div className="p-10 space-y-6">
      <div className="flex items-end justify-between border-b border-stone-300 pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Processing</p>
          <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Payroll Run</h1>
        </div>
        <div className="flex items-center gap-3">
          <Select
            value={month}
            onChange={(v) => setMonth(Number(v))}
            options={MONTHS.map((m, i) => ({ value: i, label: m }))}
            className="w-40"
          />
          <Select
            value={year}
            onChange={(v) => setYear(Number(v))}
            options={[2024, 2025, 2026, 2027].map(y => ({ value: y, label: y }))}
            className="w-28"
          />
        </div>
      </div>

      {/* Totals */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <StatCard label="Headcount" value={entries.length} />
        <StatCard label="Gross" value={fmtCompact(totals.gross)} sublabel="EGP" accent="gold" />
        <StatCard label="Net Payout" value={fmtCompact(totals.net)} sublabel="EGP" accent="green" />
        <StatCard label="Tax Withheld" value={fmtCompact(totals.tax)} sublabel="to ETA" />
        <StatCard label="Employer Cost" value={fmtCompact(totals.employerCost)} sublabel="EGP total" />
      </div>

      {/* Actions */}
      <div className="flex gap-3 flex-wrap">
        <Button onClick={commitRun} variant="gold" size="lg">
          <Check size={16} /> Commit {monthLabel(month, year)} Payroll
        </Button>
      </div>

      {/* Table */}
      <div className="bg-stone-50 border border-stone-300 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 border-b border-stone-300">
            <tr className="text-[10px] uppercase tracking-[0.15em] text-stone-600">
              <th className="text-left px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Employee</th>
              <th className="text-right px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Fixed</th>
              <th className="text-right px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Variable</th>
              <th className="text-right px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Gross</th>
              <th className="text-right px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>SI Emp</th>
              <th className="text-right px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>HI Emp</th>
              <th className="text-right px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Tax</th>
              <th className="text-right px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Net</th>
              <th className="text-center px-3 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Adj</th>
            </tr>
          </thead>
          <tbody className="tabular-nums" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            {entries.map(({ employee: emp, calc }) => (
              <tr key={emp.id} className="border-b border-stone-200 hover:bg-stone-100">
                <td className="px-3 py-2">
                  <div className="text-stone-900">{emp.nameEn}</div>
                  <div className="text-[10px] text-stone-500">{emp.code} · {emp.department}</div>
                </td>
                <td className="px-3 py-2 text-right text-stone-900">{fmt(calc.fixedSalary)}</td>
                <td className="px-3 py-2 text-right text-stone-700">{fmt(calc.variableSalary)}</td>
                <td className="px-3 py-2 text-right text-stone-900">{fmt(calc.grossSalary)}</td>
                <td className="px-3 py-2 text-right text-red-800">-{fmt(calc.socialInsuranceEmployee)}</td>
                <td className="px-3 py-2 text-right text-red-800">-{fmt(calc.healthInsuranceEmployee)}</td>
                <td className="px-3 py-2 text-right text-red-800">-{fmt(calc.monthlyTax)}</td>
                <td className="px-3 py-2 text-right text-stone-900 font-medium">{fmt(calc.netSalary)}</td>
                <td className="px-3 py-2 text-center">
                  <button onClick={() => setShowAdjustmentsFor(emp.id)} className="text-stone-500 hover:text-stone-900">
                    <Edit3 size={12} />
                  </button>
                </td>
              </tr>
            ))}
            <tr className="bg-stone-200 border-t-2 border-stone-900 font-medium">
              <td className="px-3 py-3 text-stone-900 text-xs uppercase tracking-wide">Totals</td>
              <td className="px-3 py-3 text-right text-stone-900">—</td>
              <td className="px-3 py-3 text-right text-stone-900">—</td>
              <td className="px-3 py-3 text-right text-stone-900">{fmt(totals.gross)}</td>
              <td className="px-3 py-3 text-right text-red-900">{fmt(totals.siEmployee)}</td>
              <td className="px-3 py-3 text-right text-red-900">{fmt(totals.hiEmployee)}</td>
              <td className="px-3 py-3 text-right text-red-900">{fmt(totals.tax)}</td>
              <td className="px-3 py-3 text-right text-stone-900">{fmt(totals.net)}</td>
              <td></td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Committed runs */}
      {payrollRuns.length > 0 && (
        <div>
          <h3 className="text-2xl tracking-tight mb-4 pt-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Committed Runs</h3>
          <div className="bg-stone-50 border border-stone-300">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 border-b border-stone-300">
                <tr className="text-[10px] uppercase tracking-[0.15em] text-stone-600">
                  <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Period</th>
                  <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Date</th>
                  <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Employees</th>
                  <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Net Payout</th>
                  <th className="text-center px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Status</th>
                  <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Actions</th>
                </tr>
              </thead>
              <tbody style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                {payrollRuns.map(run => (
                  <tr key={run.id} className="border-b border-stone-200 hover:bg-stone-100">
                    <td className="px-4 py-3 text-stone-900">{monthLabel(run.month, run.year)}</td>
                    <td className="px-4 py-3 text-stone-600 text-xs">{new Date(run.date).toLocaleString('en-GB')}</td>
                    <td className="px-4 py-3 text-right text-stone-700">{run.entries.length}</td>
                    <td className="px-4 py-3 text-right tabular-nums text-stone-900">{fmtEGP(run.totals.net)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-1 ${run.paid ? 'bg-emerald-100 text-emerald-900' : 'bg-amber-100 text-amber-900'}`}>
                        {run.paid ? 'Paid' : 'Approved'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <div className="flex justify-end gap-1">
                        <button onClick={() => setViewingRun(run)} className="p-1.5 text-stone-500 hover:text-stone-900 hover:bg-stone-200" title="View">
                          <Eye size={14} />
                        </button>
                        {!run.paid && (
                          <button onClick={() => markPaid(run.id)} className="p-1.5 text-stone-500 hover:text-emerald-700 hover:bg-emerald-50" title="Mark paid">
                            <CheckCircle2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <Modal
        isOpen={!!showAdjustmentsFor}
        onClose={() => setShowAdjustmentsFor(null)}
        title="Period Adjustments"
        maxWidth="max-w-2xl"
      >
        {showAdjustmentsFor && (
          <AdjustmentsForm
            value={adjustments[showAdjustmentsFor] || {}}
            onChange={(a) => setAdjustments({ ...adjustments, [showAdjustmentsFor]: a })}
            onClose={() => setShowAdjustmentsFor(null)}
            settings={settings}
          />
        )}
      </Modal>

      <Modal
        isOpen={!!viewingRun}
        onClose={() => setViewingRun(null)}
        title={viewingRun ? `${monthLabel(viewingRun.month, viewingRun.year)} Details` : ''}
        maxWidth="max-w-6xl"
      >
        {viewingRun && <RunDetailView run={viewingRun} settings={settings} />}
      </Modal>
    </div>
  );
}

function AdjustmentsForm({ value, onChange, onClose, settings }) {
  const [a, setA] = useState(value);
  function set(k, v) { setA({ ...a, [k]: v }); }
  return (
    <div className="p-8 space-y-6">
      <p className="text-sm text-stone-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        Overtime under Law 14/2025: +{(settings.overtimeDayMultiplier - 1) * 100}% daytime, +{(settings.overtimeNightMultiplier - 1) * 100}% nighttime.
        Rest day work pays double plus an alternative rest day.
      </p>
      <div className="grid grid-cols-2 gap-5">
        <div><Label>Overtime Hours (Day)</Label><Input type="number" value={a.overtimeHoursDay || 0} onChange={(v) => set('overtimeHoursDay', v)} /></div>
        <div><Label>Overtime Hours (Night)</Label><Input type="number" value={a.overtimeHoursNight || 0} onChange={(v) => set('overtimeHoursNight', v)} /></div>
        <div><Label>Rest-Day Hours</Label><Input type="number" value={a.restDayHours || 0} onChange={(v) => set('restDayHours', v)} /></div>
        <div><Label>Commission</Label><Input type="number" value={a.commission || 0} onChange={(v) => set('commission', v)} /></div>
        <div><Label>Bonus</Label><Input type="number" value={a.bonus || 0} onChange={(v) => set('bonus', v)} /></div>
        <div><Label>Other Variable</Label><Input type="number" value={a.otherAllowances || 0} onChange={(v) => set('otherAllowances', v)} /></div>
        <div><Label>Loan Deduction</Label><Input type="number" value={a.loanDeduction || 0} onChange={(v) => set('loanDeduction', v)} /></div>
        <div><Label>Advance Deduction</Label><Input type="number" value={a.advanceDeduction || 0} onChange={(v) => set('advanceDeduction', v)} /></div>
        <div><Label>Absence Days</Label><Input type="number" value={a.absenceDays || 0} onChange={(v) => set('absenceDays', v)} /></div>
        <div><Label>Unpaid Leave Days</Label><Input type="number" value={a.unpaidLeaveDays || 0} onChange={(v) => set('unpaidLeaveDays', v)} /></div>
      </div>
      <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={() => { onChange({}); onClose(); }}>Clear</Button>
        <Button variant="primary" onClick={() => { onChange(a); onClose(); }}>Apply</Button>
      </div>
    </div>
  );
}

function RunDetailView({ run, settings }) {
  return (
    <div className="p-8 space-y-5">
      <div className="grid grid-cols-4 gap-4 text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        <div><p className="text-[10px] uppercase text-stone-500 tracking-wider">Gross</p><p className="text-xl tabular-nums" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{fmtEGP(run.totals.gross)}</p></div>
        <div><p className="text-[10px] uppercase text-stone-500 tracking-wider">Net Payout</p><p className="text-xl tabular-nums text-amber-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{fmtEGP(run.totals.net)}</p></div>
        <div><p className="text-[10px] uppercase text-stone-500 tracking-wider">Tax to ETA</p><p className="text-xl tabular-nums" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{fmtEGP(run.totals.tax)}</p></div>
        <div><p className="text-[10px] uppercase text-stone-500 tracking-wider">SI to NOSI</p><p className="text-xl tabular-nums" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{fmtEGP(run.totals.siEmployee + run.totals.siEmployer)}</p></div>
      </div>
      <div className="overflow-x-auto border border-stone-300">
        <table className="w-full text-sm">
          <thead className="bg-stone-100">
            <tr className="text-[10px] uppercase tracking-wider text-stone-600">
              <th className="text-left px-3 py-2">Code</th>
              <th className="text-left px-3 py-2">Name</th>
              <th className="text-right px-3 py-2">Gross</th>
              <th className="text-right px-3 py-2">Deductions</th>
              <th className="text-right px-3 py-2">Net</th>
              <th className="text-left px-3 py-2">Bank</th>
            </tr>
          </thead>
          <tbody style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }} className="tabular-nums">
            {run.entries.map(e => (
              <tr key={e.employeeId} className="border-t border-stone-200">
                <td className="px-3 py-2 text-stone-500 text-xs">{e.employeeCode}</td>
                <td className="px-3 py-2">{e.employeeName}</td>
                <td className="px-3 py-2 text-right">{fmt(e.calc.grossSalary)}</td>
                <td className="px-3 py-2 text-right text-red-800">{fmt(e.calc.totalDeductions)}</td>
                <td className="px-3 py-2 text-right font-medium">{fmt(e.calc.netSalary)}</td>
                <td className="px-3 py-2 text-xs text-stone-600">{e.bankCode} · {e.bankAccount}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// PAYSLIPS VIEW
// ----------------------------------------------------------------------------

function PayslipsView({ employees, payrollRuns, settings }) {
  const [selectedRun, setSelectedRun] = useState(payrollRuns[0]?.id || null);
  const [selectedEmployee, setSelectedEmployee] = useState(null);

  const run = payrollRuns.find(r => r.id === selectedRun);

  if (payrollRuns.length === 0) {
    return (
      <div className="p-10">
        <h1 className="text-5xl tracking-tight mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Payslips</h1>
        <div className="bg-stone-50 border border-stone-300 p-12 text-center">
          <FileText className="mx-auto mb-4 text-stone-400" size={32} />
          <p className="text-stone-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            Commit a payroll run first to generate payslips.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-10 space-y-6">
      <div className="flex items-end justify-between border-b border-stone-300 pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Documents</p>
          <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Payslips</h1>
        </div>
        <Select
          value={selectedRun || ''}
          onChange={setSelectedRun}
          options={payrollRuns.map(r => ({ value: r.id, label: monthLabel(r.month, r.year) }))}
          className="w-52"
        />
      </div>

      <div className="grid grid-cols-12 gap-5">
        <div className="col-span-4 bg-stone-50 border border-stone-300 max-h-[700px] overflow-y-auto">
          <div className="p-4 bg-stone-100 border-b border-stone-300">
            <p className="text-xs uppercase tracking-wider text-stone-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>
              {run?.entries.length} employees
            </p>
          </div>
          {run?.entries.map(e => (
            <button
              key={e.employeeId}
              onClick={() => setSelectedEmployee(e.employeeId)}
              className={`w-full text-left px-4 py-3 border-b border-stone-200 transition ${selectedEmployee === e.employeeId ? 'bg-stone-900 text-stone-50' : 'hover:bg-stone-100'}`}
              style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}
            >
              <div className={`text-sm font-medium ${selectedEmployee === e.employeeId ? 'text-stone-50' : 'text-stone-900'}`}>
                {e.employeeName}
              </div>
              <div className={`text-xs ${selectedEmployee === e.employeeId ? 'text-stone-300' : 'text-stone-500'}`}>
                {e.employeeCode} · Net {fmt(e.calc.netSalary)}
              </div>
            </button>
          ))}
        </div>

        <div className="col-span-8">
          {selectedEmployee && run ? (
            <Payslip
              entry={run.entries.find(e => e.employeeId === selectedEmployee)}
              run={run}
              settings={settings}
              employee={employees.find(emp => emp.id === selectedEmployee)}
            />
          ) : (
            <div className="bg-stone-50 border border-stone-300 p-12 text-center">
              <p className="text-stone-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Select an employee to view payslip</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Payslip({ entry, run, settings, employee }) {
  const c = entry.calc;
  function printSlip() { window.print(); }

  return (
    <div className="bg-white border border-stone-300 print:border-0 print:shadow-none">
      <div className="p-10">
        {/* Header */}
        <div className="flex justify-between items-start border-b-2 border-stone-900 pb-6 mb-8">
          <div>
            <h2 className="text-4xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>{settings.company.nameEn}</h2>
            <p className="text-sm text-stone-600 mt-1" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }} dir="rtl" lang="ar">{settings.company.nameAr}</p>
            <p className="text-xs text-stone-500 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{settings.company.address}</p>
            <p className="text-xs text-stone-500" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Tax Card: {settings.company.taxCardNumber || '—'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-800" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Payslip / قسيمة الراتب</p>
            <p className="text-2xl mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{monthLabel(run.month, run.year)}</p>
          </div>
        </div>

        {/* Employee info */}
        <div className="grid grid-cols-2 gap-8 mb-8 text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500 mb-2">Employee</p>
            <p className="text-lg text-stone-900">{entry.employeeName}</p>
            <p className="text-stone-600" dir="rtl" lang="ar">{entry.employeeNameAr}</p>
            <p className="text-xs text-stone-500 mt-1">Code: {entry.employeeCode}</p>
            <p className="text-xs text-stone-500">National ID: {employee?.nationalId || '—'}</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-[0.15em] text-stone-500 mb-2">Payment</p>
            <p className="text-stone-700 text-xs">Bank: {entry.bankCode}</p>
            <p className="text-stone-700 text-xs">Account: {entry.bankAccount}</p>
            <p className="text-stone-700 text-xs">IBAN: {entry.iban}</p>
            <p className="text-stone-700 text-xs mt-1">Department: {employee?.department || '—'}</p>
          </div>
        </div>

        {/* Earnings & Deductions */}
        <div className="grid grid-cols-2 gap-8 mb-8" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-emerald-800 border-b border-stone-300 pb-2 mb-3" style={{ fontWeight: 500 }}>Earnings</h4>
            <div className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between"><span className="text-stone-700">Basic Salary</span><span className="text-stone-900">{fmt(c.basic)}</span></div>
              {c.housingAllowance > 0 && <div className="flex justify-between"><span className="text-stone-700">Housing Allowance</span><span className="text-stone-900">{fmt(c.housingAllowance)}</span></div>}
              {c.transportAllowance > 0 && <div className="flex justify-between"><span className="text-stone-700">Transport Allowance</span><span className="text-stone-900">{fmt(c.transportAllowance)}</span></div>}
              {c.mealAllowance > 0 && <div className="flex justify-between"><span className="text-stone-700">Meal Allowance</span><span className="text-stone-900">{fmt(c.mealAllowance)}</span></div>}
              {c.otherFixedAllowances > 0 && <div className="flex justify-between"><span className="text-stone-700">Other Allowances</span><span className="text-stone-900">{fmt(c.otherFixedAllowances)}</span></div>}
              {c.overtimeDayPay > 0 && <div className="flex justify-between"><span className="text-stone-700">Overtime (Day)</span><span className="text-stone-900">{fmt(c.overtimeDayPay)}</span></div>}
              {c.overtimeNightPay > 0 && <div className="flex justify-between"><span className="text-stone-700">Overtime (Night)</span><span className="text-stone-900">{fmt(c.overtimeNightPay)}</span></div>}
              {c.restDayPay > 0 && <div className="flex justify-between"><span className="text-stone-700">Rest Day Work</span><span className="text-stone-900">{fmt(c.restDayPay)}</span></div>}
              {c.commission > 0 && <div className="flex justify-between"><span className="text-stone-700">Commission</span><span className="text-stone-900">{fmt(c.commission)}</span></div>}
              {c.bonus > 0 && <div className="flex justify-between"><span className="text-stone-700">Bonus</span><span className="text-stone-900">{fmt(c.bonus)}</span></div>}
              {c.absenceDeduction > 0 && <div className="flex justify-between text-red-800"><span>Absence</span><span>-{fmt(c.absenceDeduction)}</span></div>}
              <div className="flex justify-between pt-2 border-t border-stone-300 font-medium">
                <span className="text-stone-900 uppercase tracking-wide text-xs">Gross</span>
                <span className="text-stone-900">{fmt(c.grossSalary)}</span>
              </div>
            </div>
          </div>
          <div>
            <h4 className="text-xs uppercase tracking-[0.2em] text-red-800 border-b border-stone-300 pb-2 mb-3" style={{ fontWeight: 500 }}>Deductions</h4>
            <div className="space-y-2 text-sm tabular-nums">
              <div className="flex justify-between"><span className="text-stone-700">Social Insurance (11%)</span><span className="text-red-800">-{fmt(c.socialInsuranceEmployee)}</span></div>
              <div className="flex justify-between"><span className="text-stone-700">Health Insurance (1%)</span><span className="text-red-800">-{fmt(c.healthInsuranceEmployee)}</span></div>
              <div className="flex justify-between"><span className="text-stone-700">Income Tax (PAYE)</span><span className="text-red-800">-{fmt(c.monthlyTax)}</span></div>
              {c.loanDeduction > 0 && <div className="flex justify-between"><span className="text-stone-700">Loan</span><span className="text-red-800">-{fmt(c.loanDeduction)}</span></div>}
              {c.advanceDeduction > 0 && <div className="flex justify-between"><span className="text-stone-700">Advance</span><span className="text-red-800">-{fmt(c.advanceDeduction)}</span></div>}
              <div className="flex justify-between pt-2 border-t border-stone-300 font-medium">
                <span className="text-stone-900 uppercase tracking-wide text-xs">Total Deductions</span>
                <span className="text-red-800">-{fmt(c.totalDeductions)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Net */}
        <div className="bg-stone-900 text-stone-50 p-6 flex justify-between items-center">
          <div>
            <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Net Pay · صافي الراتب</p>
            <p className="text-xs text-stone-400 mt-1" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Transferred to {entry.bankCode}</p>
          </div>
          <p className="text-4xl tabular-nums" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(c.netSalary)}</p>
        </div>

        {/* Employer contributions */}
        <div className="mt-6 pt-4 border-t border-stone-300 text-xs text-stone-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          <p className="uppercase tracking-wider mb-2 text-stone-500">Employer Contributions (not deducted from salary)</p>
          <div className="grid grid-cols-3 gap-4 tabular-nums">
            <div>Social Insurance (18.75%): <span className="text-stone-800">{fmt(c.socialInsuranceEmployer)}</span></div>
            <div>Health Insurance (3.25%): <span className="text-stone-800">{fmt(c.healthInsuranceEmployer)}</span></div>
            <div>Total Employer Cost: <span className="text-stone-900 font-medium">{fmt(c.totalEmployerCost)}</span></div>
          </div>
        </div>

        <div className="flex justify-end gap-2 pt-6 mt-6 border-t border-stone-200 print:hidden">
          <Button onClick={printSlip} variant="ghost" size="sm"><Printer size={12} /> Print</Button>
        </div>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// BANK TRANSFER VIEW
// ----------------------------------------------------------------------------

function BankTransferView({ payrollRuns, settings }) {
  const [selectedRun, setSelectedRun] = useState(payrollRuns[0]?.id || null);
  const [format, setFormat] = useState('CIB-EXCEL');

  const run = payrollRuns.find(r => r.id === selectedRun);

  function downloadCSV(content, filename) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function generateCIBExcel() {
    // CIB e-Payroll host-to-host format — CSV tolerated by their uploader
    const header = 'Employee Code,Employee Name,National ID,Account Number,IBAN,Amount EGP,Transaction Type,Reference';
    const rows = run.entries.map(e => [
      e.employeeCode,
      `"${e.employeeName}"`,
      '',
      e.bankAccount,
      e.iban,
      e.calc.netSalary.toFixed(2),
      'SAL',
      `PAYROLL-${run.year}-${String(run.month + 1).padStart(2, '0')}`
    ].join(','));
    const csv = [header, ...rows].join('\n');
    downloadCSV(csv, `CIB-Payroll-${run.year}-${String(run.month + 1).padStart(2, '0')}.csv`);
  }

  function generateEGACH() {
    // EG-ACH standard format (simplified) — used across all Egyptian banks via CBE
    const header = 'SenderIBAN,BeneficiaryName,BeneficiaryIBAN,BeneficiaryBank,Amount,Currency,Purpose,Reference,ValueDate';
    const valueDate = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const rows = run.entries.map(e => [
      settings.company.iban || 'SENDER_IBAN',
      `"${e.employeeName}"`,
      e.iban,
      e.bankCode,
      e.calc.netSalary.toFixed(2),
      'EGP',
      'SALA',
      `${run.year}${String(run.month + 1).padStart(2, '0')}-${e.employeeCode}`,
      valueDate
    ].join(','));
    const csv = [header, ...rows].join('\n');
    downloadCSV(csv, `EGACH-Payroll-${run.year}-${String(run.month + 1).padStart(2, '0')}.csv`);
  }

  function generateNBE() {
    const header = 'ACCOUNT_NUMBER|BENEFICIARY_NAME|AMOUNT|CURRENCY|NARRATIVE';
    const rows = run.entries.map(e => [
      e.bankAccount,
      e.employeeName.toUpperCase(),
      e.calc.netSalary.toFixed(2),
      'EGP',
      `SALARY ${monthLabel(run.month, run.year).toUpperCase()}`
    ].join('|'));
    const csv = [header, ...rows].join('\n');
    downloadCSV(csv, `NBE-Payroll-${run.year}-${String(run.month + 1).padStart(2, '0')}.csv`);
  }

  function generateGenericCSV() {
    const header = 'Employee Code,Employee Name,Bank Code,Account Number,IBAN,Net Salary EGP,Reference';
    const rows = run.entries.map(e => [
      e.employeeCode,
      `"${e.employeeName}"`,
      e.bankCode,
      e.bankAccount,
      e.iban,
      e.calc.netSalary.toFixed(2),
      `PAYROLL-${run.year}-${String(run.month + 1).padStart(2, '0')}`
    ].join(','));
    const csv = [header, ...rows].join('\n');
    downloadCSV(csv, `Payroll-${run.year}-${String(run.month + 1).padStart(2, '0')}.csv`);
  }

  function download() {
    if (!run) return;
    switch (format) {
      case 'CIB-EXCEL': generateCIBExcel(); break;
      case 'EG-ACH': generateEGACH(); break;
      case 'NBE': generateNBE(); break;
      default: generateGenericCSV();
    }
  }

  if (payrollRuns.length === 0) {
    return (
      <div className="p-10">
        <h1 className="text-5xl tracking-tight mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Bank Transfer</h1>
        <div className="bg-stone-50 border border-stone-300 p-12 text-center">
          <Banknote className="mx-auto mb-4 text-stone-400" size={32} />
          <p className="text-stone-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            No payroll runs committed yet.
          </p>
        </div>
      </div>
    );
  }

  // Group by bank
  const byBank = run ? run.entries.reduce((acc, e) => {
    acc[e.bankCode] = acc[e.bankCode] || { count: 0, total: 0, entries: [] };
    acc[e.bankCode].count++;
    acc[e.bankCode].total += e.calc.netSalary;
    acc[e.bankCode].entries.push(e);
    return acc;
  }, {}) : {};

  return (
    <div className="p-10 space-y-6">
      <div className="flex items-end justify-between border-b border-stone-300 pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Disbursement</p>
          <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Bank Transfer Files</h1>
          <p className="text-sm text-stone-600 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            Generate upload-ready files for your corporate banking portal.
          </p>
        </div>
      </div>

      <div className="bg-amber-50 border border-amber-300 p-5 text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
        <p className="text-amber-900"><strong>How bank transfers work:</strong> Egyptian corporate banking requires uploading a signed salary file via your bank's secure portal (CIB e-Payroll / NBE Business / QNB Corporate). Download the file below, log in to your bank's portal, and upload. Maker/checker authorization is always enforced by the bank — final release requires an authorized signatory to approve in the portal.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div>
          <Label>Payroll Run</Label>
          <Select
            value={selectedRun || ''}
            onChange={setSelectedRun}
            options={payrollRuns.map(r => ({ value: r.id, label: monthLabel(r.month, r.year) }))}
          />
        </div>
        <div>
          <Label>Output Format</Label>
          <Select
            value={format}
            onChange={setFormat}
            options={[
              { value: 'CIB-EXCEL', label: 'CIB e-Payroll (Excel/CSV)' },
              { value: 'EG-ACH', label: 'EG-ACH Interbank (CBE)' },
              { value: 'NBE', label: 'NBE Business Online' },
              { value: 'GENERIC', label: 'Generic CSV (all banks)' },
            ]}
          />
        </div>
        <div className="flex items-end">
          <Button onClick={download} variant="gold" className="w-full"><FileDown size={14} /> Download File</Button>
        </div>
      </div>

      {/* By-bank summary */}
      {run && (
        <div>
          <h3 className="text-2xl tracking-tight mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Disbursement by Bank</h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {Object.entries(byBank).map(([code, data]) => {
              const bank = EGYPTIAN_BANKS.find(b => b.code === code);
              return (
                <div key={code} className="bg-stone-50 border border-stone-300 p-5">
                  <div className="flex justify-between items-start mb-3">
                    <div>
                      <p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>{code}</p>
                      <p className="text-sm text-stone-900 mt-0.5" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>{bank?.name || code}</p>
                    </div>
                    <Building size={16} className="text-stone-400" />
                  </div>
                  <p className="text-3xl tabular-nums" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtCompact(data.total)}</p>
                  <p className="text-xs text-stone-500 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                    {data.count} employee(s) · SWIFT: {bank?.swift}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Preview */}
      {run && (
        <div>
          <h3 className="text-2xl tracking-tight mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Transfer Preview</h3>
          <div className="bg-stone-50 border border-stone-300 overflow-x-auto max-h-[500px] overflow-y-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 border-b border-stone-300 sticky top-0">
                <tr className="text-[10px] uppercase tracking-wider text-stone-600">
                  <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Code</th>
                  <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Beneficiary</th>
                  <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Bank</th>
                  <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>IBAN</th>
                  <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Amount</th>
                </tr>
              </thead>
              <tbody style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }} className="tabular-nums">
                {run.entries.map(e => (
                  <tr key={e.employeeId} className="border-b border-stone-200">
                    <td className="px-4 py-2 text-xs text-stone-500">{e.employeeCode}</td>
                    <td className="px-4 py-2 text-stone-900">{e.employeeName}</td>
                    <td className="px-4 py-2 text-stone-700 text-xs">{e.bankCode}</td>
                    <td className="px-4 py-2 text-stone-500 text-xs font-mono">{e.iban || '—'}</td>
                    <td className="px-4 py-2 text-right text-stone-900 font-medium">{fmt(e.calc.netSalary)}</td>
                  </tr>
                ))}
                <tr className="bg-stone-200 border-t-2 border-stone-900">
                  <td colSpan={4} className="px-4 py-3 text-xs uppercase tracking-wider">Total Disbursement</td>
                  <td className="px-4 py-3 text-right font-medium">{fmt(run.entries.reduce((s, e) => s + e.calc.netSalary, 0))}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// COMPLIANCE VIEW
// ----------------------------------------------------------------------------

function ComplianceView({ employees, payrollRuns, settings }) {
  const [selectedRun, setSelectedRun] = useState(payrollRuns[0]?.id || null);
  const run = payrollRuns.find(r => r.id === selectedRun);

  function downloadCSV(content, filename) {
    const blob = new Blob(['\uFEFF' + content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportTaxReport() {
    if (!run) return;
    const header = 'Employee Code,National ID,Tax Card No.,Employee Name,Annual Taxable Income,Annual Tax,Monthly Tax Withheld';
    const rows = run.entries.map(e => {
      const emp = employees.find(emp => emp.id === e.employeeId);
      return [
        e.employeeCode,
        emp?.nationalId || '',
        emp?.taxCardNumber || '',
        `"${e.employeeName}"`,
        e.calc.annualTaxable.toFixed(2),
        e.calc.annualTax.toFixed(2),
        e.calc.monthlyTax.toFixed(2)
      ].join(',');
    });
    const total = run.entries.reduce((s, e) => s + e.calc.monthlyTax, 0);
    const csv = [header, ...rows, `,,,,TOTAL,,${total.toFixed(2)}`].join('\n');
    downloadCSV(csv, `ETA-TaxReport-${run.year}-${String(run.month + 1).padStart(2, '0')}.csv`);
  }

  function exportForm1() {
    // Form 1 (NOSI) — New hires and insurable salary declaration
    if (!run) return;
    const header = 'Social Insurance No.,National ID,Employee Name,Hire Date,Insurable Salary,Employee Contribution 11%,Employer Contribution 18.75%';
    const rows = run.entries.map(e => {
      const emp = employees.find(emp => emp.id === e.employeeId);
      return [
        emp?.socialInsuranceNumber || '',
        emp?.nationalId || '',
        `"${e.employeeName}"`,
        emp?.hireDate || '',
        e.calc.insurableBase.toFixed(2),
        e.calc.socialInsuranceEmployee.toFixed(2),
        e.calc.socialInsuranceEmployer.toFixed(2)
      ].join(',');
    });
    const csv = [header, ...rows].join('\n');
    downloadCSV(csv, `NOSI-Form1-${run.year}-${String(run.month + 1).padStart(2, '0')}.csv`);
  }

  function exportForm6() {
    // Form 6 (NOSI) — Terminations/leavers
    if (!run) return;
    const header = 'Social Insurance No.,National ID,Employee Name,Hire Date,Last Day,Reason,Final Insurable Salary';
    const terminated = employees.filter(e => e.status === 'Terminated');
    const rows = terminated.map(emp => [
      emp.socialInsuranceNumber || '',
      emp.nationalId || '',
      `"${emp.nameEn}"`,
      emp.hireDate || '',
      emp.terminationDate || '',
      emp.terminationReason || 'Resignation',
      ((emp.basicSalary || 0) + (emp.housingAllowance || 0) + (emp.transportAllowance || 0) + (emp.mealAllowance || 0)).toFixed(2)
    ].join(','));
    const csv = [header, ...(rows.length > 0 ? rows : ['No terminations in this period'])].join('\n');
    downloadCSV(csv, `NOSI-Form6-${run.year}-${String(run.month + 1).padStart(2, '0')}.csv`);
  }

  const deadlines = run ? (() => {
    const period = new Date(run.year, run.month + 1, 15);
    const annualReconciliation = new Date(run.year + 1, 0, 31);
    return { filing: period, annual: annualReconciliation };
  })() : null;

  return (
    <div className="p-10 space-y-6">
      <div className="border-b border-stone-300 pb-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Regulatory</p>
        <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Compliance & Filings</h1>
        <p className="text-sm text-stone-600 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          ETA (Egyptian Tax Authority) & NOSI (National Organization for Social Insurance) filings.
        </p>
      </div>

      {payrollRuns.length === 0 ? (
        <div className="bg-stone-50 border border-stone-300 p-12 text-center">
          <ShieldCheck className="mx-auto mb-4 text-stone-400" size={32} />
          <p className="text-stone-600" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Commit a payroll run to generate filings.</p>
        </div>
      ) : (
        <>
          <div className="flex gap-3">
            <div className="flex-1">
              <Label>Reporting Period</Label>
              <Select
                value={selectedRun || ''}
                onChange={setSelectedRun}
                options={payrollRuns.map(r => ({ value: r.id, label: monthLabel(r.month, r.year) }))}
              />
            </div>
          </div>

          {run && deadlines && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="bg-stone-900 text-stone-50 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <Clock size={16} className="text-amber-400" />
                  <p className="text-[10px] uppercase tracking-[0.2em] text-amber-400" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Monthly Filing Deadline</p>
                </div>
                <p className="text-3xl tracking-tight mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>
                  {deadlines.filing.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-stone-400" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  Salary withholding tax & social insurance filings due by 15th of month following payroll.
                </p>
              </div>
              <div className="bg-amber-900 text-amber-50 p-6">
                <div className="flex items-center gap-2 mb-3">
                  <CalendarDays size={16} className="text-amber-200" />
                  <p className="text-[10px] uppercase tracking-[0.2em] text-amber-200" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Annual Reconciliation</p>
                </div>
                <p className="text-3xl tracking-tight mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>
                  {deadlines.annual.toLocaleDateString('en-GB', { day: '2-digit', month: 'long', year: 'numeric' })}
                </p>
                <p className="text-xs text-amber-200" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  Annual tax reconciliation report due to ETA.
                </p>
              </div>
            </div>
          )}

          {run && (
            <>
              {/* ETA Tax Summary */}
              <div className="bg-stone-50 border border-stone-300 p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-800" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>ETA — Egyptian Tax Authority</p>
                    <h3 className="text-2xl tracking-tight mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Monthly Salary Tax (PAYE)</h3>
                    <p className="text-xs text-stone-600 mt-1" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Law 91 of 2005 · Remit by 15th of next month</p>
                  </div>
                  <Button onClick={exportTaxReport} variant="secondary" size="sm"><Download size={12} /> Export CSV</Button>
                </div>
                <div className="grid grid-cols-3 gap-6 tabular-nums" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500">Employees Subject to Tax</p>
                    <p className="text-2xl" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{run.entries.filter(e => e.calc.monthlyTax > 0).length}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500">Total Taxable Income</p>
                    <p className="text-2xl" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(run.entries.reduce((s, e) => s + (e.calc.annualTaxable / 12), 0))}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-amber-800">Tax to Remit</p>
                    <p className="text-2xl text-amber-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(run.totals.tax)}</p>
                  </div>
                </div>
              </div>

              {/* NOSI Social Insurance */}
              <div className="bg-stone-50 border border-stone-300 p-6">
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-800" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>NOSI — National Organization for Social Insurance</p>
                    <h3 className="text-2xl tracking-tight mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Social Insurance Contributions</h3>
                    <p className="text-xs text-stone-600 mt-1" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                      Law 148 of 2019 · Floor EGP {settings.socialInsurance.minMonthlyInsurable} · Ceiling EGP {settings.socialInsurance.maxMonthlyInsurable}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={exportForm1} variant="secondary" size="sm"><Download size={12} /> Form 1</Button>
                    <Button onClick={exportForm6} variant="secondary" size="sm"><Download size={12} /> Form 6</Button>
                  </div>
                </div>
                <div className="grid grid-cols-4 gap-4 tabular-nums" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500">Employee (11%)</p>
                    <p className="text-xl" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(run.totals.siEmployee)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500">Employer (18.75%)</p>
                    <p className="text-xl" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(run.totals.siEmployer)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-stone-500">Health Ins. (Total 4.25%)</p>
                    <p className="text-xl" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(run.totals.hiEmployee + run.totals.hiEmployer)}</p>
                  </div>
                  <div>
                    <p className="text-[10px] uppercase tracking-wider text-amber-800">Total to NOSI</p>
                    <p className="text-xl text-amber-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{fmtEGP(run.totals.siEmployee + run.totals.siEmployer + run.totals.hiEmployee + run.totals.hiEmployer)}</p>
                  </div>
                </div>
              </div>

              {/* Training Fund */}
              {employees.filter(e => e.status === 'Active').length >= settings.trainingFund.thresholdEmployees && (
                <div className="bg-stone-50 border border-stone-300 p-6">
                  <div className="mb-4">
                    <p className="text-[10px] uppercase tracking-[0.2em] text-amber-800" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Law 14/2025</p>
                    <h3 className="text-2xl tracking-tight mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Training & Rehabilitation Fund</h3>
                    <p className="text-xs text-stone-600 mt-1" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
                      Required for 30+ employees · 0.25% of minimum social insurance wage per employee (min EGP {settings.trainingFund.minPerEmployee} / max EGP {settings.trainingFund.maxPerEmployee} annually per employee)
                    </p>
                  </div>
                  <p className="text-xl tabular-nums" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>
                    Estimated annual contribution: {fmtEGP(employees.filter(e => e.status === 'Active').length * settings.trainingFund.maxPerEmployee)}
                  </p>
                </div>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

// ----------------------------------------------------------------------------
// LEAVE VIEW
// ----------------------------------------------------------------------------

function LeaveView({ employees, leaveRecords, setLeaveRecords, settings }) {
  const [showModal, setShowModal] = useState(false);

  function addRecord(rec) {
    setLeaveRecords([{ ...rec, id: uid() }, ...leaveRecords]);
    setShowModal(false);
  }

  function deleteRecord(id) {
    if (confirm('Delete this leave record?')) {
      setLeaveRecords(leaveRecords.filter(r => r.id !== id));
    }
  }

  // Leave balance per employee
  const balances = employees.filter(e => e.status === 'Active').map(emp => {
    const hireDate = emp.hireDate ? new Date(emp.hireDate) : null;
    const birthDate = emp.birthDate ? new Date(emp.birthDate) : null;
    const now = new Date();
    const years = hireDate ? (now - hireDate) / (365.25 * 24 * 3600 * 1000) : 0;
    const age = birthDate ? (now - birthDate) / (365.25 * 24 * 3600 * 1000) : 0;
    const entitlement = calculateLeaveEntitlement(years, age, emp.isDisabled, settings);
    const usedThisYear = leaveRecords
      .filter(r => r.employeeId === emp.id
        && r.type === 'Annual'
        && new Date(r.from).getFullYear() === now.getFullYear()
        && r.status === 'Approved')
      .reduce((sum, r) => sum + (r.days || 0), 0);
    return { employee: emp, entitlement, used: usedThisYear, remaining: entitlement - usedThisYear, years: years.toFixed(1) };
  });

  return (
    <div className="p-10 space-y-6">
      <div className="flex items-end justify-between border-b border-stone-300 pb-6">
        <div>
          <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Time Off</p>
          <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Leave Management</h1>
          <p className="text-sm text-stone-600 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
            Law 14/2025 — 15 days (yr 1) · 21 days (yr 2+) · 30 days (10+ yrs or age 50+) · 45 days (disability)
          </p>
        </div>
        <Button onClick={() => setShowModal(true)} variant="gold"><Plus size={14} /> Record Leave</Button>
      </div>

      <div>
        <h3 className="text-2xl tracking-tight mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Annual Leave Balances ({new Date().getFullYear()})</h3>
        <div className="bg-stone-50 border border-stone-300 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 border-b border-stone-300">
              <tr className="text-[10px] uppercase tracking-wider text-stone-600">
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Employee</th>
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Years</th>
                <th className="text-center px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Entitlement</th>
                <th className="text-center px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Used</th>
                <th className="text-center px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Remaining</th>
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Progress</th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              {balances.map(({ employee: emp, entitlement, used, remaining, years }) => {
                const pct = (used / entitlement) * 100;
                return (
                  <tr key={emp.id} className="border-b border-stone-200">
                    <td className="px-4 py-3">
                      <div className="text-stone-900">{emp.nameEn}</div>
                      <div className="text-xs text-stone-500">{emp.code} · {emp.department}</div>
                    </td>
                    <td className="px-4 py-3 text-stone-700 tabular-nums">{years}</td>
                    <td className="px-4 py-3 text-center text-stone-900 tabular-nums">{entitlement}</td>
                    <td className="px-4 py-3 text-center text-stone-700 tabular-nums">{used}</td>
                    <td className="px-4 py-3 text-center text-emerald-800 font-medium tabular-nums">{remaining}</td>
                    <td className="px-4 py-3">
                      <div className="h-[3px] bg-stone-200 w-32 overflow-hidden">
                        <div className={`h-full ${pct > 80 ? 'bg-red-700' : pct > 50 ? 'bg-amber-700' : 'bg-emerald-700'}`} style={{ width: `${pct}%` }} />
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div>
        <h3 className="text-2xl tracking-tight mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Leave Records</h3>
        <div className="bg-stone-50 border border-stone-300 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-stone-100 border-b border-stone-300">
              <tr className="text-[10px] uppercase tracking-wider text-stone-600">
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Employee</th>
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Type</th>
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>From</th>
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>To</th>
                <th className="text-center px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Days</th>
                <th className="text-left px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Status</th>
                <th className="text-right px-4 py-3" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}></th>
              </tr>
            </thead>
            <tbody style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              {leaveRecords.length === 0 ? (
                <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-500">No leave records yet.</td></tr>
              ) : leaveRecords.map(r => {
                const emp = employees.find(e => e.id === r.employeeId);
                return (
                  <tr key={r.id} className="border-b border-stone-200">
                    <td className="px-4 py-3 text-stone-900">{emp?.nameEn || 'Unknown'}</td>
                    <td className="px-4 py-3 text-stone-700">{r.type}</td>
                    <td className="px-4 py-3 text-stone-700 text-xs tabular-nums">{r.from}</td>
                    <td className="px-4 py-3 text-stone-700 text-xs tabular-nums">{r.to}</td>
                    <td className="px-4 py-3 text-center text-stone-900 tabular-nums">{r.days}</td>
                    <td className="px-4 py-3">
                      <span className={`text-[10px] uppercase tracking-wide px-2 py-1 ${r.status === 'Approved' ? 'bg-emerald-100 text-emerald-900' : r.status === 'Rejected' ? 'bg-red-100 text-red-900' : 'bg-amber-100 text-amber-900'}`}>
                        {r.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => deleteRecord(r.id)} className="text-stone-400 hover:text-red-700"><Trash2 size={13} /></button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <Modal isOpen={showModal} onClose={() => setShowModal(false)} title="Record Leave" maxWidth="max-w-xl">
        <LeaveForm employees={employees} onSave={addRecord} onCancel={() => setShowModal(false)} />
      </Modal>
    </div>
  );
}

function LeaveForm({ employees, onSave, onCancel }) {
  const [form, setForm] = useState({
    employeeId: employees[0]?.id || '',
    type: 'Annual',
    from: new Date().toISOString().slice(0, 10),
    to: new Date().toISOString().slice(0, 10),
    days: 1,
    status: 'Approved',
    notes: '',
  });

  useEffect(() => {
    if (form.from && form.to) {
      const d1 = new Date(form.from);
      const d2 = new Date(form.to);
      const diff = Math.round((d2 - d1) / (24 * 3600 * 1000)) + 1;
      if (diff >= 0 && diff !== form.days) setForm(f => ({ ...f, days: diff }));
    }
  }, [form.from, form.to]);

  return (
    <div className="p-8 space-y-5">
      <div><Label>Employee</Label>
        <Select value={form.employeeId} onChange={(v) => setForm({...form, employeeId: v})} options={employees.filter(e => e.status === 'Active').map(e => ({ value: e.id, label: `${e.nameEn} (${e.code})` }))} />
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Type</Label>
          <Select value={form.type} onChange={(v) => setForm({...form, type: v})} options={['Annual', 'Sick', 'Maternity (4 months)', 'Paternity (1 day)', 'Casual', 'Unpaid', 'Hajj', 'Other']} />
        </div>
        <div><Label>Status</Label>
          <Select value={form.status} onChange={(v) => setForm({...form, status: v})} options={['Pending', 'Approved', 'Rejected']} />
        </div>
        <div><Label>Days</Label><Input type="number" value={form.days} onChange={(v) => setForm({...form, days: v})} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>From</Label><Input type="date" value={form.from} onChange={(v) => setForm({...form, from: v})} /></div>
        <div><Label>To</Label><Input type="date" value={form.to} onChange={(v) => setForm({...form, to: v})} /></div>
      </div>
      <div><Label>Notes</Label><Input value={form.notes} onChange={(v) => setForm({...form, notes: v})} /></div>
      <div className="flex justify-end gap-3 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="primary" onClick={() => onSave(form)}><Check size={14} /> Record</Button>
      </div>
    </div>
  );
}

// ----------------------------------------------------------------------------
// SETTINGS VIEW
// ----------------------------------------------------------------------------

function SettingsView({ settings, setSettings }) {
  const [draft, setDraft] = useState(settings);
  const [saved, setSaved] = useState(false);

  function save() {
    setSettings(draft);
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  }

  function reset() {
    if (confirm('Reset all settings to 2026 Egyptian defaults?')) {
      setDraft(DEFAULT_SETTINGS);
      setSettings(DEFAULT_SETTINGS);
    }
  }

  return (
    <div className="p-10 space-y-8">
      <div className="border-b border-stone-300 pb-6">
        <p className="text-[10px] uppercase tracking-[0.25em] text-amber-800 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Configuration</p>
        <h1 className="text-5xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>Settings</h1>
        <p className="text-sm text-stone-600 mt-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          Adjust statutory rates annually. Review at end of each tax year.
        </p>
      </div>

      {/* Company */}
      <section className="bg-stone-50 border border-stone-300 p-6">
        <h3 className="text-xl tracking-tight mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Company Details</h3>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Name (English)</Label><Input value={draft.company.nameEn} onChange={(v) => setDraft({...draft, company: {...draft.company, nameEn: v}})} /></div>
          <div><Label>Name (Arabic)</Label><Input value={draft.company.nameAr} onChange={(v) => setDraft({...draft, company: {...draft.company, nameAr: v}})} /></div>
          <div><Label>Tax Card Number</Label><Input value={draft.company.taxCardNumber} onChange={(v) => setDraft({...draft, company: {...draft.company, taxCardNumber: v}})} /></div>
          <div><Label>Commercial Register</Label><Input value={draft.company.commercialRegister} onChange={(v) => setDraft({...draft, company: {...draft.company, commercialRegister: v}})} /></div>
          <div><Label>Social Insurance No.</Label><Input value={draft.company.socialInsuranceNumber} onChange={(v) => setDraft({...draft, company: {...draft.company, socialInsuranceNumber: v}})} /></div>
          <div><Label>E-Invoicing ID</Label><Input value={draft.company.eInvoicingId} onChange={(v) => setDraft({...draft, company: {...draft.company, eInvoicingId: v}})} /></div>
          <div><Label>Company Bank</Label><Select value={draft.company.bankName} onChange={(v) => setDraft({...draft, company: {...draft.company, bankName: v}})} options={EGYPTIAN_BANKS.map(b => b.code)} /></div>
          <div><Label>Company IBAN</Label><Input value={draft.company.iban} onChange={(v) => setDraft({...draft, company: {...draft.company, iban: v}})} /></div>
        </div>
      </section>

      {/* Tax Brackets */}
      <section className="bg-stone-50 border border-stone-300 p-6">
        <h3 className="text-xl tracking-tight mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Income Tax (Law 91/2005)</h3>
        <p className="text-xs text-stone-600 mb-4" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Last updated: 2026 per PwC Egypt Tax Summary</p>
        <div className="grid grid-cols-2 gap-4 mb-6">
          <div><Label>Annual Personal Exemption (EGP)</Label><Input type="number" value={draft.annualPersonalExemption} onChange={(v) => setDraft({...draft, annualPersonalExemption: v})} /></div>
          <div><Label>Disabled Personal Exemption (EGP)</Label><Input type="number" value={draft.disabledPersonalExemption} onChange={(v) => setDraft({...draft, disabledPersonalExemption: v})} /></div>
        </div>
        <p className="text-[10px] uppercase tracking-wide text-stone-500 mb-2" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>Progressive Brackets (Annual, EGP)</p>
        <div className="space-y-2">
          {draft.taxBrackets.map((b, i) => (
            <div key={i} className="grid grid-cols-3 gap-2 items-center text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
              <div className="text-stone-700 tabular-nums">
                {b.from.toLocaleString()} → {b.to === Infinity ? '∞' : b.to.toLocaleString()}
              </div>
              <div>
                <input
                  type="number"
                  step="0.001"
                  value={b.rate}
                  onChange={(e) => {
                    const newBrackets = [...draft.taxBrackets];
                    newBrackets[i] = { ...b, rate: Number(e.target.value) };
                    setDraft({...draft, taxBrackets: newBrackets});
                  }}
                  className="w-full px-3 py-1.5 bg-white border border-stone-300 text-sm focus:outline-none focus:border-stone-900"
                />
              </div>
              <div className="text-stone-500 text-xs">= {(b.rate * 100).toFixed(1)}%</div>
            </div>
          ))}
        </div>
      </section>

      {/* Social Insurance */}
      <section className="bg-stone-50 border border-stone-300 p-6">
        <h3 className="text-xl tracking-tight mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Social Insurance (Law 148/2019)</h3>
        <p className="text-xs text-stone-600 mb-4" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
          15% annual cap adjustment through 2027 · Review each January
        </p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Min Insurable (EGP)</Label><Input type="number" value={draft.socialInsurance.minMonthlyInsurable} onChange={(v) => setDraft({...draft, socialInsurance: {...draft.socialInsurance, minMonthlyInsurable: v}})} /></div>
          <div><Label>Max Insurable (EGP)</Label><Input type="number" value={draft.socialInsurance.maxMonthlyInsurable} onChange={(v) => setDraft({...draft, socialInsurance: {...draft.socialInsurance, maxMonthlyInsurable: v}})} /></div>
          <div><Label>Employee Rate</Label><Input type="number" value={draft.socialInsurance.employeeRate} onChange={(v) => setDraft({...draft, socialInsurance: {...draft.socialInsurance, employeeRate: v}})} /></div>
          <div><Label>Employer Rate</Label><Input type="number" value={draft.socialInsurance.employerRate} onChange={(v) => setDraft({...draft, socialInsurance: {...draft.socialInsurance, employerRate: v}})} /></div>
        </div>
      </section>

      {/* Labour Law */}
      <section className="bg-stone-50 border border-stone-300 p-6">
        <h3 className="text-xl tracking-tight mb-2" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Labour Law (Law 14/2025)</h3>
        <p className="text-xs text-stone-600 mb-4" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Effective 1 September 2025</p>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div><Label>Minimum Wage (EGP)</Label><Input type="number" value={draft.minimumWage} onChange={(v) => setDraft({...draft, minimumWage: v})} /></div>
          <div><Label>Work Hours / Week</Label><Input type="number" value={draft.workingHoursPerWeek} onChange={(v) => setDraft({...draft, workingHoursPerWeek: v})} /></div>
          <div><Label>Overtime Day Multiplier</Label><Input type="number" value={draft.overtimeDayMultiplier} onChange={(v) => setDraft({...draft, overtimeDayMultiplier: v})} /></div>
          <div><Label>Overtime Night Multiplier</Label><Input type="number" value={draft.overtimeNightMultiplier} onChange={(v) => setDraft({...draft, overtimeNightMultiplier: v})} /></div>
          <div><Label>Rest-Day Multiplier</Label><Input type="number" value={draft.restDayMultiplier} onChange={(v) => setDraft({...draft, restDayMultiplier: v})} /></div>
          <div><Label>Annual Increment Min</Label><Input type="number" value={draft.annualIncrementMin} onChange={(v) => setDraft({...draft, annualIncrementMin: v})} /></div>
        </div>
      </section>

      {/* Actions */}
      <div className="flex justify-between items-center pt-4">
        <Button variant="ghost" onClick={reset}>Reset to Defaults</Button>
        <div className="flex items-center gap-3">
          {saved && <span className="text-xs text-emerald-800 uppercase tracking-wider" style={{ fontFamily: 'DM Sans, system-ui, sans-serif', fontWeight: 500 }}>✓ Saved</span>}
          <Button variant="gold" onClick={save}><Check size={14} /> Save Settings</Button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// HR SUITE VIEWS
// ============================================================================

function PageHeader({ eyebrow, title, subtitle, actions }) {
  return (
    <div className="flex items-start justify-between gap-6 mb-8">
      <div>
        {eyebrow && <p className="text-[10px] text-amber-700 uppercase tracking-[0.25em] mb-2" style={{ fontWeight: 500 }}>{eyebrow}</p>}
        <h1 className="text-4xl text-stone-900 tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{title}</h1>
        {subtitle && <p className="text-sm text-stone-600 mt-2 max-w-2xl">{subtitle}</p>}
      </div>
      {actions && <div className="flex items-center gap-2 flex-shrink-0">{actions}</div>}
    </div>
  );
}

function Badge({ children, color = 'stone' }) {
  const colors = {
    stone:   'bg-stone-100 text-stone-700 border-stone-200',
    amber:   'bg-amber-50 text-amber-900 border-amber-200',
    emerald: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    green:   'bg-green-50 text-green-800 border-green-200',
    red:     'bg-red-50 text-red-800 border-red-200',
    blue:    'bg-blue-50 text-blue-800 border-blue-200',
    orange:  'bg-orange-50 text-orange-800 border-orange-200',
  };
  return <span className={`inline-flex items-center px-2 py-0.5 text-[10px] uppercase tracking-wider border ${colors[color] || colors.stone}`} style={{ fontWeight: 500 }}>{children}</span>;
}

function Textarea({ value, onChange, rows = 3, placeholder = '' }) {
  return (
    <textarea value={value || ''} onChange={e => onChange(e.target.value)} rows={rows} placeholder={placeholder}
      className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:border-amber-500 focus:outline-none"
      style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }} />
  );
}

function StarRating({ value, onChange, readOnly = false, size = 20 }) {
  return (
    <div className="flex gap-1">
      {[1,2,3,4,5].map(n => (
        readOnly
          ? <Star key={n} size={size} className={n <= value ? 'text-amber-500 fill-amber-500' : 'text-stone-300'} />
          : <button key={n} type="button" onClick={() => onChange(n)}>
              <Star size={size} className={n <= value ? 'text-amber-500 fill-amber-500' : 'text-stone-300'} />
            </button>
      ))}
    </div>
  );
}

// ============================================================================
// ATTENDANCE VIEW
// ============================================================================
function AttendanceView({ employees, attendance, setAttendance }) {
  const [selectedDate, setSelectedDate] = useState(todayISO());
  const [search, setSearch] = useState('');

  const activeEmps = employees.filter(e => e.status === 'Active');

  const dayRecords = useMemo(() => {
    const byCode = {};
    attendance.filter(a => a.date === selectedDate).forEach(a => { byCode[a.employeeCode] = a; });
    return activeEmps.map(emp => ({ employee: emp, record: byCode[emp.code] || null }))
      .filter(r => !search || r.employee.nameEn.toLowerCase().includes(search.toLowerCase()) || r.employee.code.toLowerCase().includes(search.toLowerCase()));
  }, [attendance, selectedDate, activeEmps, search]);

  const stats = useMemo(() => {
    const recs = attendance.filter(a => a.date === selectedDate);
    const byStatus = {};
    ATTENDANCE_STATUSES.forEach(s => { byStatus[s.key] = 0; });
    recs.forEach(r => { if (byStatus[r.status] !== undefined) byStatus[r.status]++; });
    const notRecorded = activeEmps.length - recs.length;
    const totalOT = recs.reduce((s, r) => s + (Number(r.overtimeHours) || 0), 0);
    return { byStatus, notRecorded, totalOT, total: activeEmps.length };
  }, [attendance, selectedDate, activeEmps.length]);

  const updateRecord = (employeeCode, changes) => {
    setAttendance(prev => {
      const existing = prev.find(a => a.employeeCode === employeeCode && a.date === selectedDate);
      if (existing) return prev.map(a => a.id === existing.id ? { ...a, ...changes } : a);
      return [...prev, { id: uid(), employeeCode, date: selectedDate, status: 'present', checkIn: null, checkOut: null, hoursWorked: 0, overtimeHours: 0, note: '', ...changes }];
    });
  };

  const markAllPresent = () => {
    if (!confirm(`Mark all ${activeEmps.length} employees present for ${selectedDate}?`)) return;
    const newRecords = [];
    activeEmps.forEach(emp => {
      const existing = attendance.find(a => a.employeeCode === emp.code && a.date === selectedDate);
      if (!existing) newRecords.push({ id: uid(), employeeCode: emp.code, date: selectedDate, status: 'present', checkIn: '08:00', checkOut: '17:00', hoursWorked: 8, overtimeHours: 0, note: '' });
    });
    setAttendance(prev => [...prev, ...newRecords]);
  };

  const exportCSV = () => {
    const header = ['Date','Employee Code','Name','Department','Status','Check In','Check Out','Hours','Overtime','Note'];
    const rows = dayRecords.map(r => [selectedDate, r.employee.code, r.employee.nameEn, r.employee.department, r.record?.status || 'not-recorded', r.record?.checkIn || '', r.record?.checkOut || '', r.record?.hoursWorked || 0, r.record?.overtimeHours || 0, r.record?.note || '']);
    const csv = [header, ...rows].map(r => r.map(c => `"${c}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `attendance-${selectedDate}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Time & Attendance" title="Daily Attendance"
        subtitle="Track presence, overtime and exceptions. Overtime here flows into the payroll run calculation."
        actions={<>
          <Button variant="ghost" onClick={exportCSV}><Download size={14} /> Export CSV</Button>
          <Button variant="gold" onClick={markAllPresent}><CheckCircle2 size={14} /> Mark All Present</Button>
        </>} />

      <div className="mb-6 flex flex-wrap items-end gap-4 bg-white border border-stone-200 p-4">
        <div><Label>Date</Label><Input type="date" value={selectedDate} onChange={setSelectedDate} /></div>
        <div className="flex-1 min-w-[200px]"><Label>Search</Label><Input value={search} onChange={setSearch} placeholder="Name or code..." /></div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        {ATTENDANCE_STATUSES.slice(0, 4).map(s => (
          <div key={s.key} className="bg-white border border-stone-200 p-4">
            <p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontWeight: 500 }}>{s.label}</p>
            <p className="text-3xl mt-1 text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{stats.byStatus[s.key]}</p>
          </div>
        ))}
      </div>

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 border-b border-stone-200">
            <tr>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Employee</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Department</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Status</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>In</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Out</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Hours</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>OT</th>
            </tr>
          </thead>
          <tbody>
            {dayRecords.map(({ employee, record }) => {
              const status = record?.status || 'present';
              return (
                <tr key={employee.code} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="px-4 py-3">
                    <p className="text-stone-900" style={{ fontWeight: 500 }}>{employee.nameEn}</p>
                    <p className="text-xs text-stone-500">{employee.code}</p>
                  </td>
                  <td className="px-4 py-3 text-stone-700">{employee.department}</td>
                  <td className="px-4 py-3">
                    <select value={status} onChange={e => updateRecord(employee.code, { status: e.target.value })} className="text-xs border border-stone-300 bg-white px-2 py-1 focus:outline-none focus:border-amber-500">
                      {ATTENDANCE_STATUSES.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}
                    </select>
                  </td>
                  <td className="px-4 py-3"><input type="time" value={record?.checkIn || ''} onChange={e => updateRecord(employee.code, { checkIn: e.target.value })} className="text-xs border border-stone-300 px-2 py-1 w-24 focus:outline-none focus:border-amber-500" /></td>
                  <td className="px-4 py-3"><input type="time" value={record?.checkOut || ''} onChange={e => updateRecord(employee.code, { checkOut: e.target.value })} className="text-xs border border-stone-300 px-2 py-1 w-24 focus:outline-none focus:border-amber-500" /></td>
                  <td className="px-4 py-3 text-right"><input type="number" step="0.25" value={record?.hoursWorked || 0} onChange={e => updateRecord(employee.code, { hoursWorked: Number(e.target.value) })} className="text-xs border border-stone-300 px-2 py-1 w-20 text-right focus:outline-none focus:border-amber-500" /></td>
                  <td className="px-4 py-3 text-right"><input type="number" step="0.25" value={record?.overtimeHours || 0} onChange={e => updateRecord(employee.code, { overtimeHours: Number(e.target.value) })} className="text-xs border border-stone-300 px-2 py-1 w-20 text-right focus:outline-none focus:border-amber-500" /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="mt-4 text-xs text-stone-500">
        Total overtime today: <span className="text-stone-900" style={{ fontWeight: 500 }}>{stats.totalOT.toFixed(2)} hours</span>
        {stats.notRecorded > 0 && <> · <span className="text-amber-700">{stats.notRecorded} not yet recorded</span></>}
      </div>
    </div>
  );
}

// ============================================================================
// GOALS VIEW
// ============================================================================
function GoalsView({ employees, goals, setGoals }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterCycle, setFilterCycle] = useState('all');
  const [filterDept, setFilterDept] = useState('all');

  const cycles = useMemo(() => ['all', ...new Set(goals.map(g => g.cycle).filter(Boolean))], [goals]);

  const filtered = useMemo(() => goals.filter(g => {
    if (filterCycle !== 'all' && g.cycle !== filterCycle) return false;
    if (filterDept !== 'all') {
      const emp = employees.find(e => e.code === g.employeeCode);
      if (!emp || emp.department !== filterDept) return false;
    }
    return true;
  }), [goals, filterCycle, filterDept, employees]);

  const byStatus = useMemo(() => {
    const m = {};
    GOAL_STATUSES.forEach(s => { m[s] = 0; });
    filtered.forEach(g => { if (m[g.status] !== undefined) m[g.status]++; });
    return m;
  }, [filtered]);

  const save = (data) => {
    if (editing) setGoals(prev => prev.map(g => g.id === editing.id ? { ...g, ...data } : g));
    else setGoals(prev => [...prev, { ...data, id: uid() }]);
    setIsFormOpen(false); setEditing(null);
  };
  const remove = (id) => { if (!confirm('Delete this goal?')) return; setGoals(prev => prev.filter(g => g.id !== id)); };

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Performance" title="Goals & OKRs"
        subtitle="Quarterly goals aligned to strategic themes. Weights sum to 100% per employee, driving the performance review calibration."
        actions={<Button variant="gold" onClick={() => { setEditing(null); setIsFormOpen(true); }}><Plus size={14} /> New Goal</Button>} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {GOAL_STATUSES.map(s => (
          <div key={s} className="bg-white border border-stone-200 p-4">
            <p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontWeight: 500 }}>{s}</p>
            <p className="text-3xl mt-1 text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{byStatus[s]}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 flex flex-wrap gap-4 bg-white border border-stone-200 p-4">
        <div>
          <Label>Cycle</Label>
          <select value={filterCycle} onChange={e => setFilterCycle(e.target.value)} className="px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">
            {cycles.map(c => <option key={c} value={c}>{c === 'all' ? 'All Cycles' : c}</option>)}
          </select>
        </div>
        <div>
          <Label>Department</Label>
          <select value={filterDept} onChange={e => setFilterDept(e.target.value)} className="px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">
            <option value="all">All</option>
            {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(goal => {
          const emp = employees.find(e => e.code === goal.employeeCode);
          const statusColor = goal.status === 'Completed' ? 'emerald' : goal.status === 'At Risk' ? 'red' : goal.status === 'In Progress' ? 'amber' : 'stone';
          return (
            <div key={goal.id} className="bg-white border border-stone-200 p-5 hover:border-amber-300 transition">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <Badge color={statusColor}>{goal.status}</Badge>
                    <Badge color="stone">{goal.category}</Badge>
                    <Badge color="amber">{goal.cycle}</Badge>
                    <Badge color="stone">Weight {goal.weight}%</Badge>
                  </div>
                  <h3 className="text-lg text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{goal.title}</h3>
                  <p className="text-sm text-stone-600 mt-1">{goal.description}</p>
                  <p className="text-xs text-stone-500 mt-2">{emp ? `${emp.nameEn} · ${emp.department}` : goal.employeeCode} · Due {goal.dueDate}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { setEditing(goal); setIsFormOpen(true); }} className="p-2 text-stone-400 hover:text-amber-600"><Edit3 size={16} /></button>
                  <button onClick={() => remove(goal.id)} className="p-2 text-stone-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs text-stone-600 mb-1"><span>Progress</span><span style={{ fontWeight: 500 }}>{goal.progress}%</span></div>
                <div className="h-2 bg-stone-200"><div className={`h-full ${goal.status === 'At Risk' ? 'bg-red-400' : 'bg-amber-500'}`} style={{ width: `${goal.progress}%` }} /></div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="bg-white border border-stone-200 p-12 text-center text-stone-500 text-sm">No goals match the current filter.</div>}
      </div>

      <Modal isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null); }} title={editing ? 'Edit Goal' : 'New Goal'}>
        <GoalForm initial={editing} employees={employees} onSave={save} onCancel={() => { setIsFormOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}

function GoalForm({ initial, employees, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    employeeCode: employees[0]?.code || '', title: '', description: '',
    category: 'Operational', weight: 25, progress: 0, status: 'Not Started',
    dueDate: dateAddDays(todayISO(), 90),
    cycle: `Q${Math.floor((new Date().getMonth() + 3) / 3)}-${new Date().getFullYear()}`,
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Employee</Label><select value={data.employeeCode} onChange={e => update('employeeCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}</select></div>
        <div><Label>Cycle</Label><Input value={data.cycle} onChange={v => update('cycle', v)} placeholder="Q2-2026" /></div>
      </div>
      <div><Label>Goal Title</Label><Input value={data.title} onChange={v => update('title', v)} /></div>
      <div><Label>Description</Label><Textarea value={data.description} onChange={v => update('description', v)} rows={3} /></div>
      <div className="grid grid-cols-4 gap-4">
        <div><Label>Category</Label><select value={data.category} onChange={e => update('category', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{['Strategic','Operational','Commercial','Financial','People','Quality','Technical'].map(c => <option key={c}>{c}</option>)}</select></div>
        <div><Label>Weight (%)</Label><Input type="number" value={data.weight} onChange={v => update('weight', Number(v))} /></div>
        <div><Label>Progress (%)</Label><Input type="number" value={data.progress} onChange={v => update('progress', Number(v))} /></div>
        <div><Label>Due Date</Label><Input type="date" value={data.dueDate} onChange={v => update('dueDate', v)} /></div>
      </div>
      <div><Label>Status</Label><select value={data.status} onChange={e => update('status', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{GOAL_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}
// ============================================================================
// PERFORMANCE REVIEWS VIEW
// ============================================================================
function ReviewsView({ employees, reviews, setReviews }) {
  const [filterCycle, setFilterCycle] = useState('all');
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const cycles = useMemo(() => ['all', ...new Set(reviews.map(r => r.cycle))], [reviews]);
  const filtered = reviews.filter(r => filterCycle === 'all' || r.cycle === filterCycle);

  const save = (data) => {
    if (editing) setReviews(prev => prev.map(r => r.id === editing.id ? { ...r, ...data } : r));
    else setReviews(prev => [...prev, { ...data, id: uid() }]);
    setIsFormOpen(false); setEditing(null);
  };
  const remove = (id) => { if (!confirm('Delete this review?')) return; setReviews(prev => prev.filter(r => r.id !== id)); };

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Performance" title="Performance Reviews"
        subtitle="Quarterly and annual review cycles. Captures ratings, strengths, development areas and calibrated comments."
        actions={<Button variant="gold" onClick={() => { setEditing(null); setIsFormOpen(true); }}><Plus size={14} /> New Review</Button>} />

      <div className="mb-6 flex flex-wrap gap-4 bg-white border border-stone-200 p-4">
        <div><Label>Cycle</Label>
          <select value={filterCycle} onChange={e => setFilterCycle(e.target.value)} className="px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">
            {cycles.map(c => <option key={c} value={c}>{c === 'all' ? 'All Cycles' : c}</option>)}
          </select>
        </div>
      </div>

      <div className="space-y-3">
        {filtered.map(review => {
          const emp = employees.find(e => e.code === review.employeeCode);
          const reviewer = employees.find(e => e.code === review.reviewerCode);
          const rating = PERFORMANCE_RATINGS.find(r => r.value === review.ratingOverall);
          return (
            <div key={review.id} className="bg-white border border-stone-200 p-5 hover:border-amber-300 transition">
              <div className="flex items-start justify-between gap-4 mb-3">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge color={review.status === 'Completed' ? 'emerald' : 'amber'}>{review.status}</Badge>
                    <Badge color="amber">{review.cycle}</Badge>
                    <Badge color="stone">{review.type}</Badge>
                    {rating && review.status === 'Completed' && <Badge color={rating.color}>{rating.label}</Badge>}
                  </div>
                  <h3 className="text-xl text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{emp?.nameEn || review.employeeCode}</h3>
                  <p className="text-xs text-stone-500 mt-1">{emp?.department || ''} · Reviewer: {reviewer?.nameEn || review.reviewerCode}</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  <button onClick={() => { setEditing(review); setIsFormOpen(true); }} className="p-2 text-stone-400 hover:text-amber-600"><Edit3 size={16} /></button>
                  <button onClick={() => remove(review.id)} className="p-2 text-stone-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
              {review.status === 'Completed' && (
                <>
                  <div className="grid grid-cols-4 gap-3 mt-3 mb-3">
                    {[{k:'ratingExecution',l:'Execution'},{k:'ratingLeadership',l:'Leadership'},{k:'ratingTechnical',l:'Technical'},{k:'ratingCollaboration',l:'Collab.'}].map(m => (
                      <div key={m.k} className="bg-stone-50 border border-stone-200 p-2 text-center">
                        <p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontWeight: 500 }}>{m.l}</p>
                        <div className="flex justify-center gap-0.5 mt-1"><StarRating value={review[m.k]} readOnly size={10} /></div>
                      </div>
                    ))}
                  </div>
                  {review.strengths && <div className="mt-3 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Strengths</p><p className="text-stone-700">{review.strengths}</p></div>}
                  {review.improvements && <div className="mt-2 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Development Areas</p><p className="text-stone-700">{review.improvements}</p></div>}
                  {review.comments && <div className="mt-2 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Manager Comments</p><p className="text-stone-700">{review.comments}</p></div>}
                </>
              )}
            </div>
          );
        })}
        {filtered.length === 0 && <div className="bg-white border border-stone-200 p-12 text-center text-stone-500 text-sm">No reviews in this cycle yet.</div>}
      </div>

      <Modal isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null); }} title={editing ? 'Edit Review' : 'New Review'} maxWidth="max-w-4xl">
        <ReviewForm initial={editing} employees={employees} onSave={save} onCancel={() => { setIsFormOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}

function ReviewForm({ initial, employees, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    employeeCode: employees[0]?.code || '', reviewerCode: employees[0]?.code || '',
    cycle: `Q${Math.floor((new Date().getMonth() + 3) / 3)}-${new Date().getFullYear()}`,
    type: 'Quarterly', ratingOverall: 3, ratingExecution: 3, ratingLeadership: 3,
    ratingTechnical: 3, ratingCollaboration: 3,
    strengths: '', improvements: '', comments: '',
    status: 'Draft', completedAt: null,
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Employee</Label><select value={data.employeeCode} onChange={e => update('employeeCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}</select></div>
        <div><Label>Reviewer</Label><select value={data.reviewerCode} onChange={e => update('reviewerCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}</select></div>
        <div><Label>Cycle</Label><Input value={data.cycle} onChange={v => update('cycle', v)} /></div>
        <div><Label>Type</Label><select value={data.type} onChange={e => update('type', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{['Quarterly','Semi-Annual','Annual','Probation','360'].map(t => <option key={t}>{t}</option>)}</select></div>
      </div>
      <div className="border-t border-stone-200 pt-4">
        <p className="text-[10px] uppercase tracking-wider text-stone-600 mb-3" style={{ fontWeight: 500 }}>Ratings</p>
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Overall</Label><StarRating value={data.ratingOverall} onChange={v => update('ratingOverall', v)} /><p className="text-xs text-stone-500 mt-1">{PERFORMANCE_RATINGS.find(r => r.value === data.ratingOverall)?.desc}</p></div>
          <div><Label>Execution & Results</Label><StarRating value={data.ratingExecution} onChange={v => update('ratingExecution', v)} /></div>
          <div><Label>Leadership</Label><StarRating value={data.ratingLeadership} onChange={v => update('ratingLeadership', v)} /></div>
          <div><Label>Technical / Functional</Label><StarRating value={data.ratingTechnical} onChange={v => update('ratingTechnical', v)} /></div>
          <div><Label>Collaboration</Label><StarRating value={data.ratingCollaboration} onChange={v => update('ratingCollaboration', v)} /></div>
        </div>
      </div>
      <div><Label>Strengths</Label><Textarea value={data.strengths} onChange={v => update('strengths', v)} rows={3} /></div>
      <div><Label>Development Areas</Label><Textarea value={data.improvements} onChange={v => update('improvements', v)} rows={3} /></div>
      <div><Label>Manager Comments</Label><Textarea value={data.comments} onChange={v => update('comments', v)} rows={3} /></div>
      <div><Label>Status</Label><select value={data.status} onChange={e => { const s = e.target.value; update('status', s); if (s === 'Completed') update('completedAt', todayISO()); }} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{['Draft','In Progress','Completed','Calibrated'].map(s => <option key={s}>{s}</option>)}</select></div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}

// ============================================================================
// RECRUITMENT VIEW
// ============================================================================
function RecruitmentView({ jobs, setJobs, candidates, setCandidates }) {
  const [tab, setTab] = useState('jobs');
  const [isJobFormOpen, setIsJobFormOpen] = useState(false);
  const [editingJob, setEditingJob] = useState(null);
  const [isCandFormOpen, setIsCandFormOpen] = useState(false);
  const [editingCand, setEditingCand] = useState(null);
  const [selectedJob, setSelectedJob] = useState('all');

  const filteredCands = candidates.filter(c => selectedJob === 'all' || c.jobReqCode === selectedJob);

  const saveJob = (d) => {
    if (editingJob) setJobs(prev => prev.map(j => j.id === editingJob.id ? { ...j, ...d } : j));
    else setJobs(prev => [...prev, { ...d, id: uid() }]);
    setIsJobFormOpen(false); setEditingJob(null);
  };
  const removeJob = (id) => { if (!confirm('Delete this requisition?')) return; setJobs(prev => prev.filter(j => j.id !== id)); };

  const saveCand = (d) => {
    if (editingCand) setCandidates(prev => prev.map(c => c.id === editingCand.id ? { ...c, ...d } : c));
    else setCandidates(prev => [...prev, { ...d, id: uid() }]);
    setIsCandFormOpen(false); setEditingCand(null);
  };
  const removeCand = (id) => { if (!confirm('Delete this candidate?')) return; setCandidates(prev => prev.filter(c => c.id !== id)); };

  const pipelineCounts = useMemo(() => {
    const m = {};
    CANDIDATE_STAGES.forEach(s => { m[s] = 0; });
    filteredCands.forEach(c => { if (m[c.stage] !== undefined) m[c.stage]++; });
    return m;
  }, [filteredCands]);

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Recruitment" title="Talent Acquisition"
        subtitle="Manage requisitions, pipeline candidates through interview stages, and track time-to-hire." />

      <div className="flex gap-1 mb-6 border-b border-stone-200">
        {['jobs','candidates'].map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 text-sm uppercase tracking-wider ${tab === t ? 'border-b-2 border-amber-500 text-stone-900' : 'text-stone-500 hover:text-stone-700'}`} style={{ fontWeight: 500 }}>
            {t === 'jobs' ? `Requisitions (${jobs.length})` : `Candidates (${candidates.length})`}
          </button>
        ))}
      </div>

      {tab === 'jobs' && (
        <>
          <div className="mb-4 flex justify-end"><Button variant="gold" onClick={() => { setEditingJob(null); setIsJobFormOpen(true); }}><Plus size={14} /> New Requisition</Button></div>
          <div className="grid gap-3">
            {jobs.map(job => {
              const jobCands = candidates.filter(c => c.jobReqCode === job.reqCode);
              const statusColor = job.status === 'Open' ? 'emerald' : job.status === 'Interviewing' ? 'amber' : job.status === 'Filled' ? 'stone' : 'blue';
              return (
                <div key={job.id} className="bg-white border border-stone-200 p-5 hover:border-amber-300 transition">
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        <Badge color={statusColor}>{job.status}</Badge>
                        <Badge color="stone">{job.reqCode}</Badge>
                        <Badge color="stone">{job.headcount} position{job.headcount > 1 ? 's' : ''}</Badge>
                      </div>
                      <h3 className="text-xl text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{job.title}</h3>
                      <p className="text-xs text-stone-500 mt-1">{job.department} · {job.location} · {job.employmentType} · {fmtEGP(job.salaryMin)} — {fmtEGP(job.salaryMax)}</p>
                      <p className="text-sm text-stone-700 mt-2">{job.description}</p>
                      <p className="text-xs text-stone-500 mt-2">Posted {job.postedDate} · {jobCands.length} candidates</p>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      <button onClick={() => { setEditingJob(job); setIsJobFormOpen(true); }} className="p-2 text-stone-400 hover:text-amber-600"><Edit3 size={16} /></button>
                      <button onClick={() => removeJob(job.id)} className="p-2 text-stone-400 hover:text-red-600"><Trash2 size={16} /></button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <Modal isOpen={isJobFormOpen} onClose={() => { setIsJobFormOpen(false); setEditingJob(null); }} title={editingJob ? 'Edit Requisition' : 'New Requisition'}>
            <JobForm initial={editingJob} onSave={saveJob} onCancel={() => { setIsJobFormOpen(false); setEditingJob(null); }} />
          </Modal>
        </>
      )}

      {tab === 'candidates' && (
        <>
          <div className="mb-4 flex justify-between items-end gap-4">
            <div><Label>Filter by Requisition</Label>
              <select value={selectedJob} onChange={e => setSelectedJob(e.target.value)} className="px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500 w-64">
                <option value="all">All Requisitions</option>
                {jobs.map(j => <option key={j.id} value={j.reqCode}>{j.reqCode} — {j.title}</option>)}
              </select>
            </div>
            <Button variant="gold" onClick={() => { setEditingCand(null); setIsCandFormOpen(true); }}><Plus size={14} /> Add Candidate</Button>
          </div>

          <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-9 gap-2 mb-6">
            {CANDIDATE_STAGES.map(s => (
              <div key={s} className="bg-white border border-stone-200 p-3 text-center">
                <p className="text-[9px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>{s}</p>
                <p className="text-2xl text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{pipelineCounts[s]}</p>
              </div>
            ))}
          </div>

          <div className="bg-white border border-stone-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 border-b border-stone-200">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Candidate</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Requisition</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Stage</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Rating</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Next</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}></th>
                </tr>
              </thead>
              <tbody>
                {filteredCands.map(c => (
                  <tr key={c.id} className="border-b border-stone-100 hover:bg-stone-50">
                    <td className="px-4 py-3"><p className="text-stone-900" style={{ fontWeight: 500 }}>{c.name}</p><p className="text-xs text-stone-500">{c.phone}</p></td>
                    <td className="px-4 py-3 text-xs text-stone-600">{c.jobReqCode}</td>
                    <td className="px-4 py-3"><select value={c.stage} onChange={e => saveCand({ ...c, stage: e.target.value })} className="text-xs border border-stone-300 bg-white px-2 py-1 focus:outline-none focus:border-amber-500">{CANDIDATE_STAGES.map(s => <option key={s}>{s}</option>)}</select></td>
                    <td className="px-4 py-3"><StarRating value={c.rating} readOnly size={10} /></td>
                    <td className="px-4 py-3 text-xs text-stone-600">{c.nextInterview || '—'}</td>
                    <td className="px-4 py-3 text-right">
                      <button onClick={() => { setEditingCand(c); setIsCandFormOpen(true); }} className="p-1 text-stone-400 hover:text-amber-600"><Edit3 size={14} /></button>
                      <button onClick={() => removeCand(c.id)} className="p-1 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
                    </td>
                  </tr>
                ))}
                {filteredCands.length === 0 && <tr><td colSpan={6} className="px-4 py-8 text-center text-stone-500 text-sm">No candidates in this view.</td></tr>}
              </tbody>
            </table>
          </div>

          <Modal isOpen={isCandFormOpen} onClose={() => { setIsCandFormOpen(false); setEditingCand(null); }} title={editingCand ? 'Edit Candidate' : 'New Candidate'}>
            <CandidateForm initial={editingCand} jobs={jobs} onSave={saveCand} onCancel={() => { setIsCandFormOpen(false); setEditingCand(null); }} />
          </Modal>
        </>
      )}
    </div>
  );
}

function JobForm({ initial, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    reqCode: `REQ-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`,
    title: '', department: DEPARTMENTS[0], location: MOBICA_LOCATIONS[0],
    employmentType: 'Unlimited', headcount: 1,
    salaryMin: 10000, salaryMax: 20000,
    status: 'Open', postedDate: todayISO(),
    description: '', requirements: '',
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Requisition Code</Label><Input value={data.reqCode} onChange={v => update('reqCode', v)} /></div>
        <div><Label>Status</Label><select value={data.status} onChange={e => update('status', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{JOB_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div><Label>Job Title</Label><Input value={data.title} onChange={v => update('title', v)} /></div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Department</Label><select value={data.department} onChange={e => update('department', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{DEPARTMENTS.map(d => <option key={d}>{d}</option>)}</select></div>
        <div><Label>Location</Label><select value={data.location} onChange={e => update('location', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{MOBICA_LOCATIONS.map(l => <option key={l}>{l}</option>)}</select></div>
        <div><Label>Employment Type</Label><select value={data.employmentType} onChange={e => update('employmentType', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{CONTRACT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Headcount</Label><Input type="number" value={data.headcount} onChange={v => update('headcount', Number(v))} /></div>
        <div><Label>Salary Min (EGP)</Label><Input type="number" value={data.salaryMin} onChange={v => update('salaryMin', Number(v))} /></div>
        <div><Label>Salary Max (EGP)</Label><Input type="number" value={data.salaryMax} onChange={v => update('salaryMax', Number(v))} /></div>
      </div>
      <div><Label>Description</Label><Textarea value={data.description} onChange={v => update('description', v)} rows={3} /></div>
      <div><Label>Requirements</Label><Textarea value={data.requirements} onChange={v => update('requirements', v)} rows={3} /></div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}

function CandidateForm({ initial, jobs, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    jobReqCode: jobs[0]?.reqCode || '', name: '', email: '', phone: '',
    stage: 'Applied', rating: 0,
    appliedDate: todayISO(), nextInterview: null,
    notes: '', resumeUrl: '',
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Requisition</Label><select value={data.jobReqCode} onChange={e => update('jobReqCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{jobs.map(j => <option key={j.id} value={j.reqCode}>{j.reqCode} — {j.title}</option>)}</select></div>
        <div><Label>Stage</Label><select value={data.stage} onChange={e => update('stage', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{CANDIDATE_STAGES.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div><Label>Full Name</Label><Input value={data.name} onChange={v => update('name', v)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Email</Label><Input type="email" value={data.email} onChange={v => update('email', v)} /></div>
        <div><Label>Phone</Label><Input value={data.phone} onChange={v => update('phone', v)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Applied Date</Label><Input type="date" value={data.appliedDate} onChange={v => update('appliedDate', v)} /></div>
        <div><Label>Next Interview</Label><Input type="date" value={data.nextInterview || ''} onChange={v => update('nextInterview', v || null)} /></div>
        <div><Label>Rating</Label><div className="py-2"><StarRating value={data.rating} onChange={v => update('rating', v)} /></div></div>
      </div>
      <div><Label>Notes</Label><Textarea value={data.notes} onChange={v => update('notes', v)} rows={3} /></div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}
// ============================================================================
// TRAINING VIEW
// ============================================================================
function TrainingView({ employees, courses, setCourses, enrollments, setEnrollments, settings }) {
  const [tab, setTab] = useState('enrollments');
  const [isCourseFormOpen, setIsCourseFormOpen] = useState(false);
  const [editingCourse, setEditingCourse] = useState(null);
  const [isEnrollFormOpen, setIsEnrollFormOpen] = useState(false);
  const [editingEnroll, setEditingEnroll] = useState(null);

  const saveCourse = (d) => {
    if (editingCourse) setCourses(prev => prev.map(c => c.id === editingCourse.id ? { ...c, ...d } : c));
    else setCourses(prev => [...prev, { ...d, id: uid() }]);
    setIsCourseFormOpen(false); setEditingCourse(null);
  };
  const removeCourse = (id) => { if (!confirm('Delete this course?')) return; setCourses(prev => prev.filter(c => c.id !== id)); };

  const saveEnroll = (d) => {
    if (editingEnroll) setEnrollments(prev => prev.map(e => e.id === editingEnroll.id ? { ...e, ...d } : e));
    else setEnrollments(prev => [...prev, { ...d, id: uid() }]);
    setIsEnrollFormOpen(false); setEditingEnroll(null);
  };
  const removeEnroll = (id) => { if (!confirm('Remove this enrollment?')) return; setEnrollments(prev => prev.filter(e => e.id !== id)); };

  const today = todayISO();
  const thirtyFromNow = dateAddDays(today, 30);
  const expiringCount = enrollments.filter(e => e.expiryDate && e.expiryDate >= today && e.expiryDate <= thirtyFromNow).length;
  const expiredCount = enrollments.filter(e => e.expiryDate && e.expiryDate < today).length;

  const activeEmps = employees.filter(e => e.status === 'Active');
  const trainingFundAnnual = activeEmps.reduce((sum, emp) => {
    const fixed = (Number(emp.basicSalary) || 0) + (Number(emp.housingAllowance) || 0) + (Number(emp.transportAllowance) || 0) + (Number(emp.mealAllowance) || 0) + (Number(emp.otherAllowances) || 0);
    const insurableBase = Math.min(Math.max(fixed, settings.socialInsurance.minMonthlyInsurable), settings.socialInsurance.maxMonthlyInsurable);
    const annual = insurableBase * 12 * settings.trainingFund.ratePerEmployee;
    return sum + Math.min(Math.max(annual, settings.trainingFund.minPerEmployee), settings.trainingFund.maxPerEmployee);
  }, 0);

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Learning & Development" title="Training"
        subtitle="Course catalog, employee enrollments, and Training Fund tracking. Mandatory safety certifications with expiry alerts." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Active Courses" value={courses.length} icon={BookOpen} />
        <StatCard label="Enrollments" value={enrollments.length} icon={GraduationCap} />
        <StatCard label="Expiring ≤30d" value={expiringCount} sublabel="Certifications" icon={AlertTriangle} accent={expiringCount > 0 ? 'amber' : 'stone'} />
        <StatCard label="Training Fund" value={fmtEGP(trainingFundAnnual)} sublabel="Annual, est." icon={Wallet} />
      </div>

      <div className="flex gap-1 mb-6 border-b border-stone-200">
        {[{k:'enrollments',l:'Enrollments'},{k:'courses',l:'Course Catalog'}].map(t => (
          <button key={t.k} onClick={() => setTab(t.k)} className={`px-4 py-2 text-sm uppercase tracking-wider ${tab === t.k ? 'border-b-2 border-amber-500 text-stone-900' : 'text-stone-500 hover:text-stone-700'}`} style={{ fontWeight: 500 }}>{t.l}</button>
        ))}
      </div>

      {tab === 'enrollments' && (
        <>
          <div className="mb-4 flex justify-end"><Button variant="gold" onClick={() => { setEditingEnroll(null); setIsEnrollFormOpen(true); }}><Plus size={14} /> Enroll Employee</Button></div>
          <div className="bg-white border border-stone-200 overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-stone-100 border-b border-stone-200">
                <tr>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Employee</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Course</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Status</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Completed</th>
                  <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Expires</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Score</th>
                  <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}></th>
                </tr>
              </thead>
              <tbody>
                {enrollments.map(e => {
                  const emp = employees.find(em => em.code === e.employeeCode);
                  const course = courses.find(c => c.code === e.courseCode);
                  const expired = e.expiryDate && e.expiryDate < today;
                  const expiringSoon = e.expiryDate && e.expiryDate >= today && e.expiryDate <= thirtyFromNow;
                  return (
                    <tr key={e.id} className="border-b border-stone-100 hover:bg-stone-50">
                      <td className="px-4 py-3"><p className="text-stone-900" style={{ fontWeight: 500 }}>{emp?.nameEn || e.employeeCode}</p><p className="text-xs text-stone-500">{emp?.department || ''}</p></td>
                      <td className="px-4 py-3"><p className="text-stone-900">{course?.title || e.courseCode}</p><p className="text-xs text-stone-500">{course?.code} · {course?.category}</p></td>
                      <td className="px-4 py-3"><Badge color={e.status === 'Completed' ? 'emerald' : e.status === 'In Progress' ? 'amber' : 'stone'}>{e.status}</Badge></td>
                      <td className="px-4 py-3 text-xs text-stone-600">{e.completedDate || '—'}</td>
                      <td className="px-4 py-3 text-xs">{e.expiryDate ? <span className={expired ? 'text-red-700' : expiringSoon ? 'text-amber-700' : 'text-stone-600'} style={{ fontWeight: 500 }}>{e.expiryDate}{expired ? ' (expired)' : expiringSoon ? ' (soon)' : ''}</span> : <span className="text-stone-400">—</span>}</td>
                      <td className="px-4 py-3 text-right text-stone-700">{e.score || '—'}</td>
                      <td className="px-4 py-3 text-right">
                        <button onClick={() => { setEditingEnroll(e); setIsEnrollFormOpen(true); }} className="p-1 text-stone-400 hover:text-amber-600"><Edit3 size={14} /></button>
                        <button onClick={() => removeEnroll(e.id)} className="p-1 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
                      </td>
                    </tr>
                  );
                })}
                {enrollments.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-500 text-sm">No enrollments yet.</td></tr>}
              </tbody>
            </table>
          </div>
          <Modal isOpen={isEnrollFormOpen} onClose={() => { setIsEnrollFormOpen(false); setEditingEnroll(null); }} title={editingEnroll ? 'Edit Enrollment' : 'Enroll Employee'}>
            <EnrollmentForm initial={editingEnroll} employees={employees} courses={courses} onSave={saveEnroll} onCancel={() => { setIsEnrollFormOpen(false); setEditingEnroll(null); }} />
          </Modal>
        </>
      )}

      {tab === 'courses' && (
        <>
          <div className="mb-4 flex justify-end"><Button variant="gold" onClick={() => { setEditingCourse(null); setIsCourseFormOpen(true); }}><Plus size={14} /> New Course</Button></div>
          <div className="grid md:grid-cols-2 gap-3">
            {courses.map(c => (
              <div key={c.id} className="bg-white border border-stone-200 p-5 hover:border-amber-300 transition">
                <div className="flex items-start justify-between gap-3 mb-2">
                  <div className="flex items-center gap-2 flex-wrap">
                    <Badge color="amber">{c.category}</Badge>
                    {c.mandatory && <Badge color="red">Mandatory</Badge>}
                    <Badge color="stone">{c.code}</Badge>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => { setEditingCourse(c); setIsCourseFormOpen(true); }} className="p-1 text-stone-400 hover:text-amber-600"><Edit3 size={14} /></button>
                    <button onClick={() => removeCourse(c.id)} className="p-1 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
                <h3 className="text-lg text-stone-900 mb-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{c.title}</h3>
                <p className="text-sm text-stone-600 mb-3">{c.description}</p>
                <div className="flex items-center gap-4 text-xs text-stone-500 flex-wrap">
                  <span>{c.duration}h</span><span>·</span>
                  <span>{c.deliveryMode}</span>
                  {c.validityMonths && <><span>·</span><span>Valid {c.validityMonths}mo</span></>}
                  <span>·</span><span>{fmtEGP(c.cost)}</span>
                </div>
              </div>
            ))}
          </div>
          <Modal isOpen={isCourseFormOpen} onClose={() => { setIsCourseFormOpen(false); setEditingCourse(null); }} title={editingCourse ? 'Edit Course' : 'New Course'}>
            <CourseForm initial={editingCourse} onSave={saveCourse} onCancel={() => { setIsCourseFormOpen(false); setEditingCourse(null); }} />
          </Modal>
        </>
      )}
    </div>
  );
}

function CourseForm({ initial, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    code: '', title: '', category: COURSE_CATEGORIES[0],
    duration: 4, deliveryMode: 'In-Person', mandatory: false,
    validityMonths: null, cost: 0, description: '',
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Code</Label><Input value={data.code} onChange={v => update('code', v)} placeholder="SAF-001" /></div>
        <div><Label>Category</Label><select value={data.category} onChange={e => update('category', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{COURSE_CATEGORIES.map(c => <option key={c}>{c}</option>)}</select></div>
      </div>
      <div><Label>Title</Label><Input value={data.title} onChange={v => update('title', v)} /></div>
      <div><Label>Description</Label><Textarea value={data.description} onChange={v => update('description', v)} rows={3} /></div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Duration (hours)</Label><Input type="number" value={data.duration} onChange={v => update('duration', Number(v))} /></div>
        <div><Label>Delivery</Label><select value={data.deliveryMode} onChange={e => update('deliveryMode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{['In-Person','Online','Hybrid'].map(m => <option key={m}>{m}</option>)}</select></div>
        <div><Label>Cost (EGP)</Label><Input type="number" value={data.cost} onChange={v => update('cost', Number(v))} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Validity (months, blank = no expiry)</Label><Input type="number" value={data.validityMonths || ''} onChange={v => update('validityMonths', v ? Number(v) : null)} /></div>
        <div className="flex items-end"><label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={data.mandatory} onChange={e => update('mandatory', e.target.checked)} className="h-4 w-4" /> Mandatory course</label></div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}

function EnrollmentForm({ initial, employees, courses, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    employeeCode: employees[0]?.code || '', courseCode: courses[0]?.code || '',
    status: 'Enrolled', completedDate: null, expiryDate: null, score: null,
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  const course = courses.find(c => c.code === data.courseCode);
  return (
    <div className="space-y-4">
      <div><Label>Employee</Label><select value={data.employeeCode} onChange={e => update('employeeCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}</select></div>
      <div><Label>Course</Label><select value={data.courseCode} onChange={e => update('courseCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{courses.map(c => <option key={c.code} value={c.code}>{c.code} — {c.title}</option>)}</select></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Status</Label><select value={data.status} onChange={e => { const s = e.target.value; update('status', s); if (s === 'Completed' && !data.completedDate) { const cd = todayISO(); update('completedDate', cd); if (course?.validityMonths) update('expiryDate', dateAddDays(cd, course.validityMonths * 30)); } }} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{['Enrolled','In Progress','Completed','Failed','Withdrawn'].map(s => <option key={s}>{s}</option>)}</select></div>
        <div><Label>Score (if applicable)</Label><Input type="number" value={data.score || ''} onChange={v => update('score', v ? Number(v) : null)} /></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Completed Date</Label><Input type="date" value={data.completedDate || ''} onChange={v => update('completedDate', v || null)} /></div>
        <div><Label>Expiry Date</Label><Input type="date" value={data.expiryDate || ''} onChange={v => update('expiryDate', v || null)} /></div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}

// ============================================================================
// ORG CHART VIEW
// ============================================================================
function OrgChartView({ employees }) {
  const byDept = useMemo(() => {
    const m = {};
    employees.filter(e => e.status === 'Active').forEach(e => { if (!m[e.department]) m[e.department] = []; m[e.department].push(e); });
    return m;
  }, [employees]);

  const departments = Object.keys(byDept).sort();

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="People" title="Organization"
        subtitle="Functional structure across Mobica. Department heads and reporting teams by business unit." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Departments" value={departments.length} icon={Layers} />
        <StatCard label="Active Headcount" value={employees.filter(e => e.status === 'Active').length} icon={Users} />
        <StatCard label="Locations" value={MOBICA_LOCATIONS.length} icon={MapPin} />
        <StatCard label="Avg Team Size" value={Math.round(employees.filter(e => e.status === 'Active').length / Math.max(departments.length, 1))} icon={Network} />
      </div>

      <div className="space-y-6">
        {departments.map(dept => {
          const deptEmps = byDept[dept];
          const head = deptEmps.find(e => /director|head|chief|ceo|chairman/i.test(e.position || '')) || deptEmps[0];
          const others = deptEmps.filter(e => e.id !== head.id);
          return (
            <div key={dept} className="bg-white border border-stone-200 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-2xl text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{dept}</h2>
                <Badge color="stone">{deptEmps.length} members</Badge>
              </div>
              <div className="mb-4 pb-4 border-b border-stone-200">
                <p className="text-[10px] uppercase tracking-wider text-amber-700 mb-2" style={{ fontWeight: 500 }}>Department Lead</p>
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 bg-stone-900 text-amber-400 flex items-center justify-center text-lg" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif' }}>{head.nameEn.split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
                  <div>
                    <p className="text-stone-900" style={{ fontWeight: 500 }}>{head.nameEn}</p>
                    <p className="text-xs text-stone-500">{head.position || 'Lead'} · {head.code}</p>
                  </div>
                </div>
              </div>
              {others.length > 0 && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                  {others.map(e => (
                    <div key={e.id} className="flex items-center gap-3 p-3 border border-stone-200 bg-stone-50">
                      <div className="w-10 h-10 bg-stone-200 text-stone-700 flex items-center justify-center text-sm" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{e.nameEn.split(' ').map(p => p[0]).slice(0, 2).join('')}</div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-stone-900 truncate" style={{ fontWeight: 500 }}>{e.nameEn}</p>
                        <p className="text-xs text-stone-500 truncate">{e.position || '—'}</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================================
// DOCUMENTS VIEW
// ============================================================================
function DocumentsView({ employees, documents, setDocuments }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterEmp, setFilterEmp] = useState('all');

  const today = todayISO();
  const thirtyDays = dateAddDays(today, 30);

  const docs = documents.map(d => {
    let status = 'Valid';
    if (d.expiryDate) {
      if (d.expiryDate < today) status = 'Expired';
      else if (d.expiryDate <= thirtyDays) status = 'Expiring Soon';
    }
    return { ...d, status };
  });

  const filtered = filterEmp === 'all' ? docs : docs.filter(d => d.employeeCode === filterEmp);

  const save = (d) => {
    if (editing) setDocuments(prev => prev.map(doc => doc.id === editing.id ? { ...doc, ...d } : doc));
    else setDocuments(prev => [...prev, { ...d, id: uid() }]);
    setIsFormOpen(false); setEditing(null);
  };
  const remove = (id) => { if (!confirm('Delete this document record?')) return; setDocuments(prev => prev.filter(d => d.id !== id)); };

  const expired = docs.filter(d => d.status === 'Expired').length;
  const expiring = docs.filter(d => d.status === 'Expiring Soon').length;

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="People" title="Documents"
        subtitle="Employee document register with automated expiry tracking for national IDs, passports, work permits, driving licences and medical certificates."
        actions={<Button variant="gold" onClick={() => { setEditing(null); setIsFormOpen(true); }}><Plus size={14} /> New Document</Button>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Total Documents" value={docs.length} icon={FileSignature} />
        <StatCard label="Expired" value={expired} icon={AlertCircle} accent={expired > 0 ? 'red' : 'stone'} />
        <StatCard label="Expiring ≤30d" value={expiring} icon={AlertTriangle} accent={expiring > 0 ? 'amber' : 'stone'} />
        <StatCard label="Employees with Docs" value={new Set(docs.map(d => d.employeeCode)).size} icon={Users} />
      </div>

      <div className="mb-6 bg-white border border-stone-200 p-4">
        <Label>Filter by Employee</Label>
        <select value={filterEmp} onChange={e => setFilterEmp(e.target.value)} className="px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500 w-64">
          <option value="all">All Employees</option>
          {employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}
        </select>
      </div>

      <div className="bg-white border border-stone-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-stone-100 border-b border-stone-200">
            <tr>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Employee</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Document</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Number</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Issued</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Expires</th>
              <th className="text-left px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Status</th>
              <th className="text-right px-4 py-3 text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(d => {
              const emp = employees.find(e => e.code === d.employeeCode);
              const type = DOCUMENT_TYPES.find(t => t.key === d.type);
              return (
                <tr key={d.id} className="border-b border-stone-100 hover:bg-stone-50">
                  <td className="px-4 py-3"><p className="text-stone-900" style={{ fontWeight: 500 }}>{emp?.nameEn || d.employeeCode}</p><p className="text-xs text-stone-500">{emp?.code}</p></td>
                  <td className="px-4 py-3 text-stone-700">{type?.label || d.type}</td>
                  <td className="px-4 py-3 text-stone-700 font-mono text-xs">{d.documentNumber}</td>
                  <td className="px-4 py-3 text-xs text-stone-600">{d.issueDate || '—'}</td>
                  <td className="px-4 py-3 text-xs text-stone-600">{d.expiryDate || '—'}</td>
                  <td className="px-4 py-3"><Badge color={d.status === 'Valid' ? 'emerald' : d.status === 'Expiring Soon' ? 'amber' : 'red'}>{d.status}</Badge></td>
                  <td className="px-4 py-3 text-right">
                    <button onClick={() => { setEditing(d); setIsFormOpen(true); }} className="p-1 text-stone-400 hover:text-amber-600"><Edit3 size={14} /></button>
                    <button onClick={() => remove(d.id)} className="p-1 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </td>
                </tr>
              );
            })}
            {filtered.length === 0 && <tr><td colSpan={7} className="px-4 py-8 text-center text-stone-500 text-sm">No documents recorded.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null); }} title={editing ? 'Edit Document' : 'New Document'}>
        <DocumentForm initial={editing} employees={employees} onSave={save} onCancel={() => { setIsFormOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}

function DocumentForm({ initial, employees, onSave, onCancel }) {
  const [data, setData] = useState(initial || { employeeCode: employees[0]?.code || '', type: DOCUMENT_TYPES[0].key, documentNumber: '', issueDate: '', expiryDate: '', notes: '' });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  const type = DOCUMENT_TYPES.find(t => t.key === data.type);
  return (
    <div className="space-y-4">
      <div><Label>Employee</Label><select value={data.employeeCode} onChange={e => update('employeeCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}</select></div>
      <div><Label>Document Type</Label><select value={data.type} onChange={e => update('type', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{DOCUMENT_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}{t.mandatory ? ' *' : ''}</option>)}</select></div>
      <div><Label>Document Number</Label><Input value={data.documentNumber} onChange={v => update('documentNumber', v)} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Issue Date</Label><Input type="date" value={data.issueDate} onChange={v => update('issueDate', v)} /></div>
        <div><Label>Expiry Date {type?.requiresExpiry ? '*' : '(optional)'}</Label><Input type="date" value={data.expiryDate} onChange={v => update('expiryDate', v)} /></div>
      </div>
      <div><Label>Notes</Label><Textarea value={data.notes || ''} onChange={v => update('notes', v)} rows={2} /></div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}
// ============================================================================
// REQUESTS VIEW
// ============================================================================
function RequestsView({ employees, requests, setRequests }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);
  const [filterStatus, setFilterStatus] = useState('all');

  const filtered = filterStatus === 'all' ? requests : requests.filter(r => r.status === filterStatus);

  const save = (d) => {
    if (editing) setRequests(prev => prev.map(r => r.id === editing.id ? { ...r, ...d } : r));
    else setRequests(prev => [...prev, { ...d, id: uid() }]);
    setIsFormOpen(false); setEditing(null);
  };

  const setStatus = (id, status, comment = '') => {
    setRequests(prev => prev.map(r => r.id === id ? { ...r, status, approvedAt: todayISO(), comment: comment || r.comment } : r));
  };
  const remove = (id) => { if (!confirm('Delete this request?')) return; setRequests(prev => prev.filter(r => r.id !== id)); };

  const countByStatus = {};
  REQUEST_STATUSES.forEach(s => { countByStatus[s] = requests.filter(r => r.status === s).length; });

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Service & Workflow" title="Employee Requests"
        subtitle="HR letters, leave requests, salary advances, expense reimbursements — with approval workflow."
        actions={<Button variant="gold" onClick={() => { setEditing(null); setIsFormOpen(true); }}><Plus size={14} /> New Request</Button>} />

      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        {REQUEST_STATUSES.map(s => (
          <div key={s} className="bg-white border border-stone-200 p-4">
            <p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontWeight: 500 }}>{s}</p>
            <p className="text-3xl mt-1 text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{countByStatus[s]}</p>
          </div>
        ))}
      </div>

      <div className="mb-6 bg-white border border-stone-200 p-4">
        <Label>Filter</Label>
        <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} className="px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">
          <option value="all">All Statuses</option>
          {REQUEST_STATUSES.map(s => <option key={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-3">
        {filtered.map(req => {
          const emp = employees.find(e => e.code === req.employeeCode);
          const approver = employees.find(e => e.code === req.approverCode);
          const type = REQUEST_TYPES.find(t => t.key === req.type);
          const statusColor = req.status === 'Approved' || req.status === 'Completed' ? 'emerald' : req.status === 'Rejected' ? 'red' : req.status === 'Pending' ? 'amber' : 'stone';
          return (
            <div key={req.id} className="bg-white border border-stone-200 p-5 hover:border-amber-300 transition">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge color={statusColor}>{req.status}</Badge>
                    <Badge color="stone">{type?.label}</Badge>
                  </div>
                  <h3 className="text-lg text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{req.subject}</h3>
                  <p className="text-sm text-stone-600 mt-1">{req.details}</p>
                  {req.startDate && <p className="text-xs text-stone-500 mt-2">{req.startDate}{req.endDate && ` — ${req.endDate}`}</p>}
                  <div className="text-xs text-stone-500 mt-2">
                    From {emp?.nameEn || req.employeeCode} · Submitted {req.submittedAt}
                    {req.approvedAt && <> · {req.status} on {req.approvedAt}</>}
                    {approver && <> · Approver: {approver.nameEn}</>}
                  </div>
                  {req.comment && <p className="text-xs text-stone-700 mt-2 italic">"{req.comment}"</p>}
                </div>
                <div className="flex flex-col items-end gap-2 flex-shrink-0">
                  {req.status === 'Pending' && (
                    <div className="flex gap-2">
                      <button onClick={() => setStatus(req.id, 'Approved', prompt('Approval note (optional):', '') || '')} className="px-3 py-1 text-xs bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100 uppercase tracking-wider" style={{ fontWeight: 500 }}>Approve</button>
                      <button onClick={() => setStatus(req.id, 'Rejected', prompt('Reason for rejection:', '') || '')} className="px-3 py-1 text-xs bg-red-50 text-red-800 border border-red-200 hover:bg-red-100 uppercase tracking-wider" style={{ fontWeight: 500 }}>Reject</button>
                    </div>
                  )}
                  <div className="flex gap-1">
                    <button onClick={() => { setEditing(req); setIsFormOpen(true); }} className="p-1 text-stone-400 hover:text-amber-600"><Edit3 size={14} /></button>
                    <button onClick={() => remove(req.id)} className="p-1 text-stone-400 hover:text-red-600"><Trash2 size={14} /></button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}
        {filtered.length === 0 && <div className="bg-white border border-stone-200 p-12 text-center text-stone-500 text-sm">No requests match the filter.</div>}
      </div>

      <Modal isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null); }} title={editing ? 'Edit Request' : 'New Request'}>
        <RequestForm initial={editing} employees={employees} onSave={save} onCancel={() => { setIsFormOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}

function RequestForm({ initial, employees, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    employeeCode: employees[0]?.code || '', type: 'leave',
    subject: '', details: '', startDate: null, endDate: null,
    status: 'Pending', submittedAt: todayISO(),
    approverCode: employees[0]?.code || '', approvedAt: null, comment: '',
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  const type = REQUEST_TYPES.find(t => t.key === data.type);
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Employee</Label><select value={data.employeeCode} onChange={e => update('employeeCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}</select></div>
        <div><Label>Request Type</Label><select value={data.type} onChange={e => update('type', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{REQUEST_TYPES.map(t => <option key={t.key} value={t.key}>{t.label}</option>)}</select></div>
      </div>
      <div><Label>Subject</Label><Input value={data.subject} onChange={v => update('subject', v)} /></div>
      <div><Label>Details</Label><Textarea value={data.details} onChange={v => update('details', v)} rows={3} /></div>
      {type?.needsDates && (
        <div className="grid grid-cols-2 gap-4">
          <div><Label>Start Date</Label><Input type="date" value={data.startDate || ''} onChange={v => update('startDate', v || null)} /></div>
          <div><Label>End Date</Label><Input type="date" value={data.endDate || ''} onChange={v => update('endDate', v || null)} /></div>
        </div>
      )}
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Approver</Label><select value={data.approverCode} onChange={e => update('approverCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.nameEn}</option>)}</select></div>
        <div><Label>Status</Label><select value={data.status} onChange={e => update('status', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{REQUEST_STATUSES.map(s => <option key={s}>{s}</option>)}</select></div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}

// ============================================================================
// DISCIPLINARY VIEW
// ============================================================================
function DisciplinaryView({ employees, disciplinary, setDisciplinary }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const save = (d) => {
    if (editing) setDisciplinary(prev => prev.map(x => x.id === editing.id ? { ...x, ...d } : x));
    else setDisciplinary(prev => [...prev, { ...d, id: uid() }]);
    setIsFormOpen(false); setEditing(null);
  };
  const remove = (id) => { if (!confirm('Delete this disciplinary record?')) return; setDisciplinary(prev => prev.filter(x => x.id !== id)); };

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Compliance & Cases" title="Disciplinary Actions"
        subtitle="Warnings, suspensions and terminations — tracked per Law 14/2025. Maintains chain of documentation required for lawful action."
        actions={<Button variant="gold" onClick={() => { setEditing(null); setIsFormOpen(true); }}><Plus size={14} /> New Action</Button>} />

      <div className="bg-amber-50 border border-amber-200 p-4 mb-6 text-xs text-amber-900">
        <p className="flex items-center gap-2" style={{ fontWeight: 500 }}>
          <AlertTriangle size={14} /> Under Law 14/2025, termination for misconduct requires documented progression: verbal → written → final written warning, with employee acknowledgement.
        </p>
      </div>

      <div className="space-y-3">
        {disciplinary.map(d => {
          const emp = employees.find(e => e.code === d.employeeCode);
          const issuer = employees.find(e => e.code === d.issuedBy);
          const action = DISCIPLINARY_ACTIONS.find(a => a.key === d.action);
          const color = action?.severity <= 1 ? 'amber' : action?.severity <= 2 ? 'orange' : 'red';
          return (
            <div key={d.id} className="bg-white border border-stone-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge color={color}>{action?.label || d.action}</Badge>
                    <Badge color={d.acknowledged ? 'emerald' : 'amber'}>{d.acknowledged ? 'Acknowledged' : 'Pending Acknowledgement'}</Badge>
                  </div>
                  <h3 className="text-lg text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{emp?.nameEn || d.employeeCode}</h3>
                  <p className="text-xs text-stone-500 mt-1">{d.date} · Issued by {issuer?.nameEn || d.issuedBy}</p>
                  <div className="mt-3 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Incident</p><p className="text-stone-700">{d.incident}</p></div>
                  <div className="mt-2 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Resolution</p><p className="text-stone-700">{d.resolution}</p></div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(d); setIsFormOpen(true); }} className="p-2 text-stone-400 hover:text-amber-600"><Edit3 size={16} /></button>
                  <button onClick={() => remove(d.id)} className="p-2 text-stone-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          );
        })}
        {disciplinary.length === 0 && <div className="bg-white border border-stone-200 p-12 text-center text-stone-500 text-sm">No disciplinary records.</div>}
      </div>

      <Modal isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null); }} title={editing ? 'Edit Action' : 'New Disciplinary Action'}>
        <DisciplinaryForm initial={editing} employees={employees} onSave={save} onCancel={() => { setIsFormOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}

function DisciplinaryForm({ initial, employees, onSave, onCancel }) {
  const [data, setData] = useState(initial || {
    employeeCode: employees[0]?.code || '', action: 'verbal',
    date: todayISO(), incident: '', resolution: '',
    issuedBy: employees[0]?.code || '', acknowledged: false, acknowledgedAt: null,
    notes: '',
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Employee</Label><select value={data.employeeCode} onChange={e => update('employeeCode', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.code} — {e.nameEn}</option>)}</select></div>
        <div><Label>Action Type</Label><select value={data.action} onChange={e => update('action', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{DISCIPLINARY_ACTIONS.map(a => <option key={a.key} value={a.key}>{a.label}</option>)}</select></div>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Date</Label><Input type="date" value={data.date} onChange={v => update('date', v)} /></div>
        <div><Label>Issued By</Label><select value={data.issuedBy} onChange={e => update('issuedBy', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.nameEn}</option>)}</select></div>
      </div>
      <div><Label>Incident Description</Label><Textarea value={data.incident} onChange={v => update('incident', v)} rows={3} /></div>
      <div><Label>Resolution / Action Taken</Label><Textarea value={data.resolution} onChange={v => update('resolution', v)} rows={3} /></div>
      <div className="flex items-center gap-2">
        <input type="checkbox" checked={data.acknowledged} onChange={e => { update('acknowledged', e.target.checked); if (e.target.checked) update('acknowledgedAt', todayISO()); }} className="h-4 w-4" />
        <Label>Employee acknowledged</Label>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}

// ============================================================================
// SAFETY / INCIDENTS VIEW
// ============================================================================
function SafetyView({ employees, incidents, setIncidents }) {
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editing, setEditing] = useState(null);

  const save = (d) => {
    if (editing) setIncidents(prev => prev.map(x => x.id === editing.id ? { ...x, ...d } : x));
    else setIncidents(prev => [...prev, { ...d, id: uid() }]);
    setIsFormOpen(false); setEditing(null);
  };
  const remove = (id) => { if (!confirm('Delete this incident record?')) return; setIncidents(prev => prev.filter(x => x.id !== id)); };

  const open = incidents.filter(i => i.status === 'Open').length;
  const closed = incidents.filter(i => i.status === 'Closed').length;
  const injuries = incidents.filter(i => i.type === 'Injury').length;
  const nearMisses = incidents.filter(i => i.type === 'Near Miss').length;

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Safety" title="Incidents & Near Misses"
        subtitle="Factory floor and site safety tracking. Root cause analysis and corrective action for every recordable incident."
        actions={<Button variant="gold" onClick={() => { setEditing(null); setIsFormOpen(true); }}><Plus size={14} /> Log Incident</Button>} />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <StatCard label="Open" value={open} icon={AlertCircle} accent={open > 0 ? 'amber' : 'stone'} />
        <StatCard label="Closed (YTD)" value={closed} icon={CheckCircle2} />
        <StatCard label="Injuries" value={injuries} icon={HardHat} accent={injuries > 0 ? 'red' : 'stone'} />
        <StatCard label="Near Misses" value={nearMisses} icon={Activity} />
      </div>

      <div className="space-y-3">
        {incidents.map(inc => {
          const reporter = employees.find(e => e.code === inc.reportedBy);
          const sev = INCIDENT_SEVERITY.find(s => s.key === inc.severity);
          return (
            <div key={inc.id} className="bg-white border border-stone-200 p-5">
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <Badge color={inc.status === 'Open' ? 'amber' : 'emerald'}>{inc.status}</Badge>
                    <Badge color="stone">{inc.incidentCode}</Badge>
                    <Badge color={sev?.color || 'stone'}>{sev?.label || inc.severity}</Badge>
                    <Badge color="stone">{inc.type}</Badge>
                  </div>
                  <h3 className="text-lg text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{inc.location}</h3>
                  <p className="text-xs text-stone-500 mt-1">{inc.date} {inc.time} · Reported by {reporter?.nameEn || inc.reportedBy}</p>
                  <div className="mt-3 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Description</p><p className="text-stone-700">{inc.description}</p></div>
                  {inc.rootCause && <div className="mt-2 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Root Cause</p><p className="text-stone-700">{inc.rootCause}</p></div>}
                  {inc.correctiveAction && <div className="mt-2 text-sm"><p className="text-[10px] uppercase tracking-wider text-stone-500 mb-1" style={{ fontWeight: 500 }}>Corrective Action</p><p className="text-stone-700">{inc.correctiveAction}</p></div>}
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <button onClick={() => { setEditing(inc); setIsFormOpen(true); }} className="p-2 text-stone-400 hover:text-amber-600"><Edit3 size={16} /></button>
                  <button onClick={() => remove(inc.id)} className="p-2 text-stone-400 hover:text-red-600"><Trash2 size={16} /></button>
                </div>
              </div>
            </div>
          );
        })}
        {incidents.length === 0 && <div className="bg-white border border-stone-200 p-12 text-center text-stone-500 text-sm">No incidents logged.</div>}
      </div>

      <Modal isOpen={isFormOpen} onClose={() => { setIsFormOpen(false); setEditing(null); }} title={editing ? 'Edit Incident' : 'Log Incident'} maxWidth="max-w-4xl">
        <IncidentForm initial={editing} employees={employees} onSave={save} onCancel={() => { setIsFormOpen(false); setEditing(null); }} />
      </Modal>
    </div>
  );
}

function IncidentForm({ initial, employees, onSave, onCancel }) {
  const nextCode = `INC-${new Date().getFullYear()}-${String(Math.floor(Math.random() * 1000)).padStart(3, '0')}`;
  const [data, setData] = useState(initial || {
    incidentCode: nextCode, date: todayISO(), time: '12:00',
    location: MOBICA_LOCATIONS[0], type: INCIDENT_TYPES[0], severity: 'minor',
    description: '', reportedBy: employees[0]?.code || '', peopleInvolved: '',
    rootCause: '', correctiveAction: '', status: 'Open', closedDate: null,
  });
  const update = (k, v) => setData(d => ({ ...d, [k]: v }));
  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Incident Code</Label><Input value={data.incidentCode} onChange={v => update('incidentCode', v)} /></div>
        <div><Label>Date</Label><Input type="date" value={data.date} onChange={v => update('date', v)} /></div>
        <div><Label>Time</Label><Input type="time" value={data.time} onChange={v => update('time', v)} /></div>
      </div>
      <div className="grid grid-cols-3 gap-4">
        <div><Label>Location</Label><select value={data.location} onChange={e => update('location', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{MOBICA_LOCATIONS.map(l => <option key={l}>{l}</option>)}</select></div>
        <div><Label>Type</Label><select value={data.type} onChange={e => update('type', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{INCIDENT_TYPES.map(t => <option key={t}>{t}</option>)}</select></div>
        <div><Label>Severity</Label><select value={data.severity} onChange={e => update('severity', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{INCIDENT_SEVERITY.map(s => <option key={s.key} value={s.key}>{s.label}</option>)}</select></div>
      </div>
      <div><Label>Description</Label><Textarea value={data.description} onChange={v => update('description', v)} rows={3} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Reported By</Label><select value={data.reportedBy} onChange={e => update('reportedBy', e.target.value)} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{employees.map(e => <option key={e.code} value={e.code}>{e.nameEn}</option>)}</select></div>
        <div><Label>People Involved</Label><Input value={data.peopleInvolved} onChange={v => update('peopleInvolved', v)} placeholder="Names or employee codes" /></div>
      </div>
      <div><Label>Root Cause</Label><Textarea value={data.rootCause} onChange={v => update('rootCause', v)} rows={2} /></div>
      <div><Label>Corrective Action</Label><Textarea value={data.correctiveAction} onChange={v => update('correctiveAction', v)} rows={2} /></div>
      <div className="grid grid-cols-2 gap-4">
        <div><Label>Status</Label><select value={data.status} onChange={e => { const s = e.target.value; update('status', s); if (s === 'Closed' && !data.closedDate) update('closedDate', todayISO()); }} className="w-full px-3 py-2 text-sm bg-white border border-stone-300 focus:outline-none focus:border-amber-500">{['Open','Investigating','Closed'].map(s => <option key={s}>{s}</option>)}</select></div>
        <div><Label>Closed Date</Label><Input type="date" value={data.closedDate || ''} onChange={v => update('closedDate', v || null)} /></div>
      </div>
      <div className="flex justify-end gap-2 pt-4 border-t border-stone-200">
        <Button variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button variant="gold" onClick={() => onSave(data)}><Check size={14} /> Save</Button>
      </div>
    </div>
  );
}

// ============================================================================
// HR ANALYTICS VIEW
// ============================================================================
function AnalyticsView({ employees, payrollRuns, attendance, goals, reviews, jobs, candidates, enrollments, incidents, requests, settings }) {
  const active = employees.filter(e => e.status === 'Active');

  // Compensation stats
  const totalGross = active.reduce((s, e) => {
    const fixed = (Number(e.basicSalary) || 0) + (Number(e.housingAllowance) || 0) + (Number(e.transportAllowance) || 0) + (Number(e.mealAllowance) || 0) + (Number(e.otherAllowances) || 0);
    return s + fixed;
  }, 0);
  const avgComp = active.length ? totalGross / active.length : 0;

  // Department distribution
  const deptDist = {};
  active.forEach(e => { deptDist[e.department] = (deptDist[e.department] || 0) + 1; });
  const deptArr = Object.entries(deptDist).sort((a, b) => b[1] - a[1]);
  const maxDept = Math.max(...deptArr.map(d => d[1]), 1);

  // Tenure distribution
  const tenureBuckets = { '<1y': 0, '1-3y': 0, '3-5y': 0, '5-10y': 0, '10y+': 0 };
  active.forEach(e => {
    if (!e.hireDate) return;
    const years = (new Date() - new Date(e.hireDate)) / (365.25 * 24 * 60 * 60 * 1000);
    if (years < 1) tenureBuckets['<1y']++;
    else if (years < 3) tenureBuckets['1-3y']++;
    else if (years < 5) tenureBuckets['3-5y']++;
    else if (years < 10) tenureBuckets['5-10y']++;
    else tenureBuckets['10y+']++;
  });
  const maxTenure = Math.max(...Object.values(tenureBuckets), 1);

  // Attendance rate (last 30 days)
  const thirty = dateAddDays(todayISO(), -30);
  const recent = attendance.filter(a => a.date >= thirty);
  const total = recent.length || 1;
  const presentCount = recent.filter(a => a.status === 'present' || a.status === 'late').length;
  const attendanceRate = (presentCount / total * 100);

  // Performance distribution
  const completedReviews = reviews.filter(r => r.status === 'Completed');
  const ratingDist = {};
  PERFORMANCE_RATINGS.forEach(r => { ratingDist[r.label] = 0; });
  completedReviews.forEach(r => {
    const meta = PERFORMANCE_RATINGS.find(m => m.value === r.ratingOverall);
    if (meta) ratingDist[meta.label]++;
  });

  // Recruitment metrics
  const openReqs = jobs.filter(j => ['Open', 'Interviewing', 'Offer Extended'].includes(j.status)).length;
  const totalOpenPositions = jobs.filter(j => ['Open', 'Interviewing', 'Offer Extended'].includes(j.status)).reduce((s, j) => s + (j.headcount || 1), 0);
  const activeCandidates = candidates.filter(c => !['Hired', 'Rejected', 'Withdrew'].includes(c.stage)).length;

  // Training completion
  const trainingCompletionRate = enrollments.length ? (enrollments.filter(e => e.status === 'Completed').length / enrollments.length * 100) : 0;

  // Open cases
  const pendingRequests = requests.filter(r => r.status === 'Pending').length;
  const openIncidents = incidents.filter(i => i.status === 'Open').length;

  return (
    <div className="p-8 bg-stone-50 min-h-screen">
      <PageHeader eyebrow="Insights" title="HR Analytics"
        subtitle="People metrics across headcount, tenure, compensation, performance, recruitment, safety, and training." />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-8">
        <StatCard label="Active Headcount" value={active.length} icon={Users} />
        <StatCard label="Avg Monthly Comp" value={fmtEGP(avgComp)} icon={Wallet} />
        <StatCard label="30d Attendance" value={`${attendanceRate.toFixed(1)}%`} icon={Activity} accent={attendanceRate >= 95 ? 'emerald' : attendanceRate >= 90 ? 'amber' : 'red'} />
        <StatCard label="Training Completion" value={`${trainingCompletionRate.toFixed(0)}%`} icon={GraduationCap} />
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-stone-200 p-6">
          <h3 className="text-lg text-stone-900 mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Headcount by Department</h3>
          <div className="space-y-2">
            {deptArr.map(([dept, count]) => (
              <div key={dept} className="flex items-center gap-3">
                <div className="w-32 text-xs text-stone-700 truncate">{dept}</div>
                <div className="flex-1 h-5 bg-stone-100 relative">
                  <div className="h-full bg-amber-500" style={{ width: `${(count / maxDept) * 100}%` }} />
                </div>
                <div className="w-10 text-right text-xs text-stone-900" style={{ fontWeight: 500 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-white border border-stone-200 p-6">
          <h3 className="text-lg text-stone-900 mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Tenure Distribution</h3>
          <div className="space-y-2">
            {Object.entries(tenureBuckets).map(([bucket, count]) => (
              <div key={bucket} className="flex items-center gap-3">
                <div className="w-16 text-xs text-stone-700">{bucket}</div>
                <div className="flex-1 h-5 bg-stone-100 relative">
                  <div className="h-full bg-stone-600" style={{ width: `${(count / maxTenure) * 100}%` }} />
                </div>
                <div className="w-10 text-right text-xs text-stone-900" style={{ fontWeight: 500 }}>{count}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6 mb-6">
        <div className="bg-white border border-stone-200 p-6">
          <h3 className="text-lg text-stone-900 mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Performance Ratings</h3>
          {completedReviews.length === 0 ? (
            <p className="text-sm text-stone-500">No completed reviews yet.</p>
          ) : (
            <div className="space-y-2">
              {PERFORMANCE_RATINGS.map(r => (
                <div key={r.label} className="flex items-center gap-3">
                  <div className="w-24 text-xs text-stone-700">{r.label}</div>
                  <div className="flex-1 h-5 bg-stone-100 relative">
                    <div className={`h-full bg-${r.color}-500`} style={{ width: `${(ratingDist[r.label] / Math.max(completedReviews.length, 1)) * 100}%` }} />
                  </div>
                  <div className="w-10 text-right text-xs text-stone-900" style={{ fontWeight: 500 }}>{ratingDist[r.label]}</div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="bg-white border border-stone-200 p-6">
          <h3 className="text-lg text-stone-900 mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Recruitment Pipeline</h3>
          <div className="grid grid-cols-3 gap-3 mb-3">
            <div className="text-center"><p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontWeight: 500 }}>Open Reqs</p><p className="text-3xl text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{openReqs}</p></div>
            <div className="text-center"><p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontWeight: 500 }}>Positions</p><p className="text-3xl text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{totalOpenPositions}</p></div>
            <div className="text-center"><p className="text-[10px] uppercase tracking-wider text-stone-500" style={{ fontWeight: 500 }}>Active Candidates</p><p className="text-3xl text-stone-900" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{activeCandidates}</p></div>
          </div>
          <p className="text-xs text-stone-500 border-t border-stone-200 pt-3 mt-3">Average {totalOpenPositions > 0 ? (activeCandidates / totalOpenPositions).toFixed(1) : 0} candidates per open position.</p>
        </div>
      </div>

      <div className="bg-white border border-stone-200 p-6">
        <h3 className="text-lg text-stone-900 mb-4" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>Action Queue</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className={`p-4 border ${pendingRequests > 0 ? 'bg-amber-50 border-amber-200' : 'bg-stone-50 border-stone-200'}`}>
            <p className="text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Pending Requests</p>
            <p className="text-2xl text-stone-900 mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{pendingRequests}</p>
          </div>
          <div className={`p-4 border ${openIncidents > 0 ? 'bg-red-50 border-red-200' : 'bg-stone-50 border-stone-200'}`}>
            <p className="text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Open Incidents</p>
            <p className="text-2xl text-stone-900 mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{openIncidents}</p>
          </div>
          <div className="p-4 border bg-stone-50 border-stone-200">
            <p className="text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Active Goals</p>
            <p className="text-2xl text-stone-900 mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{goals.filter(g => g.status === 'In Progress' || g.status === 'At Risk').length}</p>
          </div>
          <div className="p-4 border bg-stone-50 border-stone-200">
            <p className="text-[10px] uppercase tracking-wider text-stone-600" style={{ fontWeight: 500 }}>Draft Reviews</p>
            <p className="text-2xl text-stone-900 mt-1" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 500 }}>{reviews.filter(r => r.status === 'Draft' || r.status === 'In Progress').length}</p>
          </div>
        </div>
      </div>
    </div>
  );
}
// ============================================================================
// MAIN APP — FULL HR SUITE
// ============================================================================

export default function MobicaPayroll() {
  const [view, setView] = useState('dashboard');
  const [loaded, setLoaded] = useState(false);

  // Payroll state
  const [settings, setSettings] = useState(DEFAULT_SETTINGS);
  const [employees, setEmployees] = useState([]);
  const [payrollRuns, setPayrollRuns] = useState([]);
  const [leaveRecords, setLeaveRecords] = useState([]);

  // HR Suite state
  const [attendance, setAttendance] = useState([]);
  const [goals, setGoals] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [candidates, setCandidates] = useState([]);
  const [courses, setCourses] = useState([]);
  const [enrollments, setEnrollments] = useState([]);
  const [documents, setDocuments] = useState([]);
  const [requests, setRequests] = useState([]);
  const [disciplinary, setDisciplinary] = useState([]);
  const [incidents, setIncidents] = useState([]);

  // Load from persistent storage
  useEffect(() => {
    (async () => {
      const [s, e, p, l, meta, att, g, rv, jb, cd, cr, en, dc, rq, ds, inc] = await Promise.all([
        storageGet(STORAGE_KEYS.settings, DEFAULT_SETTINGS),
        storageGet(STORAGE_KEYS.employees, null),
        storageGet(STORAGE_KEYS.payrollRuns, []),
        storageGet(STORAGE_KEYS.leaveRecords, []),
        storageGet(STORAGE_KEYS.meta, null),
        storageGet(STORAGE_KEYS.attendance, null),
        storageGet(STORAGE_KEYS.goals, null),
        storageGet(STORAGE_KEYS.reviews, null),
        storageGet(STORAGE_KEYS.jobs, null),
        storageGet(STORAGE_KEYS.candidates, null),
        storageGet(STORAGE_KEYS.courses, null),
        storageGet(STORAGE_KEYS.enrollments, null),
        storageGet(STORAGE_KEYS.documents, null),
        storageGet(STORAGE_KEYS.requests, null),
        storageGet(STORAGE_KEYS.disciplinary, null),
        storageGet(STORAGE_KEYS.incidents, null),
      ]);
      setSettings(s);
      const firstSeed = e === null && !meta;
      if (firstSeed) {
        setEmployees(SEED_EMPLOYEES);
        await storageSet(STORAGE_KEYS.meta, { seeded: true, seededAt: Date.now() });
      } else {
        setEmployees(e || []);
      }
      setPayrollRuns(p);
      setLeaveRecords(l);

      // Seed HR data on first load (or if missing)
      setAttendance(att === null ? generateSeedAttendance() : att);
      setGoals(g === null ? SEED_GOALS : g);
      setReviews(rv === null ? SEED_REVIEWS : rv);
      setJobs(jb === null ? SEED_JOBS : jb);
      setCandidates(cd === null ? SEED_CANDIDATES : cd);
      setCourses(cr === null ? SEED_COURSES : cr);
      setEnrollments(en === null ? SEED_ENROLLMENTS : en);
      setDocuments(dc === null ? SEED_DOCUMENTS : dc);
      setRequests(rq === null ? SEED_REQUESTS : rq);
      setDisciplinary(ds === null ? SEED_DISCIPLINARY : ds);
      setIncidents(inc === null ? SEED_INCIDENTS : inc);

      setLoaded(true);
    })();
  }, []);

  // Persist all state
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.settings, settings); }, [settings, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.employees, employees); }, [employees, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.payrollRuns, payrollRuns); }, [payrollRuns, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.leaveRecords, leaveRecords); }, [leaveRecords, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.attendance, attendance); }, [attendance, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.goals, goals); }, [goals, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.reviews, reviews); }, [reviews, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.jobs, jobs); }, [jobs, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.candidates, candidates); }, [candidates, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.courses, courses); }, [courses, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.enrollments, enrollments); }, [enrollments, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.documents, documents); }, [documents, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.requests, requests); }, [requests, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.disciplinary, disciplinary); }, [disciplinary, loaded]);
  useEffect(() => { if (loaded) storageSet(STORAGE_KEYS.incidents, incidents); }, [incidents, loaded]);

  // Load Google Fonts
  useEffect(() => {
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://fonts.googleapis.com/css2?family=Cormorant+Garamond:wght@400;500;600&family=DM+Sans:wght@400;500;600&display=swap';
    document.head.appendChild(link);
    return () => { try { document.head.removeChild(link); } catch (e) {} };
  }, []);

  const navSections = [
    {
      label: 'People',
      items: [
        { id: 'dashboard',   label: 'Dashboard',    icon: LayoutDashboard },
        { id: 'employees',   label: 'Employees',    icon: Users },
        { id: 'org',         label: 'Organization', icon: Network },
        { id: 'documents',   label: 'Documents',    icon: FileSignature },
      ],
    },
    {
      label: 'Time',
      items: [
        { id: 'attendance', label: 'Attendance', icon: ClipboardList },
        { id: 'leave',      label: 'Leave',      icon: CalendarDays },
      ],
    },
    {
      label: 'Performance',
      items: [
        { id: 'goals',    label: 'Goals & OKRs', icon: Target },
        { id: 'reviews',  label: 'Reviews',      icon: Award },
      ],
    },
    {
      label: 'Learning',
      items: [
        { id: 'training', label: 'Training', icon: GraduationCap },
      ],
    },
    {
      label: 'Recruit',
      items: [
        { id: 'recruitment', label: 'Recruitment', icon: Briefcase },
      ],
    },
    {
      label: 'Cases',
      items: [
        { id: 'requests',     label: 'Requests',     icon: Bell },
        { id: 'disciplinary', label: 'Disciplinary', icon: Flag },
        { id: 'safety',       label: 'Safety',       icon: HardHat },
      ],
    },
    {
      label: 'Payroll',
      items: [
        { id: 'payroll',    label: 'Payroll Run',   icon: Calculator },
        { id: 'payslips',   label: 'Payslips',      icon: FileText },
        { id: 'bank',       label: 'Bank Transfer', icon: Banknote },
        { id: 'compliance', label: 'Compliance',    icon: ShieldCheck },
      ],
    },
    {
      label: 'Insights',
      items: [
        { id: 'analytics', label: 'HR Analytics', icon: BarChart3 },
        { id: 'settings',  label: 'Settings',     icon: SettingsIcon },
      ],
    },
  ];

  if (!loaded) {
    return (
      <div className="min-h-screen bg-stone-100 flex items-center justify-center">
        <p className="text-stone-600 text-sm" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>Loading Mobica HR…</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-stone-100 flex" style={{ fontFamily: 'DM Sans, system-ui, sans-serif' }}>
      {/* Sidebar */}
      <aside className="w-64 bg-stone-900 text-stone-50 flex flex-col max-h-screen sticky top-0 overflow-y-auto">
        <div className="px-6 py-7 border-b border-stone-800">
          <h1 className="text-3xl tracking-tight" style={{ fontFamily: 'Cormorant Garamond, Georgia, serif', fontWeight: 400 }}>
            {settings.company.nameEn}
          </h1>
          <p className="text-xs text-amber-400 mt-1 uppercase tracking-[0.25em]" style={{ fontWeight: 500 }}>HR Suite</p>
        </div>
        <nav className="flex-1 py-2">
          {navSections.map((section, si) => (
            <div key={section.label} className={si > 0 ? 'mt-3 pt-3 border-t border-stone-800' : ''}>
              <p className="px-6 py-1 text-[9px] uppercase tracking-[0.25em] text-stone-500" style={{ fontWeight: 500 }}>{section.label}</p>
              {section.items.map(item => {
                const Icon = item.icon;
                return (
                  <button key={item.id} onClick={() => setView(item.id)}
                    className={`w-full text-left px-6 py-2 flex items-center gap-3 text-sm transition ${view === item.id ? 'bg-stone-800 text-amber-400 border-l-2 border-amber-400' : 'text-stone-400 hover:text-stone-100 hover:bg-stone-800'}`}
                    style={{ fontWeight: 500 }}>
                    <Icon size={14} />
                    {item.label}
                  </button>
                );
              })}
            </div>
          ))}
        </nav>
        <div className="px-6 py-4 border-t border-stone-800 text-[10px] text-stone-500 leading-relaxed">
          <p>Tax Year {settings.taxYear}</p>
          <p className="mt-1">Laws 91/2005, 148/2019, 14/2025</p>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto max-h-screen">
        {view === 'dashboard' && <DashboardView employees={employees} payrollRuns={payrollRuns} settings={settings} onNavigate={setView} />}
        {view === 'employees' && <EmployeesView employees={employees} setEmployees={setEmployees} settings={settings} />}
        {view === 'org' && <OrgChartView employees={employees} />}
        {view === 'documents' && <DocumentsView employees={employees} documents={documents} setDocuments={setDocuments} />}

        {view === 'attendance' && <AttendanceView employees={employees} attendance={attendance} setAttendance={setAttendance} />}
        {view === 'leave' && <LeaveView employees={employees} leaveRecords={leaveRecords} setLeaveRecords={setLeaveRecords} settings={settings} />}

        {view === 'goals' && <GoalsView employees={employees} goals={goals} setGoals={setGoals} />}
        {view === 'reviews' && <ReviewsView employees={employees} reviews={reviews} setReviews={setReviews} />}

        {view === 'training' && <TrainingView employees={employees} courses={courses} setCourses={setCourses} enrollments={enrollments} setEnrollments={setEnrollments} settings={settings} />}

        {view === 'recruitment' && <RecruitmentView jobs={jobs} setJobs={setJobs} candidates={candidates} setCandidates={setCandidates} />}

        {view === 'requests' && <RequestsView employees={employees} requests={requests} setRequests={setRequests} />}
        {view === 'disciplinary' && <DisciplinaryView employees={employees} disciplinary={disciplinary} setDisciplinary={setDisciplinary} />}
        {view === 'safety' && <SafetyView employees={employees} incidents={incidents} setIncidents={setIncidents} />}

        {view === 'payroll' && <PayrollRunView employees={employees} payrollRuns={payrollRuns} setPayrollRuns={setPayrollRuns} settings={settings} />}
        {view === 'payslips' && <PayslipsView employees={employees} payrollRuns={payrollRuns} settings={settings} />}
        {view === 'bank' && <BankTransferView payrollRuns={payrollRuns} settings={settings} />}
        {view === 'compliance' && <ComplianceView employees={employees} payrollRuns={payrollRuns} settings={settings} />}

        {view === 'analytics' && <AnalyticsView employees={employees} payrollRuns={payrollRuns} attendance={attendance} goals={goals} reviews={reviews} jobs={jobs} candidates={candidates} enrollments={enrollments} incidents={incidents} requests={requests} settings={settings} />}
        {view === 'settings' && <SettingsView settings={settings} setSettings={setSettings} />}
      </main>
    </div>
  );
}
