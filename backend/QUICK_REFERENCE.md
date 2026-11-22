# AWS Elastic Beanstalk Deployment - Quick Reference Card

## 🚀 Quick Start (For Experienced Users)

```powershell
# 1. Configure AWS
aws configure

# 2. Build
cd backend && npm run build && cd ..
cd frontend && npm run build && cd ..

# 3. Initialize EB
eb init -p "Node.js 18 running on 64bit Amazon Linux 2" --region us-east-1 bdt-arena

# 4. Create environment
eb create BDTarena-env-prod --instance-type t3.medium --scale 2

# 5. Set environment variables
eb setenv NODE_ENV=production DATABASE_URL="..." REDIS_URL="..." JWT_ACCESS_SECRET="..." JWT_REFRESH_SECRET="..."

# 6. Deploy
eb deploy

# 7. Run migrations
eb ssh --force --command "cd /var/app/current && npm run migrate"

# 8. Verify
curl "$(eb open --print-url)/api/health"
```

---

## 📋 Step-by-Step Checklist

### Pre-Deployment
- [ ] AWS account created
- [ ] IAM user created with permissions
- [ ] AWS CLI configured (`aws configure`)
- [ ] EB CLI installed (`eb --version`)
- [ ] Git repository initialized
- [ ] Dependencies installed (`npm install`)
- [ ] Code builds successfully (`npm run build`)
- [ ] .env.production created with all values

### AWS Resources
- [ ] RDS database created (bdt-arena-db-prod)
- [ ] RDS security group allows traffic from EB
- [ ] Database endpoint noted
- [ ] Database password saved securely
- [ ] ElastiCache Redis created (bdt-arena-redis-prod)
- [ ] Redis security group allows traffic from EB
- [ ] Redis endpoint noted

### EB Deployment
- [ ] EB initialized (`eb init`)
- [ ] Environment created (`eb create`)
- [ ] Environment is "Ready" and "Green"
- [ ] Environment variables set (`eb setenv`)
- [ ] Application deployed (`eb deploy`)
- [ ] Health check passing (`/api/health` returns 200)

### Post-Deployment
- [ ] Database migrations run (`npm run migrate`)
- [ ] Frontend loads in browser
- [ ] API endpoints responding
- [ ] Logs visible in CloudWatch
- [ ] Auto-scaling configured
- [ ] HTTPS certificate configured
- [ ] Payment credentials configured
- [ ] Admin account created
- [ ] Backups scheduled

---

## 🔧 Essential Commands

### Elastic Beanstalk

| Command | Purpose |
|---------|---------|
| `eb init` | Initialize Elastic Beanstalk application |
| `eb create` | Create new environment |
| `eb deploy` | Deploy application |
| `eb terminate` | Delete environment |
| `eb status` | Check environment status |
| `eb health` | Detailed health information |
| `eb logs` | View logs |
| `eb logs --stream` | Stream logs in real-time |
| `eb ssh` | Connect to instance via SSH |
| `eb printenv` | View all environment variables |
| `eb setenv KEY=VALUE` | Set environment variable |
| `eb scale N` | Scale to N instances |
| `eb open` | Open application in browser |
| `eb abort` | Abort current deployment |
| `eb appversion` | List application versions |

### AWS CLI

| Command | Purpose |
|---------|---------|
| `aws configure` | Configure AWS credentials |
| `aws sts get-caller-identity` | Verify AWS credentials |
| `aws ec2 describe-instances` | List EC2 instances |
| `aws rds describe-db-instances` | List RDS databases |
| `aws elasticache describe-cache-clusters` | List Redis clusters |
| `aws logs tail /aws/elasticbeanstalk/...` | View CloudWatch logs |

### Database (via SSH)

```bash
# After: eb ssh --force

# Connect to database
psql -h $DATABASE_ENDPOINT -U admin -d bdt_arena

# Run SQL commands
SELECT * FROM users;
SELECT * FROM payments;
\dt  # List all tables
\q   # Quit
```

---

## 🔑 Environment Variables Reference

