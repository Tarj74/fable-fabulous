SHELL := /bin/bash

.PHONY: precommit-setup precommit-checks trivy-setup

precommit-setup:
	pip install pre-commit
	pre-commit install

trivy-setup:
	curl -sfL https://raw.githubusercontent.com/aquasecurity/trivy/main/contrib/install.sh | sudo sh -s -- -b /usr/local/bin

precommit-checks:
	pre-commit run --all-files && \
	trivy fs --config trivy-filesystem-scan.yaml .
