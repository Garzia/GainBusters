# Contributing to GainBusters

First off, thank you for considering contributing to **GainBusters**! It is people like you who make open-source software secure, feature-rich, and enjoyable for everyone.

---

## 📜 Code of Conduct

By participating in this project, you agree to maintain a respectful, inclusive, and professional environment. Harassment, derogatory comments, or abusive behavior will not be tolerated.

---

## ⚖️ Contributor License Agreement (CLA)

Before we can merge any pull request, contributors must agree to the GainBusters Lightweight Contributor License Agreement ([`CLA.md`](./CLA.md)).

When opening a Pull Request, please ensure you include the following statement in your PR description:
> **"I have read the GainBusters CLA and I hereby sign and agree to its terms."**

---

## 🛠️ Development Setup

To set up your local workspace for development:

1. **Fork & Clone**:
   ```bash
   git clone https://github.com/yourusername/gainbusters.git
   cd gainbusters
   ```

2. **Install Dependencies**:
   ```bash
   npm install
   ```

3. **Run Local Dev Server**:
   ```bash
   npm run dev
   ```
   The application will run on `http://localhost:3000` with hot module replacement.

4. **Verify Linter & Build**:
   Before submitting your changes, verify that TypeScript compilation and formatting pass cleanly:
   ```bash
   npm run lint
   npm run build
   ```

---

## 🐳 Docker Verification

If your contribution modifies backend dependencies (`package.json`), Docker manifests, or filesystem handling (`STORAGE_MODE`):

1. Update the lockfile:
   ```bash
   npm install --package-lock-only
   ```
2. Test container build:
   ```bash
   docker compose up -d --build
   ```

---

## 📐 Submission Guidelines

- **Keep PRs Focused**: Avoid bundling unrelated feature changes and formatting edits in a single pull request.
- **Commit Messages**: Write clean, descriptive commit messages (e.g., `feat: add dividend yield calculation to portfolio summary`).
- **Translations / Locales**: If adding or updating UI strings in `src/locales/`, please verify consistency across all language files (`en.ts`, `it.ts`, `es.ts`, `fr.ts`, `zh.ts`, `ar.ts`). Note that `ar.ts` supports RTL layouts.

For major architectural proposals, please open an Issue first to discuss the design with the maintainers.