**Required Variables:**

```env
NODE_ENV=production                           # Environment name
DATABASE_URL=postgresql://...                # Database connection string
REDIS_URL=redis://...                        # Redis connection string
JWT_ACCESS_SECRET=...                        # 32+ char random string
JWT_REFRESH_SECRET=...                       # 32+ char random string
BACKEND_PORT=8081                            # Application port
PUBLIC_BACKEND_URL=https://...               # Public API URL
```

**Optional Variables:**

```env
PAYMENT_MODE=sandbox|production              # Default: sandbox
MARKET_MODE=simulated|real                   # Default: simulated
LOG_LEVEL=info|debug|error                   # Default: info
CORS_ORIGIN=https://yourdomain.com           # CORS allowlist
GMAIL_USER=your-email@gmail.com              # Email sender
GMAIL_APP_PASSWORD=...                       # Gmail app password
TWILIO_ACCOUNT_SID=...                       # Twilio credentials
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=...
BKASH_APP_KEY=...                            # Payment gateway
BKASH_APP_SECRET=...
NAGAD_APP_ID=...
NAGAD_APP_SECRET=...
```

---

## 🐛 Troubleshooting Guide

### Application Not Responding

**Check 1: Environment Status**
```powershell
eb status
```
Should show: `Status: Ready`, `Health: Green`

**Check 2: View Logs**
```powershell
eb logs --stream | Select-Object -Last 50
```

**Check 3: SSH & Diagnose**
```powershell
eb ssh --force
ps aux | grep node
npm start  # Try starting manually
```

### Database Connection Failed

**Check 1: Verify Connection String**
```powershell
eb printenv | grep DATABASE_URL
```

**Check 2: Security Group Rules**
- AWS Console → EC2 → Security Groups
- Find RDS security group
- Should allow inbound (TCP) port 5432 from EB security group

**Check 3: Test Connection**
```bash
# From EB instance
psql -h $DB_ENDPOINT -U admin -d bdt_arena -c "SELECT 1"
```

### Redis Connection Failed

**Check 1: Verify Connection String**
```powershell
eb printenv | grep REDIS_URL
```

**Check 2: Security Group Rules**
- AWS Console → ElastiCache → Cluster
- Check security group allows port 6379 from EB

**Check 3: Test Connection**
```bash
# From EB instance
redis-cli -h $REDIS_HOST ping
```

### High CPU Usage

**Check 1: Current CPU**
```powershell
eb health | grep CPUUtilization
```

**Check 2: View Metrics**
- AWS Console → CloudWatch → Dashboards

**Check 3: Optimize & Scale**
```powershell
# Scale to more instances
eb scale 3

# Or upgrade instance
eb config  # Edit InstanceType to larger size
```

### Out of Memory

**Quick Fix:**
```powershell
# Increase instance type
eb config
# Find: InstanceType: t3.medium
# Change to: InstanceType: t3.large
```

### 502 Bad Gateway

**Diagnosis:**
```powershell
eb logs --stream
# Look for: "Cannot GET /api/health" or errors
```

**Common Causes:**
1. Node modules not installed
2. Build failed
3. Environment variables missing
4. Port not set to 8081

**Fix:**
```powershell
eb ssh --force
cd /var/app/current
npm install
npm run build
# Then: eb deploy
```

---

## 📊 Performance Monitoring

### CPU & Memory
```powershell
# View current metrics
aws cloudwatch get-metric-statistics `
  --namespace AWS/EC2 `
  --metric-name CPUUtilization `
  --start-time (Get-Date).AddHours(-1) `
  --end-time (Get-Date) `
  --period 300 `
  --statistics Average
```

### Database Performance
```bash
# SSH to instance
eb ssh --force

# Connect to database
psql -h $DATABASE_ENDPOINT -U admin -d bdt_arena

# View slow queries
SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;

# Check connection count
SELECT count(*) FROM pg_stat_activity;
```

