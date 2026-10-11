# Smart Attendance Management System

A student project for administrator-managed student registration and attendance using backend face verification.

## Stack
- Frontend: React, Vite, JavaScript, Tailwind CSS, React Router, Axios, Lucide React, Recharts
- Backend: Flask REST API, SQLAlchemy, Flask-Migrate, JWT authentication
- Database: PostgreSQL
- Recognition: OpenCV YuNet face detection + SFace embeddings on the backend

## Architecture
The browser requests camera permission only when an administrator starts capture. It sends a captured frame to the authenticated Flask API over HTTPS. The backend validates the image, detects exactly one usable face, compares its embedding against registered embeddings, and records attendance only for a confident match in an active session. PostgreSQL is accessed only by Flask. The frontend never receives face embeddings or database credentials.

## Folder structure
- `frontend/` React web application
- `backend/app/` Flask app, routes, models, and services
- `backend/migrations/` Alembic database migrations
- `backend/tests/` backend test suite

## Phase 2: backend foundation
The Flask application factory, configuration, database extensions, health endpoint, core SQLAlchemy models, and dependency list are in place. The API refuses to start until `SECRET_KEY`, `JWT_SECRET_KEY`, and `DATABASE_URL` are configured. The JWT secret must differ from the Flask secret.

### Local PostgreSQL setup (Windows PowerShell)
1. If `psql` is not recognized, run it by its full path: `& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' -U postgres -h localhost -d postgres`. To use it by name in later terminals, add `C:\Program Files\PostgreSQL\18\bin` to Windows user `Path` and open a new PowerShell window. Adjust the versioned directory if needed.
2. At the `postgres=#` prompt, create the project database: `CREATE DATABASE smart_attendance;`, then type `\q` to exit.
3. In a PowerShell terminal, go to `backend`, create and activate a virtual environment, and install packages:

```powershell
cd .\backend
py -3.12 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
```

