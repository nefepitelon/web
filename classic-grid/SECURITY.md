# Security Policy

- Never commit `.env`, `secrets/`, `data/`, private keys, API secrets, or Telegram tokens/chat IDs.
- Only commit `.env.example` with **empty** secret values. Fill real keys on your machine after `cp .env.example .env`.
- If you find a secret in this repository, open an issue **without pasting the secret**, and rotate the credential immediately.
- README dashboard image is a UI screenshot (no tokens/addresses). Never paste live credentials into Issues/PRs.
