#!/bin/bash
# AWS Elastic Beanstalk Quick Start Deployment
# This script automates the entire deployment process

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Configuration
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
ENVIRONMENT="${1:-staging}"
AWS_REGION="${AWS_REGION:-us-east-1}"
INSTANCE_TYPE="${2:-t3.medium}"

# Menu function
show_menu() {
	clear
	echo -e "${BLUE}╔════════════════════════════════════════════════════════╗${NC}"
	echo -e "${BLUE}║  BDT Arena - AWS Elastic Beanstalk Deployment Helper   ║${NC}"
	echo -e "${BLUE}╚════════════════════════════════════════════════════════╝${NC}"
	echo ""
	echo -e "${YELLOW}Environment: ${GREEN}$ENVIRONMENT${NC}"
	echo -e "${YELLOW}Region: ${GREEN}$AWS_REGION${NC}"
	echo -e "${YELLOW}Instance Type: ${GREEN}$INSTANCE_TYPE${NC}"
	echo ""
	echo "Choose an option:"
	echo "1) Setup Prerequisites (Install AWS CLI, EB CLI)"
	echo "2) Configure AWS Credentials"
	echo "3) Create RDS Database"
	echo "4) Create ElastiCache Redis"
	echo "5) Create Elastic Beanstalk Environment"
	echo "6) Deploy Application"
	echo "7) Run Database Migrations"
	echo "8) Configure Environment Variables"
	echo "9) View Application Status"
	echo "10) Stream Application Logs"
	echo "11) SSH into Instance"
	echo "12) Full Setup (All steps 1-7)"
	echo "13) Exit"
	echo ""
}

# Log function
log_info() {
	echo -e "${BLUE}[INFO]${NC} $1"
}

log_success() {
	echo -e "${GREEN}[✓]${NC} $1"
}

log_warning() {
	echo -e "${YELLOW}[!]${NC} $1"
}

log_error() {
	echo -e "${RED}[✗]${NC} $1"
}

# Check prerequisites
check_prerequisites() {
	log_info "Checking prerequisites..."

	# Check AWS CLI
	if ! command -v aws &> /dev/null; then
		log_error "AWS CLI not found"
		read -p "Install AWS CLI? (y/n) " -n 1 -r
		echo
		if [[ $REPLY =~ ^[Yy]$ ]]; then
			echo "Visit: https://aws.amazon.com/cli/"
			exit 1
		fi
	else
		log_success "AWS CLI found: $(aws --version)"
	fi

	# Check EB CLI
	if ! command -v eb &> /dev/null; then
		log_error "EB CLI not found"
		read -p "Install EB CLI? (y/n) " -n 1 -r
		echo
		if [[ $REPLY =~ ^[Yy]$ ]]; then
			pip install awsebcli --upgrade --user
			log_success "EB CLI installed"
		fi
	else
		log_success "EB CLI found: $(eb --version)"
	fi

	# Check Node.js
	if ! command -v node &> /dev/null; then
		log_error "Node.js not found"
		exit 1
	else
		log_success "Node.js found: $(node --version)"
	fi

	# Check npm
	if ! command -v npm &> /dev/null; then
		log_error "npm not found"
		exit 1
	else
		log_success "npm found: $(npm --version)"
	fi

	# Check Git
	if ! command -v git &> /dev/null; then
		log_error "Git not found"
		exit 1
	else
		log_success "Git found: $(git --version)"
	fi

	echo ""
}

# Configure AWS credentials
configure_aws_credentials() {
	clear
	echo -e "${BLUE}AWS Credentials Configuration${NC}"
	echo "=============================="
	echo ""

	# Check if already configured
	if aws sts get-caller-identity &> /dev/null; then
		log_success "AWS Credentials already configured"
		ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text)
		IDENTITY=$(aws sts get-caller-identity --query Arn --output text)
		echo "Account ID: $ACCOUNT_ID"
		echo "Identity: $IDENTITY"
		echo ""
		read -p "Reconfigure? (y/n) " -n 1 -r
		echo
		if [[ ! $REPLY =~ ^[Yy]$ ]]; then
			return
		fi
	fi

	log_info "Run: aws configure"
	echo ""
	echo "You'll need:"
	echo "1. AWS Access Key ID (from IAM user)"
	echo "2. AWS Secret Access Key (from IAM user)"
	echo "3. Default region (us-east-1 recommended)"
	echo "4. Default output format (json)"
	echo ""

	aws configure --profile bdt-arena

	log_success "AWS credentials configured"
	echo ""
}

