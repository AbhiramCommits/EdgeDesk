import type { RequestCategory, RequestPriority, RequestStatus, UserRole } from "shared";

export interface SeedUser {
  id: string;
  email: string;
  name: string;
  role: UserRole;
}

export interface SeedRequest {
  id: string;
  requesterId: string;
  title: string;
  body: string;
  category: RequestCategory;
  priority: RequestPriority;
  status: RequestStatus;
  assigneeId: string | null;
  resolution?: string;
}

export const SEED_USERS: SeedUser[] = [
  {
    id: "seed_user_ada",
    email: "ada.lovelace@edgedesk.test",
    name: "Ada Lovelace",
    role: "employee",
  },
  {
    id: "seed_user_grace",
    email: "grace.hopper@edgedesk.test",
    name: "Grace Hopper",
    role: "employee",
  },
  {
    id: "seed_user_linus",
    email: "linus.torvalds@edgedesk.test",
    name: "Linus Torvalds",
    role: "employee",
  },
  {
    id: "seed_user_priya",
    email: "priya.raman@edgedesk.test",
    name: "Priya Raman",
    role: "people_ops",
  },
  {
    id: "seed_user_marcus",
    email: "marcus.chen@edgedesk.test",
    name: "Marcus Chen",
    role: "people_ops",
  },
  {
    id: "seed_user_sasha",
    email: "sasha.ivanov@edgedesk.test",
    name: "Sasha Ivanov",
    role: "admin",
  },
];

function req(
  n: number,
  requesterId: string,
  category: RequestCategory,
  priority: RequestPriority,
  status: RequestStatus,
  title: string,
  body: string,
  assigneeId: string | null,
  resolution?: string,
): SeedRequest {
  return {
    id: `seed_req_${String(n).padStart(3, "0")}`,
    requesterId,
    title,
    body,
    category,
    priority,
    status,
    assigneeId,
    ...(resolution ? { resolution } : {}),
  };
}

const ADA = "seed_user_ada";
const GRACE = "seed_user_grace";
const LINUS = "seed_user_linus";
const PRIYA = "seed_user_priya";
const MARCUS = "seed_user_marcus";
const SASHA = "seed_user_sasha";

