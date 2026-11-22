# BDT Arena - AWS Elastic Beanstalk Step-By-Step Deployment

**Complete Guide: From Zero to Production in AWS**

---

## ⏱️ Time Estimate: 2-3 hours total

---

## SECTION 1: Pre-Deployment Setup (30-45 minutes)

### Step 1.1: Install Required Tools

#### For Windows Users:

**1. AWS CLI v2**
- Download: https://awscli.amazonaws.com/AWSCLIV2.msi
- Run installer and follow wizard
- Verify: Open PowerShell and run:
  ```powershell
  aws --version
  ```

**2. EB CLI**
- Open PowerShell as Administrator
- Run:
  ```powershell
  pip install awsebcli --upgrade --user
  ```
- Verify:
  ```powershell
  eb --version
  ```

**3. Git (if not installed)**
- Download: https://git-scm.com/download/win
- Run installer and follow wizard
- Verify:
  ```powershell
  git --version
  ```

**4. PowerShell for better experience:**
- Already included with Windows 10/11
- All commands in this guide use PowerShell format

---

### Step 1.2: Create AWS Account & User

**1. Create AWS Account**
- Visit: https://aws.amazon.com
- Click "Create an AWS Account"
- Complete registration with email and credit card
- Verify email and phone

**2. Create IAM User for Deployment**
- Visit: https://console.aws.amazon.com/iam/home
- Click "Users" in left sidebar
- Click "Create user"
- Name: `bdt-arena-deployer`
- ✓ Check "Provide user access to AWS Management Console"
- Select "I want to create an IAM user"
- Set custom password

**3. Attach Permissions to User**
Still in IAM console:
- Find your newly created user
- Click on the user name
- Click "Add permissions" → "Add permissions"
- Select "Attach policies directly"
- Search and check these policies:
  - AmazonElasticBeanstalkFullAccess
  - AmazonRDSFullAccess
  - AmazonElastiCacheFullAccess
  - AmazonEC2FullAccess
  - CloudWatchFullAccess
  - IAMReadOnlyAccess
  - AWSCloudFormationFullAccess
  - AmazonS3FullAccess
- Click "Next" → "Add permissions"

**4. Create Access Key**
- In IAM console, go to "Security credentials" tab
- Click "Create access key"
- Select "Command Line Interface (CLI)"
- ✓ Acknowledge warning
- Click "Create access key"
- **Save the CSV file - you'll need it!**

---

### Step 1.3: Configure AWS CLI

**Step 1: Open PowerShell**

**Step 2: Run configuration**
```powershell
aws configure
```

**Step 3: Enter credentials (from the CSV file you saved)**
```
AWS Access Key ID: [PASTE from CSV]
AWS Secret Access Key: [PASTE from CSV]
Default region name: us-east-1
Default output format: json
```

**Step 4: Verify configuration**
```powershell
aws sts get-caller-identity
```

Should show your account information.

---

### Step 1.4: Prepare Application Code

**Step 1: Navigate to project directory**
```powershell
cd C:\Users\Lenovo\Downloads\BDT_Arena\BDT-Arena-Docker
```

**Step 2: Verify git repository**
```powershell
git status
```

Should show you're on the main branch.

**Step 3: Install dependencies**
```powershell
# Backend
cd backend
npm install
npm run build
cd ..

# Frontend
cd frontend
npm install
npm run build
cd ..
```

**Step 4: Verify builds**
```powershell
ls backend/dist/
ls frontend/dist/
```

Should see `index.js` and `index.html` respectively.

---

## SECTION 2: AWS Resource Creation (45 minutes)

### Step 2.1: Create RDS Database

**Option A: Using Interactive Script (RECOMMENDED)**

```powershell
cd backend
bash eb-deploy-interactive.sh
```

Then select option "3) Create RDS Database"

**Option B: Using AWS Console (Manual)**

1. Go to: https://console.aws.amazon.com/rds
2. Click "Create database"
3. Engine: PostgreSQL
4. Version: 15.3
5. Template: Production
6. DB instance identifier: `bdt-arena-db-prod`
7. Master username: `admin`
8. Master password: Generate strong password (save it!)
   ```powershell
   # Generate in PowerShell:
   [convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes((1..32 | ForEach-Object {[char](Get-Random -Minimum 33 -Maximum 126)}) -join ''))
   ```
