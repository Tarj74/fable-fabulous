# Local Git Tracking Setup

This guide helps you set up a local repository, connect it to a remote, and switch to your feature branch.

## 1) Create and enter project directory

```bash
mkdir <new-dir>
cd <new-dir>
```

## 2) Initialize Git with `main` as default branch

```bash
git init -b main
```

If your Git version does not support `-b main`:

```bash
git init
git branch -M main
```

## 3) Configure Git user details

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
```

## 4) Add remote and sync

```bash
git remote add origin <repo-url>
git fetch origin
git pull origin main
```

## 5) Checkout your feature branch

If branch already exists on remote:

```bash
git checkout -b feature-branch origin/feature-branch
```

If you want to create a new local branch:

```bash
git checkout -b feature-branch
```

---

## Pre-commit setup and usage

This repo includes: `pre-commit-config.yaml`

Create a virtual environment and activate it before installing pre-commit using following or custom commands:
```bash
python3 -m venv venv && source venv/bin/activate
```

Install:

```bash
pip install pre-commit
```

Use:

```bash
pre-commit install
pre-commit run --all-files
```

---

## Trivy setup and usage

This repo includes: `trivy-filesystem-scan.yaml`

Install (Linux/macOS via script):

```bash
curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sh
```

Use config file:

```bash
trivy fs --config trivy-filesystem-scan.yaml .
```

---

## Optional: Use Makefile (simple)

If you prefer shortcuts, use the included `Makefile`:

```bash
make precommit-setup
make trivy-setup
make precommit-checks # NOTE: Run after every git add .
```
