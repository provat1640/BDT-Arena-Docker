# AWS Elastic Beanstalk Deployment - Step-by-Step Guide

## Table of Contents
1. [Prerequisites](#prerequisites)
2. [AWS Account Setup](#aws-account-setup)
3. [Prepare Application](#prepare-application)
4. [Create RDS Database](#create-rds-database)
5. [Create ElastiCache Redis](#create-elasticache-redis)
6. [Create Elastic Beanstalk Application](#create-elastic-beanstalk-application)
7. [Deploy Application](#deploy-application)
8. [Run Migrations](#run-migrations)
9. [Verification](#verification)
10. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Software
Before starting, install the following tools:

```bash
# Check if installed
aws --version
eb --version
node --version
npm --version
git --version
```

### If Not Installed:

**1. AWS CLI v2**
```bash
# Windows (via installer)
https://awscli.amazonaws.com/AWSCLIV2.msi

# macOS (via Homebrew)
brew install awscli

# Linux
curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip"
unzip awscliv2.zip
sudo ./aws/install
```

**2. Elastic Beanstalk CLI**
```bash
pip install awsebcli --upgrade --user
```

**3. Node.js & npm**
```bash
# Visit https://nodejs.org/ (LTS version 18 or higher)
# For Windows: Download installer
# For macOS: brew install node
# For Linux: Use NodeSource repository
```

**4. Git**
```bash
# Windows: https://git-scm.com/download/win
# macOS: brew install git
# Linux: sudo apt-get install git (Ubuntu/Debian)
```

---

## AWS Account Setup

### Step 1: Create AWS Account
1. Visit https://aws.amazon.com
2. Click "Create an AWS Account"
3. Follow the registration process
4. Add payment method
5. Verify phone/email

### Step 2: Create IAM User for Deployment
1. Go to AWS Console → IAM → Users
2. Click "Create user"
3. Enter username: `bdt-arena-deployer`
4. Check "Provide user access to AWS Management Console"
5. Set password or auto-generate
6. **Attach Permissions**:
   - AmazonElasticBeanstalkFullAccess
   - AmazonRDSFullAccess
   - AmazonElastiCacheFullAccess
   - AmazonEC2FullAccess
   - CloudWatchFullAccess
   - IAMReadOnlyAccess
7. Click "Create user"
8. Download CSV with credentials
9. **Keep this file secure!**

### Step 3: Configure AWS CLI
```bash
aws configure

# When prompted, enter:
# AWS Access Key ID: [From CSV file]
# AWS Secret Access Key: [From CSV file]
# Default region name: us-east-1 (or your preferred region)
# Default output format: json
```

**Verify configuration:**
```bash
aws sts get-caller-identity
# Should show your account ID and user ARN
```

---

## Prepare Application

### Step 1: Clone/Update Repository
```bash
cd C:\Users\Lenovo\Downloads\BDT_Arena\BDT-Arena-Docker

# Make sure you're on main branch
git status
git checkout main
git pull origin main
```

### Step 2: Install Dependencies
```bash
# Backend
cd backend
npm install
npm run build

# Frontend
cd ../frontend
npm install
npm run build

# Return to root
cd ..
```

### Step 3: Verify Build
```bash
# Check if build artifacts exist
ls -la backend/dist/
ls -la frontend/dist/

# Should see index.js in backend/dist/
# Should see index.html in frontend/dist/
```

### Step 4: Create Production Environment File
```bash
# Create .env.production in root or use AWS Secrets Manager
# Copy from .env.example as template
cp .env.example .env.production
```

**Edit `.`.env.production` and set these values:**

```bash
# Application
NODE_ENV=production
TZ=Asia/Dhaka
LOG_LEVEL=info

# Server
BACKEND_PORT=8081
PUBLIC_BACKEND_URL=https://bdt-arena-api.elasticbeanstalk.com
CORS_ORIGIN=https://yourdomain.com

# Database (will configure after RDS creation)
DATABASE_URL=postgresql://admin:PASSWORD@bdt-arena-db.XXXXX.us-east-1.rds.amazonaws.com:5432/bdt_arena

# JWT (Generate secure random strings)
JWT_ACCESS_SECRET=your-secure-random-string-min-32-chars
JWT_REFRESH_SECRET=another-secure-random-string-min-32-chars

# Payment (Keep as sandbox initially)
PAYMENT_MODE=sandbox
BKASH_APP_KEY=your-key
BKASH_APP_SECRET=your-secret
# ... other payment keys

# Email (Gmail)
GMAIL_USER=your-email@gmail.com
GMAIL_APP_PASSWORD=your-app-specific-password

# SMS (Twilio)
TWILIO_ACCOUNT_SID=your-sid
TWILIO_AUTH_TOKEN=your-token
TWILIO_PHONE_NUMBER=your-twilio-number

# Redis (will configure after ElastiCache creation)
REDIS_URL=redis://your-elasticache-endpoint:6379

# Market
MARKET_MODE=simulated
```

**To generate secure JWT secrets:**
```bash
node -e "console.log('JWT_ACCESS_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('JWT_REFRESH_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

---

## Create RDS Database

### Option A: Using AWS Console (GUI)

**Step 1: Navigate to RDS**
1. Go to AWS Console → RDS
2. Click "Databases" → "Create database"

**Step 2: Configure Database**
- **Engine**: PostgreSQL
- **Version**: 15.3
- **Template**: Free tier (development) or Production
- **DB instance identifier**: `bdt-arena-db-prod`
- **Master username**: `admin`
- **Master password**: Generate strong password (save it!)
  ```bash
  # Generate 32-char password
  openssl rand -base64 32
  ```

**Step 3: Instance Configuration**
- **DB instance class**: 
  - Development: db.t3.micro
  - Production: db.t3.small or larger
- **Storage**: 100 GB SSD
- **Storage autoscaling**: Enable

**Step 4: Connectivity**
- **VPC**: (Create the EB VPC first, or use default)
- **Public accessibility**: No (for security)
- **VPC security group**: Create new → `bdt-arena-db-sg`

**Step 5: Database Options**
- **Database name**: `bdt_arena`
- **Port**: 5432
- **Parameter group**: default

**Step 6: Backup**
- **Backup retention period**: 
  - Development: 7 days
  - Production: 30 days
- **Backup window**: 03:00-04:00 UTC

**Step 7: Create Database**
- Click "Create database"
- **Wait 5-10 minutes for creation**

### Option B: Using AWS CLI

```bash
# Create RDS database
aws rds create-db-instance \
  --db-instance-identifier bdt-arena-db-prod \
  --db-instance-class db.t3.small \
  --engine postgres \
  --engine-version 15.3 \
  --master-username admin \
  --master-user-password "$(openssl rand -base64 32)" \
  --allocated-storage 100 \
  --storage-type gp3 \
  --db-name bdt_arena \
  --backup-retention-period 30 \
  --multi-az \
  --storage-encrypted \
  --enable-cloudwatch-logs-exports postgresql \
  --region us-east-1

# Get database endpoint
aws rds describe-db-instances \
  --db-instance-identifier bdt-arena-db-prod \
  --region us-east-1 \
  --query 'DBInstances[0].Endpoint'
```

### Step 3: Test Database Connection

**Get connection details:**
1. Go to AWS Console → RDS → Databases
2. Click on `bdt-arena-db-prod`
3. Copy the **Endpoint** (e.g., `bdt-arena-db-prod.xxxxx.us-east-1.rds.amazonaws.com`)
4. Copy the **Port** (5432)

**Test connection (using psql):**
```bash
# Install PostgreSQL client (optional, for testing)
# Windows: https://www.postgresql.org/download/windows/
# macOS: brew install postgresql
# Linux: sudo apt-get install postgresql-client

# Test connection
psql -h bdt-arena-db-prod.xxxxx.us-east-1.rds.amazonaws.com \
	 -U admin \
	 -d bdt_arena \
	 -c "SELECT 1"
```

**Save these details for later:**
```
DB_ENDPOINT: bdt-arena-db-prod.xxxxx.us-east-1.rds.amazonaws.com
DB_PORT: 5432
DB_NAME: bdt_arena
DB_USER: admin
DB_PASSWORD: [your-generated-password]
```

---

## Create ElastiCache Redis

### Option A: Using AWS Console

**Step 1: Navigate to ElastiCache**
1. Go to AWS Console → ElastiCache
2. Click "Clusters" → "Create cluster"

**Step 2: Configure Cluster**
- **Cluster engine**: Redis
- **Engine version**: 7.0 (or latest)
- **Node type**: 
  - Development: cache.t3.micro
  - Production: cache.t3.small
- **Number of nodes**: 1

**Step 3: Cluster Details**
- **Cluster identifier**: `bdt-arena-redis-prod`
- **Port**: 6379
- **Parameter group**: default
- **Parameter group family**: redis7

**Step 4: Subnet Group**
- **Subnet group name**: Create new → `bdt-arena-redis-subnet`
- **VPC ID**: Same as EB VPC
- Select **Private subnets only**

**Step 5: Security**
- **VPC security groups**: Create new → `bdt-arena-redis-sg`
- **Encryption at rest**: Enable
- **Encryption in transit**: Enable
- **Auth token**: Generate strong token

**Step 6: Create Cluster**
- Click "Create"
- **Wait 5-10 minutes for creation**

### Option B: Using AWS CLI

```bash
# Create ElastiCache cluster
aws elasticache create-cache-cluster \
  --cache-cluster-id bdt-arena-redis-prod \
  --cache-node-type cache.t3.micro \
  --engine redis \
  --engine-version 7.0 \
  --num-cache-nodes 1 \
  --port 6379 \
  --cache-security-group-ids sg-xxxxxxxx \
  --region us-east-1

# Get endpoint
aws elasticache describe-cache-clusters \
  --cache-cluster-id bdt-arena-redis-prod \
  --show-cache-node-info \
  --region us-east-1
```

### Step 3: Save Connection Details

**Get connection details:**
1. Go to AWS Console → ElastiCache → Clusters
2. Click on `bdt-arena-redis-prod`
3. Copy the **Primary Endpoint** (e.g., `bdt-arena-redis-prod.xxxxx.ng.0001.use1.cache.amazonaws.com:6379`)

**Save for later:**
```
REDIS_URL: redis://bdt-arena-redis-prod.xxxxx.ng.0001.use1.cache.amazonaws.com:6379
```

---

## Create Elastic Beanstalk Application

### Step 1: Initialize EB Application

```bash
# Navigate to project root
cd C:\Users\Lenovo\Downloads\BDT_Arena\BDT-Arena-Docker

# Initialize Elastic Beanstalk
eb init -p "Node.js 18 running on 64bit Amazon Linux 2" \
  --region us-east-1 \
  --instance-profile aws-elasticbeanstalk-ec2-role \
  bdt-arena

# When prompted:
# - Application name: BDT_Arena
# - CodeCommit: No (we'll use git directly)
# - SSH: No (configure later if needed)
```

**Verify initialization:**
```bash
ls -la .elasticbeanstalk/
# Should see config.yml
```

### Step 2: Create Elastic Beanstalk Environment

```bash
# Create load-balanced environment
eb create BDTarena-env \
  --instance-type t3.medium \
  --scale 2 \
  --elb-type application \
  --envvars NODE_ENV=production,PAYMENT_MODE=sandbox,MARKET_MODE=simulated

# OR for simpler single-instance setup (development)
eb create BDTarena-env \
  --single \
  --instance-type t3.medium
```

**This will:**
- Create EC2 instances
- Create load balancer
- Configure security groups
- Deploy application
- **Wait 10-15 minutes for environment creation**

### Step 3: Monitor Creation Progress

```bash
# Check status
eb status

# View logs in real-time
eb logs --stream

# Expected output:
# Environment name: BDTarena-env
# Status: Creating (wait until "Ready")
# Health: Green (indicates healthy)
```

**Wait until you see:**
```
Status: Ready
Health: Green
```

---

## Configure Environment Variables

### Step 1: Set Environment Variables via EB CLI

```bash
# Set all environment variables at once
eb setenv \
  NODE_ENV=production \
  BACKEND_PORT=8081 \
  PUBLIC_BACKEND_URL=https://bdt-arena-api.elasticbeanstalk.com \
  CORS_ORIGIN=https://yourdomain.com \
  DATABASE_URL="postgresql://admin:YOUR_PASSWORD@bdt-arena-db-prod.xxxxx.us-east-1.rds.amazonaws.com:5432/bdt_arena" \
  JWT_ACCESS_SECRET="your-secure-jwt-access-secret" \
  JWT_REFRESH_SECRET="your-secure-jwt-refresh-secret" \
  PAYMENT_MODE=sandbox \
  GMAIL_USER="your-email@gmail.com" \
  GMAIL_APP_PASSWORD="your-gmail-app-password" \
  TWILIO_ACCOUNT_SID="your-twilio-sid" \
  TWILIO_AUTH_TOKEN="your-twilio-token" \
  TWILIO_PHONE_NUMBER="your-twilio-phone" \
  REDIS_URL="redis://bdt-arena-redis-prod.xxxxx.ng.0001.use1.cache.amazonaws.com:6379" \
  LOG_LEVEL=info \
  TZ=Asia/Dhaka \
  MARKET_MODE=simulated
```

### Step 2: Verify Environment Variables (via Console)

1. Go to AWS Console → Elastic Beanstalk
2. Click "Applications" → "BDT_Arena"
3. Click "Environments" → "BDTarena-env"
4. Click "Configuration"
5. Under "Software" → "Environment properties"
6. Verify all variables are set

### Step 3: Update Environment Variables (if needed)

```bash
# View current settings
eb printenv

# Update specific variable
eb setenv PAYMENT_MODE=production

# Remove variable (if needed)
eb printenv | grep VARIABLE_NAME
```

---

## Deploy Application

### Step 1: Prepare Deployment Package

```bash
# Navigate to project root
cd C:\Users\Lenovo\Downloads\BDT_Arena\BDT-Arena-Docker

# Make sure everything is built
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# Commit to git (EB uses git history)
git add .
git commit -m "Deploy to production"
```

### Step 2: Deploy Application

```bash
# Simple deployment
eb deploy

# OR with specific region/environment
eb deploy BDTarena-env --region us-east-1

# With specific message
eb deploy -m "Production deployment v1.0.0"
```

**Deployment will:**
- Zip application files
- Upload to S3
- Create new application version
- Deploy to EC2 instances
- Run health checks
- **Takes 5-10 minutes**

### Step 3: Monitor Deployment

```bash
# Check current status
eb status

# Stream logs during deployment
eb logs --stream

# Expected final status:
# Status: Ready
# Health: Green
```

**Troubleshoot if not green:**
```bash
# View full error logs
eb logs | tail -100

# SSH into instance for debugging
eb ssh
```

---

## Run Database Migrations

### Step 1: SSH into EB Instance

```bash
# Connect to instance
eb ssh

# You should see prompt similar to:
# [ec2-user@ip-xxx-xxx-xxx-xxx]~$
```

### Step 2: Navigate to Application

```bash
# Change to application directory
cd /var/app/current

# List files
ls -la

# Should see: backend/, frontend/, package.json, etc.
```

### Step 3: Run Migrations

```bash
# Run database migrations
npm run migrate

# Run database seed (creates sample data)
npm run seed

# You should see output like:
# Running migration: 001_initial_schema.sql
# Running migration: 002_add_payments.sql
# ...
# All migrations completed!
```

### Step 4: Verify Database

```bash
# Connect to database from instance
psql -h bdt-arena-db-prod.xxxxx.us-east-1.rds.amazonaws.com \
	 -U admin \
	 -d bdt_arena \
	 -c "\dt"

# Should list all tables:
# users, wallets, ledgers, payments, admin_users, etc.
```

### Step 5: Exit SSH Session

```bash
exit
```

---

## Verification

### Step 1: Check Application Health

```bash
# Get application URL
APP_URL=$(eb open --print-url)
echo $APP_URL

# Should output something like:
# http://BDTarena-env.xxxxx.elasticbeanstalk.com
```

### Step 2: Test Health Endpoint

```bash
# Test API health
curl https://$APP_URL/api/health

# Should return:
# {"status":"ok","db":"ok","redis":"ok","timestamp":"2024-01-15T10:30:00Z"}
```

### Step 3: Test Frontend

```bash
# Open application in browser
eb open

# Should load React frontend
# Check browser console for errors (F12 → Console)
```

### Step 4: Test Payment Endpoint

```bash
# Test payment API
curl -X POST https://$APP_URL/api/payments/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -d '{
	"amount": 1000,
	"gateway": "bkash"
  }'

# Should return payment initiation response
```

### Step 5: Monitor Logs

```bash
# View recent logs
eb logs

# Stream logs in real-time
eb logs --stream --all

# Download all logs to file
eb logs --all --zip
```

### Step 6: Check CloudWatch Metrics

1. Go to AWS Console → CloudWatch
2. Click "Dashboards"
3. Find "BDT-Arena" dashboard
4. Verify metrics:
   - CPU Utilization (should be < 50% at rest)
   - Network In/Out (should show traffic)
   - Instances (should show 2 running)

---

## Auto-Scaling Configuration

### Step 1: View Current Auto-Scaling

```bash
# Check configuration
eb config
```

### Step 2: Update Scaling Policy

```bash
# Edit config file
eb config

# Find section:
# aws:autoscaling:asg:
#   MinSize: 2
#   MaxSize: 6

# Modify and save (in your editor, usually vim)
# Press :wq to save and exit
```

### Step 3: Configure Scaling Triggers

1. Go to AWS Console → EC2 → Auto Scaling Groups
2. Find "awseb-BDTarena-env-AutoScalingGroup"
3. Click "Scaling policies"
4. Add scaling policy:
   - **Scale up when CPU > 80%**
   - **Scale down when CPU < 20%**

---

## HTTPS/SSL Configuration

### Step 1: Create SSL Certificate (ACM)

1. Go to AWS Console → Certificate Manager
2. Click "Request a certificate"
3. Enter domain: `bdt-arena-api.example.com`
4. Choose DNS validation
5. Add to Route 53 DNS records (if using Route 53)
6. Wait for "Issued" status

### Step 2: Apply Certificate to Load Balancer

1. Go to AWS Console → EC2 → Load Balancers
2. Find elastic load balancer for "BDTarena-env"
3. Click "Listeners"
4. Add listener:
   - Protocol: HTTPS
   - Port: 443
   - SSL Certificate: Select the one just created
5. Edit HTTP listener:
   - Add redirect rule: HTTP → HTTPS (301)

---

## Troubleshooting

### Problem: Environment Creation Failed

```bash
# View error logs
eb logs --all

# Check specific errors
eb status --verbose

# Rebuild environment
eb create BDTarena-env-2 --instance-type t3.medium
```

### Problem: Database Connection Error

```bash
# Verify DATABASE_URL is correct
eb printenv | grep DATABASE_URL

# Check RDS security group
# Must allow traffic from EB security group on port 5432

# Test connection from EB instance
eb ssh
psql -h [DB_ENDPOINT] -U admin -d bdt_arena -c "SELECT 1"
```

### Problem: Redis Connection Error

```bash
# Verify REDIS_URL is correct
eb printenv | grep REDIS_URL

# Check ElastiCache security group rules
# Must allow traffic from EB security group on port 6379

# Test connection
redis-cli -h [REDIS_ENDPOINT] ping
```

### Problem: Application Returns 502 Bad Gateway

```bash
# Application crashed, view logs
eb logs --stream

# Common causes:
# 1. Database connection string wrong
# 2. PORT environment variable not set (should be 8081)
# 3. Node modules not installed
# 4. Build failed

# Rebuild and redeploy
npm run build
eb deploy
```

### Problem: High CPU Usage

1. Go to CloudWatch → Dashboards
2. Check CPU metric
3. If > 80% for extended period:
   - Increase instance type: `eb scale 2` then update config
   - Optimize database queries
   - Enable Redis caching
   - Check for memory leaks

### Problem: Database is Slow

```bash
# SSH into database instance and check:
psql -h [DB_ENDPOINT] -U admin -d bdt_arena

# Check slow queries
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

# Create missing indexes
CREATE INDEX idx_payments_user_id ON payments(user_id);
CREATE INDEX idx_ledgers_wallet_id ON ledgers(wallet_id);
```

### Problem: Out of Memory

```bash
# Check memory usage
free -h

# Increase swap space
sudo fallocate -l 2G /swapfile
sudo chmod 600 /swapfile
sudo mkswap /swapfile
sudo swapon /swapfile

# Or upgrade to larger instance type
eb scale 2
# Then modify instance type in EB config
eb config
```

### Emergency Rollback

```bash
# List previous versions
eb appversion

# Rollback to previous version
eb deploy my-app-1234

# Full environment rebuild
eb terminate BDTarena-env
eb create BDTarena-env (with corrected configuration)
```

---

## Post-Deployment Checklist

- [ ] Application loads in browser
- [ ] `/api/health` returns 200 status
- [ ] Database migrations completed successfully
- [ ] Can login with test credentials
- [ ] Payment endpoints respond (in sandbox mode)
- [ ] Admin dashboard accessible
- [ ] Logs visible in CloudWatch
- [ ] Auto-scaling policies configured
- [ ] SSL/HTTPS certificate applied
- [ ] Daily backups scheduled
- [ ] Monitoring alerts set up
- [ ] Load balancer health checks passing

---

## Monitoring & Maintenance

### Daily Tasks
```bash
# Check environment health
eb status

# Review recent logs
eb logs
```

### Weekly Tasks
- Review CloudWatch metrics
- Check error rates
- Monitor database performance
- Test backup restoration

### Monthly Tasks
- Update application code
- Review and update security groups
- Verify backups are working
- Check AWS cost usage

### Command Reference

```bash
# General
eb init              # Initialize EB app
eb create            # Create environment
eb deploy            # Deploy changes
eb terminate         # Delete environment

# Monitoring
eb status            # Check environment status
eb logs              # View logs
eb logs --stream     # Stream logs in real-time
eb health            # Detailed health info
eb printenv          # View all env variables

# Configuration
eb config            # Edit environment config
eb setenv KEY=VALUE  # Set environment variable
eb scale 3           # Scale to 3 instances

# SSH
eb ssh               # Connect to instance
eb ssh --force       # Force connection
eb ssh -- ls -la     # Run command on instance

# Cleanup
eb terminate         # Delete environment
eb appversion        # List versions
eb abort              # Abort ongoing deployment
```

---

## Support Resources

- **AWS Documentation**: https://docs.aws.amazon.com/elasticbeanstalk/
- **Node.js Deployment**: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-nodejs.html
- **RDS Documentation**: https://docs.aws.amazon.com/rds/
- **ElastiCache Guide**: https://docs.aws.amazon.com/elasticache/
- **EB CLI Reference**: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html

---

## Common Configuration Files

### `.elasticbeanstalk/config.yml`
```yaml
branch-defaults:
  main:
	environment: BDTarena-env

environment-defaults:
  BDTarena-env:
	branch: main
	group_suffix: null

global:
  application_name: BDT_Arena
  default_platform: Node.js 18 running on 64bit Amazon Linux 2
  default_region: us-east-1
  include_git_submodules: true
  instance_profile: null
  platform_name: null
  platform_version: null
  sc: git
  workspace_type: Application
```

### `.ebignore`
```
.git
.gitignore
.env
.env.local
node_modules/
*.log
.DS_Store
.vscode/
.idea/
*.swp
coverage/
frontend/node_modules/
backend/node_modules/
```

---

**Next Steps After Deployment:**
1. Set up custom domain (Route 53)
2. Configure payment gateway credentials
3. Set up email/SMS providers
4. Create admin account
5. Test end-to-end workflows
6. Monitor first 24 hours for issues
7. Enable CloudTrail for audit logs
8. Set up backup restoration testing