9. DB instance class: `db.t3.small`
10. Storage: 100 GB SSD
11. Multi-AZ: Yes
12. Backup retention: 30 days
13. Click "Create database"
14. **Wait 10 minutes for creation**

**After RDS is Created:**
- Go to RDS console
- Click on database
- Copy the **Endpoint** (looks like: `bdt-arena-db-prod.xxxxx.us-east-1.rds.amazonaws.com`)
- Save this endpoint

---

### Step 2.2: Create ElastiCache Redis

**Step 1: Go to ElastiCache Console**
- Visit: https://console.aws.amazon.com/elasticache

**Step 2: Click "Create cluster"**

**Step 3: Configure**
- Cluster engine: Redis
- Name: `bdt-arena-redis-prod`
- Node type: `cache.t3.micro`
- Number of nodes: 1
- Port: 6379
- Create new subnet group
- Enable encryption at rest and in transit
- Click "Create"

**Step 4: Wait for creation (5-10 minutes)**

**Step 5: Get endpoint**
- Go back to ElastiCache console
- Click on your cluster
- Copy the **Primary Endpoint** (looks like: `bdt-arena-redis-prod.xxxxx.ng.0001.use1.cache.amazonaws.com`)
- Save this endpoint

---

### Step 2.3: Update Environment File

**Step 1: Open the environment file**
```powershell
cd C:\Users\Lenovo\Downloads\BDT_Arena\BDT-Arena-Docker
notepad .env.production
```

**Step 2: Add these values (replace with your actual values)**
```env
# Application
NODE_ENV=production
TZ=Asia/Dhaka
LOG_LEVEL=info

# Server
BACKEND_PORT=8081
PUBLIC_BACKEND_URL=https://bdt-arena-api.elasticbeanstalk.com
CORS_ORIGIN=https://yourdomain.com

# Database (from RDS setup)
DATABASE_URL=postgresql://admin:YOUR_RDS_PASSWORD@bdt-arena-db-prod.xxxxx.us-east-1.rds.amazonaws.com:5432/bdt_arena

# JWT Secrets (generate strong random strings)
JWT_ACCESS_SECRET=generate-this-with-crypto
JWT_REFRESH_SECRET=generate-this-with-crypto

# Payment
PAYMENT_MODE=sandbox
BKASH_APP_KEY=your-key
BKASH_APP_SECRET=your-secret
NAGAD_APP_ID=your-id
NAGAD_APP_SECRET=your-secret

# Email (Gmail)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=gmail-app-password

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=your-twilio-number

# Redis (from ElastiCache)
REDIS_URL=redis://bdt-arena-redis-prod.xxxxx.ng.0001.use1.cache.amazonaws.com:6379

# Market
MARKET_MODE=simulated
```

**Step 3: To generate JWT secrets:**
```powershell
# Run in PowerShell to generate JWT_ACCESS_SECRET
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"

# Run this to generate JWT_REFRESH_SECRET
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

Copy the output and paste into .env.production

---

## SECTION 3: Deploy to Elastic Beanstalk (60 minutes)

### Step 3.1: Initialize Elastic Beanstalk (One-time)

```powershell
cd C:\Users\Lenovo\Downloads\BDT_Arena\BDT-Arena-Docker

eb init -p "Node.js 18 running on 64bit Amazon Linux 2" `
  --region us-east-1 `
  --instance-profile aws-elasticbeanstalk-ec2-role `
  bdt-arena
```

**When prompted:**
- Application name: `BDT_Arena`
- Select region: `1) us-east-1`

**Result: Creates `.elasticbeanstalk/` directory**

---

### Step 3.2: Create Elastic Beanstalk Environment

**Step 1: Build the application**
```powershell
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..
```

**Step 2: Commit to git**
```powershell
git add .
git commit -m "Initial deployment to production"
```

**Step 3: Create environment**
```powershell
eb create BDTarena-env-prod `
  --instance-type t3.medium `
  --scale 2 `
  --elb-type application `
  --envvars NODE_ENV=production,PAYMENT_MODE=sandbox,MARKET_MODE=simulated
```