# Build application
build_application() {
	log_info "Building application..."
	echo ""

	cd "$PROJECT_ROOT"

	# Build backend
	log_info "Building backend..."
	cd backend
	npm install
	npm run build
	log_success "Backend built"

	# Build frontend
	log_info "Building frontend..."
	cd ../frontend
	npm install
	npm run build
	log_success "Frontend built"

	cd "$PROJECT_ROOT"
	echo ""
}

# Create RDS Database
create_rds_database() {
	clear
	echo -e "${BLUE}Create RDS Database${NC}"
	echo "===================="
	echo ""

	log_warning "This step guides you through RDS creation"
	echo ""
	echo "Parameters:"
	echo "- Engine: PostgreSQL 15.3"
	echo "- Identifier: bdt-arena-db-$ENVIRONMENT"
	echo "- Database name: bdt_arena"
	echo "- Port: 5432"
	echo "- Storage: 100 GB SSD"
	echo ""

	read -p "Create RDS database now? (y/n) " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		return
	fi

	read -p "Generate password (y/n or enter custom): " -n 1 -r
	echo

	if [[ $REPLY =~ ^[Yy]$ ]]; then
		DB_PASSWORD=$(openssl rand -base64 32)
		echo "Generated password: $DB_PASSWORD"
	else
		read -s -p "Enter database password: " DB_PASSWORD
		echo
	fi

	log_info "Creating RDS instance..."

	aws rds create-db-instance \
		--db-instance-identifier "bdt-arena-db-$ENVIRONMENT" \
		--db-instance-class db.t3.small \
		--engine postgres \
		--engine-version 15.3 \
		--master-username admin \
		--master-user-password "$DB_PASSWORD" \
		--allocated-storage 100 \
		--storage-type gp3 \
		--db-name bdt_arena \
		--backup-retention-period 30 \
		--multi-az \
		--storage-encrypted \
		--enable-cloudwatch-logs-exports postgresql \
		--region "$AWS_REGION" 2>/dev/null || log_error "RDS might already exist"

	log_info "Waiting for RDS to be available (this takes 5-10 minutes)..."

	aws rds wait db-instance-available \
		--db-instance-identifier "bdt-arena-db-$ENVIRONMENT" \
		--region "$AWS_REGION"

	# Get endpoint
	DB_ENDPOINT=$(aws rds describe-db-instances \
		--db-instance-identifier "bdt-arena-db-$ENVIRONMENT" \
		--region "$AWS_REGION" \
		--query 'DBInstances[0].Endpoint.Address' \
		--output text)

	log_success "RDS database created!"
	echo "Endpoint: $DB_ENDPOINT"
	echo "Port: 5432"
	echo "Database: bdt_arena"
	echo "Username: admin"
	echo "Password: $DB_PASSWORD (save this!)"
	echo ""
	echo "DATABASE_URL: postgresql://admin:$DB_PASSWORD@$DB_ENDPOINT:5432/bdt_arena"
	echo ""

	# Save to temporary file
	echo "DATABASE_URL=postgresql://admin:$DB_PASSWORD@$DB_ENDPOINT:5432/bdt_arena" > /tmp/bdt-arena-db.env
	log_info "Saved to /tmp/bdt-arena-db.env"
	echo ""
}

