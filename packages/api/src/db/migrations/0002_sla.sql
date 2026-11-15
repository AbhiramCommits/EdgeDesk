-- Second migration: SLA tracking, the open-request view, and the small
-- reference tables the triage agent's tools read (policy KB + equipment stock).
-- Proves migration ordering against local D1 (0001 then 0002).

ALTER TABLE requests ADD COLUMN due_at TEXT;
ALTER TABLE requests ADD COLUMN sla_breached INTEGER NOT NULL DEFAULT 0;
ALTER TABLE requests ADD COLUMN resolved_at TEXT;
ALTER TABLE requests ADD COLUMN draft_resolution TEXT;

CREATE INDEX idx_requests_due_at ON requests(due_at);

CREATE VIEW v_open_requests AS
SELECT
  r.id,
  r.title,
  r.category,
  r.priority,
  r.status,
  r.due_at,
  r.created_at,
  r.updated_at,
  ru.name AS requester_name,
  au.name AS assignee_name,
  CASE
    WHEN r.due_at IS NOT NULL
      AND r.status NOT IN ('resolved', 'rejected')
      AND r.due_at < strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
    THEN 1
    ELSE 0
  END AS is_overdue
FROM requests r
JOIN users ru ON ru.id = r.requester_id
LEFT JOIN users au ON au.id = r.assignee_id
WHERE r.status NOT IN ('resolved', 'rejected');

CREATE TABLE policy_kb (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  category TEXT NOT NULL CHECK (
    category IN ('equipment', 'onboarding', 'policy', 'access', 'payroll', 'other')
  ),
  tags TEXT NOT NULL DEFAULT ''
);

CREATE TABLE equipment_inventory (
  sku TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  category TEXT NOT NULL,
  quantity INTEGER NOT NULL DEFAULT 0,
  location TEXT NOT NULL DEFAULT 'SF-HQ'
);

INSERT INTO policy_kb (id, title, body, category, tags) VALUES
('kb_pto', 'Paid time off and vacation', 'Full-time employees accrue 20 days of PTO per year. Submit requests in the HR portal at least two weeks ahead for absences longer than three days. Unused PTO carries over up to five days.', 'policy', 'pto vacation time off leave accrual carryover'),
('kb_remote', 'Remote and international work', 'Employees may work remotely up to 20 days per year without approval. International work beyond 30 days requires a People-Ops review for tax and payroll implications.', 'policy', 'remote work international relocation abroad tax'),
('kb_travel', 'Travel and expense policy', 'Book economy travel through the corporate travel tool. Meals are reimbursed up to 75 USD per day with receipts. Client dinners above 150 USD need director approval.', 'policy', 'travel expense reimbursement receipts flight hotel meals'),
('kb_sick', 'Sick leave', 'Sick leave is separate from PTO. Notify your manager on the first day. A doctor note is required only for absences longer than five consecutive days.', 'policy', 'sick leave illness doctor note absence'),
('kb_parental', 'Parental leave', 'All parents receive 16 weeks of paid parental leave. Notify People-Ops at least 30 days before the intended start date. Leave may be split into two blocks within the first year.', 'policy', 'parental leave maternity paternity adoption newborn'),
('kb_bereavement', 'Bereavement leave', 'Employees may take up to five paid days for the loss of an immediate family member and up to two days for extended family. Notify your manager and People-Ops as soon as possible.', 'policy', 'bereavement grief death family funeral'),
('kb_conduct', 'Code of conduct', 'The code of conduct training is mandatory for all employees and contractors within 30 days of joining. Report concerns confidentially to the ethics line.', 'policy', 'code conduct training ethics harassment mandatory'),
('kb_equipment_return', 'Equipment return and offboarding', 'Return laptops, chargers, badges, and peripherals on or before your last day. People-Ops ships a prepaid box for remote employees. Devices are wiped after return.', 'equipment', 'equipment return offboarding laptop charger badge wipe'),
('kb_reimbursement', 'Expense reimbursement', 'Submit expenses within 30 days with itemized receipts. Approved reports are paid in the next payroll cycle. Home internet stipends are 50 USD per month with a provider invoice.', 'payroll', 'expense reimbursement receipt payroll internet stipend'),
('kb_payroll_cycle', 'Payroll cycle and corrections', 'Salaries are paid on the 25th, or the previous business day when the 25th falls on a weekend. Corrections submitted before the 15th appear in that month''s run.', 'payroll', 'payroll salary payday correction payslip direct deposit'),
('kb_tax', 'Tax withholding and W-4', 'Update federal withholding in the payroll portal under Tax Documents. Changes submitted before the 10th apply to the current month. People-Ops cannot give tax advice.', 'payroll', 'tax w-4 withholding federal state deduction'),
('kb_benefits', 'Benefits and 401k', 'Elections open during the annual enrollment window. The company matches 401k contributions up to 6 percent. Contribution changes can be made quarterly in the benefits portal.', 'payroll', 'benefits 401k retirement match enrollment contribution'),
('kb_access', 'Accounts and access provisioning', 'Request access through People-Ops with a manager approval. Access is granted by least privilege and reviewed quarterly. Production admin access requires a security review.', 'access', 'access provisioning account permissions least privilege admin'),
('kb_sso', 'SSO and password reset', 'Use the self-service password reset on the SSO login page. If you are locked out, People-Ops can issue a temporary password valid for one hour after identity verification.', 'access', 'sso login password reset locked mfa vpn'),
('kb_onboarding', 'New hire onboarding checklist', 'Before day one: laptop imaged, accounts provisioned, buddy assigned, and welcome kit shipped. On day one: orientation, security training, and first-week plan. Check progress in the onboarding hub.', 'onboarding', 'onboarding new hire first day checklist buddy orientation'),
('kb_accommodation', 'Workplace accommodations', 'Employees can request ergonomic equipment or workplace adjustments through People-Ops. Requests are reviewed confidentially and do not require a diagnosis.', 'other', 'accommodation ergonomic accessibility workplace adjustment');

INSERT INTO equipment_inventory (sku, name, category, quantity, location) VALUES
('eq_laptop_thinkpad', 'ThinkPad T14 Gen 4 laptop', 'laptop', 7, 'SF-HQ'),
('eq_laptop_macbook', 'MacBook Pro 14 laptop', 'laptop', 3, 'SF-HQ'),
('eq_monitor_27', '27-inch 4K monitor', 'monitor', 12, 'SF-HQ'),
('eq_monitor_dell', 'Dell UltraSharp 27 monitor', 'monitor', 0, 'NYC'),
('eq_keyboard', 'Logitech MX Keys keyboard', 'keyboard', 18, 'SF-HQ'),
('eq_mouse', 'Logitech Ergo vertical mouse', 'mouse', 9, 'SF-HQ'),
('eq_headset', 'Jabra Evolve2 headset', 'headset', 4, 'SF-HQ'),
('eq_dock', 'CalDigit TS4 USB-C dock', 'dock', 6, 'SF-HQ'),
('eq_charger', 'USB-C 96W charger', 'charger', 25, 'SF-HQ'),
('eq_webcam', 'Logitech Brio 4K webcam', 'webcam', 2, 'SF-HQ'),
('eq_chair', 'Herman Miller Aeron chair', 'chair', 0, 'SF-HQ');
