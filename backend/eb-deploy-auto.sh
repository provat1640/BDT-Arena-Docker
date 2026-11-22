#!/bin/bash
# AWS Elastic Beanstalk Automated Deployment Script
# Usage: ./eb-deploy-auto.sh [environment] [instance-type] [skip-build]

set -e

# Configuration
ENVIRONMENT="${1:-staging}"
INSTANCE_TYPE="${2:-t3.medium}"
SKIP_BUILD="${3:-false}"
AWS_REGION="${AWS_REGION:-us-east-1}"
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# Logging functions
log_info() {
	echo -e "${BLUE}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} ${BLUE}INFO:${NC} $1"
}

log_success() {
	echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} ${GREEN}✓${NC} $1"
}

log_warning() {
	echo -e "${YELLOW}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} ${YELLOW}⚠${NC} $1"
}

log_error() {
	echo -e "${RED}[$(date +'%Y-%m-%d %H:%M:%S')]${NC} ${RED}✗${NC} $1"
	exit 1
}

# Print header
print_header() {
	clear
	cat << "EOF"
╔═══════════════════════════════════════════════════════╗
║  BDT Arena - AWS Elastic Beanstalk Deployment         ║
║  Automated Deployment Script                          ║
╚═══════════════════════════════════════════════════════╝
EOF
	echo ""
	echo "Configuration:"
	echo "  Environment: $ENVIRONMENT"
	echo "  Instance Type: $INSTANCE_TYPE"
	echo "  AWS Region: $AWS_REGION"
	echo "  Project Root: $PROJECT_ROOT"
	echo "  Skip Build: $SKIP_BUILD"
	echo ""
}

# Check prerequisites
check_prerequisites() {
	log_info "Checking prerequisites..."

	# Check required commands
	for cmd in aws eb node npm git; do
		if ! command -v $cmd &> /dev/null; then
			log_error "$cmd is not installed. Please install it first."
		fi
	done

	# Check AWS credentials
	if ! aws sts get-caller-identity &> /dev/null; then
		log_error "AWS credentials not configured. Run: aws configure"
	fi

	# Check git
	if ! git rev-parse --git-dir > /dev/null 2>&1; then
		log_error "Not a git repository. Initialize with: git init"
	fi

	log_success "All prerequisites met"
}

# Build application
build_application() {
	if [ "$SKIP_BUILD" = "true" ]; then
		log_warning "Skipping build (SKIP_BUILD=true)"
		return
	fi

	log_info "Building application..."

	cd "$PROJECT_ROOT"

	# Install and build backend
	log_info "Building backend..."
	cd backend
	npm ci --prefer-offline --no-audit
	npm run build
	cd ..

	# Install and build frontend
	log_info "Building frontend..."
	cd frontend
	npm ci --prefer-offline --no-audit
	npm run build
	cd ..

	log_success "Application built successfully"
}

# Commit to git
commit_to_git() {
	log_info "Committing changes to git..."

	cd "$PROJECT_ROOT"

	# Check if there are changes
	if git diff --quiet; then
		log_warning "No changes to commit"
		return
	fi

	git add .
	git commit -m "Deploy $ENVIRONMENT environment at $(date +'%Y-%m-%d %H:%M:%S')"

	log_success "Changes committed"
}

# Verify EB initialization
verify_eb_init() {
	log_info "Verifying Elastic Beanstalk initialization..."

	cd "$PROJECT_ROOT"

	if [ ! -f ".elasticbeanstalk/config.yml" ]; then
		log_warning "Elastic Beanstalk not initialized. Initializing now..."

		eb init -p "Node.js 18 running on 64bit Amazon Linux 2" \
			--region "$AWS_REGION" \
			--instance-profile aws-elasticbeanstalk-ec2-role \
			bdt-arena

		log_success "Elastic Beanstalk initialized"
	else
		log_success "Elastic Beanstalk already initialized"
	fi
}

# Check if environment exists
check_environment_exists() {
	log_info "Checking if environment exists..."

	if eb list | grep -q "BDTarena-env-$ENVIRONMENT"; then
		log_success "Environment exists: BDTarena-env-$ENVIRONMENT"
		return 0
	else
		log_warning "Environment does not exist: BDTarena-env-$ENVIRONMENT"
		return 1
	fi
}

# Create environment
create_environment() {
	log_info "Creating Elastic Beanstalk environment..."
	log_info "This may take 10-15 minutes..."

	cd "$PROJECT_ROOT"

	eb create "BDTarena-env-$ENVIRONMENT" \
		--instance-type "$INSTANCE_TYPE" \
		--scale 2 \
		--elb-type application \
		--envvars \
			NODE_ENV="$ENVIRONMENT" \
			PAYMENT_MODE=sandbox \
			MARKET_MODE=simulated \
			LOG_LEVEL=info \
			BACKEND_PORT=8081 \
			TZ=Asia/Dhaka

	log_success "Environment created: BDTarena-env-$ENVIRONMENT"
}

# Deploy to environment
deploy_to_environment() {
	log_info "Deploying to Elastic Beanstalk..."

	cd "$PROJECT_ROOT"

	eb deploy "BDTarena-env-$ENVIRONMENT" \
		-m "Automated deployment to $ENVIRONMENT at $(date +'%Y-%m-%d %H:%M:%S')"

	log_success "Deployment initiated"
}