# Create ElastiCache
create_elasticache() {
	clear
	echo -e "${BLUE}Create ElastiCache Redis${NC}"
	echo "========================="
	echo ""

	log_warning "This step guides you through ElastiCache creation"
	echo ""
	echo "Parameters:"
	echo "- Engine: Redis 7"
	echo "- Identifier: bdt-arena-redis-$ENVIRONMENT"
	echo "- Port: 6379"
	echo ""

	read -p "Create ElastiCache cluster now? (y/n) " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		return
	fi

	log_info "Note: You must have VPC security group 'bdt-arena-redis-sg' created first"
	read -p "Continue? (y/n) " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		return
	fi

	log_info "Creating ElastiCache cluster..."

	aws elasticache create-cache-cluster \
		--cache-cluster-id "bdt-arena-redis-$ENVIRONMENT" \
		--cache-node-type cache.t3.micro \
		--engine redis \
		--engine-version 7.0 \
		--num-cache-nodes 1 \
		--port 6379 \
		--region "$AWS_REGION" 2>/dev/null || log_error "ElastiCache might already exist"

	log_info "Waiting for ElastiCache to be available (this takes 5-10 minutes)..."

	aws elasticache wait cache-cluster-available \
		--cache-cluster-id "bdt-arena-redis-$ENVIRONMENT" \
		--region "$AWS_REGION"

	# Get endpoint
	REDIS_URL=$(aws elasticache describe-cache-clusters \
		--cache-cluster-id "bdt-arena-redis-$ENVIRONMENT" \
		--show-cache-node-info \
		--region "$AWS_REGION" \
		--query 'CacheClusters[0].CacheNodes[0].Endpoint.Address' \
		--output text)

	log_success "ElastiCache cluster created!"
	echo "Endpoint: $REDIS_URL:6379"
	echo ""
	echo "REDIS_URL: redis://$REDIS_URL:6379"
	echo ""

	# Save to temporary file
	echo "REDIS_URL=redis://$REDIS_URL:6379" > /tmp/bdt-arena-redis.env
	log_info "Saved to /tmp/bdt-arena-redis.env"
	echo ""
}

# Initialize Elastic Beanstalk
init_eb() {
	log_info "Initializing Elastic Beanstalk..."

	cd "$PROJECT_ROOT"

	if [ -d ".elasticbeanstalk" ]; then
		log_warning "Elastic Beanstalk already initialized"
		return
	fi

	eb init -p "Node.js 18 running on 64bit Amazon Linux 2" \
		--region "$AWS_REGION" \
		--instance-profile aws-elasticbeanstalk-ec2-role \
		bdt-arena

	log_success "Elastic Beanstalk initialized"
	echo ""
}

# Create EB environment
create_eb_environment() {
	clear
	echo -e "${BLUE}Create Elastic Beanstalk Environment${NC}"
	echo "===================================="
	echo ""

	log_info "Creating Elastic Beanstalk environment..."
	echo "This will take 10-15 minutes..."
	echo ""

	cd "$PROJECT_ROOT"

	# Build first
	build_application

	# Commit to git
	log_info "Committing to git..."
	git add .
	git commit -m "Deploy to $ENVIRONMENT environment" || log_warning "Nothing to commit"
	echo ""

	# Create environment
	log_info "Creating environment BDTarena-env..."
	eb create "BDTarena-env-$ENVIRONMENT" \
		--instance-type "$INSTANCE_TYPE" \
		--scale 2 \
		--elb-type application \
		--envvars NODE_ENV="$ENVIRONMENT",PAYMENT_MODE=sandbox,MARKET_MODE=simulated

	log_success "Elastic Beanstalk environment created!"
	echo ""
}

# Deploy application
deploy_application() {
	clear
	echo -e "${BLUE}Deploy Application${NC}"
	echo "=================="
	echo ""

	cd "$PROJECT_ROOT"

	# Build
	log_info "Building application..."
	build_application

	# Commit
	log_info "Committing changes..."
	git add .
	git commit -m "Deploy update" || log_warning "Nothing to commit"
	echo ""

	# Deploy
	log_info "Deploying to Elastic Beanstalk..."
	eb deploy --message "Deployment at $(date)"

	log_success "Application deployed!"
	echo ""
}