If `py -3.12` reports `No suitable Python runtime found`, install a current Python 3.12 64-bit release from [python.org](https://www.python.org/downloads/release/python-31210/), select **Add python.exe to PATH**, and reopen PowerShell. Confirm with `py -3.12 --version`. Do not install the embeddable package. The project `.venv` is local and should not be copied to GitHub.

4. Edit `backend/.env`: set the PostgreSQL password and replace both secret placeholders with separate random strings of at least 32 characters. The database URL format is `postgresql+psycopg://USERNAME:PASSWORD@localhost:5432/smart_attendance`. URL-encode special characters in the password.
5. Apply the included database migrations, then start the local API:

```powershell
$env:FLASK_APP = "run:app"
flask db upgrade
flask run --debug
```

After changing a model in a later development step, generate and apply a new migration with `flask db migrate -m "describe the change"` followed by `flask db upgrade`.

6. Open `http://127.0.0.1:5000/api/health`; a successful response is `{"service":"smart-attendance-api","status":"ok"}`. Run `flask create-admin` once to add your administrator; the command prompts for the password without echoing it.

If `py -3.12` is not recognized, install Python 3.12 and reopen the terminal. To start the app in a later session, activate `.venv`, set `FLASK_APP`, and run `flask run --debug`.

### Phase 2 files
- `backend/app/__init__.py`: creates the Flask app and attaches extensions/routes.
- `backend/app/config.py`: reads secrets, database URL, CORS origins, and recognition threshold from environment variables.
- `backend/app/extensions.py`: shared SQLAlchemy, migration, and JWT extensions.
- `backend/app/models.py`: users, classes, students, encrypted-face-template storage, sessions, attendance, and audit log schema.
- `backend/app/routes/health.py`: public readiness endpoint with no private data.
- `backend/requirements.txt`: backend and production WSGI dependencies.

## Phase 3: authentication and student API
Administrators are created through a Flask CLI prompt, so passwords are not placed in command history. Login returns a short-lived bearer token; logout revokes it in the database. Student routes require the administrator role, validate all input, normalize email addresses, reject duplicate roll numbers/emails, and soft-delete students while removing their biometric templates and preserving attendance history.

After running `flask db upgrade`, create the first administrator if you have not already, then start the API:

```powershell
flask create-admin
flask run --debug
```

Implemented routes:
- `POST /api/auth/login`, `POST /api/auth/logout`, `GET /api/auth/me`
- `GET /api/students?q=&department=&class_name=&page=&per_page=`
- `POST /api/students`, `GET /api/students/<id>`, `PUT /api/students/<id>`, `DELETE /api/students/<id>`
- `POST /api/students/<id>/account` — administrator sets or resets the linked student's portal password.

### Student sign-in portal

Student accounts are created by an administrator; there is no public student self-registration. After adding a student, open **Students** and select the key icon in that student's row. Set a temporary password of at least 12 characters and give it to the student privately. The student signs in at `/student/login` using their profile email and the temporary password, then can view their own attendance at `/student/attendance` and change their password. Student endpoints get the linked student from the authenticated account, so the browser cannot request another student's records. Updating a student's profile email also updates the linked login; deactivating the student disables the login.

Run the latest migration after pulling this feature:

```powershell
python -m flask --app run:app db upgrade
```

For each call after login, send `Authorization: Bearer <access_token>`. The tests use an isolated in-memory database and do not need your PostgreSQL password:

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
```

`backend/tests/test_auth_students.py` covers login, logout revocation, role checks, student creation, duplicate prevention, searching, updates, and deactivation.

## Phase 4: face registration and verification
The backend uses OpenCV 4.14 `FaceDetectorYN` with YuNet and `FaceRecognizerSF` with SFace. OpenCV Zoo's example threshold for cosine similarity is 0.363; it is configurable and is a starting point that must be tuned with consented enrollment images. The API requires 3–5 registration captures, rejects no-face, multiple-face, low-quality, and inconsistent capture sets, and encrypts generated embeddings using Fernet. Uploaded images are not saved to the application's database or persistent files; the web server may use short-lived request buffers while processing uploads. Recognition rejects low scores and close competing matches. The model files and their source/license details are in `backend/models/README.md`.

Generate a private face-data encryption key and add it to `backend/.env` (never to the frontend, GitHub, or chat):

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Set the printed value as `FACE_DATA_ENCRYPTION_KEY`. Keep it backed up securely; losing it makes stored embeddings unreadable. Use a different key per environment and do not rotate it without re-encrypting existing templates.

Face API routes (administrator bearer token required):
- `POST /api/face/register/<student_id>` — multipart form field `images`, 3–5 JPEG/PNG captures.
- `POST /api/face/recognize` — multipart form field `image`; returns `recognized`, `unknown`, or `ambiguous`. This endpoint identifies a face but does not mark attendance.
- `DELETE /api/face/<student_id>` — removes the student's encrypted biometric templates.

The SFace cosine threshold and ambiguity margin are configured by `FACE_MATCH_THRESHOLD` and `FACE_AMBIGUITY_MARGIN`. A score is similarity, not a probability or guarantee of identity. Administrators must verify enrollment belongs to the selected student. Camera access is requested by the browser only on the capture page; browsers require localhost or a secure HTTPS origin.

## Phase 5: sessions, attendance, and reports
Administrators can create class sessions, start and end them, and mark attendance only for a face the backend recognized in the selected active session. The browser sends a captured frame and session ID; it cannot choose the student ID. The API checks the recognized student's department, class, and section against the session roster. A database unique constraint prevents a student from being marked twice in the same session.

Implemented routes:
- `GET /api/classes`, `POST /api/classes`
- `GET /api/attendance/sessions`, `POST /api/attendance/sessions`, `GET /api/attendance/sessions/<id>`, and session `/start` and `/end`
- `POST /api/attendance/mark` — multipart form fields `session_id` and `image`
- `GET /api/attendance/records` — filters: `student_id`, `session_id`, `class_id`, `department`, `from_date`, `to_date`, `page`, `per_page`
- `GET /api/attendance/records/<id>`, `GET /api/attendance/reports`, `GET /api/attendance/export`
- `GET /api/dashboard/stats`, `GET /api/dashboard/recent-activity`
- `GET /api/audit` — administrator-only paginated action history
- `GET /api/student/attendance` — signed-in student's own attendance summary and class-by-class history
- `PUT /api/student/password` — signed-in student changes their password after checking the current password

Dashboard counts are derived from active students, real session rosters, and attendance records. The dashboard counts each student once per date; reports calculate totals across class sessions. Run the backend checks with `python -m pytest -q` from `backend/`.

## Privacy and limitations
Face embeddings are sensitive biometric data. Store only what the application needs, restrict access, provide deletion, and use TLS in production. Face recognition can make mistakes and may perform differently across lighting, camera quality, and demographic groups; uncertain matches must be rejected and reviewed by an administrator. This college project is not a substitute for a formally audited biometric system.

## Phase 6: frontend and local development

Install and run the React app in a second PowerShell window:

```powershell
cd .\frontend
npm install
npm run dev
```

Open the Vite URL printed in the terminal (normally `http://localhost:5173`). Vite proxies `/api` to `http://127.0.0.1:5000`. Keep Flask and Vite running in separate terminals. Sign in using the admin credentials created by `flask create-admin`. For a production bundle, run `npm run build`; output is `frontend/dist/`.

Backend checks (from `backend/`):

```powershell
python -m pip install -r requirements-dev.txt
python -m pytest -q
python -m compileall -q app tests
```

Tests use an isolated in-memory SQLite database and do not need PostgreSQL credentials or modify your local database.

## Phase 7: GitHub

The project root is the folder containing `backend/`, `frontend/`, `.gitignore`, and this README. Never run Git commands from `backend/` or `frontend/` when preparing the whole project.

Before creating a GitHub repository or committing, confirm that local configuration and data are ignored. The commands below are for when you are ready to start Phase 7; they do not upload anything until you run `git push`:

```powershell
# Run from the project root.
Get-Location
Test-Path .git

# Initialize only if this project does not already have a .git folder.
git init

# Confirm local secrets and generated/private data are ignored.
git check-ignore -v backend/.env backend/instance/migration_generation.db frontend/node_modules frontend/dist

# Stage the project, then inspect the staged file names before committing.
git add .gitignore README.md backend frontend
git status --short
git diff --cached --name-only

# If any .env, database, dump, log, upload, or private face-data path appears
# in the staged list, stop and unstage that path before committing.
git commit -m "Build smart attendance system"
git branch -M main

# Create an empty GitHub repository in the browser, then replace this URL.
git remote add origin https://github.com/YOUR-USERNAME/smart-attendance-system.git
git push -u origin main
```

If `Test-Path .git` is `True`, do not run `git init`; inspect the existing repository and remote first. If `git status` reports an unexpected directory or repository, stop rather than initializing a nested repository or pushing from the wrong folder. `.gitignore` excludes `.env`, virtual environments, `node_modules`, build output, local databases and dumps, logs, exports, uploads, and face-data folders. Never commit credentials, private face data, or generated encryption keys. Review model sources and license notes in `backend/models/README.md` before redistributing model weights.

## Phase 8: deployment outline (Render API + Vercel UI)

1. Push the repository to GitHub following Phase 7.
2. Create a managed PostgreSQL database with your hosting provider; keep its credentials private.
3. On Render, create a Python web service from this repository and set **Root Directory** to `backend`. Use build command `pip install -r requirements.txt`, start command `gunicorn --bind 0.0.0.0:$PORT run:app`, and **Health Check Path** `/api/health`. This health endpoint checks PostgreSQL connectivity as well as Flask availability. The `backend/.python-version` file selects Python 3.12 when `backend` is the service root.
4. Set Render environment variables: distinct random `SECRET_KEY` and `JWT_SECRET_KEY`; `DATABASE_URL` to the provider's internal PostgreSQL URL; `FACE_DATA_ENCRYPTION_KEY` to a generated Fernet key; `CORS_ORIGINS` to the exact Vercel site origin; and `APP_TIMEZONE=Asia/Kolkata`. Start with `FACE_MATCH_THRESHOLD=0.363` and `FACE_AMBIGUITY_MARGIN=0.05`; tune only with consented validation images. Run `flask db upgrade` in the service shell before first use, then `flask create-admin`. Never put secrets in source control or `VITE_*` variables.
5. On Vercel, import the repository with **Root Directory** `frontend`, framework preset Vite, build command `npm run build`, and output directory `dist`. Set `VITE_API_BASE_URL` to `https://YOUR-RENDER-SERVICE.onrender.com/api` and redeploy.
6. Verify `https://YOUR-RENDER-SERVICE.onrender.com/api/health`, visit the Vercel site, and sign in. Browser camera access requires HTTPS in production. The configured CORS origin must exactly match the frontend origin.

Render's Flask guide uses Gunicorn for production, and its Python version can be selected with `.python-version` at the service root ([Render Flask guide](https://render.com/docs/deploy-flask), [Render Python version](https://render.com/docs/python-version)). Vercel's [Vite guide](https://vercel.com/docs/frameworks/frontend/vite) documents deploying Vite projects. These are deployment instructions only; this repository has not been pushed or deployed. A live PostgreSQL connection could not be verified without the local database password.

## Troubleshooting

- **`py -3.12`: No suitable Python runtime found** — install Python 3.12 x64, enable the PATH option, reopen PowerShell, then confirm `py -3.12 --version` ([Python 3.12 Windows installer](https://www.python.org/downloads/release/python-31210/)).
- **`psql` is not recognized** — use `& 'C:\Program Files\PostgreSQL\18\bin\psql.exe' ...` or add that folder to PATH and start a fresh PowerShell session. This message means PowerShell cannot find `psql.exe`; it does not tell you whether the server is running.
- **Database connection refused** — confirm the PostgreSQL service is running and check the username, password, port, and URL in `backend/.env`.
- **Frontend reports API/network errors** — run Flask on port 5000 and Vite on port 5173, and check the Flask health endpoint.
- **Camera permission is unavailable** — allow camera access in the browser; remote deployments need HTTPS, while localhost works for development.
- **Face match fails** — use a bright, front-facing image; enroll consistent captures; confirm both model files exist. The threshold is a similarity score, not a probability.
