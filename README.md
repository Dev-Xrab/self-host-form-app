# Self Host Form

A desktop app for teachers to build forms, quizzes, and exams and host them from their own computer. Students answer in a browser on the same network, or over a public link through a Cloudflare tunnel. Responses stay on the host machine by default.

## Features

- **Form builder** with many question types, including matrix questions, file uploads, and templates
- **Subjects, rosters, and sessions** to organize classes and track who answered
- **Automatic grading** and response analytics
- **Exam integrity tools**: fullscreen gate, refocus lock, and connection overlays for respondents
- **Exports** to Excel, PDF, and ZIP
- **Public links** through a built-in Cloudflare tunnel, with no port forwarding needed
- **Optional cloud sync** and Google Forms import through the separate `cloud-server`

## Tech stack

React 19 + Vite · Express 5 · Electron · SQLite (Node's built-in `node:sqlite`) · Zustand · PostgreSQL (cloud server only)

## Getting started

Requires **Node.js 22.5 or newer**.

```bash
git clone https://github.com/Dev-Xrab/self-host-form-app.git
cd self-host-form-app
npm install
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Start the Vite frontend dev server |
| `npm run server` | Start the local API server with auto-reload |
| `npm run desktop` | Launch the Electron desktop app |
| `npm run build` | Build the frontend into `dist/` |
| `npm run dist` | Build installers into `release/` |
| `npm run lint` | Lint with oxlint |

### Cloud server (optional)

The cloud server handles sync and Google sign-in. It needs PostgreSQL and a Google OAuth client.

```bash
cd cloud-server
npm install
cp .env.example .env   # then fill in the values
cd ..
npm run cloud-server
```

Never commit `cloud-server/.env`.

## Project layout

```
electron/      Electron main process, preload, and splash screen
server/        Local Express API (auth, forms, responses, sessions, tunnel, ...)
cloud-server/  Optional central sync server (PostgreSQL + Google OAuth)
src/           React frontend (features/, pages/, components/)
store/         Zustand stores
scripts/       Build helper scripts
```

## Contributing

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) to get started, and follow our [Code of Conduct](CODE_OF_CONDUCT.md).

To report a security vulnerability, see [SECURITY.md](SECURITY.md). Please don't open a public issue for it.

## License

[MIT](LICENSE)