# Configure environment variables
configure_env_vars() {
	clear
	echo -e "${BLUE}Configure Environment Variables${NC}"
	echo "==============================="
	echo ""

	log_info "This will set environment variables for the EB environment"
	echo ""

	# Load from files if they exist
	if [ -f "/tmp/bdt-arena-db.env" ]; then
		source /tmp/bdt-arena-db.env
	fi

	if [ -f "/tmp/bdt-arena-redis.env" ]; then
		source /tmp/bdt-arena-redis.env
	fi

	echo "Required variables:"
	echo "1. DATABASE_URL"
	echo "2. REDIS_URL"
	echo "3. JWT_ACCESS_SECRET"
	echo "4. JWT_REFRESH_SECRET"
	echo "5. GMAIL_USER"
	echo "6. GMAIL_APP_PASSWORD"
	echo ""

	read -p "Continue with configuration? (y/n) " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		return
	fi

	# Generate JWT secrets if needed
	if [ -z "$JWT_ACCESS_SECRET" ]; then
		JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
		log_info "Generated JWT_ACCESS_SECRET"
	fi

	if [ -z "$JWT_REFRESH_SECRET" ]; then
		JWT_REFRESH_SECRET=$(node -e "console.log(require('crypto').randomBytes(32).toString('hex'))")
		log_info "Generated JWT_REFRESH_SECRET"
	fi

	# Set environment variables
	log_info "Setting environment variables..."

	eb setenv \
		NODE_ENV="$ENVIRONMENT" \
		BACKEND_PORT=8081 \
		PUBLIC_BACKEND_URL="https://bdt-arena-api-$ENVIRONMENT.elasticbeanstalk.com" \
		DATABASE_URL="${DATABASE_URL}" \
		REDIS_URL="${REDIS_URL}" \
		JWT_ACCESS_SECRET="$JWT_ACCESS_SECRET" \
		JWT_REFRESH_SECRET="$JWT_REFRESH_SECRET" \
		PAYMENT_MODE=sandbox \
		MARKET_MODE=simulated \
		LOG_LEVEL=info \
		TZ=Asia/Dhaka

	log_success "Environment variables configured!"
	echo ""
	log_warning "Save these values securely:"
	echo "DATABASE_URL=$DATABASE_URL"
	echo "REDIS_URL=$REDIS_URL"
	echo "JWT_ACCESS_SECRET=$JWT_ACCESS_SECRET"
	echo "JWT_REFRESH_SECRET=$JWT_REFRESH_SECRET"
	echo ""
}

# Run migrations
run_migrations() {
	clear
	echo -e "${BLUE}Run Database Migrations${NC}"
	echo "======================="
	echo ""

	log_info "Connecting to instance and running migrations..."
	echo ""

	eb ssh --force --command "cd /var/app/current && npm run migrate"

	log_success "Migrations completed!"
	echo ""
}

# View status
view_status() {
	clear
	echo -e "${BLUE}Environment Status${NC}"
	echo "=================="
	echo ""

	eb status

	echo ""
	read -p "Press Enter to continue..."
}

# Stream logs
stream_logs() {
	clear
	echo -e "${BLUE}Application Logs${NC}"
	echo "================"
	echo ""
	log_info "Streaming logs (Ctrl+C to stop)..."
	echo ""

	eb logs --stream --all
}

# SSH into instance
ssh_instance() {
	clear
	echo -e "${BLUE}SSH into Instance${NC}"
	echo "================="
	echo ""

	log_info "Connecting to instance..."
	eb ssh --force
}

# Full setup
full_setup() {
	clear
	echo -e "${BLUE}Full Setup Wizard${NC}"
	echo "================"
	echo ""
	log_warning "This will take 30-45 minutes"
	echo ""

	read -p "Continue with full setup? (y/n) " -n 1 -r
	echo
	if [[ ! $REPLY =~ ^[Yy]$ ]]; then
		return
	fi

	# Step by step
	log_info "Step 1/7: Checking prerequisites..."
	check_prerequisites

	log_info "Step 2/7: Configuring AWS credentials..."
	configure_aws_credentials

	log_info "Step 3/7: Creating RDS database..."
	create_rds_database

	log_info "Step 4/7: Creating ElastiCache..."
	create_elasticache

	log_info "Step 5/7: Initializing Elastic Beanstalk..."
	init_eb

	log_info "Step 6/7: Creating EB environment..."
	create_eb_environment

	log_info "Step 7/7: Running migrations..."
	run_migrations

	log_success "Full setup completed!"
	echo ""
	echo "Next steps:"
	echo "1. Save your database and Redis credentials securely"
	echo "2. Configure payment gateway credentials"
	echo "3. Set up email/SMS providers"
	echo "4. Test the application at:"

	APP_URL=$(eb open --print-url)
	echo "   $APP_URL"
	echo ""
}

# Main loop
main() {
	while true; do
		show_menu
		read -p "Select option (1-13): " choice

		case $choice in
			1) check_prerequisites ;;
			2) configure_aws_credentials ;;
			3) create_rds_database ;;
			4) create_elasticache ;;
			5) init_eb && create_eb_environment ;;
			6) deploy_application ;;
			7) run_migrations ;;
			8) configure_env_vars ;;
			9) view_status ;;
			10) stream_logs ;;
			11) ssh_instance ;;
			12) full_setup ;;
			13) echo -e "${GREEN}Goodbye!${NC}"; exit 0 ;;
			*) log_error "Invalid option" ;;
		esac

		if [ $choice != 13 ]; then
			echo ""
			read -p "Press Enter to continue..."
		fi
	done
}

# Run main
main "$@"
