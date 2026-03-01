export interface TimelineAction {
  timestamp: number;
  label: string;
}

export interface PullRequest {
  number: number;
  title: string;
  url: string;
  branch: string;
}

export interface DemoRun {
  id: string;
  title: string;
  summary: string;
  status: string;
  source: string;
  commitSha: string;
  timestamp: number;
  durationMs: number;
  routesTested: string[];
  actions: TimelineAction[];
  pr: PullRequest;
}

export const DEMO_RUNS: DemoRun[] = [
  {
    id: "demo-1",
    title: "Add user authentication flow",
    summary:
      "Recorded sign-up, sign-in, and password reset flows across 4 routes with form validation and error states.",
    status: "completed",
    source: "github-pr",
    commitSha: "a3f8c12",
    timestamp: Date.now() - 1000 * 60 * 60 * 2,
    durationMs: 34000,
    routesTested: ["/sign-in", "/sign-up", "/forgot-password", "/dashboard"],
    actions: [
      { timestamp: 0, label: "Navigated to /sign-up" },
      { timestamp: 3200, label: "Typed name into input" },
      { timestamp: 5800, label: "Typed email address" },
      { timestamp: 8400, label: "Typed password" },
      { timestamp: 10000, label: 'Clicked "Sign up" button' },
      { timestamp: 12500, label: "Redirected to /dashboard" },
      { timestamp: 15000, label: "Clicked sign out" },
      { timestamp: 17000, label: "Navigated to /sign-in" },
      { timestamp: 19500, label: "Typed email address" },
      { timestamp: 22000, label: "Typed password" },
      { timestamp: 24000, label: 'Clicked "Sign in" button' },
      { timestamp: 26000, label: "Redirected to /dashboard" },
      { timestamp: 28000, label: 'Clicked "Forgot password" link' },
      { timestamp: 30000, label: "Typed email for reset" },
      { timestamp: 32000, label: 'Clicked "Send reset link"' },
      { timestamp: 34000, label: "Verified success message" },
    ],
    pr: {
      number: 42,
      title: "Add user authentication flow",
      url: "https://github.com/glimpse-dev/glimpse/pull/42",
      branch: "feat/auth",
    },
  },
  {
    id: "demo-2",
    title: "Redesign pricing page",
    summary:
      "Captured responsive layout changes on the pricing page, including toggle between monthly and annual billing.",
    status: "completed",
    source: "manual",
    commitSha: "e7b2d09",
    timestamp: Date.now() - 1000 * 60 * 60 * 18,
    durationMs: 21000,
    routesTested: ["/pricing"],
    actions: [
      { timestamp: 0, label: "Navigated to /pricing" },
      { timestamp: 2000, label: "Scrolled to plan comparison" },
      { timestamp: 5000, label: "Toggled to annual billing" },
      { timestamp: 7500, label: "Toggled back to monthly" },
      { timestamp: 10000, label: "Resized viewport to tablet" },
      { timestamp: 13000, label: "Verified responsive layout" },
      { timestamp: 15000, label: "Resized viewport to mobile" },
      { timestamp: 17500, label: 'Clicked "Get started" on Pro plan' },
      { timestamp: 19000, label: "Verified checkout redirect" },
      { timestamp: 21000, label: "Screenshot captured" },
    ],
    pr: {
      number: 38,
      title: "Redesign pricing page with annual toggle",
      url: "https://github.com/glimpse-dev/glimpse/pull/38",
      branch: "feat/pricing-redesign",
    },
  },
  {
    id: "demo-3",
    title: "Fix checkout validation bug",
    summary:
      "Verified that credit card validation no longer rejects valid Amex cards on the checkout page.",
    status: "completed",
    source: "github-pr",
    commitSha: "4d1fa88",
    timestamp: Date.now() - 1000 * 60 * 60 * 46,
    durationMs: 12000,
    routesTested: ["/checkout", "/checkout/confirm"],
    actions: [
      { timestamp: 0, label: "Navigated to /checkout" },
      { timestamp: 2000, label: "Filled shipping address" },
      { timestamp: 4500, label: "Entered Amex card number" },
      { timestamp: 6000, label: "Entered expiry and CVV" },
      { timestamp: 7500, label: 'Clicked "Pay now"' },
      { timestamp: 9000, label: "Redirected to /checkout/confirm" },
      { timestamp: 10500, label: "Verified order confirmation" },
      { timestamp: 12000, label: "Screenshot captured" },
    ],
    pr: {
      number: 45,
      title: "Fix Amex card validation regex",
      url: "https://github.com/glimpse-dev/glimpse/pull/45",
      branch: "fix/amex-validation",
    },
  },
];