**This will:**
- Create 2x t3.medium EC2 instances
- Create Load Balancer
- Configure security groups
- Deploy your application
- **Takes 10-15 minutes**

**Step 4: Monitor progress**
```powershell
eb status
```

Keep running this until you see:
```
Environment Status: Ready
Health: Green
```

---

### Step 3.3: Configure Environment Variables

**Step 1: Set environment variables from your .env.production**

```powershell
eb setenv `
  NODE_ENV=production `
  BACKEND_PORT=8081 `
  DATABASE_URL="postgresql://admin:PASSWORD@endpoint:5432/bdt_arena" `
  REDIS_URL="redis://endpoint:6379" `
  JWT_ACCESS_SECRET="your-generated-secret"  `
  JWT_REFRESH_SECRET="your-generated-secret" `
  PAYMENT_MODE=sandbox `
  GMAIL_USER="your-email@gmail.com" `
  GMAIL_APP_PASSWORD="your-app-password" `
  TWILIO_ACCOUNT_SID="your-sid" `
  TWILIO_AUTH_TOKEN="your-token" `
  TWILIO_PHONE_NUMBER="your-phone" `
  LOG_LEVEL=info `
  TZ=Asia/Dhaka `
  MARKET_MODE=simulated
```

**Step 2: Verify variables**
```powershell
eb printenv
```

Should show all the variables you just set.

---

### Step 3.4: Deploy Application

```powershell
eb deploy
```

**Monitor deployment:**
```powershell
eb logs --stream
```

Press Ctrl+C when you see:
```
Successfully created environment BDTarena-env
```

---

### Step 3.5: Run Database Migrations

**Step 1: Connect to instance**
```powershell
eb ssh --force
```

You'll see a prompt like:
```
[ec2-user@ip-xxx-xxx-xxx-xxx ~]$
```

**Step 2: Navigate to application**
```bash
cd /var/app/current
```

**Step 3: Run migrations**
```bash
npm run migrate
```

You should see output like:
```
Running migration: 001_initial_schema.sql
Running migration: 002_add_payments.sql
...
All migrations completed!
```

**Step 4: Seed database (optional - create sample data)**
```bash
npm run seed
```

**Step 5: Exit connection**
```bash
exit
```

---

## SECTION 4: Verification (15 minutes)

### Step 4.1: Test Application Health

```powershell
# Get application URL
$url = eb open --print-url

# Test health endpoint
curl "$url/api/health"
```

Should return:
```json
{"status":"ok","db":"ok","redis":"ok","timestamp":"2024-01-15T10:30:00Z"}
```

---

### Step 4.2: Test Frontend

```powershell
# Open in browser
eb open
```

Should load the React application.

Check browser console for errors (F12 → Console tab).

---

### Step 4.3: View Logs

```powershell
# View last 100 lines
eb logs

# Stream logs in real-time
eb logs --stream

# Download all logs to zip file
eb logs --all --zip
```

---

### Step 4.4: Check AWS CloudWatch

1. Go to: https://console.aws.amazon.com/cloudwatch
2. Click "Dashboards"
3. Find "BDT-Arena" dashboard
4. Verify these metrics:
   - CPU Utilization: < 50%
   - Network In/Out: Should show traffic
   - Number of Instances: Should show 2

---

## SECTION 5: Post-Deployment Configuration

### Step 5.1: Configure Payment Gateways

1. Get credentials from bKash and Nagad
2. In AWS Console → Secrets Manager:
   - Create secret `bdt-arena/payments/bkash` with your keys
   - Create secret `bdt-arena/payments/nagad` with your keys
3. Update .env.production with the secrets
4. Redeploy: `eb deploy`

---

### Step 5.2: Configure Email Service

1. Enable Gmail 2-Factor Authentication
2. Create App Password: https://myaccount.google.com/apppasswords
3. Set `GMAIL_APP_PASSWORD` to the generated password
4. Update with: `eb setenv GMAIL_USER="your-email@gmail.com"`

---

### Step 5.3: Configure SMS Service

1. Create Twilio account: https://www.twilio.com
2. Get credentials from Twilio console
3. Set environment variables:
   ```powershell
   eb setenv `
	 TWILIO_ACCOUNT_SID="your-sid" `
	 TWILIO_AUTH_TOKEN="your-token" `
	 TWILIO_PHONE_NUMBER="your-twilio-number"
   ```

