# BDT Arena Deployment Configuration
# AWS Elastic Beanstalk Setup

## Application Configuration

### Basic Details
```
Application Name: BDT_Arena
Environment Name: BDTarena-env
Domain Prefix: bdt-arena-api
```

### Platform Configuration
```
Platform: Node.js 18 running on 64bit Amazon Linux 2
Instance Class: t3.medium (recommended minimum)
```

### Deployment Mode
```
Choose: Load Balanced (for scalability and high availability)
Min Instances: 2
Max Instances: 6
```

## Environment Variables

All variables below should be set in Elastic Beanstalk console under:
Configuration → Software → Environment properties

### Application
```
NODE_ENV=production
TZ=Asia/Dhaka
LOG_LEVEL=info
```

### Server
```
BACKEND_PORT=8081
FRONTEND_PORT=80
PUBLIC_BACKEND_URL=https://bdt-arena-api.elasticbeanstalk.com
CORS_ORIGIN=https://bdt-arena.example.com
```

### Database
```
DATABASE_URL=postgresql://[user]:[password]@[rds-endpoint]:5432/bdt_arena
POSTGRES_DB=bdt_arena
POSTGRES_USER=admin
POSTGRES_PASSWORD=[GENERATE_SECURE_PASSWORD]
```

### JWT Secrets (Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
```
JWT_ACCESS_SECRET=[GENERATE_SECURE_VALUE]
JWT_REFRESH_SECRET=[GENERATE_SECURE_VALUE]
JWT_ACCESS_TTL=15m
JWT_REFRESH_TTL=7d
```

### Payment Gateways
```
PAYMENT_MODE=production
BKASH_APP_KEY=[YOUR_BKASH_APP_KEY]
BKASH_APP_SECRET=[YOUR_BKASH_APP_SECRET]
BKASH_USERNAME=[YOUR_BKASH_USERNAME]
BKASH_PASSWORD=[YOUR_BKASH_PASSWORD]
NAGAD_APP_ID=[YOUR_NAGAD_APP_ID]
NAGAD_APP_SECRET=[YOUR_NAGAD_APP_SECRET]
NAGAD_PUBLIC_KEY=[YOUR_NAGAD_PUBLIC_KEY]
NAGAD_PRIVATE_KEY=[YOUR_NAGAD_PRIVATE_KEY]
```

### Email Service (Gmail)
```
GMAIL_USER=[your-email@gmail.com]
GMAIL_APP_PASSWORD=[GENERATE_APP_PASSWORD]
```

### SMS Service (Twilio)
```
TWILIO_ACCOUNT_SID=[YOUR_ACCOUNT_SID]
TWILIO_AUTH_TOKEN=[YOUR_AUTH_TOKEN]
TWILIO_PHONE_NUMBER=[YOUR_TWILIO_PHONE]
```

### Redis (for rate limiting and caching)
```
REDIS_URL=redis://[elasticache-endpoint]:6379
```

### Market Data
```
MARKET_MODE=simulated
```

## AWS Resource Setup

### 1. PostgreSQL RDS Database
```
Engine: PostgreSQL 15.x
Instance Class: db.t3.micro (development) or db.t3.small (production)
Storage: 100 GB SSD
Backup Retention: 30 days
Multi-AZ: Yes (for production)
```

### 2. ElastiCache Redis (Optional but Recommended)
```
Engine: Redis 7.x
Node Type: cache.t3.micro
Num Cache Nodes: 1 (development) or 3 (production for replication)
```

### 3. RDS Security Group
Allow inbound from Elastic Beanstalk security group on port 5432

### 4. ElastiCache Security Group
Allow inbound from Elastic Beanstalk security group on port 6379

### 5. IAM Role for Elastic Beanstalk
Required permissions:
- AmazonEC2FullAccess
- AmazonRDSFullAccess
- AmazonElastiCacheFullAccess
- CloudWatchFullAccess
- AmazonS3FullAccess (for logs)
- CloudWatchLogsFullAccess

## Deployment Steps

### Step 1: Prepare AWS Account
```bash
# Set up AWS CLI and credentials
aws configure

# Create S3 bucket for deployments
aws s3 mb s3://bdt-arena-deployments-[ACCOUNT-ID]
```

### Step 2: Create RDS Database
```bash
aws rds create-db-instance \
  --db-instance-identifier bdt-arena-db \
  --db-instance-class db.t3.small \
  --engine postgres \
  --master-username admin \
  --master-user-password [SECURE_PASSWORD] \
  --allocated-storage 100 \
  --backup-retention-period 30 \
  --multi-az
```

### Step 3: Create Elastic Beanstalk Application
```bash
# Using AWS CLI
aws elasticbeanstalk create-application \
  --application-name BDT_Arena \
  --description "Bangladesh Gaming & Trading Platform"

# OR using EB CLI (recommended)
eb init -p "Node.js 18 running on 64bit Amazon Linux 2" \
  --region us-east-1 \
  --instance-profile aws-elasticbeanstalk-ec2-role \
  bdt-arena
```

