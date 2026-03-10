create table if not exists public.system_settings (
  key text primary key,
  value jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default timezone('utc', now())
);

insert into public.system_settings (key, value)
values
  (
    'admin_org_settings',
    jsonb_build_object(
      'orgName', '',
      'supportEmail', '',
      'whatsappNumber', null
    )
  ),
  (
    'admin_notification_settings',
    jsonb_build_object(
      'adminNotificationEmails', '[]'::jsonb,
      'bccTesterEnabled', false,
      'testerEmails', '[]'::jsonb,
      'bookingPaidRecipients', '[]'::jsonb,
      'overdueRecipients', '[]'::jsonb
    )
  ),
  (
    'rental_invoice_reminder_policy',
    jsonb_build_object(
      'remindersEnabled', true,
      'firstReminderDays', 3,
      'secondReminderDays', 7,
      'finalReminderDays', 14,
      'reminderGuardWindowHours', 24,
      'reminderBatchLimit', 50
    )
  )
on conflict (key) do nothing;
