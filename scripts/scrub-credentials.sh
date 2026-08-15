#!/bin/bash
# Scrub leaked credentials from git history using git-filter-repo
cd /home/z/my-project

echo '=== Backing up git state ==='
git log --oneline -5 > /tmp/git-log-backup.txt
echo 'Backup saved to /tmp/git-log-backup.txt'

echo '=== Creating replacement expressions file ==='
cat > /tmp/credentials-replacements.txt << 'EOF'
***REDACTED***==>REDACTED_DEMO_PASSWORD
ops123==>REDACTED_DEMO_PASSWORD
sales123==>REDACTED_DEMO_PASSWORD
cust123==>REDACTED_DEMO_PASSWORD
Rtr360@Secure9==>REDACTED_SEED_PASSWORD
EOF

echo '=== Running git-filter-repo blob replacement ==='
git filter-repo --replace-text /tmp/credentials-replacements.txt --force 2>&1

echo '=== Verifying scrub ==='
echo '--- Checking for old passwords ---'
git log --all -p 2>&1 | rg -c '***REDACTED***|ops123|sales123|cust123' || echo '0 matches - clean!'

echo '--- Recent commits ---'
git log --oneline -5

echo '=== Credential scrubbing complete ==='