### Step 4: Create Environment
```bash
eb create BDTarena-env \
  --instance-type t3.medium \
  --scale 2 \
  --envvars NODE_ENV=production,PAYMENT_MODE=production
```

### Step 5: Deploy Application
```bash
# Use CodePipeline for CI/CD (recommended)
# Or manual deployment:

# Build the application
cd backend && npm run build && cd ..

# Create deployment package
eb deploy

# Check deployment status
eb status
eb logs
```

### Step 6: Run Database Migrations
```bash
# SSH into instance
eb ssh

# Run migrations
npm run migrate
npm run seed
```

### Step 7: Configure Auto-Scaling
```
EC2 Auto Scaling Group:
- Min: 2 instances
- Max: 6 instances
- Scale up when CPU > 80%
- Scale down when CPU < 20%
```

### Step 8: Configure Load Balancer Health Check
```
Path: /api/health
Expected Status: 200
Interval: 30 seconds
Timeout: 5 seconds
Healthy Threshold: 3
Unhealthy Threshold: 5
```

## Monitoring & Logging

### CloudWatch Dashboards
- Monitor CPU, Memory, Disk usage
- Track Application Errors
- Monitor Database connections
- Watch Redis cache hits/misses

### Application Logs
```
Logs stored in: /var/log/bdt-arena/
- combined.log: All application logs
- error.log: Error logs only
- exceptions.log: Uncaught exceptions
```

### Set up Log Retention
```bash
aws logs put-retention-policy \
  --log-group-name /aws/elasticbeanstalk/bdt-arena/application \
  --retention-in-days 30
```

## HTTPS/SSL Setup

### Using ACM Certificate
```
1. Request certificate in AWS Certificate Manager
2. Domain: bdt-arena-api.elasticbeanstalk.com
3. Add to ALB listener (port 443)
4. Redirect HTTP to HTTPS
```

### HTTPS Configuration in .ebextensions/01_environment.config
```
aws:elbv2:listener:443:
  InstancePort: 8081
  InstanceProtocol: http
  Protocol: https
  SSLCertificateArns: arn:aws:acm:region:account:certificate/id
```

## Backup & Disaster Recovery

### RDS Automated Backups
- 30-day retention
- Daily snapshots
- Test restore procedures monthly

### Application Code Backups
- CodeCommit repository
- Daily automated backups to S3

## Performance Tuning

### Application Optimizations
```
- Enable gzip compression
- Use connection pooling (20 max connections)
- Cache frequently accessed data in Redis
- Implement rate limiting per IP
```

### Database Optimizations
```
- Enable Query Cache
- Index frequently searched fields
- Monitor slow queries
- Use read replicas for analytics
```

## Security Checklist

- [ ] Change all default passwords
- [ ] Enable CloudTrail for audit logs
- [ ] Set up VPC with public/private subnets
- [ ] Configure Security Groups properly
- [ ] Enable RDS encryption at rest
- [ ] Enable S3 encryption
- [ ] Set up WAF (Web Application Firewall)
- [ ] Enable VPC Flow Logs
- [ ] Regular security patches
- [ ] DDoS protection with AWS Shield

## Cost Optimization

### Estimated Monthly Costs (Production)
```
Elastic Beanstalk (2x t3.medium):     ~$100
RDS (db.t3.small, Multi-AZ):         ~$200
ElastiCache (cache.t3.micro):        ~$20
Data Transfer:                        ~$50
Total:                               ~$370
```

### Cost Reduction Tips
- Use Reserved Instances (1-year commitment): ~30% savings
- Use Spot Instances for non-critical tasks: ~90% savings
- Optimize database instance size
- Enable S3 lifecycle policies

## Troubleshooting

### Check Logs
```bash
eb logs
tail -f /var/log/bdt-arena/combined.log
```

### Common Issues
1. **Database Connection Timeout**
   - Check Security Group rules
   - Verify DATABASE_URL environment variable

2. **Memory Issues**
   - Increase instance type (t3.large)
   - Enable Node.js heap dumps

3. **Slow API Response**
   - Check CloudWatch metrics
   - Query RDS performance insights
   - Check Redis cache hit rate

## Monitoring Commands

```bash
# Check environment health
eb health

# Stream logs in real-time
eb logs --stream

# Check recent deployments
eb appversion

# SSH into instance
eb ssh

# Open EB dashboard
eb open
```

## Scaling Strategy

**Development:** Single t3.micro instance with minimal resources
**Staging:** 1-2 t3.small instances with shared RDS
**Production:** 2-6 t3.medium instances with dedicated RDS (Multi-AZ)

## Next Steps

1. Set up AWS CodePipeline for CI/CD
2. Configure SNS notifications for alerts
3. Set up application performance monitoring (APM)
4. Implement automated disaster recovery tests
5. Plan capacity for expected growth