export const SEED_REQUESTS: SeedRequest[] = [
  // ---- equipment (10) ----
  req(1, ADA, "equipment", "p2", "resolved", "Replace failing laptop battery", "My ThinkPad battery drains in under an hour and shuts down randomly. I need a replacement battery or a loaner laptop this week.", PRIYA, "Replacement battery shipped; loaner picked up on the same day."),
  req(2, GRACE, "equipment", "p1", "in_progress", "Second monitor for pair programming", "I am pairing most afternoons and would like a 27-inch monitor plus a USB-C dock so I can keep my laptop closed.", MARCUS),
  req(3, LINUS, "equipment", "p3", "new", "Standing desk conversion", "Requesting a sit-stand desk converter for my home office setup. No urgency, whenever the next batch arrives.", null),
  req(4, ADA, "equipment", "p0", "resolved", "Laptop stolen while travelling", "My work laptop was stolen from the hotel lobby. I need a replacement machine imaged today and the old device wiped remotely.", SASHA, "Remote wipe confirmed, replacement laptop couriered and collected."),
  req(5, GRACE, "equipment", "p2", "in_progress", "Noise cancelling headset", "The open office is loud and my current headset has a broken microphone. Requesting a replacement headset.", PRIYA),
  req(6, LINUS, "equipment", "p2", "awaiting_info", "Docking station compatibility", "I have a new MacBook and my old dock does not charge it. Can you confirm which dock model works before shipping one?", MARCUS),
  req(7, ADA, "equipment", "p1", "resolved", "Keyboard replacement", "Several keys on my keyboard are unresponsive. I need a replacement keyboard to keep working.", PRIYA, "Keyboard swapped at the IT bar."),
  req(8, GRACE, "equipment", "p3", "new", "Ergonomic mouse request", "My wrist has been sore; requesting a vertical ergonomic mouse.", null),
  req(9, LINUS, "equipment", "p2", "resolved", "Webcam for customer calls", "The built-in camera on my desktop monitor is poor quality. Requesting an external 1080p webcam.", MARCUS, "Webcam delivered and installed."),
  req(10, ADA, "equipment", "p1", "in_progress", "Loaner charger for offsite", "Travelling to a customer site next week and my charger is frayed. Need a replacement charger before Monday.", PRIYA),
  // ---- onboarding (10) ----
  req(11, PRIYA, "onboarding", "p2", "in_progress", "New hire starting Monday", "We have a new backend engineer starting Monday. Please prepare laptop, accounts, and a buddy assignment.", MARCUS),
  req(12, GRACE, "onboarding", "p1", "resolved", "Onboarding buddy for design hire", "Our new product designer starts Wednesday and needs a buddy plus the first-week schedule.", PRIYA, "Buddy assigned and welcome calendar sent."),
  req(13, LINUS, "onboarding", "p2", "new", "Dev environment bootstrap for intern", "An intern joins next month. They need GitHub, staging VPN, and the standard dev environment set up.", null),
  req(14, PRIYA, "onboarding", "p0", "resolved", "New hire has no laptop on day one", "The new sales rep arrived this morning without a laptop. This is blocking their first-day training.", SASHA, "Spare laptop issued within two hours."),
  req(15, MARCUS, "onboarding", "p2", "in_progress", "Welcome kit shipping to Berlin", "Please ship the welcome kit and swag to our Berlin hire before their start date.", PRIYA),
  req(16, GRACE, "onboarding", "p3", "awaiting_info", "Orientation session recording", "Can we get the orientation recording added to the onboarding hub for future hires?", MARCUS),
  req(17, ADA, "onboarding", "p2", "resolved", "First-week checklist access", "I am helping onboard a teammate and cannot open the first-week checklist. Please grant access.", PRIYA, "Checklist shared as a document link."),
  req(18, LINUS, "onboarding", "p1", "in_progress", "Contractor onboarding paperwork", "A contractor starts Thursday and still needs the NDA and equipment agreement processed.", MARCUS),
  req(19, GRACE, "onboarding", "p2", "new", "Team introduction calendar", "Please add our new hire to the weekly team intro calendar and the buddy rotation.", null),
  req(20, ADA, "onboarding", "p2", "resolved", "Onboarding swag size exchange", "The hoodie in the welcome kit is the wrong size. Can it be exchanged?", PRIYA, "Exchange arranged with the vendor."),
  // ---- policy (10) ----
  req(21, ADA, "policy", "p2", "resolved", "Remote work policy for new country", "I am relocating to Portugal for three months. What does the remote work policy allow for international work?", PRIYA, "Pointed to the international remote-work policy and approved 90 days."),
  req(22, GRACE, "policy", "p3", "new", "Parental leave policy question", "Where can I find the current parental leave policy and the notice period for extending it?", null),
  req(23, LINUS, "policy", "p2", "in_progress", "Expense policy for client dinners", "What is the reimbursement limit for client dinners while travelling? The handbook section is unclear.", MARCUS),
  req(24, ADA, "policy", "p1", "resolved", "Travel policy exception request", "My flight exceeds the economy class policy because of a medical need. How do I request an exception?", PRIYA, "Exception approved by People-Ops and Finance."),
  req(25, GRACE, "policy", "p2", "awaiting_info", "Sick leave documentation", "Do I need a doctor's note for a three-day sick leave under the current policy?", MARCUS),
  req(26, LINUS, "policy", "p3", "new", "Holiday calendar for next year", "Please share next year's company holiday calendar and any regional variations.", null),
  req(27, ADA, "policy", "p2", "resolved", "Code of conduct training deadline", "When is the code of conduct training due, and is it mandatory for contractors?", PRIYA, "Training assigned; deadline shared with the team."),
  req(28, GRACE, "policy", "p1", "in_progress", "Bereavement leave policy", "A family member passed away. What bereavement leave am I entitled to and how do I request it?", MARCUS),
  req(29, LINUS, "policy", "p2", "resolved", "Equipment return policy", "What is the policy for returning equipment when someone leaves the company?", PRIYA, "Shared the offboarding equipment checklist."),
  req(30, ADA, "policy", "p3", "rejected", "Pet policy in the office", "Can I bring my dog to the office on Fridays under the workplace policy?", MARCUS, "Request declined: office is not pet-friendly."),
  // ---- access (10) ----
  req(31, ADA, "access", "p1", "resolved", "GitHub repo access for analytics", "Please grant me write access to the analytics repository so I can merge dashboards.", PRIYA, "Added to the analytics team in GitHub."),
  req(32, GRACE, "access", "p0", "in_progress", "Locked out of SSO", "I am locked out of SSO and cannot log in to any internal tool. I have a customer demo in one hour.", SASHA),
  req(33, LINUS, "access", "p2", "new", "VPN access for contractor", "A new contractor needs VPN access to the staging environment for the next six weeks.", null),
  req(34, ADA, "access", "p1", "resolved", "Admin rights on staging database", "I need temporary admin rights on the staging database to run a migration.", MARCUS, "Temporary admin granted for 24 hours."),
  req(35, GRACE, "access", "p2", "in_progress", "Jira project permissions", "I cannot edit tickets in the hiring project. Please add me to the correct Jira role.", PRIYA),
  req(36, LINUS, "access", "p1", "awaiting_info", "Password reset for payroll portal", "The payroll portal keeps rejecting my password and the reset email never arrives.", MARCUS),
  req(37, ADA, "access", "p2", "resolved", "Shared mailbox access", "Please add me to the people-ops shared mailbox so I can answer candidate questions.", PRIYA, "Mailbox delegation added."),
  req(38, GRACE, "access", "p0", "resolved", "Production deploy permission blocked", "The release is blocked because I do not have deploy permission for the production project in CI.", SASHA, "Deploy role granted and release unblocked."),
  req(39, LINUS, "access", "p3", "new", "Read-only access to finance dashboard", "Requesting read-only access to the finance dashboard for quarterly planning.", null),
  req(40, ADA, "access", "p2", "rejected", "Personal laptop on corporate network", "Can I connect my personal laptop to the corporate network for side projects?", MARCUS, "Denied: personal devices are not permitted on the corporate network."),
  // ---- payroll (10) ----
  req(41, ADA, "payroll", "p1", "resolved", "Missing overtime on payslip", "My last payslip is missing approved overtime hours. Please correct it before the next payroll run.", PRIYA, "Payroll correction processed with the next cycle."),
  req(42, GRACE, "payroll", "p2", "in_progress", "Direct deposit account change", "I need to update my direct deposit account for next month's salary payment.", MARCUS),
  req(43, LINUS, "payroll", "p2", "new", "W-4 tax withholding update", "Please send instructions for updating my tax withholding on the payroll portal.", null),
  req(44, ADA, "payroll", "p0", "in_progress", "Salary not paid this month", "My salary did not arrive today and rent is due. Please check the payroll run urgently.", SASHA),
  req(45, GRACE, "payroll", "p1", "resolved", "Bonus calculation question", "My quarterly bonus looks lower than the plan. Can someone explain the calculation?", PRIYA, "Payroll reviewed the calculation and issued a correction."),
  req(46, LINUS, "payroll", "p3", "resolved", "Payslip PDF access", "How do I download older payslip PDFs from the payroll portal?", MARCUS, "Sent step-by-step instructions."),
  req(47, ADA, "payroll", "p2", "awaiting_info", "Reimbursement for home internet", "I use my home internet for on-call. How do I claim the monthly reimbursement?", PRIYA),
  req(48, GRACE, "payroll", "p2", "resolved", "401k contribution percentage", "I want to raise my 401k contribution from 5% to 8% starting next quarter.", MARCUS, "Updated in the benefits portal."),
  req(49, LINUS, "payroll", "p2", "resolved", "Expense report stuck in review", "My travel expense report has been pending for two weeks and I need it paid.", PRIYA, "Report approved and reimbursed."),
  req(50, ADA, "payroll", "p3", "rejected", "Advance on next month's salary", "Can I get an advance on next month's salary for a home deposit?", SASHA, "Declined under the salary advance policy."),
  // ---- other (10) ----
  req(51, ADA, "other", "p2", "in_progress", "Need help finding the right team", "I have a question that does not fit any of the usual categories. Who should I talk to about workplace planning?", SASHA),
  req(52, GRACE, "other", "p3", "new", "Office plant watering schedule", "The plants near the kitchen look dry. Is there a facilities rota for watering them?", null),
  req(53, LINUS, "other", "p2", "resolved", "Conference ticket reimbursement", "I bought a conference ticket with my personal card. Which team handles reimbursement?", PRIYA, "Expense submitted under travel and reimbursed."),
  req(54, ADA, "other", "p1", "new", "Desk move coordination", "Our team is reorganising seats next week and we need facilities to help move monitors and docks.", null),
  req(55, GRACE, "other", "p2", "awaiting_info", "Not sure who owns this request", "I need something updated in the org chart but I am not sure whether that is People-Ops or IT.", MARCUS),
  req(56, LINUS, "other", "p3", "resolved", "Lost access badge", "I lost my building badge. Not urgent because I work remotely this week, but I need a replacement eventually.", SASHA, "Temporary badge issued; permanent replacement ordered."),
  req(57, ADA, "other", "p2", "in_progress", "Team offsite planning help", "We are planning a team offsite and need help with venue contracts and budget approval.", PRIYA),
  req(58, GRACE, "other", "p2", "resolved", "Recognition award nomination", "How do I nominate a teammate for the quarterly recognition award?", MARCUS, "Shared the nomination form and deadline."),
  req(59, LINUS, "other", "p1", "in_progress", "Workplace accommodation request", "I need an ergonomic assessment and a quiet workspace accommodation. I am not sure which process applies.", SASHA),
  req(60, ADA, "other", "p3", "rejected", "Personal mail delivery", "Can personal packages be delivered to the office address?", MARCUS, "Declined: personal deliveries are not accepted."),
];