---

### Step 5.4: Create Admin Account

```powershell
# SSH into instance
eb ssh --force

# Run admin creation script
cd /var/app/current
npm run create-admin -- --email admin@example.com --password securepassword

# Exit
exit
```

---

## SECTION 6: Monitoring & Maintenance

### Regular Commands

```powershell
# Check status
eb status

# View current environment variables
eb printenv

# View logs in real-time
eb logs --stream

# SSH into instance for debugging
eb ssh --force

# Scale instances (if needed)
eb scale 3  # Scale to 3 instances

# Describe environment details
eb printenv --json

# Abort failed deployment
eb abort

# Terminate environment (when done)
eb terminate
```

---

### Troubleshooting Quick Reference

| Problem | Solution |
|---------|----------|
| Database connection error | Check SECURITY GROUPS allow traffic from EB to RDS on port 5432 |
| Redis connection error | Check SECURITY GROUPS allow traffic from EB to ElastiCache on port 6379 |
| 502 Bad Gateway | Check logs: `eb logs --stream` |
| High CPU usage | Increase instance type or optimize queries |
| Application timeout | Check database and Redis connectivity |
| Out of memory | Upgrade instance type or reduce Node.js heap size |

---

### Emergency Operations

**Rollback to previous version:**
```powershell
eb appversion
eb deploy [version-id]
```

**Rebuild entire environment:**
```powershell
eb terminate BDTarena-env-prod
# Then redeploy with: eb create BDTarena-env-prod ...
```

---

## SECTION 7: Costs & Optimization

### Estimated Monthly Costs
- EC2 (2x t3.medium): ~$100
- RDS (db.t3.small, Multi-AZ): ~$200
- ElastiCache (cache.t3.micro): ~$20
- Data Transfer: ~$50
- **Total: ~$370/month**

### Cost Optimization
- Use Reserved Instances: Save 30-50%
- Use Spot Instances: Save up to 90% (for non-critical)
- Right-size instances based on actual usage
- Enable auto-scaling to avoid over-provisioning
- Use RDS Read Replicas only if needed

---

## SECTION 8: Security Checklist

- [ ] Change all default passwords
- [ ] Enable Multi-Factor Authentication (MFA) for AWS account
- [ ] Use IAM roles for EC2 instances
- [ ] Configure Security Groups properly
- [ ] Enable encryption at rest (RDS, S3)
- [ ] Enable encryption in transit (HTTPS/TLS)
- [ ] Set up CloudTrail for audit logs
- [ ] Configure VPC with public/private subnets
- [ ] Use Secrets Manager for credentials
- [ ] Enable WAF (Web Application Firewall)
- [ ] Regular security patches

---

## Final Check: Everything Working?

✅ Application loads in browser: `YES / NO`
✅ `/api/health` returns 200: `YES / NO`
✅ Logs visible in CloudWatch: `YES / NO`
✅ Can login to admin: `YES / NO`
✅ Payment endpoints responding: `YES / NO`
✅ Database connected: `YES / NO`
✅ Redis connected: `YES / NO`

If all above are YES, your deployment is successful! 🎉

---

## Getting Help

**Documentation:**
- AWS Elastic Beanstalk: https://docs.aws.amazon.com/elasticbeanstalk/
- EB CLI Reference: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html
- RDS Documentation: https://docs.aws.amazon.com/rds/
- ElastiCache Guide: https://docs.aws.amazon.com/elasticache/

**Support Resources:**
- AWS Support Center: https://console.aws.amazon.com/support/
- AWS Forum: https://forums.aws.amazon.com/
- Stack Overflow: Tag `amazon-elastic-beanstalk`

---

**Deployment Date:** `_____________`
**Environment:** `_____________`
**Application URL:** `_____________`
**Admin Email:** `_____________`
**Admin Password:** `_____________` (Save securely!)

---

**🎉 Congratulations! Your application is now live on AWS Elastic Beanstalk!**