# Wait for environment to be ready
wait_for_environment() {
	log_info "Waiting for environment to be ready..."

	cd "$PROJECT_ROOT"

	max_attempts=60
	attempt=0

	while [ $attempt -lt $max_attempts ]; do
		status=$(eb status --json | jq -r '.EnvironmentStatus' 2>/dev/null || echo "Unknown")
		health=$(eb health --json | jq -r '.EnvironmentHealth' 2>/dev/null || echo "Unknown")

		echo -ne "\rStatus: $status | Health: $health | Attempt: $((attempt+1))/$max_attempts"

		if [ "$status" = "Ready" ] && [ "$health" = "Green" ]; then
			echo ""
			log_success "Environment is ready and healthy"
			return 0
		fi

		sleep 10
		((attempt++))
	done

	echo ""
	log_warning "Timeout waiting for environment. Check status with: eb status"
	return 1
}

# Verify deployment
verify_deployment() {
	log_info "Verifying deployment..."

	cd "$PROJECT_ROOT"

	# Get application URL
	APP_URL=$(eb open --print-url)

	log_info "Testing health endpoint..."

	# Wait for endpoint to respond
	for i in {1..30}; do
		if curl -s "$APP_URL/api/health" > /dev/null 2>&1; then
			log_success "Application is responding"

			# Get health status
			HEALTH_RESPONSE=$(curl -s "$APP_URL/api/health")
			echo "Health Response: $HEALTH_RESPONSE"

			return 0
		fi

		echo -ne "\rAttempt $i/30..."
		sleep 2
	done

	echo ""
	log_warning "Application not responding yet. It may still be starting up."
	return 1
}

# Run migrations
run_migrations() {
	log_info "Running database migrations..."

	cd "$PROJECT_ROOT"

	# Connect via SSH and run migrations
	eb ssh --force --command "cd /var/app/current && npm run migrate 2>&1"

	log_success "Migrations completed"
}

# Display results
display_results() {
	clear
	echo -e "${GREEN}╔═══════════════════════════════════════════════════════╗${NC}"
	echo -e "${GREEN}║  Deployment Completed Successfully! 🎉                ║${NC}"
	echo -e "${GREEN}╚═══════════════════════════════════════════════════════╝${NC}"
	echo ""

	cd "$PROJECT_ROOT"

	APP_URL=$(eb open --print-url)

	echo "Deployment Summary:"
	echo "  Environment: BDTarena-env-$ENVIRONMENT"
	echo "  Region: $AWS_REGION"
	echo "  Instance Type: $INSTANCE_TYPE"
	echo "  Application URL: $APP_URL"
	echo ""

	# Get more details
	log_info "Gathering deployment details..."

	echo "Instances:"
	eb scale --info 2>/dev/null || true
	echo ""

	echo "Useful Commands:"
	echo "  Check status: eb status"
	echo "  View logs: eb logs --stream"
	echo "  SSH: eb ssh"
	echo "  Terminate: eb terminate"
	echo ""

	echo "Next Steps:"
	echo "1. Visit the application: $APP_URL"
	echo "2. Set up payment gateway credentials (AWS Secrets Manager)"
	echo "3. Configure email and SMS providers"
	echo "4. Run admin setup queries"
	echo "5. Monitor CloudWatch metrics"
	echo ""
}

# Display errors
display_errors() {
	clear
	echo -e "${RED}╔═══════════════════════════════════════════════════════╗${NC}"
	echo -e "${RED}║  Deployment Failed ✗                                  ║${NC}"
	echo -e "${RED}╚═══════════════════════════════════════════════════════╝${NC}"
	echo ""

	log_error "See above for details"

	echo ""
	echo "Troubleshooting Commands:"
	echo "  Check status: eb status"
	echo "  View logs: eb logs --all"
	echo "  View health: eb health"
	echo "  SSH: eb ssh"
	echo ""
}

# Main deployment flow
main() {
	print_header

	# Step 1: Check prerequisites
	log_info "Step 1/6: Checking prerequisites"
	check_prerequisites
	echo ""

	# Step 2: Build application
	log_info "Step 2/6: Building application"
	build_application
	echo ""

	# Step 3: Commit changes
	log_info "Step 3/6: Committing to git"
	commit_to_git
	echo ""

	# Step 4: Verify EB
	log_info "Step 4/6: Verifying Elastic Beanstalk"
	verify_eb_init
	echo ""

	# Step 5: Create or update environment
	log_info "Step 5/6: Creating/Updating environment"

	if check_environment_exists; then
		log_info "Deploying to existing environment..."
		deploy_to_environment
	else
		log_info "Creating new environment..."
		create_environment
	fi
	echo ""

	# Step 6: Verify deployment
	log_info "Step 6/6: Verifying deployment"

	if ! wait_for_environment; then
		display_errors
		exit 1
	fi

	if ! verify_deployment; then
		log_warning "Deployment verification incomplete, but deployment was initiated"
	fi

	# Run migrations
	log_info "Running database migrations..."
	if ! run_migrations; then
		log_warning "Migrations may need manual running"
	fi

	# Display results
	display_results
}

# Error handling
trap 'log_error "Deployment failed"; display_errors; exit 1' ERR

# Run main
main "$@"
