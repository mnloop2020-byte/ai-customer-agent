# Automation Scheduler

This project can run follow-up sequences automatically through a protected API route.

## Required env var

```env
AUTOMATION_SECRET="replace_with_long_random_secret"
SMTP_HOST="smtp.your-provider.com"
SMTP_PORT="587"
SMTP_USER="your_smtp_user"
SMTP_PASS="your_smtp_password"
SMTP_FROM_EMAIL="sales@your-company.com"
SMTP_FROM_NAME="MNtechnique"
SMTP_SECURE="false"
```

## Protected endpoint

```text
POST /api/automation/follow-ups/run
```

## Auth modes

1. Logged-in dashboard user  
   The route can be called from inside the app UI.

2. External scheduler  
   Send a bearer token plus the company slug:

```json
{
  "companySlug": "mntechnique"
}
```

## PowerShell example

```powershell
Invoke-WebRequest -Uri "http://localhost:3000/api/automation/follow-ups/run" `
  -Method POST `
  -Headers @{
    Authorization = "Bearer YOUR_AUTOMATION_SECRET"
    "Content-Type" = "application/json"
  } `
  -Body '{"companySlug":"mntechnique"}'
```

## cURL example

```bash
curl -X POST "http://localhost:3000/api/automation/follow-ups/run" \
  -H "Authorization: Bearer YOUR_AUTOMATION_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"companySlug":"mntechnique"}'
```

## What happens when it runs

- Finds due scheduled follow-ups
- Attempts delivery by email when the lead has an email path
- Marks tasks as `SENT`, `FAILED`, or internal-only based on delivery result
- Writes a `SYSTEM` message into the latest conversation
- Re-opens or updates the conversation status
- Updates the lead workflow state
- Records an `AuditLog`
- Creates a human handoff automatically when delivery fails