### Application Logs
```powershell
# Last 100 lines
eb logs

# Real-time stream
eb logs --stream

# All logs (zip file)
eb logs --all --zip

# Specific timeframe
eb logs --start-time "2024-01-15 10:00:00"
```

---

## 💾 Backup & Recovery

### RDS Backups

```bash
# Create manual snapshot
aws rds create-db-snapshot \
  --db-instance-identifier bdt-arena-db-prod \
  --db-snapshot-identifier snapshot-2024-01-15

# List snapshots
aws rds describe-db-snapshots \
  --db-instance-identifier bdt-arena-db-prod

# Restore from snapshot
aws rds restore-db-instance-from-db-snapshot \
  --db-instance-identifier bdt-arena-db-restored \
  --db-snapshot-identifier snapshot-2024-01-15
```

### EB Environment Rollback

```powershell
# List previous versions
eb appversion

# Rollback to previous version
eb deploy my-app-1234
```

---

## 🔐 Security Commands

### Update Security Groups

```bash
# Allow SSH (restrict to your IP only!)
aws ec2 authorize-security-group-ingress \
  --group-id sg-xxxxxxxx \
  --protocol tcp \
  --port 22 \
  --cidr 123.45.67.89/32  # Replace with your IP
```

### Enable Encryption

```bash
# Already done during setup, but verify:
aws rds describe-db-instances \
  --db-instance-identifier bdt-arena-db-prod \
  --query 'DBInstances[0].StorageEncrypted'
```

### View CloudTrail Logs

```bash
# List events
aws cloudtrail look-up-events \
  --lookup-attributes AttributeKey=ResourceName,AttributeValue=BDTarena-env
```

---

## 📞 Support & Documentation

- **AWS Documentation**: https://docs.aws.amazon.com/
- **EB CLI Reference**: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/eb-cli3.html
- **Node.js on EB**: https://docs.aws.amazon.com/elasticbeanstalk/latest/dg/create-deploy-nodejs.html
- **AWS Support**: https://console.aws.amazon.com/support/center/
- **Stack Overflow**: `[amazon-elastic-beanstalk]` tag

---

## 💡 Tips & Best Practices

1. **Always use environment variables** for sensitive data (no hardcoding)
2. **Tag your resources** for better organization and cost tracking
3. **Use read replicas** for database backups and analytics
4. **Enable CloudWatch alarms** for critical metrics
5. **Test rollback procedures** regularly
6. **Keep application logs for 30+ days** for debugging
7. **Use VPC** for network security and isolation
8. **Enable VPC Flow Logs** for network troubleshooting
9. **Automate deployments** using CodePipeline
10. **Monitor costs** with AWS Billing & Cost Management

---

## 🎯 Common Scenarios

### Deploying Code Changes

```powershell
# Make code changes
# Then:
cd backend && npm run build && cd ..
git add .
git commit -m "Update feature XYZ"
eb deploy
```

### Adding New Environment Variable

```powershell
eb setenv NEW_VAR="new_value"
# Application automatically restarts
```

### Scaling Up for High Traffic

```powershell
# Temporary: Scale instances
eb scale 4  # Scale to 4 instances

# Permanent: Change auto-scaling policies
eb config  # Edit MaxSize
```

### Emergency Rollback

```powershell
eb appversion  # See version history
eb deploy version-id-from-list
```

### SSH Debugging

```powershell
eb ssh --force
cd /var/app/current
npm start  # Start app manually
# Check actual error messages
```

---

## 📝 Deployment Log Template

```
Date: _______________
Environment: _______________
Deployer: _______________

Pre-Deployment:
- [ ] Code compiled
- [ ] Tests passed
- [ ] Environment variables prepared

Deployment:
- Started: _______________
- Completed: _______________
- Duration: _______________

Post-Deployment:
- [ ] Health check passed
- [ ] Logs verified
- [ ] Admin notified

Issues (if any):
_________________________________
_________________________________

Resolution:
_________________________________
_________________________________
```

---

**Last Updated:** 2024-01-15
**Version:** 1.0
**Status:** Production Ready ✅
